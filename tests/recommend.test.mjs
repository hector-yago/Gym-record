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
