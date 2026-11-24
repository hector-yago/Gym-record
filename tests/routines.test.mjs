import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveItem, newRoutine, nextRoutine, routineFromSession, sanitizeRoutine, suggestRoutineName } from '../js/routines.js';
import { createWakeLock } from '../js/wakelock.js';

const done = (id, date, routineId) => ({ id, date, startedAt: Date.parse(`${date}T10:00:00Z`), endedAt: Date.parse(`${date}T11:00:00Z`), notes: '', entries: [], ...(routineId ? { routineId } : {}) });
const A = { id: 'a', name: 'Día A', exerciseIds: ['x'], createdAt: 1 };
const B = { id: 'b', name: 'Día B', exerciseIds: ['y'], createdAt: 2 };
const C = { id: 'c', name: 'Día C', exerciseIds: ['z'], createdAt: 3 };

test('sanitizeRoutine: nombre obligatorio, ids únicos y límite', () => {
  assert.equal(sanitizeRoutine({ id: 'r', name: '   ', exerciseIds: ['x'] }), null);
  assert.equal(sanitizeRoutine({ name: 'Sin id' }), null);
  const r = sanitizeRoutine({ id: 'r', name: '  Día A  ', exerciseIds: ['x', 'y', 'x', '', 3], createdAt: 5 });
  assert.deepEqual(r, { id: 'r', name: 'Día A', exerciseIds: ['x', 'y', '3'], createdAt: 5 });
});

test('rotación: sin rutinas no hay; sin historial toca la primera; después la siguiente de forma cíclica', () => {
  assert.equal(nextRoutine([], []), null);
  assert.equal(nextRoutine([A, B], []).id, 'a');
  assert.equal(nextRoutine([A, B], [done('s1', '2026-11-10')]).id, 'a', 'sesiones sin rutina no cuentan');
  assert.equal(nextRoutine([A, B], [done('s1', '2026-11-10', 'a')]).id, 'b');
  assert.equal(nextRoutine([A, B], [done('s1', '2026-11-10', 'a'), done('s2', '2026-11-17', 'b')]).id, 'a');
  assert.equal(nextRoutine([A, B, C], [done('s1', '2026-11-10', 'b')]).id, 'c');
});

test('rotación: usa la última sesión terminada con rutina, aunque se haya hecho otra libre después', () => {
  const sessions = [done('s1', '2026-11-10', 'a'), done('s2', '2026-11-17'), { ...done('s3', '2026-11-24', 'b'), endedAt: null }];
  assert.equal(nextRoutine([A, B], sessions).id, 'b', 'la sesión activa (sin terminar) no cuenta');
});

test('rotación: si la rutina de la última sesión se borró, vuelve a la primera', () => {
  assert.equal(nextRoutine([B, C], [done('s1', '2026-11-10', 'a')]).id, 'b');
});

test('rutina desde una sesión y nombres sugeridos', () => {
  const s = { ...done('s', '2026-11-10'), entries: [{ exerciseId: 'x', notes: '', sets: [] }, { exerciseId: 'y', notes: '', sets: [] }, { exerciseId: 'x', notes: '', sets: [] }] };
  const r = routineFromSession(s, 'Empuje', 7);
  assert.deepEqual([r.name, r.exerciseIds, r.createdAt], ['Empuje', ['x', 'y'], 7]);
  assert.equal(newRoutine('', ['x']), null);
  assert.equal(suggestRoutineName([]), 'Día A');
  assert.equal(suggestRoutineName([A, B]), 'Día C');
});

test('moveItem sube/baja sin salirse y no muta', () => {
  const l = ['a', 'b', 'c'];
  assert.deepEqual(moveItem(l, 1, -1), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(l, 1, 1), ['a', 'c', 'b']);
  assert.deepEqual(moveItem(l, 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(l, ['a', 'b', 'c']);
});

const fakeNav = ({ reject = false } = {}) => {
  const calls = { request: 0, release: 0 };
  const listeners = [];
  const nav = {
    calls,
    fireRelease: () => listeners.forEach((f) => f()),
    wakeLock: {
      request: async () => {
        calls.request++;
        if (reject) throw new Error('NotAllowedError');
        return { addEventListener: (_, f) => listeners.push(f), release: async () => { calls.release++; } };
      },
    },
  };
  return nav;
};

test('wake lock: sin soporte no hace nada y nunca lanza', async () => {
  const w = createWakeLock({ nav: {} });
  assert.equal(w.supported, false);
  assert.equal(await w.acquire(), false);
  await w.release();
});

test('wake lock: adquiere una sola vez, reintenta tras perderlo y libera', async () => {
  const nav = fakeNav();
  const w = createWakeLock({ nav });
  assert.equal(await w.acquire(), true);
  assert.equal(await w.acquire(), false, 'no pide dos veces mientras lo tiene');
  assert.equal(nav.calls.request, 1);
  nav.fireRelease(); // iOS lo libera al ocultar la app
  assert.equal(w.held, false);
  assert.equal(await w.reacquire(), true);
  assert.equal(nav.calls.request, 2);
  await w.release();
  assert.equal(nav.calls.release, 1);
  assert.equal(await w.reacquire(), false, 'tras release() ya no se desea');
});

test('wake lock: un rechazo del sistema no rompe nada', async () => {
  const w = createWakeLock({ nav: fakeNav({ reject: true }) });
  assert.equal(await w.acquire(), false);
  assert.equal(w.held, false);
});
