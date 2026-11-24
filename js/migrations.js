// Versionado del esquema de datos. REGLAS (ver docs/datos-y-migraciones.md):
//  - Nunca se edita una migración ya publicada; se añade una nueva (N → N+1) y se sube CURRENT_SCHEMA.
//  - Cada migración es pura e idempotente sobre el documento y NO elimina datos del usuario.
//  - Antes de migrar, el almacén guarda una copia del documento original (store.js).
//  - Cada versión publicada deja un fixture en tests/fixtures/ y un test que lo migra a la actual.
import { isValidKey } from './dates.js';
import { MUSCLES, EQUIPMENT } from './catalog.js';
import { sanitizeSet } from './workouts.js';
import { DEFAULT_CARDIO_TARGET, sanitizeBlock } from './cardio.js';

export const CURRENT_SCHEMA = 2;
export const APP_ID = 'gym-record';

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system', // 'system' | 'light' | 'dark'
  targetPerWeek: 2,
  restSeconds: 90,
  backupReminderDays: 14,
  sound: true,
  cardioTargetMin: DEFAULT_CARDIO_TARGET, // minutos de cardio por semana (orientativo)
});

export function emptyDoc() {
  return { schemaVersion: CURRENT_SCHEMA, sessions: [], customExercises: [], exerciseSettings: {}, bodyweight: [], settings: { ...DEFAULT_SETTINGS }, meta: {} };
}

// Cada clave N convierte un documento de versión N en versión N+1.
const steps = {
  // 0 → 1: documento sin versión (p. ej. importado a mano). La normalización final hace el trabajo.
  0: (doc) => ({ ...doc, schemaVersion: 1 }),
  // 1 → 2: cardio. Las entradas ganan `blocks` (vacío por defecto) y los ajustes `cardioTargetMin`; no se pierde nada.
  1: (doc) => ({ ...doc, schemaVersion: 2 }),
};

export function migrate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('El documento de datos no es válido.');
  let doc = { ...input };
  const from = Number.isInteger(doc.schemaVersion) ? doc.schemaVersion : 0;
  if (from > CURRENT_SCHEMA) {
    throw new Error(`Los datos son de una versión más nueva de la app (esquema ${from}). Actualiza la app antes de abrirlos.`);
  }
  doc.schemaVersion = from;
  for (let v = from; v < CURRENT_SCHEMA; v++) {
    if (!steps[v]) throw new Error(`Falta la migración del esquema ${v} al ${v + 1}.`);
    doc = steps[v](doc);
  }
  return { doc: sanitize(doc), from, to: CURRENT_SCHEMA };
}

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

function sanitizeEntry(e) {
  if (!e?.exerciseId) return null;
  const sets = (Array.isArray(e.sets) ? e.sets : []).map(sanitizeSet).filter(Boolean);
  const blocks = (Array.isArray(e.blocks) ? e.blocks : []).map(sanitizeBlock).filter(Boolean);
  return { exerciseId: String(e.exerciseId), notes: str(e.notes, 500), sets, blocks };
}

export function sanitizeSession(s) {
  if (!s?.id || !isValidKey(s.date)) return null;
  const startedAt = num(s.startedAt) ?? Date.now();
  const endedAt = s.endedAt == null ? null : num(s.endedAt);
  return {
    id: String(s.id),
    date: s.date,
    startedAt,
    endedAt,
    notes: str(s.notes, 1000),
    entries: (Array.isArray(s.entries) ? s.entries : []).map(sanitizeEntry).filter(Boolean),
  };
}

export function sanitizeCustomExercise(e) {
  const name = str(e?.name, 80);
  if (!e?.id || !name || !MUSCLES[e.primary]) return null;
  const reps = Array.isArray(e.reps) && e.reps.length === 2 ? [Math.round(Number(e.reps[0])), Math.round(Number(e.reps[1]))] : [8, 12];
  return {
    id: String(e.id),
    name,
    alt: str(e.alt, 120),
    primary: e.primary,
    secondary: (Array.isArray(e.secondary) ? e.secondary : []).filter((m) => MUSCLES[m] && m !== e.primary),
    equipment: EQUIPMENT[e.equipment] ? e.equipment : 'other',
    step: Number.isFinite(Number(e.step)) && Number(e.step) >= 0 ? Number(e.step) : 2.5,
    reps: reps[0] >= 1 && reps[1] >= reps[0] && reps[1] <= 100 ? reps : [8, 12],
    how: str(e.how, 600),
  };
}

