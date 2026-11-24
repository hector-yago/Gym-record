// Cardio: bloques de actividad dentro de una sesión. Lógica pura (sin DOM ni reloj).
// Un ejercicio de cardio guarda en su entrada `blocks: [{ min, km?, level?, incline?, bpm?, rpe?:1|2|3 }]` (no usa `sets`).
import { addDays, diffDays, weekStart } from './dates.js';

export const CARDIO_METRICS = {
  km: { label: 'Distancia', unit: 'km', step: 0.5 },
  level: { label: 'Nivel / resistencia', unit: 'nivel', step: 1 },
  incline: { label: 'Inclinación', unit: '% incl.', step: 0.5 },
  bpm: { label: 'Pulsaciones medias', unit: 'ppm', step: 5 },
};
export const CARDIO_THRESHOLDS = { breakDays: 21, stagnantSessions: 3, lowFactor: 0.4, noCardioDays: 28, restFactor: 0.8, timeStepFactor: 0.1 };
export const DEFAULT_CARDIO_TARGET = 150;

const fmt = (n, d = 1) => String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',');
export const isCardio = (e) => e?.kind === 'cardio';

/** Normaliza un bloque; null si no tiene al menos 1 minuto. */
export function sanitizeBlock(b) {
  const min = Math.round(Number(b?.min));
  if (!Number.isFinite(min) || min < 1 || min > 600) return null;
  const out = { min };
  const opt = (key, lo, hi, decimals) => {
    const raw = b?.[key];
    const v = Number(raw);
    if (raw === null || raw === undefined || raw === '' || !Number.isFinite(v) || v < lo || v > hi || v === 0) return;
    out[key] = Math.round(v * 10 ** decimals) / 10 ** decimals;
  };
  opt('km', 0, 500, 2);
  opt('level', 0, 50, 0);
  opt('incline', 0, 30, 1);
  opt('bpm', 30, 230, 0);
  if ([1, 2, 3].includes(b?.rpe)) out.rpe = b.rpe;
  return out;
}

export const blockSpeed = (b) => (b?.km > 0 && b.min > 0 ? b.km / (b.min / 60) : null);
export const blocksMinutes = (blocks) => (blocks ?? []).reduce((a, b) => a + b.min, 0);
export const entryCardioMinutes = (entry) => blocksMinutes(entry?.blocks);
export const sessionCardioMinutes = (session) => session.entries.reduce((a, e) => a + entryCardioMinutes(e), 0);

/** «20 min · 2,5 km · 7,5 km/h · nivel 8» (un bloque) o «3 bloques · 35 min · 4,1 km» (varios). */
export function describeBlocks(blocks) {
  if (!blocks?.length) return '';
  if (blocks.length === 1) {
    const b = blocks[0];
    const speed = blockSpeed(b);
    return [`${b.min} min`, b.km && `${fmt(b.km, 2)} km`, speed && `${fmt(speed)} km/h`, b.level && `nivel ${b.level}`, b.incline && `${fmt(b.incline)} % incl.`, b.bpm && `${b.bpm} ppm`].filter(Boolean).join(' · ');
  }
  const km = blocks.reduce((a, b) => a + (b.km ?? 0), 0);
  return [`${blocks.length} bloques`, `${blocksMinutes(blocks)} min`, km > 0 && `${fmt(km, 2)} km`].filter(Boolean).join(' · ');
}

