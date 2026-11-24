import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeSets, est1RM, exerciseHistory, newRecords, records, sanitizeSet, sessionVolume, workingSets } from '../js/workouts.js';

const sess = (id, date, entries, startedAt = Date.parse(`${date}T10:00:00Z`)) => ({ id, date, startedAt, endedAt: startedAt + 3600000, notes: '', entries });
const e = (exerciseId, sets) => ({ exerciseId, notes: '', sets });

test('1RM estimado (Epley)', () => {
  assert.equal(est1RM(100, 1), 100);
  assert.ok(Math.abs(est1RM(100, 10) - 133.33) < 0.01);
  assert.equal(est1RM(0, 10), 0);
});

test('las series de calentamiento no cuentan en volumen ni historial', () => {
  const s = sess('a', '2026-11-10', [e('x', [{ kg: 20, reps: 15, warmup: true }, { kg: 40, reps: 10 }, { kg: 40, reps: 8 }])]);
  assert.equal(workingSets(s.entries[0]).length, 2);
  assert.equal(sessionVolume(s), 40 * 10 + 40 * 8);
  const h = exerciseHistory([s], 'x');
  assert.equal(h.length, 1);
  assert.equal(h[0].topKg, 40);
});

test('describeSets resume series iguales y distintas', () => {
  assert.equal(describeSets([{ kg: 40, reps: 10 }, { kg: 40, reps: 10 }, { kg: 40, reps: 10 }]), '3×10 · 40 kg');
  assert.equal(describeSets([{ kg: 40, reps: 10 }, { kg: 35, reps: 8 }]), '40×10, 35×8');
});

test('sanitizeSet descarta valores imposibles y limita RPE', () => {
  assert.equal(sanitizeSet({ kg: -1, reps: 5 }), null);
  assert.equal(sanitizeSet({ kg: 10, reps: 0 }), null);
  assert.deepEqual(sanitizeSet({ kg: 10.456, reps: 8.4, rpe: 3, warmup: true }), { kg: 10.46, reps: 8, rpe: 3, warmup: true });
  assert.deepEqual(sanitizeSet({ kg: 10, reps: 8, rpe: 9 }), { kg: 10, reps: 8 });
});

test('récords: solo hay récord si ya existía referencia previa', () => {
  const a = sess('a', '2026-11-03', [e('x', [{ kg: 40, reps: 10 }])]);
  const b = sess('b', '2026-11-10', [e('x', [{ kg: 45, reps: 8 }]), e('y', [{ kg: 10, reps: 10 }])]);
  const recs = newRecords([a, b], b);
  assert.equal(recs.length, 1);
  assert.deepEqual([recs[0].exerciseId, recs[0].kind, recs[0].value, recs[0].previous], ['x', 'peso', 45, 40]);
  assert.equal(records(exerciseHistory([a, b], 'x')).topKg, 45);
});
