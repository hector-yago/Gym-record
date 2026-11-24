// Récords personales de todos los ejercicios (fuerza y cardio) y récords batidos en un periodo. Lógica pura.
import { cardioHistory } from './cardio.js';
import { exerciseHistory } from './workouts.js';

const done = (sessions) => sessions.filter((s) => s.endedAt);
/** Mejor valor de `pick(fila)` con la fecha en la que se logró por primera vez (empates: la más antigua). */
const bestOf = (rows, pick) => rows.reduce((best, r) => (pick(r) > (best?.value ?? 0) ? { value: pick(r), date: r.date } : best), null);

/** Una fila por ejercicio con sus mejores marcas; ordenadas por la marca más reciente primero. */
export function allRecords(sessions, exMap) {
  const finishedSessions = done(sessions);
  const ids = new Set(finishedSessions.flatMap((s) => s.entries.map((e) => e.exerciseId)));
  const rows = [];
  for (const id of ids) {
    const ex = exMap.get(id);
    if (!ex) continue;
    if (ex.kind === 'cardio') {
      const h = cardioHistory(finishedSessions, id);
      if (!h.length) continue;
      const row = { exerciseId: id, kind: 'cardio', sessions: h.length, lastDate: h.at(-1).date, minutes: bestOf(h, (r) => r.minutes), km: bestOf(h, (r) => r.km), speed: bestOf(h, (r) => r.speed ?? 0) };
      row.latest = [row.minutes, row.km, row.speed].filter(Boolean).map((r) => r.date).sort().at(-1);
      rows.push(row);
    } else {
      const h = exerciseHistory(finishedSessions, id);
      if (!h.length) continue;
      const row = { exerciseId: id, kind: 'strength', sessions: h.length, lastDate: h.at(-1).date, topKg: bestOf(h, (r) => r.topKg), best1rm: bestOf(h, (r) => r.best1rm), volume: bestOf(h, (r) => r.volume) };
      row.latest = [row.topKg, row.best1rm, row.volume].filter(Boolean).map((r) => r.date).sort().at(-1);
      rows.push(row);
    }
  }
  return rows.sort((a, b) => (b.latest ?? '').localeCompare(a.latest ?? ''));
}

/**
 * Récords batidos entre `from` y `to` (inclusive) respecto a todo lo anterior a `from`.
 * La primera vez que se hace un ejercicio no es récord, es la referencia.
 * Fuerza: peso máximo o 1RM estimado. Cardio: tiempo o velocidad media.
 */
export function prsInRange(sessions, exMap, from, to) {
  const finishedSessions = done(sessions);
  const ids = new Set(finishedSessions.filter((s) => s.date >= from && s.date <= to).flatMap((s) => s.entries.map((e) => e.exerciseId)));
  const out = [];
  for (const id of ids) {
    const ex = exMap.get(id);
    if (!ex) continue;
    if (ex.kind === 'cardio') {
      const h = cardioHistory(finishedSessions, id);
      const before = h.filter((r) => r.date < from);
      const during = h.filter((r) => r.date >= from && r.date <= to);
      if (!before.length || !during.length) continue;
      const bm = Math.max(...before.map((r) => r.minutes));
      const dm = Math.max(...during.map((r) => r.minutes));
      const bs = Math.max(0, ...before.map((r) => r.speed ?? 0));
      const ds = Math.max(0, ...during.map((r) => r.speed ?? 0));
      if (dm > bm) out.push({ exerciseId: id, kind: 'tiempo', value: dm, previous: bm });
      else if (ds > bs * 1.001 && bs > 0) out.push({ exerciseId: id, kind: 'velocidad', value: ds, previous: bs });
    } else {
      const h = exerciseHistory(finishedSessions, id);
      const before = h.filter((r) => r.date < from);
      const during = h.filter((r) => r.date >= from && r.date <= to);
      if (!before.length || !during.length) continue;
      const bk = Math.max(...before.map((r) => r.topKg));
      const dk = Math.max(...during.map((r) => r.topKg));
      const b1 = Math.max(...before.map((r) => r.best1rm));
      const d1 = Math.max(...during.map((r) => r.best1rm));
      if (dk > bk) out.push({ exerciseId: id, kind: 'peso', value: dk, previous: bk });
      else if (d1 > b1 * 1.001) out.push({ exerciseId: id, kind: '1rm', value: d1, previous: b1 });
    }
  }
  return out;
}