/** Historial de un ejercicio de cardio: una fila por sesión (más antigua primero). */
export function cardioHistory(sessions, exerciseId, { includeActive = false } = {}) {
  const rows = [];
  for (const s of sessions) {
    if (!s.endedAt && !includeActive) continue;
    const blocks = s.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.blocks ?? []);
    if (!blocks.length) continue;
    const minutes = blocksMinutes(blocks);
    const km = blocks.reduce((a, b) => a + (b.km ?? 0), 0);
    const rpes = blocks.map((b) => b.rpe).filter(Boolean);
    rows.push({
      date: s.date, sessionId: s.id, startedAt: s.startedAt, blocks, minutes, km,
      speed: km > 0 ? km / (minutes / 60) : null,
      level: Math.max(0, ...blocks.map((b) => b.level ?? 0)),
      incline: Math.max(0, ...blocks.map((b) => b.incline ?? 0)),
      allEasy: rpes.length === blocks.length && rpes.every((r) => r === 1),
      allLimit: rpes.length === blocks.length && rpes.every((r) => r === 3),
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt);
}

export const lastCardio = (sessions, exerciseId, excludeSessionId = null) => cardioHistory(sessions.filter((s) => s.id !== excludeSessionId), exerciseId).at(-1) ?? null;

/** Valores iniciales del siguiente bloque: el último de la sesión, si no el de la última vez, si no los minutos típicos. */
export function nextCardioDraft(entry, last, exercise) {
  const base = entry?.blocks?.at(-1) ?? last?.blocks?.[0];
  return { min: base?.min ?? exercise?.typicalMin ?? 20, km: base?.km ?? 0, level: base?.level ?? 0, incline: base?.incline ?? 0, bpm: base?.bpm ?? 0, rpe: null };
}

/** Minutos y km de cardio por semana (lunes) de las últimas `weeks` semanas, la actual la última. */
export function weeklyCardio(sessions, today, weeks = 8) {
  const start = weekStart(today);
  const done = sessions.filter((s) => s.endedAt);
  return Array.from({ length: weeks }, (_, k) => {
    const from = addDays(start, -7 * (weeks - 1 - k));
    const to = addDays(from, 6);
    const list = done.filter((s) => s.date >= from && s.date <= to);
    return { from, minutes: list.reduce((a, s) => a + sessionCardioMinutes(s), 0), km: list.reduce((a, s) => a + s.entries.reduce((b, e) => b + (e.blocks ?? []).reduce((c, x) => c + (x.km ?? 0), 0), 0), 0) };
  });
}

export const cardioTotals = (sessions) => {
  const done = sessions.filter((s) => s.endedAt);
  return { minutes: done.reduce((a, s) => a + sessionCardioMinutes(s), 0), sessions: done.filter((s) => sessionCardioMinutes(s) > 0).length };
};

/**
 * Recomendación para una actividad de cardio. kind: cardio_up | cardio_down | cardio_time | cardio_keep.
 * `exercise.metrics` indica qué intensidad se puede subir (nivel, inclinación o velocidad).
 */
export function cardioRecommendation(exercise, history, today) {
  const n = history.length;
  if (!n) return null;
  const last = history[n - 1];
  const prev = n > 1 ? history[n - 2] : null;
  const metrics = exercise.metrics ?? [];
  const base = { exerciseId: exercise.id };
  const T = CARDIO_THRESHOLDS;

  const away = diffDays(last.date, today);
  if (away >= T.breakDays) {
    const min = Math.max(10, Math.round((last.minutes * T.restFactor) / 5) * 5);
    return { ...base, kind: 'cardio_down', priority: 3, target: { min }, title: `Vuelve con ${min} min suaves`, detail: `Llevas ${away} días sin hacerlo. Empieza con ${min} min a intensidad cómoda y recupera tu ritmo en 2-3 sesiones.`, why: `Parón de ${away} días (≥ ${T.breakDays}).` };
  }
  if (last.allLimit && prev?.allLimit) {
    return { ...base, kind: 'cardio_down', priority: 3, title: 'Baja un punto la intensidad', detail: 'Las dos últimas veces has acabado «al límite». Reduce nivel, inclinación o velocidad un escalón y mantén el tiempo; la constancia importa más que el pico.', why: 'Dos sesiones seguidas «al límite».' };
  }
  if (last.allEasy && prev?.allEasy) {
    if (metrics.includes('level')) return { ...base, kind: 'cardio_up', priority: 3, target: { level: (last.level || 0) + 1 }, title: `Sube a nivel ${(last.level || 0) + 1}`, detail: 'Las dos últimas sesiones te han resultado fáciles. Sube un nivel de resistencia y mantén el tiempo.', why: 'Dos sesiones seguidas «fácil».' };
    if (metrics.includes('incline')) return { ...base, kind: 'cardio_up', priority: 3, target: { incline: round1((last.incline || 0) + 1) }, title: `Sube a ${fmt((last.incline || 0) + 1)} % de inclinación`, detail: 'Las dos últimas sesiones te han resultado fáciles. Un punto más de inclinación sube el esfuerzo sin correr más.', why: 'Dos sesiones seguidas «fácil».' };
    return { ...base, kind: 'cardio_up', priority: 3, title: 'Un poco más rápido', detail: `Las dos últimas sesiones te han resultado fáciles${last.speed ? ` (a ${fmt(last.speed)} km/h de media)` : ''}. Sube ~0,5 km/h o alarga el tiempo.`, why: 'Dos sesiones seguidas «fácil».' };
  }
  const k = T.stagnantSessions;
  if (n >= k && history.slice(-k).every((h) => h.minutes === last.minutes && !h.allLimit)) {
    const add = Math.max(2, Math.round((last.minutes * T.timeStepFactor) / 1) || 2);
    const min = last.minutes + Math.min(add, 10);
    return { ...base, kind: 'cardio_time', priority: 2, target: { min }, title: `Prueba con ${min} min`, detail: `Llevas ${k} sesiones con ${last.minutes} min. Añade unos minutos (~10 %) para seguir progresando.`, why: `${k} sesiones seguidas con el mismo tiempo.` };
  }
  return { ...base, kind: 'cardio_keep', priority: 0, title: 'Mantén el ritmo', detail: 'Sin cambios: cuando te resulte «fácil» dos veces seguidas te propondré más intensidad.', why: 'Sin señales de progreso ni de exceso.' };
}
const round1 = (n) => Math.round(n * 10) / 10;

const WORKING = (e) => (e.sets ?? []).filter((s) => !s.warmup).length;

/** Consejos generales de cardio: añadir cardio, volumen semanal bajo y equilibrio con la fuerza. */
export function cardioGeneralRecommendations(sessions, today, targetMin = DEFAULT_CARDIO_TARGET) {
  const done = sessions.filter((s) => s.endedAt);
  if (done.length < 3) return [];
  const from = addDays(today, -(CARDIO_THRESHOLDS.noCardioDays - 1));
  const recent = done.filter((s) => s.date >= from && s.date <= today);
  const min28 = recent.reduce((a, s) => a + sessionCardioMinutes(s), 0);
  const sets28 = recent.reduce((a, s) => a + s.entries.reduce((b, e) => b + WORKING(e), 0), 0);
  const ever = done.some((s) => sessionCardioMinutes(s) > 0);
  const out = [];
  if (!ever) {
    out.push({ kind: 'cardio_add', priority: 1, title: 'Añade algo de cardio', detail: 'Solo has registrado fuerza. 15-20 min de cinta, elíptica o bici al terminar mejoran la resistencia y la recuperación. Empieza con algo cómodo.', why: 'Ningún bloque de cardio registrado.' });
  } else if (min28 / 4 < targetMin * CARDIO_THRESHOLDS.lowFactor) {
    out.push({ kind: 'cardio_add', priority: 1, title: 'Poco cardio últimamente', detail: `Tu media es de ${fmt(min28 / 4, 0)} min/semana de cardio registrado. La referencia orientativa para adultos son ~${targetMin} min/semana de actividad moderada (contando también andar, bici al trabajo, etc.).`, why: `Media 4 semanas ${fmt(min28 / 4, 0)} min < ${fmt(targetMin * CARDIO_THRESHOLDS.lowFactor, 0)} min.` });
  }
  if (ever && min28 > 0 && sets28 === 0 && recent.length >= 3) {
    out.push({ kind: 'balance', priority: 1, title: 'Añade algo de fuerza', detail: 'En las últimas 4 semanas solo has hecho cardio. Dos días de fuerza a la semana ayudan a mantener músculo y huesos.', why: 'Cardio sin series de fuerza en 28 días.' });
  }
  return out;
}
