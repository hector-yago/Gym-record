// Molestias por zona (músculo/articulación cercana). Lógica pura.
// No es consejo médico: solo avisa en los ejercicios que cargan la zona y evita proponer subidas de peso.
import { MUSCLES } from './catalog.js';
import { isValidKey } from './dates.js';
import { newId } from './workouts.js';

export const MAX_PAIN_NOTE = 200;

export function sanitizePain(p) {
  if (!p?.id || !MUSCLES[p.area] || !isValidKey(p.date)) return null;
  const out = { id: String(p.id), area: p.area, note: String(p.note ?? '').trim().slice(0, MAX_PAIN_NOTE), date: p.date, resolved: Boolean(p.resolved) };
  if (out.resolved && isValidKey(p.resolvedDate)) out.resolvedDate = p.resolvedDate;
  return out;
}

export const newPain = (area, note, date) => sanitizePain({ id: `pain-${newId()}`, area, note, date, resolved: false });
export const activePains = (pains) => pains.filter((p) => !p.resolved);

/** Molestias activas que carga el ejercicio: `main` si es su músculo principal, `side` si es secundario. */
export function painsFor(exercise, pains) {
  if (!exercise || exercise.kind === 'cardio') return [];
  return activePains(pains)
    .map((p) => (p.area === exercise.primary ? { ...p, role: 'main' } : exercise.secondary?.includes(p.area) ? { ...p, role: 'side' } : null))
    .filter(Boolean);
}

const names = (list) => list.map((e) => e.nickname || e.name).slice(0, 4).join(', ');

/** Consejos generales por molestia activa (prioridad alta, con su «por qué»). */
export function painRecommendations(pains, exercises, today) {
  return activePains(pains).map((p) => {
    const loading = exercises.filter((e) => !e.hidden && e.kind !== 'cardio' && (e.primary === p.area || e.secondary.includes(p.area)));
    const main = loading.filter((e) => e.primary === p.area);
    return {
      kind: 'pain', priority: 3, painId: p.id,
      title: `Molestia en ${MUSCLES[p.area].name.toLowerCase()}`,
      detail: `${p.note ? `«${p.note}» · ` : ''}desde el ${p.date.slice(8)}/${p.date.slice(5, 7)}. No subas peso en los ejercicios que la cargan${main.length ? ` (${names(main)}…)` : ''} y prueba variantes más suaves. Si dura más de unos días o empeora, consulta a un profesional sanitario.`,
      why: `Molestia activa en ${MUSCLES[p.area].name.toLowerCase()} anotada por ti.`,
    };
  });
}
