import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BACKUP_KEEP, createStore, memoryAdapter } from '../js/store.js';
import { CURRENT_SCHEMA, migrate } from '../js/migrations.js';
import { newSession } from '../js/workouts.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const clock = (start = 1_800_000_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
};

test('primer arranque crea el documento y los cambios persisten entre sesiones', async () => {
  const adapter = memoryAdapter();
  const s1 = createStore(adapter);
  assert.equal((await s1.load()).created, true);
  await s1.update((d) => { d.sessions.push(newSession('2026-11-24', 1)); });
  const s2 = createStore(adapter);
  assert.equal((await s2.load()).created, false);
  assert.equal(s2.state.sessions.length, 1);
});

test('migración: el fixture de la v1 publicada se abre sin perder nada (v1 → v2)', async () => {
  const v1 = fixture('v1.json');
  const adapter = memoryAdapter();
  await adapter.put('doc', v1);
  const s = createStore(adapter);
  const info = await s.load();
  assert.equal(info.migratedFrom, 1, 'la v1 se migra a la actual con copia previa');
  assert.equal((await s.listBackups()).length, 1);
  assert.equal(s.state.schemaVersion, CURRENT_SCHEMA);
  assert.deepEqual(s.state.sessions[0].entries[0].blocks, [], 'las entradas antiguas ganan blocks vacío');
  assert.equal(s.state.settings.cardioTargetMin, 150);
  assert.equal(s.state.sessions.length, 2);
  assert.deepEqual(s.state.sessions[0].entries[0].sets, v1.sessions[0].entries[0].sets);
  assert.equal(s.state.customExercises.length, 1);
  assert.equal(s.state.exerciseSettings['press-pecho-maquina'].nickname, 'La de pecho azul');
  assert.equal(s.state.bodyweight.length, 2);
  assert.equal(s.state.settings.targetPerWeek, 3);
  assert.equal(s.state.settings.sound, false);
});

test('documento sin versión (esquema 0) se migra con copia previa', async () => {
  const adapter = memoryAdapter();
  const v0 = fixture('v1.json');
  delete v0.schemaVersion;
  await adapter.put('doc', v0);
  const s = createStore(adapter, clock());
  assert.equal((await s.load()).migratedFrom, 0);
  assert.equal(s.state.sessions.length, 2);
  assert.equal((await s.listBackups()).length, 1);
});

test('datos de una versión más nueva: error y no se toca nada', async () => {
  const adapter = memoryAdapter();
  const future = { ...fixture('v1.json'), schemaVersion: CURRENT_SCHEMA + 1 };
  await adapter.put('doc', future);
  await assert.rejects(() => createStore(adapter).load(), /versión más nueva/);
  assert.deepEqual(await adapter.get('doc'), future);
});

test('saneado: descarta lo irrecuperable y deja una sola sesión activa', () => {
  const { doc } = migrate({
    sessions: [
      { id: 'a', date: 'mal', entries: [] },
      { id: 'b', date: '2026-11-01', startedAt: 1, endedAt: null, entries: [{ exerciseId: 'x', sets: [{ kg: 10, reps: 5 }, { kg: -3, reps: 5 }] }] },
      { id: 'c', date: '2026-11-02', startedAt: 2, endedAt: null, entries: [] },
    ],
    bodyweight: [{ date: '2026-11-01', kg: 5 }, { date: '2026-11-02', kg: 80 }],
  });
  assert.equal(doc.sessions.length, 2);
  assert.equal(doc.sessions.filter((s) => !s.endedAt).length, 1);
  assert.equal(doc.sessions.find((s) => s.id === 'b').entries[0].sets.length, 1);
  assert.equal(doc.bodyweight.length, 1);
});

test('copia automática diaria y límite de copias', async () => {
  const c = clock();
  const s = createStore(memoryAdapter(), c);
  await s.load();
  assert.equal(await s.autoBackup(), false, 'sin datos no hay copia');
  await s.update((d) => { d.sessions.push(newSession('2026-11-24', 1)); });
  assert.equal(await s.autoBackup(), true);
  assert.equal(await s.autoBackup(), false, 'solo una al día');
  for (let i = 0; i < BACKUP_KEEP + 3; i++) { c.advance(86400000 + 1); await s.autoBackup(); }
  assert.equal((await s.listBackups()).length, BACKUP_KEEP);
});

test('exportar e importar: reemplazar y fusionar, con fotos', async () => {
  const a = createStore(memoryAdapter());
  await a.load();
  await a.update((d) => { Object.assign(d, migrate(fixture('v1.json')).doc); });
  await a.savePhoto('jalon-pecho', 'data:image/jpeg;base64,AAAA');
  const json = await a.exportJson();
  assert.match(json, /"app": "gym-record"/);

  const b = createStore(memoryAdapter());
  await b.load();
  assert.deepEqual(await b.importJson(json, 'replace'), { sessions: 2 });
  assert.equal(await b.getPhoto('jalon-pecho'), 'data:image/jpeg;base64,AAAA');
  assert.equal(b.state.exerciseSettings['jalon-pecho'].photo, true);

  // fusionar no duplica
  assert.deepEqual(await b.importJson(json, 'merge'), { sessions: 2 });
  assert.equal(b.state.bodyweight.length, 2);

  await assert.rejects(() => b.importJson('{"app":"otra"}'), /no es una exportación/);
  await assert.rejects(() => b.importJson('no json'), /JSON válido/);
});

