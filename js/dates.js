// Fechas como claves 'YYYY-MM-DD'. Aritmética UTC sobre claves: inmune a cambios de horario. Módulo puro.
const pad = (n) => String(n).padStart(2, '0');

export const isValidKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && !Number.isNaN(Date.parse(`${k}T00:00:00Z`)) && new Date(`${k}T00:00:00Z`).toISOString().startsWith(k);

/** Clave del día local de un Date. */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const toUtc = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
const fromUtc = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export const addDays = (k, n) => fromUtc(toUtc(k) + n * 86400000);
/** Días de a hasta b (positivo si b es posterior). */
export const diffDays = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export const isoDow = (k) => ((new Date(toUtc(k)).getUTCDay() + 6) % 7) + 1;
/** Lunes de la semana de la clave. */
export const weekStart = (k) => addDays(k, 1 - isoDow(k));

export const DOW_NAMES = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function agoLabel(k, today) {
  const n = diffDays(k, today);
  if (n <= 0) return 'hoy';
  if (n === 1) return 'ayer';
  if (n < 14) return `hace ${n} días`;
  if (n < 60) return `hace ${Math.round(n / 7)} semanas`;
  return `hace ${Math.round(n / 30)} meses`;
}
