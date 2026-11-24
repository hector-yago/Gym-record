import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceRecommendation, exerciseRecommendation, muscleRecommendations } from '../js/recommend.js';
import { exerciseHistory } from '../js/workouts.js';
import { exerciseIndex, resolveExercises } from '../js/catalog.js';

const ex = { id: 'x', name: 'X', primary: 'chest', secondary: [], equipment: 'machine', step: 5, reps: [8, 12] };
// Construye el historial a través del código real (sesiones terminadas → exerciseHistory).
const hist = (...rows) => exerciseHistory(
  rows.map(([date, ...sets], i) => ({
    id: `s${i}`, date, startedAt: i + 1, endedAt: i + 2, notes: '',
    entries: [{ exerciseId: 'x', notes: '', sets: sets.map(([kg, reps, rpe]) => ({ kg, reps, ...(rpe ? { rpe } : {}) })) }],
  })),
  'x',
);
const T = '2026-11-24';

test('sin historial no hay recomendación', () => assert.equal(exerciseRecommendation(ex, [], T), null));

test('todas las series en el tope del rango → sube peso un salto', () => {
  const r = exerciseRecommendation(ex, hist(['2026-11-20', [40, 12], [40, 12], [40, 12]]), T);
  assert.equal(r.kind, 'raise_weight');
  assert.deepEqual(r.target, { kg: 45, reps: 8 });
});

test('todo «fácil» y cerca del tope → sube peso', () => {
  const r = exerciseRecommendation(ex, hist(['2026-11-20', [40, 11, 1], [40, 11, 1]]), T);
  assert.equal(r.kind, 'raise_weight');
});

test('dentro del rango → más repeticiones con el mismo peso', () => {
  const r = exerciseRecommendation(ex, hist(['2026-11-20', [40, 9], [40, 9], [40, 9]]), T);
  assert.equal(r.kind, 'more_reps');
  assert.deepEqual(r.target, { kg: 40, reps: 10 });
});

test('por debajo del mínimo una vez → mantener; dos veces seguidas → bajar', () => {
  const once = exerciseRecommendation(ex, hist(['2026-11-13', [40, 10]], ['2026-11-20', [45, 6], [45, 6]]), T);
  assert.equal(once.kind, 'more_reps');
  const twice = exerciseRecommendation(ex, hist(['2026-11-13', [45, 6], [45, 6]], ['2026-11-20', [45, 6], [45, 5]]), T);
  assert.equal(twice.kind, 'lower_weight');
  assert.equal(twice.target.kg, 40);
});

test('estancamiento: 3 sesiones sin mejorar → añade serie o cambia de ejercicio', () => {
  const h = hist(['2026-10-20', [50, 10]], ['2026-10-27', [40, 9], [40, 9]], ['2026-11-03', [40, 9], [40, 9]], ['2026-11-10', [40, 9], [40, 9]]);
  assert.equal(exerciseRecommendation(ex, h, T).kind, 'add_set');
  const four = [[40, 9], [40, 9], [40, 9], [40, 9]];
  const h4 = hist(['2026-10-20', [50, 10]], ['2026-10-27', ...four], ['2026-11-03', ...four], ['2026-11-10', ...four]);
  assert.equal(exerciseRecommendation(ex, h4, T).kind, 'change_exercise');
});

test('parón de 3 semanas → vuelve con un 10 % menos', () => {
  const r = exerciseRecommendation(ex, hist(['2026-10-20', [40, 10]]), T);
  assert.equal(r.kind, 'lower_weight');
  assert.equal(r.target.kg, 35);
});

test('peso corporal en el tope → hazlo más difícil (no sube kg)', () => {
  const bw = { ...ex, equipment: 'body', step: 0 };
  assert.equal(exerciseRecommendation(bw, hist(['2026-11-20', [0, 12], [0, 12]]), T).kind, 'add_set');
});

