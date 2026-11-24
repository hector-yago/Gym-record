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

test('migración: el fixture de la v1 publicada se abre sin perder nada', async () => {
  const v1 = fixture('v1.json');
  const adapter = memoryAdapter();
  await adapter.put('doc', v1);
  const s = createStore(adapter);
  const info = await s.load();
  assert.equal(info.migratedFrom, null);
  assert.equal(s.state.schemaVersion, CURRENT_SCHEMA);
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
