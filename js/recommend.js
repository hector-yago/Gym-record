// Recomendaciones por reglas locales (sin IA), explicables y puras. Doble progresión:
//  - todas las series de trabajo en el tope del rango de reps → sube el peso un salto y vuelve al mínimo del rango;
//  - por debajo del mínimo en dos sesiones seguidas (o todo «al límite») → baja el peso un salto;
//  - dentro del rango → mismo peso e intenta +1 repetición;
//  - 3 sesiones sin mejorar el 1RM estimado → cambia de series/ejercicio;
//  - más de 3 semanas sin hacerlo → vuelve con ~10 % menos.
import { diffDays } from './dates.js';
import { MUSCLES } from './catalog.js';
import { est1RM, fmtKg, round1 } from './workouts.js';
import { lastTrained, muscleSets, weeklyCounts } from './stats.js';
import { addDays } from './dates.js';

export const THRESHOLDS = { stagnantSessions: 3, breakDays: 21, neglectedDays: 10, deloadFactor: 0.9 };

const roundToStep = (kg, step) => (step > 0 ? Math.round(kg / step) * step : round1(kg));
const allRpe = (sets, v) => sets.length > 0 && sets.every((s) => s.rpe === v);

/**
 * Recomendación para un ejercicio a partir de su historial (más antiguo primero) y `today`.
 * Devuelve null si no hay datos. kind: raise_weight | lower_weight | more_reps | add_set | remove_set | change_exercise | keep.
 */
export function exerciseRecommendation(exercise, history, today, alternatives = [], opts = {}) {
  const n = history.length;
  if (!n) return null;
  const last = history[n - 1];
  const prev = n > 1 ? history[n - 2] : null;
  const [min, max] = exercise.reps;
  const step = exercise.step ?? 0;
  const sets = last.sets;
  const base = { exerciseId: exercise.id };
  const unit = exercise.equipment === 'body' && step === 0 ? '' : ' kg';
  const withKg = (kg) => (kg > 0 ? ` con ${fmtKg(kg)}${unit}` : '');

  // 0. Vuelta tras un parón largo
  const away = diffDays(last.date, today);
  if (away >= THRESHOLDS.breakDays && last.topKg > 0) {
    const kg = Math.max(step, roundToStep(last.topKg * THRESHOLDS.deloadFactor, step));
    return { ...base, kind: 'lower_weight', priority: 3, target: { kg }, title: `Vuelve con ${fmtKg(kg)}${unit}`, detail: `Llevas ${away} días sin hacerlo. Empieza un ~10 % por debajo (${fmtKg(last.topKg)}${unit}) y recupera en 1-2 sesiones.`, why: `Parón de ${away} días (≥ ${THRESHOLDS.breakDays}).` };
  }

  const atTop = sets.filter((s) => s.kg === last.topKg);
  const allMax = sets.every((s) => s.reps >= max);
  const allEasy = allRpe(sets, 1) && last.avgReps >= max - 2;
  const struggling = last.avgReps < min;

  // 1. Le cuesta: bajar peso
  if (struggling) {
    const twice = prev && prev.topKg === last.topKg && prev.avgReps < min;
    if (twice || allRpe(sets, 3)) {
      if (sets.length >= 5) {
        return { ...base, kind: 'remove_set', priority: 2, title: 'Quita una serie', detail: `Haces ${sets.length} series y no llegas a ${min} repeticiones. Con ${sets.length - 1} series rendirás más en cada una.`, why: `Media de ${round1(last.avgReps)} reps (< ${min}) con ${sets.length} series.` };
      }
      const kg = Math.max(0, roundToStep(last.topKg - step, step));
      if (step > 0 && last.topKg > 0 && kg < last.topKg) {
        return { ...base, kind: 'lower_weight', priority: 3, target: { kg }, title: `Baja a ${fmtKg(kg)}${unit}`, detail: `No llegas a ${min} repeticiones con ${fmtKg(last.topKg)}${unit}. Baja un escalón y sube reps hasta ${max}.`, why: twice ? `Dos sesiones seguidas por debajo de ${min} reps.` : 'Todas las series «al límite» y por debajo del rango.' };
      }
    }
    return { ...base, kind: 'more_reps', priority: 1, target: { kg: last.topKg, reps: min }, title: `Busca ${min} reps${withKg(last.topKg)}`, detail: `Mantén el ${last.topKg > 0 ? 'peso' : 'esfuerzo'} hasta llegar a ${min} repeticiones en todas las series. Si en la próxima sesión sigues por debajo, bajamos el peso.`, why: `Media de ${round1(last.avgReps)} reps (< ${min}).` };
  }

  // 2. Progreso: subir peso
  if (allMax || (allEasy && !opts.conservative)) {
    if (step > 0 && last.topKg > 0) {
      const kg = round1(last.topKg + step);
      return { ...base, kind: 'raise_weight', priority: 3, target: { kg, reps: min }, title: `Sube a ${fmtKg(kg)}${unit}`, detail: `${allMax ? `Has llegado a ${max} repeticiones en todas las series` : 'Te ha resultado fácil'}. Sube ${fmtKg(step)} kg y vuelve a ${min}-${max} reps.`, why: allMax ? `Todas las series ≥ ${max} reps con ${fmtKg(last.topKg)}${unit}.` : 'Todas las series marcadas «fácil».' };
    }
    return { ...base, kind: 'add_set', priority: 2, title: 'Hazlo más difícil', detail: `Ya llegas a ${max} reps: añade una serie, lastre o una variante más difícil.`, why: `Todas las series ≥ ${max} reps con peso corporal.` };
  }

  // 3. Estancamiento: 3 sesiones sin mejorar el 1RM estimado
  const k = THRESHOLDS.stagnantSessions;
  if (!opts.conservative && n >= k + 1) {
    const recent = history.slice(-k).map((h) => h.best1rm);
    const earlier = Math.max(...history.slice(0, -k).map((h) => h.best1rm));
    if (Math.max(...recent) <= earlier * 1.005) {
      const alt = alternatives.slice(0, 2).map((a) => a.name).join(' o ');
      if (sets.length < 4) {
        return { ...base, kind: 'add_set', priority: 2, title: 'Añade una serie', detail: `Llevas ${k} sesiones sin mejorar. Prueba con ${sets.length + 1} series${alt ? `, o cambia a ${alt}` : ''}.`, why: `1RM estimado sin mejorar en ${k} sesiones.` };
      }
      return { ...base, kind: 'change_exercise', priority: 2, title: 'Cambia de ejercicio', detail: `Llevas ${k} sesiones sin mejorar y ya haces ${sets.length} series. ${alt ? `Prueba ${alt} unas semanas` : 'Cambia de variante unas semanas'}, o descansa una semana de este.`, why: `1RM estimado sin mejorar en ${k} sesiones.`, alternatives: alternatives.slice(0, 2).map((a) => a.id) };
    }
  }

  // 4. Dentro del rango: más repeticiones
  const reps = Math.min(max, Math.ceil(last.avgReps) + (Number.isInteger(last.avgReps) ? 1 : 0));
  return { ...base, kind: 'more_reps', priority: 1, target: { kg: last.topKg, reps }, title: `Intenta ${reps} reps${withKg(last.topKg)}`, detail: `Mismo peso; cuando llegues a ${max} reps en todas las series subiremos peso.`, why: `Media de ${round1(last.avgReps)} reps, rango ${min}-${max}.` };
}