test('recordatorio de copia manual', async () => {
  const c = clock();
  const s = createStore(memoryAdapter(), c);
  await s.load();
  assert.equal(s.backupDue(), false);
  await s.update((d) => { d.sessions.push(newSession('2026-11-24', c.now())); });
  assert.equal(s.backupDue(), false);
  c.advance(15 * 86400000);
  assert.equal(s.backupDue(), true);
  await s.markExported();
  assert.equal(s.backupDue(), false);
});

test('fixture v2 (con cardio): se migra a la v3 con copia previa y conserva los bloques', async () => {
  const v2 = fixture('v2.json');
  const adapter = memoryAdapter();
  await adapter.put('doc', v2);
  const s = createStore(adapter);
  assert.equal((await s.load()).migratedFrom, 2);
  assert.equal((await s.listBackups()).length, 1);
  assert.deepEqual(s.state.routines, []);
  assert.equal(s.state.settings.keepAwake, true);
  const cardio = s.state.sessions[0].entries.find((e) => e.exerciseId === 'cinta');
  assert.deepEqual(cardio.blocks, v2.sessions[0].entries[1].blocks);
  assert.equal(s.state.settings.cardioTargetMin, 120);
});

test('fixture v3 (con rutinas): se migra a la v4 con copia previa y conserva rutinas y routineId', async () => {
  const v3 = fixture('v3.json');
  const adapter = memoryAdapter();
  await adapter.put('doc', v3);
  const s = createStore(adapter);
  assert.equal((await s.load()).migratedFrom, 3);
  assert.equal((await s.listBackups()).length, 1);
  assert.deepEqual(s.state.pains, []);
  assert.equal(s.state.settings.goal, 'hypertrophy');
  assert.deepEqual(s.state.routines.map((r) => r.name), ['Día A', 'Día B']);
  assert.equal(s.state.sessions[0].routineId, 'routine-a');
  assert.equal(s.state.settings.keepAwake, false);
});

test('importar fusionando no duplica rutinas y añade las que faltan', async () => {
  const a = createStore(memoryAdapter());
  await a.load();
  await a.update((d) => { Object.assign(d, migrate(fixture('v3.json')).doc); });
  const json = await a.exportJson();
  const b = createStore(memoryAdapter());
  await b.load();
  await b.update((d) => { d.routines.push({ id: 'routine-a', name: 'Día A', exerciseIds: ['jalon-pecho'], createdAt: 1 }); });
  await b.importJson(json, 'merge');
  assert.equal(b.state.routines.length, 2);
  assert.deepEqual(b.state.routines.find((r) => r.id === 'routine-a').exerciseIds, ['jalon-pecho'], 'lo local manda');
});

test('fixture v4 (superseries, descanso, molestias, objetivo): se abre tal cual', async () => {
  const v4 = fixture('v4.json');
  const adapter = memoryAdapter();
  await adapter.put('doc', v4);
  const s = createStore(adapter);
  assert.equal((await s.load()).migratedFrom, null);
  assert.deepEqual(s.state.sessions[0].entries.map((e) => e.ss), ['ss-1', 'ss-1']);
  assert.equal(s.state.exerciseSettings['press-pecho-maquina'].rest, 45);
  assert.equal(s.state.pains[0].area, 'shoulders');
  assert.equal(s.state.pains[1].resolved, true);
  assert.equal(s.state.settings.goal, 'strength');
});

test('saneado v4: goal inválido, descanso fuera de rango y molestias sin zona se descartan', () => {
  const { doc } = migrate({
    settings: { goal: 'otro' },
    exerciseSettings: { x: { rest: 5 }, y: { rest: 120, nickname: 'Y' } },
    pains: [{ id: 'p1', area: 'nada', date: '2026-11-01' }, { id: 'p2', area: 'chest', date: '2026-11-02', note: ' dolor ' }],
    sessions: [{ id: 's', date: '2026-11-01', startedAt: 1, endedAt: 2, entries: [{ exerciseId: 'a', ss: '  ss-9 ', sets: [{ kg: 1, reps: 1 }] }] }],
  });
  assert.equal(doc.settings.goal, 'hypertrophy');
  assert.equal(doc.exerciseSettings.x, undefined);
  assert.equal(doc.exerciseSettings.y.rest, 120);
  assert.deepEqual(doc.pains.map((p) => [p.id, p.note]), [['p2', 'dolor']]);
  assert.equal(doc.sessions[0].entries[0].ss, 'ss-9');
});

test('importar fusionando añade molestias que faltan sin duplicar', async () => {
  const a = createStore(memoryAdapter());
  await a.load();
  await a.update((d) => { Object.assign(d, migrate(fixture('v4.json')).doc); });
  const json = await a.exportJson();
  const b = createStore(memoryAdapter());
  await b.load();
  await b.update((d) => { d.pains.push({ id: 'pain-1', area: 'shoulders', note: 'local', date: '2026-11-20', resolved: false }); });
  await b.importJson(json, 'merge');
  assert.equal(b.state.pains.length, 2);
  assert.equal(b.state.pains.find((p) => p.id === 'pain-1').note, 'local', 'lo local manda');
});
