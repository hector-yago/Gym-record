// Informe mensual (datos + HTML autónomo para compartir) y comparación de dos sesiones. Lógica pura.
import { entryCardioMinutes, sessionCardioMinutes } from './cardio.js';
import { MUSCLE_IDS } from './catalog.js';
import { addDays, diffDays } from './dates.js';
import { prsInRange } from './records.js';
import { muscleSets, sessionMinutes } from './stats.js';
import { describeSets, est1RM, fmtKg, sessionSetCount, sessionVolume, workingSets } from './workouts.js';

const pad = (n) => String(n).padStart(2, '0');
const done = (sessions) => sessions.filter((s) => s.endedAt);

export const ymOf = (date) => date.slice(0, 7);
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export function monthBounds(ym) {
  const next = `${shiftMonth(ym, 1)}-01`;
  return { from: `${ym}-01`, to: addDays(next, -1) };
}
export const monthLabel = (ym) => new Date(`${ym}-15T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

function summarize(list) {
  return {
    sessions: list.length,
    days: new Set(list.map((s) => s.date)).size,
    sets: list.reduce((a, s) => a + sessionSetCount(s), 0),
    volume: list.reduce((a, s) => a + sessionVolume(s), 0),
    minutes: list.reduce((a, s) => a + sessionMinutes(s), 0),
    cardioMinutes: list.reduce((a, s) => a + sessionCardioMinutes(s), 0),
    cardioKm: list.reduce((a, s) => a + s.entries.reduce((b, e) => b + (e.blocks ?? []).reduce((c, x) => c + (x.km ?? 0), 0), 0), 0),
  };
}

/** Datos del informe de un mes (`ym` = 'AAAA-MM'), con la comparación con el mes anterior. */
export function monthReport(sessions, exMap, ym) {
  const { from, to } = monthBounds(ym);
  const prev = monthBounds(shiftMonth(ym, -1));
  const inMonth = done(sessions).filter((s) => s.date >= from && s.date <= to);
  const inPrev = done(sessions).filter((s) => s.date >= prev.from && s.date <= prev.to);
  const total = summarize(inMonth);
  const before = summarize(inPrev);

  const perExercise = new Map();
  for (const s of inMonth) {
    for (const e of s.entries) {
      const ex = exMap.get(e.exerciseId);
      if (!ex || ex.kind === 'cardio') continue;
      const row = perExercise.get(e.exerciseId) ?? { exerciseId: e.exerciseId, sets: 0, volume: 0, sessions: 0 };
      row.sets += workingSets(e).length;
      row.volume += workingSets(e).reduce((a, x) => a + (x.kg > 0 ? x.kg * x.reps : 0), 0);
      row.sessions += 1;
      perExercise.set(e.exerciseId, row);
    }
  }
  const cardio = new Map();
  for (const s of inMonth) for (const e of s.entries) {
    const n = entryCardioMinutes(e);
    if (n > 0) cardio.set(e.exerciseId, (cardio.get(e.exerciseId) ?? 0) + n);
  }
  const weeks = (diffDays(from, to) + 1) / 7;
  const sets = muscleSets(inMonth, exMap, from, to);
  return {
    ym, from, to, ...total,
    perWeek: total.sessions / weeks,
    previous: before,
    topExercises: [...perExercise.values()].sort((a, b) => b.sets - a.sets || b.volume - a.volume).slice(0, 5),
    cardioByExercise: [...cardio].map(([exerciseId, minutes]) => ({ exerciseId, minutes })).sort((a, b) => b.minutes - a.minutes),
    muscles: MUSCLE_IDS.map((m) => ({ muscle: m, sets: sets[m].effective })).filter((r) => r.sets > 0).sort((a, b) => b.sets - a.sets),
    prs: prsInRange(sessions, exMap, from, to),
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n, d = 0) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: d });
const delta = (now, before, unit = '') => (before > 0 ? `${now >= before ? '▲' : '▼'} ${num(Math.abs(now - before), 1)}${unit} frente al mes anterior` : '');
const prText = (r) => ({ peso: `peso máximo ${fmtKg(r.value)} kg (antes ${fmtKg(r.previous)})`, '1rm': `1RM estimado ${num(r.value, 1)} kg (antes ${num(r.previous, 1)})`, tiempo: `mejor tiempo ${r.value} min (antes ${r.previous})`, velocidad: `velocidad media ${num(r.value, 1)} km/h (antes ${num(r.previous, 1)})` })[r.kind];

/** HTML autónomo (sin red ni scripts) para guardar, compartir o imprimir como PDF. */
export function reportHtml(r, { nameOf, muscleName }) {
  const rows = (items, cells) => (items.length ? `<table>${items.map((i) => `<tr>${cells(i).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>` : '<p class="m">Sin datos este mes.</p>');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informe de ${esc(monthLabel(r.ym))}</title>
<style>body{font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1b1612}h1{margin:0 0 4px}h2{margin:24px 0 8px;font-size:1.05rem;border-bottom:2px solid #d9480f;padding-bottom:4px}.m{color:#6b625a}.k{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.k div{background:#f6f4f1;border-radius:10px;padding:10px}.k b{display:block;font-size:1.4rem}.k small{color:#6b625a}table{width:100%;border-collapse:collapse}td{padding:6px 4px;border-bottom:1px solid #ece8e3}td:last-child{text-align:right}@media print{body{margin:0}}</style></head><body>
<h1>Informe de ${esc(monthLabel(r.ym))}</h1><p class="m">Gym Record · del ${esc(r.from.slice(8))}/${esc(r.from.slice(5, 7))} al ${esc(r.to.slice(8))}/${esc(r.to.slice(5, 7))}</p>
<div class="k"><div><b>${r.sessions}</b><small>entrenamientos · ${r.days} días${r.previous.sessions ? ` · ${esc(delta(r.sessions, r.previous.sessions))}` : ''}</small></div><div><b>${num(r.perWeek, 1)}</b><small>por semana de media</small></div><div><b>${num(r.sets)}</b><small>series de trabajo</small></div><div><b>${num(r.volume / 1000, 1)} t</b><small>volumen levantado${r.previous.volume ? ` · ${esc(delta(r.volume / 1000, r.previous.volume / 1000, ' t'))}` : ''}</small></div><div><b>${num(r.minutes / 60, 1)} h</b><small>tiempo entrenando</small></div><div><b>${num(r.cardioMinutes)} min</b><small>cardio${r.cardioKm ? ` · ${num(r.cardioKm, 1)} km` : ''}</small></div></div>
<h2>Récords del mes</h2>${rows(r.prs, (p) => [esc(nameOf(p.exerciseId)), esc(prText(p))])}
<h2>Ejercicios más trabajados</h2>${rows(r.topExercises, (e) => [esc(nameOf(e.exerciseId)), `${e.sets} series · ${num(e.volume)} kg`])}
<h2>Músculos (series efectivas)</h2>${rows(r.muscles, (m) => [esc(muscleName(m.muscle)), `${num(m.sets, 1)}`])}
<h2>Cardio</h2>${rows(r.cardioByExercise, (c) => [esc(nameOf(c.exerciseId)), `${c.minutes} min`])}
<p class="m">Generado en el dispositivo; tus datos no salen de él salvo que compartas este fichero.</p></body></html>`;
}

/** Resumen de un ejercicio dentro de una sesión (fuerza o cardio). */
function sideOf(session, exerciseId, ex) {
  const entries = session.entries.filter((e) => e.exerciseId === exerciseId);
  if (!entries.length) return null;
  if (ex?.kind === 'cardio') {
    const blocks = entries.flatMap((e) => e.blocks ?? []);
    const minutes = blocks.reduce((a, b) => a + b.min, 0);
    const km = blocks.reduce((a, b) => a + (b.km ?? 0), 0);
    return { kind: 'cardio', minutes, km, speed: km > 0 && minutes > 0 ? km / (minutes / 60) : null, blocks };
  }
  const sets = entries.flatMap(workingSets);
  if (!sets.length) return null;
  return {
    kind: 'strength', sets, text: describeSets(sets), topKg: Math.max(...sets.map((s) => s.kg)),
    volume: sets.reduce((a, s) => a + (s.kg > 0 ? s.kg * s.reps : 0), 0), best1rm: Math.max(...sets.map((s) => est1RM(s.kg, s.reps))),
  };
}

/**
 * Compara dos sesiones ejercicio a ejercicio. Las diferencias son B − A (si A es la más antigua, positivo = mejora).
 * Devuelve filas con `a`/`b` (null si ese ejercicio no está en esa sesión) y un resumen global.
 */
export function compareSessions(a, b, exMap) {
  const ids = [...new Set([...a.entries, ...b.entries].map((e) => e.exerciseId))];
  const rows = ids.map((id) => {
    const ex = exMap.get(id);
    const sa = sideOf(a, id, ex);
    const sb = sideOf(b, id, ex);
    const both = sa && sb && sa.kind === sb.kind;
    return {
      exerciseId: id, kind: ex?.kind === 'cardio' ? 'cardio' : 'strength', a: sa, b: sb,
      dTop: both && sa.kind === 'strength' ? sb.topKg - sa.topKg : null,
      dVolume: both && sa.kind === 'strength' ? sb.volume - sa.volume : null,
      d1rm: both && sa.kind === 'strength' ? sb.best1rm - sa.best1rm : null,
      dMinutes: both && sa.kind === 'cardio' ? sb.minutes - sa.minutes : null,
    };
  });
  const sum = (s) => ({ sets: sessionSetCount(s), volume: sessionVolume(s), minutes: sessionMinutes(s), cardioMinutes: sessionCardioMinutes(s) });
  return { rows, a: sum(a), b: sum(b), common: rows.filter((r) => r.a && r.b).length };
}
