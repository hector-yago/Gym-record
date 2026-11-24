// Lógica pura de sesiones y series (sin DOM ni reloj). Una sesión:
// { id, date:'YYYY-MM-DD', startedAt, endedAt|null, notes, entries:[{ exerciseId, notes, sets:[{ kg, reps, rpe?:1|2|3, warmup?:true }] }] }
// rpe: 1 = fácil, 2 = justo, 3 = al límite.
import { addDays, diffDays } from './dates.js';

export const RPE_LABELS = { 1: 'Fácil', 2: 'Justo', 3: 'Al límite' };

export const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** 1RM estimado (Epley). Con 1 repetición es el propio peso; para pesos 0 devuelve 0. */
export function est1RM(kg, reps) {
  if (!(kg > 0) || !(reps > 0)) return 0;
  return reps === 1 ? kg : kg * (1 + reps / 30);
}
export const round1 = (n) => Math.round(n * 10) / 10;
export const fmtKg = (n) => `${String(round1(n)).replace('.', ',')}`;

export const workingSets = (entry) => (entry?.sets ?? []).filter((s) => !s.warmup);
export const setVolume = (s) => (s.kg > 0 ? s.kg * s.reps : 0);
export const entryVolume = (entry) => workingSets(entry).reduce((a, s) => a + setVolume(s), 0);
export const sessionVolume = (session) => session.entries.reduce((a, e) => a + entryVolume(e), 0);
export const sessionSetCount = (session) => session.entries.reduce((a, e) => a + workingSets(e).length, 0);

export const newSession = (date, now, routineId = null) => ({ id: newId(), date, startedAt: now, endedAt: null, notes: '', entries: [], ...(routineId ? { routineId } : {}) });
export const activeSession = (sessions) => sessions.find((s) => !s.endedAt) ?? null;
/** Sesiones terminadas, de más reciente a más antigua. */
export const finished = (sessions) => sessions.filter((s) => s.endedAt).sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt);

/** Historial de un ejercicio: una fila por sesión terminada (más antigua primero) con sus series de trabajo. */
export function exerciseHistory(sessions, exerciseId, { includeActive = false } = {}) {
  const rows = [];
  for (const s of sessions) {
    if (!s.endedAt && !includeActive) continue;
    const sets = s.entries.filter((e) => e.exerciseId === exerciseId).flatMap(workingSets);
    if (!sets.length) continue;
    rows.push({
      date: s.date,
      sessionId: s.id,
      startedAt: s.startedAt,
      sets,
      topKg: Math.max(...sets.map((x) => x.kg)),
      best1rm: Math.max(...sets.map((x) => est1RM(x.kg, x.reps))),
      volume: sets.reduce((a, x) => a + setVolume(x), 0),
      avgReps: sets.reduce((a, x) => a + x.reps, 0) / sets.length,
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt);
}

/** Récords del ejercicio sobre un historial: peso máximo, 1RM estimado, volumen de sesión y reps con el peso máximo. */
export function records(history) {
  const out = { topKg: 0, best1rm: 0, volume: 0, topKgDate: null, best1rmDate: null };
  for (const h of history) {
    if (h.topKg > out.topKg) { out.topKg = h.topKg; out.topKgDate = h.date; }
    if (h.best1rm > out.best1rm) { out.best1rm = h.best1rm; out.best1rmDate = h.date; }
    if (h.volume > out.volume) out.volume = h.volume;
  }
  return out;
}

/** Récords superados al terminar una sesión respecto a las anteriores. */
export function newRecords(sessions, session) {
  const before = sessions.filter((s) => s.endedAt && s.id !== session.id && (s.date < session.date || (s.date === session.date && s.startedAt < session.startedAt)));
  const out = [];
  for (const id of new Set(session.entries.map((e) => e.exerciseId))) {
    const prev = exerciseHistory(before, id);
    if (!prev.length) continue; // primera vez: no es un récord, es la referencia
    const now = exerciseHistory([{ ...session, endedAt: session.endedAt ?? 1 }], id)[0];
    if (!now) continue;
    const r = records(prev);
    if (now.topKg > r.topKg) out.push({ exerciseId: id, kind: 'peso', value: now.topKg, previous: r.topKg });
    else if (now.best1rm > r.best1rm * 1.001) out.push({ exerciseId: id, kind: '1rm', value: now.best1rm, previous: r.best1rm });
  }
  return out;
}

/** Última sesión terminada con el ejercicio (para precargar y mostrar «la última vez»). */
export function lastPerformance(sessions, exerciseId, beforeSessionId = null) {
  const hist = exerciseHistory(sessions.filter((s) => s.id !== beforeSessionId), exerciseId);
  return hist.at(-1) ?? null;
}

/** Texto compacto de series: «3×10 · 40 kg» o «40×10, 40×9, 35×8». */
export function describeSets(sets) {
  if (!sets.length) return '';
  const same = sets.every((s) => s.kg === sets[0].kg && s.reps === sets[0].reps);
  if (same) return `${sets.length}×${sets[0].reps}${sets[0].kg > 0 ? ` · ${fmtKg(sets[0].kg)} kg` : ''}`;
  return sets.map((s) => (s.kg > 0 ? `${fmtKg(s.kg)}×${s.reps}` : `${s.reps}`)).join(', ');
}

/** Valores iniciales de la próxima serie: la última de la sesión; si no, la de la última vez; si no, el mínimo del rango. */
export function nextDraft(entry, last, exercise) {
  const own = workingSets(entry).at(-1) ?? entry?.sets?.at(-1);
  const prev = last?.sets?.[0];
  const base = own ?? prev;
  return { kg: base?.kg ?? 0, reps: base?.reps ?? exercise?.reps?.[0] ?? 10, rpe: null, warmup: false };
}

export function sanitizeSet(s) {
  const kg = Number(s?.kg);
  const reps = Math.round(Number(s?.reps));
  if (!Number.isFinite(kg) || kg < 0 || kg > 1000 || !Number.isFinite(reps) || reps < 1 || reps > 1000) return null;
  const out = { kg: Math.round(kg * 100) / 100, reps };
  if ([1, 2, 3].includes(s.rpe)) out.rpe = s.rpe;
  if (s.warmup) out.warmup = true;
  return out;
}

/** Semanas (lunes) con al menos una sesión, para rachas y frecuencia. */
export function sessionsInRange(sessions, fromDay, toDay) {
  return sessions.filter((s) => s.endedAt && s.date >= fromDay && s.date <= toDay);
}
export const daysSince = (date, today) => diffDays(date, today);
export { addDays };
