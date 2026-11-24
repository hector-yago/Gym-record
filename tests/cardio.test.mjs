import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardioGeneralRecommendations, cardioHistory, cardioRecommendation, describeBlocks, nextCardioDraft, sanitizeBlock, weeklyCardio } from '../js/cardio.js';
import { lastTrained } from '../js/stats.js';
import { exerciseIndex, resolveExercises } from '../js/catalog.js';

const sess = (id, date, entries) => ({ id, date, startedAt: Date.parse(`${date}T10:00:00Z`), endedAt: Date.parse(`${date}T11:00:00Z`), notes: '', entries });
const cardio = (exerciseId, ...blocks) => ({ exerciseId, notes: '', sets: [], blocks });
const strength = (exerciseId, n = 3) => ({ exerciseId, notes: '', sets: Array.from({ length: n }, () => ({ kg: 40, reps: 10 })), blocks: [] });
const T = '2026-11-24';
const cinta = { id: 'cinta', metrics: ['km', 'incline', 'bpm'] };
const eliptica = { id: 'eliptica', metrics: ['level', 'km', 'bpm'] };
const hist = (id, rows) => cardioHistory(rows.map(([date, ...blocks], i) => sess(`s${i}`, date, [cardio(id, ...blocks)])), id);

test('sanitizeBlock: minutos obligatorios, métricas opcionales y rangos', () => {
  assert.equal(sanitizeBlock({ min: 0 }), null);
  assert.equal(sanitizeBlock({ min: 'x' }), null);
  assert.deepEqual(sanitizeBlock({ min: 20.4, km: 2.456, level: 7.6, incline: 3.04, bpm: 140, rpe: 2 }), { min: 20, km: 2.46, level: 8, incline: 3, bpm: 140, rpe: 2 });
  assert.deepEqual(sanitizeBlock({ min: 10, km: 0, level: '', incline: 99, bpm: 10, rpe: 7 }), { min: 10 });
});

test('describeBlocks: un bloque con velocidad media y varios bloques resumidos', () => {
  assert.equal(describeBlocks([{ min: 20, km: 2.5, level: 8 }]), '20 min · 2,5 km · 7,5 km/h · nivel 8');
  assert.equal(describeBlocks([{ min: 20, km: 2 }, { min: 10, km: 1.5 }]), '2 bloques · 30 min · 3,5 km');
  assert.equal(describeBlocks([]), '');
});

test('historial de cardio agrega bloques por sesión y no mezcla ejercicios', () => {
  const s = sess('a', '2026-11-20', [cardio('cinta', { min: 20, km: 2, rpe: 2 }, { min: 10, km: 1 }), cardio('eliptica', { min: 15 }), strength('jalon-pecho')]);
  const h = cardioHistory([s], 'cinta');
  assert.equal(h.length, 1);
  assert.equal(h[0].minutes, 30);
  assert.equal(h[0].km, 3);
  assert.ok(Math.abs(h[0].speed - 6) < 1e-9);
  assert.equal(cardioHistory([s], 'jalon-pecho').length, 0);
});

test('precarga: último bloque de la sesión, luego el de la última vez, luego los minutos típicos', () => {
  assert.deepEqual(nextCardioDraft({ blocks: [{ min: 12, km: 1 }] }, null, {}), { min: 12, km: 1, level: 0, incline: 0, bpm: 0, rpe: null });
  assert.equal(nextCardioDraft({ blocks: [] }, { blocks: [{ min: 25 }] }, {}).min, 25);
  assert.equal(nextCardioDraft({ blocks: [] }, null, { typicalMin: 15 }).min, 15);
});

test('consejo: sin historial no hay; dos sesiones «fácil» → sube nivel (elíptica) o inclinación (cinta)', () => {
  assert.equal(cardioRecommendation(cinta, [], T), null);
  const e = cardioRecommendation(eliptica, hist('eliptica', [['2026-11-13', { min: 20, level: 6, rpe: 1 }], ['2026-11-20', { min: 20, level: 6, rpe: 1 }]]), T);
  assert.equal(e.kind, 'cardio_up');
  assert.deepEqual(e.target, { level: 7 });
  const c = cardioRecommendation(cinta, hist('cinta', [['2026-11-13', { min: 20, incline: 2, rpe: 1 }], ['2026-11-20', { min: 20, incline: 2, rpe: 1 }]]), T);
  assert.equal(c.kind, 'cardio_up');
  assert.deepEqual(c.target, { incline: 3 });
});

test('consejo: dos sesiones «al límite» → baja intensidad; parón largo → vuelve suave', () => {
  const lim = cardioRecommendation(cinta, hist('cinta', [['2026-11-13', { min: 20, rpe: 3 }], ['2026-11-20', { min: 20, rpe: 3 }]]), T);
  assert.equal(lim.kind, 'cardio_down');
  const brk = cardioRecommendation(cinta, hist('cinta', [['2026-10-20', { min: 30 }]]), T);
  assert.equal(brk.kind, 'cardio_down');
  assert.equal(brk.target.min, 25);
});

test('consejo: tres sesiones con el mismo tiempo → más minutos; si no, mantener', () => {
  const same = cardioRecommendation(cinta, hist('cinta', [['2026-11-06', { min: 20 }], ['2026-11-13', { min: 20 }], ['2026-11-20', { min: 20 }]]), T);
  assert.equal(same.kind, 'cardio_time');
  assert.equal(same.target.min, 22);
  assert.equal(cardioRecommendation(cinta, hist('cinta', [['2026-11-20', { min: 20 }]]), T).kind, 'cardio_keep');
});

test('consejos generales: sin cardio, poco cardio y solo cardio', () => {
  const onlyStrength = [sess('a', '2026-11-10', [strength('jalon-pecho')]), sess('b', '2026-11-17', [strength('jalon-pecho')]), sess('c', '2026-11-20', [strength('jalon-pecho')])];
  assert.equal(cardioGeneralRecommendations(onlyStrength, T)[0].kind, 'cardio_add');
  assert.deepEqual(cardioGeneralRecommendations(onlyStrength.slice(0, 2), T), [], 'con menos de 3 sesiones no aconseja');

  const low = [...onlyStrength, sess('d', '2026-11-21', [cardio('cinta', { min: 20 })])];
  const rec = cardioGeneralRecommendations(low, T);
  assert.equal(rec[0].kind, 'cardio_add');
  assert.match(rec[0].detail, /5 min\/semana/);

  const enough = [...onlyStrength, ...['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22'].map((d, i) => sess(`e${i}`, d, [cardio('cinta', { min: 90 })]))];
  assert.deepEqual(cardioGeneralRecommendations(enough, T), []);

  const onlyCardio = ['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-22'].map((d, i) => sess(`f${i}`, d, [cardio('cinta', { min: 45 })]));
  assert.equal(cardioGeneralRecommendations(onlyCardio, T).find((r) => r.kind === 'balance')?.title, 'Añade algo de fuerza');
});

test('cardio por semana y que no cuente como músculo trabajado', () => {
  const sessions = [sess('a', '2026-11-17', [cardio('cinta', { min: 20, km: 2 })]), sess('b', '2026-11-23', [cardio('cinta', { min: 30, km: 3 }), strength('jalon-pecho')])];
  const w = weeklyCardio(sessions, T, 2);
  assert.deepEqual(w.map((x) => x.minutes), [20, 30]);
  assert.equal(w[1].km, 3);
  const map = exerciseIndex(resolveExercises({}));
  const last = lastTrained(sessions, map);
  assert.equal(last.cardio, undefined);
  assert.equal(last.lats, '2026-11-23');
});