function sanitizeSettingsFor(o) {
  const out = {};
  if (str(o?.nickname, 60)) out.nickname = str(o.nickname, 60);
  if (Number.isFinite(Number(o?.step)) && Number(o.step) >= 0 && Number(o.step) <= 100 && o.step !== null && o.step !== '') out.step = Number(o.step);
  if (Array.isArray(o?.reps) && o.reps.length === 2) {
    const [a, b] = o.reps.map((x) => Math.round(Number(x)));
    if (a >= 1 && b >= a && b <= 100) out.reps = [a, b];
  }
  if (str(o?.notes, 500)) out.notes = str(o.notes, 500);
  if (o?.photo) out.photo = true;
  if (o?.hidden) out.hidden = true;
  return out;
}

/** Normaliza y descarta lo irrecuperable, sin tocar lo válido. Se aplica también a las importaciones. */
export function sanitize(doc) {
  const seen = new Set();
  const sessions = [];
  for (const s of Array.isArray(doc.sessions) ? doc.sessions : []) {
    const c = sanitizeSession(s);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    sessions.push(c);
  }
  // Solo puede haber una sesión activa: la más reciente; el resto se cierran con su última marca.
  const active = sessions.filter((s) => !s.endedAt).sort((a, b) => b.startedAt - a.startedAt);
  for (const s of active.slice(1)) s.endedAt = s.startedAt;

  const customSeen = new Set();
  const customExercises = [];
  for (const e of Array.isArray(doc.customExercises) ? doc.customExercises : []) {
    const c = sanitizeCustomExercise(e);
    if (!c || customSeen.has(c.id)) continue;
    customSeen.add(c.id);
    customExercises.push(c);
  }

  const exerciseSettings = {};
  for (const [id, o] of Object.entries(doc.exerciseSettings && typeof doc.exerciseSettings === 'object' ? doc.exerciseSettings : {})) {
    const c = sanitizeSettingsFor(o);
    if (Object.keys(c).length) exerciseSettings[id] = c;
  }

  const byDate = new Map();
  for (const w of Array.isArray(doc.bodyweight) ? doc.bodyweight : []) {
    const kg = num(w?.kg);
    if (isValidKey(w?.date) && kg !== null && kg > 20 && kg < 400) byDate.set(w.date, { date: w.date, kg: Math.round(kg * 10) / 10 });
  }
  const bodyweight = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const s = { ...DEFAULT_SETTINGS, ...(doc.settings ?? {}) };
  if (!['system', 'light', 'dark'].includes(s.theme)) s.theme = 'system';
  s.targetPerWeek = Number.isFinite(Number(s.targetPerWeek)) && s.targetPerWeek >= 1 && s.targetPerWeek <= 14 ? Number(s.targetPerWeek) : 2;
  s.restSeconds = Number.isInteger(s.restSeconds) && s.restSeconds >= 10 && s.restSeconds <= 600 ? s.restSeconds : 90;
  s.backupReminderDays = Number.isInteger(s.backupReminderDays) && s.backupReminderDays > 0 ? s.backupReminderDays : 14;
  s.sound = s.sound !== false;
  s.cardioTargetMin = Number.isInteger(s.cardioTargetMin) && s.cardioTargetMin >= 30 && s.cardioTargetMin <= 1000 ? s.cardioTargetMin : DEFAULT_CARDIO_TARGET;
  const meta = {};
  for (const k of ['lastExport', 'lastAutoBackup']) if (Number.isFinite(doc.meta?.[k])) meta[k] = doc.meta[k];
  return { schemaVersion: CURRENT_SCHEMA, sessions, customExercises, exerciseSettings, bodyweight, settings: s, meta };
}