test('músculos olvidados: sugiere el que lleva más tiempo sin entrenarse', () => {
  const list = resolveExercises({});
  const map = exerciseIndex(list);
  const mk = (id, date, exerciseId) => ({ id, date, startedAt: 1, endedAt: 2, notes: '', entries: [{ exerciseId, notes: '', sets: [{ kg: 10, reps: 10 }] }] });
  const sessions = [mk('a', '2026-11-01', 'press-pecho-maquina'), mk('b', '2026-11-22', 'jalon-pecho')];
  const recs = muscleRecommendations(sessions, list, map, T);
  const chest = recs.find((r) => r.muscle === 'chest');
  assert.ok(chest, 'debería sugerir pecho (23 días)');
  assert.equal(chest.days, 23);
  assert.equal(recs.find((r) => r.muscle === 'lats'), undefined);
  assert.equal(balanceRecommendation(sessions, map, T), null);
});

/* ---- 0.3.0: aproximación, descarga y sustituciones ---- */
import { alternativesFor, deloadRecommendation, warmupSets } from '../js/recommend.js';

test('series de aproximación: 50 % × 8 y 70 % × 5 redondeadas al salto; nada por debajo de 20 kg o sin salto', () => {
  assert.deepEqual(warmupSets(60, 5), [{ kg: 30, reps: 8, warmup: true }, { kg: 40, reps: 5, warmup: true }]);
  assert.deepEqual(warmupSets(50, 2.5), [{ kg: 25, reps: 8, warmup: true }, { kg: 35, reps: 5, warmup: true }]);
  assert.deepEqual(warmupSets(22, 5), [{ kg: 10, reps: 8, warmup: true }, { kg: 15, reps: 5, warmup: true }]);
  assert.deepEqual(warmupSets(19, 5), []);
  assert.deepEqual(warmupSets(60, 0), []);
  for (const s of warmupSets(20, 10)) assert.ok(s.kg < 20);
});

// Historial semanal de volumen: 1 sesión por semana en los lunes indicados, 3×10 a `kg`
const weekly = (mondays, kgOf = () => 40) => mondays.map((d, i) => ({
  id: `w${i}`, date: d, startedAt: i + 1, endedAt: i + 2, notes: '',
  entries: [{ exerciseId: 'x', notes: '', sets: Array.from({ length: 3 }, () => ({ kg: kgOf(i), reps: 10 })), blocks: [] }],
}));
const MONDAYS = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'];
const TODAY = '2026-11-24'; // martes de la semana en curso (23/11), sin sesión aún

test('descarga: 6+ semanas seguidas con carga normal → la recomienda', () => {
  const r = deloadRecommendation(weekly(MONDAYS), TODAY);
  assert.equal(r.kind, 'deload');
  assert.match(r.detail, /11 semanas|\d+ semanas seguidas/);
});

test('descarga: una semana ligera o un parón reciente reinicia la cuenta', () => {
  const light = deloadRecommendation(weekly(MONDAYS, (i) => (i === 8 ? 10 : 40)), TODAY); // 02/11 ligera → quedan 2 semanas
  assert.equal(light, null);
  const gap = deloadRecommendation(weekly(MONDAYS.filter((d) => d !== '2026-11-02')), TODAY); // semana sin entrenar
  assert.equal(gap, null);
});

test('descarga: sin historia suficiente no aconseja', () => {
  assert.equal(deloadRecommendation(weekly(MONDAYS.slice(-5)), TODAY), null, 'menos de 8 sesiones');
  assert.equal(deloadRecommendation([], TODAY), null);
});

test('sustituciones: mismo músculo y tipo, primero los usados y luego mismo equipo', () => {
  const list = resolveExercises({});
  const press = list.find((e) => e.id === 'press-pecho-maquina');
  const used = new Map([['aperturas-mariposa', 3]]);
  const alts = alternativesFor(press, list, used);
  assert.ok(alts.length > 0);
  assert.ok(alts.every((e) => e.primary === 'chest' && e.id !== press.id && e.kind !== 'cardio'));
  assert.equal(alts[0].id, 'aperturas-mariposa', 'el ya usado va primero');
  const sameEquipment = alts.filter((e) => !used.has(e.id) && e.equipment === 'machine');
  assert.ok(alts.indexOf(sameEquipment[0]) < alts.findIndex((e) => e.equipment === 'dumbbell'), 'mismo equipo antes que otros');

  const cinta = list.find((e) => e.id === 'cinta');
  assert.ok(alternativesFor(cinta, list).every((e) => e.kind === 'cardio'), 'el cardio solo se sustituye por cardio');
});
