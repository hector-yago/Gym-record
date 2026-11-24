// Objetivo de entrenamiento (fuerza / hipertrofia / mantenimiento) y descansos. Lógica pura.
// El objetivo cambia los rangos de repeticiones por defecto, los descansos y lo conservadores que son los consejos.
export const GOALS = {
  strength: { label: 'Fuerza', hint: 'Pocas repeticiones con más peso (3-6 en compuestos) y descansos largos.' },
  hypertrophy: { label: 'Hipertrofia', hint: 'Masa muscular: rangos del catálogo (normalmente 8-12) y descanso estándar.' },
  maintenance: { label: 'Mantenimiento', hint: 'Mantener lo que tienes: descansos cortos y consejos más prudentes (sin subir peso solo por «fácil»).' },
};
export const DEFAULT_GOAL = 'hypertrophy';
export const isGoal = (g) => Object.hasOwn(GOALS, g);

const timeBased = (e) => (e?.reps?.[1] ?? 0) >= 30;

/** Compuesto = varios músculos implicados (no cardio, no ejercicios por tiempo). */
export const isCompound = (e) => e?.kind !== 'cardio' && !timeBased(e) && (e?.secondary?.length ?? 0) >= 2;

/** Rango de repeticiones por defecto según objetivo; el del usuario siempre manda (se aplica fuera). */
export function repRangeFor(e, goal) {
  if (e.kind === 'cardio' || timeBased(e) || goal !== 'strength') return e.reps;
  return isCompound(e) ? [3, 6] : [6, 10];
}

const GOAL_REST_DELTA = { strength: 60, hypertrophy: 0, maintenance: -30 };
export const REST_OPTIONS = [45, 60, 90, 120, 150, 180, 240];

/**
 * Descanso en segundos: el del ejercicio si lo tiene; si no, el base (ajuste) + ajuste del objetivo;
 * los ejercicios de aislamiento descansan 30 s menos que los compuestos (mín. 45 s).
 */
export function restFor(e, { restSeconds = 90, goal = DEFAULT_GOAL } = {}, override = null) {
  if (Number.isInteger(override) && override >= 10 && override <= 600) return override;
  const base = restSeconds + (GOAL_REST_DELTA[goal] ?? 0);
  return Math.min(600, Math.max(30, isCompound(e) ? base : Math.max(45, base - 30)));
}

/** Consejos prudentes: solo suben peso al llegar al tope de repeticiones y no proponen cambios por estancamiento. */
export const isConservative = (goal) => goal === 'maintenance';
