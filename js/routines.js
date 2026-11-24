// Rutinas guardables (p. ej. «Día A», «Día B») y rotación. Lógica pura (sin DOM ni reloj).
// Una rutina: { id, name, exerciseIds[], createdAt }. Las sesiones guardan `routineId` si se empezaron desde una.
import { finished, newId } from './workouts.js';

export const MAX_ROUTINE_EXERCISES = 40;

export function sanitizeRoutine(r) {
  const name = String(r?.name ?? '').trim().slice(0, 60);
  if (!r?.id || !name) return null;
  const ids = [...new Set((Array.isArray(r.exerciseIds) ? r.exerciseIds : []).map(String).filter(Boolean))].slice(0, MAX_ROUTINE_EXERCISES);
  return { id: String(r.id), name, exerciseIds: ids, createdAt: Number.isFinite(Number(r.createdAt)) ? Number(r.createdAt) : Date.now() };
}

export const newRoutine = (name, exerciseIds, now = Date.now()) => sanitizeRoutine({ id: `routine-${newId()}`, name, exerciseIds, createdAt: now });

/** Rutina a partir de los ejercicios de una sesión (en su orden, sin repetir). */
export const routineFromSession = (session, name, now = Date.now()) => newRoutine(name, session.entries.map((e) => e.exerciseId), now);

/**
 * Rutina que «toca»: la siguiente (cíclica por orden de creación) a la de la última sesión terminada con `routineId`.
 * Sin historial, o si esa rutina se borró, la primera.
 */
export function nextRoutine(routines, sessions) {
  if (!routines.length) return null;
  const last = finished(sessions).find((s) => s.routineId);
  const i = last ? routines.findIndex((r) => r.id === last.routineId) : -1;
  return routines[(i + 1) % routines.length];
}

/** Mueve el elemento `index` de la lista `delta` posiciones (-1 sube, +1 baja). Devuelve una copia. */
export function moveItem(list, index, delta) {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const out = [...list];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

/** Nombre sugerido para la siguiente rutina: «Día A», «Día B»… */
export function suggestRoutineName(routines) {
  const used = new Set(routines.map((r) => r.name));
  for (let i = 0; i < 26; i++) {
    const n = `Día ${String.fromCharCode(65 + i)}`;
    if (!used.has(n)) return n;
  }
  return `Rutina ${routines.length + 1}`;
}
