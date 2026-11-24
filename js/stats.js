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

/** Número de entrenamientos terminados por día en [from, to]. */
export function activityByDay(sessions, from, to) {
  const map = new Map();
  for (const s of done(sessions)) if (s.date >= from && s.date <= to) map.set(s.date, (map.get(s.date) ?? 0) + 1);
  return map;
}

/** Calendario de constancia: `weeks` columnas (lunes → domingo), la semana actual la última. */
export function calendarGrid(sessions, today, weeks = 16) {
  const start = addDays(weekStart(today), -7 * (weeks - 1));
  const counts = activityByDay(sessions, start, today);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const date = addDays(start, w * 7 + d);
    return { date, count: counts.get(date) ?? 0, future: date > today };
  }));
}

/** Días desde el último entrenamiento terminado (null si no hay ninguno). */
export function daysSinceLast(sessions, today) {
  const dates = done(sessions).map((s) => s.date).filter((d) => d <= today);
  return dates.length ? diffDays(dates.sort().at(-1), today) : null;
}

export const SHORT_SETS_PER_WEEK = 6; // por debajo de esto, de forma sostenida, un músculo «se queda corto»
const SKIP_VOLUME = new Set(['forearms']);

/**
 * Series efectivas por músculo: semana en curso frente a la media de las 4 semanas completas anteriores.
 * `short` = media < 6 series/semana teniendo actividad real (≥ 4 sesiones en las últimas 4 semanas).
 */
export function muscleVolumeTable(sessions, exMap, today) {
  const start = weekStart(today);
  const weekSets = (k) => muscleSets(sessions, exMap, addDays(start, -7 * k), addDays(start, -7 * k + 6));
  const current = weekSets(0);
  const prev = [1, 2, 3, 4].map(weekSets);
  const active = done(sessions).filter((s) => s.date >= addDays(start, -28) && s.date < start).length >= 4;
  return MUSCLE_IDS.filter((m) => !SKIP_VOLUME.has(m)).map((m) => {
    const avgPrev = prev.reduce((a, w) => a + w[m].effective, 0) / 4;
    return { muscle: m, current: current[m].effective, avgPrev, delta: current[m].effective - avgPrev, short: active && avgPrev < SHORT_SETS_PER_WEEK };
  }).sort((a, b) => b.current - a.current || b.avgPrev - a.avgPrev);
}