const SKIP_MUSCLES = new Set(['forearms']);

/** Músculos sin trabajar (como principal) desde hace ≥ neglectedDays, los más abandonados primero. */
export function muscleRecommendations(sessions, exercises, exMap, today) {
  const done = sessions.filter((s) => s.endedAt);
  if (done.length < 2) return [];
  const last = lastTrained(done, exMap);
  const used = new Map();
  for (const s of done) for (const e of s.entries) used.set(e.exerciseId, (used.get(e.exerciseId) ?? 0) + 1);
  const out = [];
  for (const [muscle, date] of Object.entries(last)) {
    if (SKIP_MUSCLES.has(muscle)) continue;
    const days = date ? diffDays(date, today) : null;
    if (date && days < THRESHOLDS.neglectedDays) continue;
    const examples = suggestExercises(exercises, muscle, used);
    out.push({
      kind: 'train_muscle', muscle, priority: date ? 2 : 1, days, exampleIds: examples.map((e) => e.id),
      title: `Entrena ${MUSCLES[muscle].name.toLowerCase()}`,
      detail: `${date ? `Hace ${days} días que no lo trabajas` : 'Aún no has trabajado este músculo'} (${MUSCLES[muscle].hint}).${examples.length ? ` Ideas: ${examples.map((e) => e.nickname || e.name).join(', ')}.` : ''}`,
      why: date ? `Último trabajo: ${date} (≥ ${THRESHOLDS.neglectedDays} días).` : 'Sin registros de este músculo.',
    });
  }
  // Primero los que ya trabajaste y has descuidado (más días antes); los nunca trabajados, detrás.
  return out.sort((a, b) => (b.days ?? -1) - (a.days ?? -1)).slice(0, 4);
}

/** Ejercicios de un músculo: primero los que ya usas, luego máquinas (más fáciles de aprender). */
export function suggestExercises(exercises, muscle, used = new Map(), count = 2) {
  const list = exercises.filter((e) => !e.hidden && e.primary === muscle);
  const rank = (e) => (used.get(e.id) ? 0 : e.equipment === 'machine' ? 1 : e.equipment === 'cable' ? 2 : 3);
  return list.sort((a, b) => rank(a) - rank(b) || (used.get(b.id) ?? 0) - (used.get(a.id) ?? 0)).slice(0, count);
}

const PUSH = ['chest', 'shoulders', 'triceps'];
const PULL = ['lats', 'upper_back', 'biceps'];

