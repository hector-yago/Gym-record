// Estadísticas puras sobre sesiones terminadas.
import { addDays, diffDays, weekStart } from './dates.js';
import { MUSCLE_IDS } from './catalog.js';
import { sessionVolume, workingSets } from './workouts.js';

const done = (sessions) => sessions.filter((s) => s.endedAt);

/** Series de trabajo por músculo en [from, to]. Principal cuenta 1; secundario 0,5 (series «efectivas»). */
export function muscleSets(sessions, exMap, from, to) {
  const out = Object.fromEntries(MUSCLE_IDS.map((m) => [m, { primary: 0, secondary: 0, effective: 0 }]));
  for (const s of done(sessions)) {
    if (s.date < from || s.date > to) continue;
    for (const e of s.entries) {
      const ex = exMap.get(e.exerciseId);
      if (!ex) continue;
      const n = workingSets(e).length;
      if (out[ex.primary]) { out[ex.primary].primary += n; out[ex.primary].effective += n; }
      for (const m of ex.secondary) if (out[m]) { out[m].secondary += n; out[m].effective += n * 0.5; }
    }
  }
  return out;
}

/** Último día en que se trabajó cada músculo como principal (null si nunca). */
export function lastTrained(sessions, exMap) {
  const out = Object.fromEntries(MUSCLE_IDS.map((m) => [m, null]));
  for (const s of done(sessions)) {
    for (const e of s.entries) {
      const ex = exMap.get(e.exerciseId);
      if (!ex || ex.kind === 'cardio' || !workingSets(e).length) continue;
      if (!out[ex.primary] || s.date > out[ex.primary]) out[ex.primary] = s.date;
    }
  }
  return out;
}

/** Sesiones y volumen por semana (lunes) de las últimas `weeks` semanas, la actual la última. */
export function weeklyCounts(sessions, today, weeks = 8) {
  const start = weekStart(today);
  const rows = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(start, -7 * i);
    const to = addDays(from, 6);
    const list = done(sessions).filter((s) => s.date >= from && s.date <= to);
    rows.push({ from, count: list.length, volume: list.reduce((a, s) => a + sessionVolume(s), 0) });
  }
  return rows;
}

/** Media real de sesiones por semana: últimas `weeks` semanas completas, o desde la primera sesión si hay menos historia. */
export function avgPerWeek(sessions, today, weeks = 8) {
  const list = done(sessions);
  if (!list.length) return 0;
  const first = list.reduce((m, s) => (s.date < m ? s.date : m), list[0].date);
  const span = Math.min(weeks, Math.max(1, Math.ceil((diffDays(weekStart(first), weekStart(today)) + 1) / 7)));
  const from = addDays(weekStart(today), -7 * (span - 1));
  return list.filter((s) => s.date >= from).length / span;
}

/** Semanas seguidas (terminando en la actual o la anterior) en las que se llegó al objetivo de sesiones. */
export function weekStreak(sessions, today, target = 1) {
  const need = Math.max(1, Math.floor(target));
  const counts = weeklyCounts(sessions, today, 52);
  let i = counts.length - 1;
  if (counts[i].count < need) i--; // la semana en curso aún puede completarse
  let n = 0;
  while (i >= 0 && counts[i].count >= need) { n++; i--; }
  return n;
}

export function totals(sessions) {
  const list = done(sessions);
  return {
    sessions: list.length,
    sets: list.reduce((a, s) => a + s.entries.reduce((b, e) => b + workingSets(e).length, 0), 0),
    volume: list.reduce((a, s) => a + sessionVolume(s), 0),
    minutes: list.reduce((a, s) => a + (s.endedAt && s.startedAt ? Math.max(0, (s.endedAt - s.startedAt) / 60000) : 0), 0),
  };
}

/** Duración en minutos de una sesión terminada (limitada a 6 h por si se olvidó terminarla). */
export const sessionMinutes = (s) => (s.endedAt && s.startedAt ? Math.min(360, Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000))) : 0);
