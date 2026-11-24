import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avgPerWeek, lastTrained, muscleSets, weekStreak, weeklyCounts } from '../js/stats.js';
import { addDays, diffDays, isoDow, weekStart } from '../js/dates.js';
import { exerciseIndex, resolveExercises } from '../js/catalog.js';

const mk = (date, exerciseId = 'press-pecho-maquina', n = 3) => ({ id: date + exerciseId, date, startedAt: 1, endedAt: 2, notes: '', entries: [{ exerciseId, notes: '', sets: Array.from({ length: n }, () => ({ kg: 40, reps: 10 })) }] });
const map = exerciseIndex(resolveExercises({}));

test('fechas: semana ISO y aritmética', () => {
  assert.equal(isoDow('2026-11-24'), 2);
  assert.equal(weekStart('2026-11-29'), '2026-11-23');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(diffDays('2026-11-01', '2026-11-24'), 23);
});

test('series por músculo: principal cuenta 1 y secundario 0,5', () => {
  const m = muscleSets([mk('2026-11-23')], map, '2026-11-17', '2026-11-24');
  assert.equal(m.chest.effective, 3);
  assert.equal(m.triceps.effective, 1.5);
  assert.equal(m.lats.effective, 0);
  assert.equal(lastTrained([mk('2026-11-23')], map).chest, '2026-11-23');
});

test('media semanal, conteo y racha', () => {
  const sessions = [mk('2026-11-03'), mk('2026-11-05'), mk('2026-11-10'), mk('2026-11-12'), mk('2026-11-17'), mk('2026-11-19')];
  const T = '2026-11-24'; // martes de la semana en curso, sin sesiones aún
  assert.equal(weeklyCounts(sessions, T, 4).at(-1).count, 0);
  assert.equal(weeklyCounts(sessions, T, 4).at(-2).count, 2);
  assert.equal(weekStreak(sessions, T, 2), 3, 'la semana en curso aún puede completarse');
  assert.equal(weekStreak(sessions, T, 3), 0);
  assert.ok(Math.abs(avgPerWeek(sessions, T) - 6 / 4) < 1e-9);
});