/** Desequilibrio empuje/tirón en las últimas 4 semanas. */
export function balanceRecommendation(sessions, exMap, today) {
  const sets = muscleSets(sessions, exMap, addDays(today, -27), today);
  const sum = (ids) => ids.reduce((a, m) => a + sets[m].effective, 0);
  const push = sum(PUSH);
  const pull = sum(PULL);
  if (push >= 10 && push > pull * 1.5) {
    return { kind: 'balance', priority: 2, title: 'Más espalda', detail: `En 4 semanas: ${round1(push)} series de empuje (pecho/hombro/tríceps) frente a ${round1(pull)} de tirón (espalda/bíceps). Equilibra con remos y jalones; cuida los hombros.`, why: 'Empuje > 1,5 × tirón.' };
  }
  if (pull >= 10 && pull > push * 1.5) {
    return { kind: 'balance', priority: 2, title: 'Más pecho y hombros', detail: `En 4 semanas: ${round1(pull)} series de tirón frente a ${round1(push)} de empuje. Equilibra con presses.`, why: 'Tirón > 1,5 × empuje.' };
  }
  return null;
}

/** ¿Va por debajo del objetivo de sesiones por semana? */
export function frequencyRecommendation(avg, target, sessionCount) {
  if (sessionCount < 4 || !(target > 0)) return null;
  if (avg < target - 0.5) {
    return { kind: 'frequency', priority: 1, title: 'Frecuencia por debajo del objetivo', detail: `Tu media es de ${round1(avg)} sesiones/semana y tu objetivo es ${target}. Fija días concretos o baja el objetivo en Ajustes.`, why: `Media ${round1(avg)} < objetivo ${target}.` };
  }
  return null;
}

/** Plan sugerido para hoy: los músculos más descansados con ejercicios de ejemplo. */
export function suggestWorkout(sessions, exercises, exMap, today, maxMuscles = 3) {
  const done = sessions.filter((s) => s.endedAt);
  const last = lastTrained(done, exMap);
  const used = new Map();
  for (const s of done) for (const e of s.entries) used.set(e.exerciseId, (used.get(e.exerciseId) ?? 0) + 1);
  const rows = Object.entries(last)
    .filter(([m]) => !SKIP_MUSCLES.has(m) && m !== 'adductors')
    .map(([muscle, date]) => ({ muscle, days: date ? diffDays(date, today) : 999 }))
    .sort((a, b) => b.days - a.days);
  return rows.slice(0, maxMuscles).map((r) => ({ ...r, exercises: suggestExercises(exercises, r.muscle, used, 2) }));
}

/**
 * Series de aproximación antes de la primera serie pesada: 50 % × 8 y 70 % × 5 redondeadas al salto del ejercicio.
 * Solo con peso de trabajo ≥ 20 kg y salto > 0 (con menos peso no hace falta). Devuelve series con `warmup: true`.
 */
export function warmupSets(kg, step) {
  if (!(kg >= 20) || !(step > 0)) return [];
  const at = (f) => Math.max(step, round1(Math.round((kg * f) / step) * step));
  const out = [];
  const a = at(0.5);
  const b = at(0.7);
  if (a < kg) out.push({ kg: a, reps: 8, warmup: true });
  if (b < kg && b > a) out.push({ kg: b, reps: 5, warmup: true });
  return out;
}

/**
 * Semana de descarga: tras ≥ 6 semanas completas seguidas con carga normal (volumen ≥ 60 % de la mediana de las últimas 12),
 * y con ≥ 8 semanas de historia. Una semana ligera o un parón reinicia la cuenta.
 */
export function deloadRecommendation(sessions, today) {
  const done = sessions.filter((s) => s.endedAt);
  if (done.length < 8) return null;
  const first = done.reduce((m, s) => (s.date < m ? s.date : m), done[0].date);
  if (diffDays(first, today) < 56) return null;
  const prior = weeklyCounts(done, today, 12).slice(0, -1); // semanas completas (la actual aún no cuenta)
  const vols = prior.map((w) => w.volume).filter((v) => v > 0).sort((a, b) => a - b);
  if (vols.length < 4) return null;
  const median = vols[Math.floor(vols.length / 2)];
  let streak = 0;
  for (let i = prior.length - 1; i >= 0 && prior[i].volume >= median * 0.6; i--) streak++;
  if (streak < 6) return null;
  return {
    kind: 'deload', priority: 2, title: 'Semana de descarga',
    detail: `Llevas ${streak} semanas seguidas con carga normal. Esta semana o la próxima haz los mismos ejercicios con ~60 % del peso y sin llegar al límite; después vuelve a progresar.`,
    why: `${streak} semanas completas seguidas con volumen ≥ 60 % de tu mediana (≥ 6).`,
  };
}

/** Sustitutos de un ejercicio (mismo músculo y mismo tipo fuerza/cardio): primero los ya usados, luego mismo equipo, luego máquinas. */
export function alternativesFor(exercise, list, used = new Map(), count = 8) {
  const cardio = exercise.kind === 'cardio';
  const rank = (e) => (used.get(e.id) ? 0 : e.equipment === exercise.equipment ? 1 : e.equipment === 'machine' ? 2 : 3);
  return list
    .filter((e) => !e.hidden && e.id !== exercise.id && e.primary === exercise.primary && (e.kind === 'cardio') === cardio)
    .sort((a, b) => rank(a) - rank(b) || (used.get(b.id) ?? 0) - (used.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'es'))
    .slice(0, count);
}

export { est1RM };
