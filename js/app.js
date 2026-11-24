// Interfaz de Gym Record: Entreno, Historial, Estadísticas, Consejos y Más (ejercicios, peso corporal, ajustes).
// Sin dependencias ni paso de build. La lógica está en módulos puros (workouts, stats, recommend).
import { VERSION } from './version.js';
import { addDays, agoLabel, DOW_NAMES, dayKey, diffDays, isoDow, isValidKey, weekStart } from './dates.js';
import { CATALOG, CARDIO_GROUP, displayName, EQUIPMENT, exerciseIndex, groupName, groupOrder, MUSCLE_IDS, MUSCLES, resolveExercises, searchExercises, STEP_OPTIONS } from './catalog.js';
import {
  cardioGeneralRecommendations, cardioHistory, cardioRecommendation, cardioTotals, CARDIO_METRICS, describeBlocks, isCardio, lastCardio, nextCardioDraft, sanitizeBlock,
  sessionCardioMinutes, weeklyCardio,
} from './cardio.js';
import {
  activeSession, describeSets, est1RM, exerciseHistory, finished, fmtKg, lastPerformance, newId, newRecords, newSession, nextDraft, records,
  RPE_LABELS, sanitizeSet, sessionSetCount, sessionVolume, workingSets,
} from './workouts.js';
import { avgPerWeek, lastTrained, muscleSets, sessionMinutes, totals, weekStreak, weeklyCounts } from './stats.js';
import { balanceRecommendation, exerciseRecommendation, frequencyRecommendation, muscleRecommendations, suggestExercises, suggestWorkout } from './recommend.js';
import { muscleMapSvg } from './muscle-map.js';
import { beep, createTimer, fmtClock, prepareAudio } from './timer.js';
import { shrinkImage } from './photos.js';
import { createStore, indexedDbAdapter, memoryAdapter } from './store.js';
import { $, closeSheet, confirmSheet, esc, fmtDate, fmtNum, fmtStamp, ICON, lineChart, longDate, monthName, openSheet, shortDate, toast } from './ui.js';

/* ---------- estado ---------- */
// En localhost se puede fijar el día con ?hoy=AAAA-MM-DD (pruebas). En producción siempre es el día real.
const params = new URLSearchParams(location.search);
const FAKE_OK = ['localhost', '127.0.0.1'].includes(location.hostname);
let fakeToday = FAKE_OK && isValidKey(params.get('hoy') ?? '') ? params.get('hoy') : null;
const today = () => fakeToday ?? dayKey(new Date());
if (FAKE_OK) window.__setToday = (k) => { fakeToday = k; render(); };

const ui = { view: 'train', search: '', muscle: '', drafts: {}, statEx: '', statCardio: '', statDays: 7, storageWarning: '', persisted: null, timerEndedAt: 0 };
let store;
const timer = createTimer();
let cache = { doc: null };

/** Catálogo + ejercicios propios + ajustes, memoizado por versión del documento. */
function ex() {
  if (cache.doc !== store.state) {
    const list = resolveExercises(store.state);
    cache = { doc: store.state, list, map: exerciseIndex(list) };
  }
  return cache;
}
const exName = (id) => displayName(ex().map.get(id));
const doneSessions = () => finished(store.state.sessions);
const musName = groupName;
/** Chips de filtro: músculos y, al final, cardio. */
const GROUPS = [...MUSCLE_IDS, CARDIO_GROUP];
const kgStepOf = (e) => (e.step > 0 ? e.step : 2.5);
const repStepOf = (e) => (e.reps[1] >= 30 ? 5 : 1);
const repUnit = (e) => (e.reps[1] >= 30 ? 'seg' : 'reps');
const fmtElapsed = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`; };

/* ---------- acciones sobre datos ---------- */
async function mutateSession(id, fn) {
  await store.update((d) => { const s = d.sessions.find((x) => x.id === id); if (s) fn(s); });
}

async function startSession({ exerciseIds = [] } = {}) {
  if (activeSession(store.state.sessions)) return;
  ui.drafts = {};
  const s = newSession(today(), Date.now());
  s.entries = exerciseIds.map((exerciseId) => ({ exerciseId, notes: '', sets: [], blocks: [] }));
  await store.update((d) => { d.sessions.push(s); });
  ui.view = 'train';
}

async function addExercise(sid, exerciseId) {
  await mutateSession(sid, (s) => { if (!s.entries.some((e) => e.exerciseId === exerciseId)) s.entries.push({ exerciseId, notes: '', sets: [], blocks: [] }); });
}

async function registerBlock(sid, exerciseId) {
  const d = ui.drafts[exerciseId];
  const block = sanitizeBlock({ ...d, min: d?.min });
  if (!block) return toast('Indica al menos 1 minuto.');
  ui.drafts[exerciseId] = { ...d, rpe: null };
  await mutateSession(sid, (s) => s.entries.find((e) => e.exerciseId === exerciseId)?.blocks.push(block));
}

async function registerSet(sid, exerciseId) {
  const draft = ui.drafts[exerciseId];
  const set = sanitizeSet(draft);
  if (!set) return toast('Revisa el peso y las repeticiones.');
  prepareAudio();
  ui.drafts[exerciseId] = { ...draft, rpe: null, warmup: false };
  if (!set.warmup) timer.start(store.state.settings.restSeconds);
  await mutateSession(sid, (s) => s.entries.find((e) => e.exerciseId === exerciseId)?.sets.push(set));
  tick();
}

async function finishSession(sid) {
  const s = store.state.sessions.find((x) => x.id === sid);
  if (!s) return;
  const withSets = s.entries.filter((e) => e.sets.length || e.blocks?.length);
  if (!withSets.length) {
    return confirmSheet('Sesión vacía', 'No hay ninguna serie ni bloque de cardio registrado. ¿Descartar el entrenamiento?', 'Descartar', async () => {
      await store.update((d) => { d.sessions = d.sessions.filter((x) => x.id !== sid); });
      ui.drafts = {}; timer.stop(); tick();
    });
  }
  const closed = { ...s, entries: withSets, endedAt: Date.now() };
  const recs = newRecords(store.state.sessions, closed);
  await store.update((d) => { const i = d.sessions.findIndex((x) => x.id === sid); d.sessions[i] = closed; });
  ui.drafts = {}; timer.stop(); tick();
  summarySheet(closed, recs);
}

/* ---------- vistas ---------- */
const TABS = [['train', 'Entreno', ICON.train], ['history', 'Historial', ICON.history], ['stats', 'Estadísticas', ICON.stats], ['advice', 'Consejos', ICON.advice], ['more', 'Más', ICON.more]];
const SUBVIEWS = { exercises: 'Ejercicios', bodyweight: 'Peso corporal', settings: 'Ajustes' };

function header(title, sub = '', back = false) {
  return `<header class="top">${back ? '<button class="back" data-action="back" aria-label="Volver">‹ Más</button>' : ''}<div class="titles"><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div></header>`;
}

function viewTrain() {
  const s = activeSession(store.state.sessions);
  return s ? viewSession(s) : viewHome();
}

function recKindIcon(kind) {
  return { raise_weight: ['⬆️', 'up'], lower_weight: ['⬇️', 'down'], more_reps: ['🔁', ''], add_set: ['➕', ''], remove_set: ['➖', 'down'], change_exercise: ['🔄', ''], train_muscle: ['🎯', ''], balance: ['⚖️', ''], frequency: ['📅', ''], cardio_up: ['⬆️', 'up'], cardio_down: ['⬇️', 'down'], cardio_time: ['⏱', ''], cardio_keep: ['👍', ''], cardio_add: ['🏃', ''] }[kind] ?? ['💡', ''];
}
function recHtml(r, { link = false } = {}) {
  const [icon, tone] = recKindIcon(r.kind);
  const who = r.exerciseId ? `<small class="hint">${esc(exName(r.exerciseId))}</small>` : '';
  return `<div class="rec"><div class="ic ${tone}">${icon}</div><div>${who}<b>${esc(r.title)}</b><p class="hint">${esc(r.detail)}</p>${link ? '' : `<details><summary>¿Por qué?</summary><p class="hint">${esc(r.why)}</p></details>`}</div></div>`;
}

/** Todas las recomendaciones, agrupadas. */
function allRecommendations() {
  const { list, map } = ex();
  const done = doneSessions();
  const t = today();
  const used = new Set(done.filter((s) => diffDays(s.date, t) <= 60).flatMap((s) => s.entries.map((e) => e.exerciseId)));
  const perExercise = [];
  for (const id of used) {
    const e = map.get(id);
    if (!e) continue;
    let rec;
    if (isCardio(e)) rec = cardioRecommendation(e, cardioHistory(done, id), t);
    else rec = exerciseRecommendation(e, exerciseHistory(done, id), t, suggestExercises(list, e.primary, new Map(), 4).filter((a) => a.id !== id));
    if (rec) perExercise.push(rec);
  }
  perExercise.sort((a, b) => b.priority - a.priority);
  const general = [frequencyRecommendation(avgPerWeek(done, t), store.state.settings.targetPerWeek, done.length), balanceRecommendation(done, map, t), ...cardioGeneralRecommendations(done, t, store.state.settings.cardioTargetMin)].filter(Boolean);
  return { perExercise, muscles: muscleRecommendations(done, list, map, t), general };
}

function viewHome() {
  const t = today();
  const done = doneSessions();
  const target = store.state.settings.targetPerWeek;
  const week = weeklyCounts(done, t, 1)[0].count;
  const weekCardio = weeklyCardio(done, t, 1)[0].minutes;
  const dots = Array.from({ length: Math.max(target, week) }, (_, i) => `<span class="tag ${i < week ? 'ok' : ''}">${i < week ? '✓' : '·'}</span>`).join('');
  const banner = store.backupDue() ? `<div class="banner" role="alert"><span>Hace tiempo que no exportas una copia de tus entrenos.</span><button class="btn small" data-action="export">Exportar</button></div>` : '';
  const warn = ui.storageWarning ? `<div class="banner" role="alert">${esc(ui.storageWarning)}</div>` : '';
  const { list, map } = ex();
  const plan = done.length >= 2 ? suggestWorkout(done, list, map, t) : [];
  const planCard = plan.length ? `<section class="group"><h2><span>Sugerencia para hoy</span></h2><div class="card">${plan.map((p) => `<div class="line"><span><b>${esc(musName(p.muscle))}</b><br><small class="hint">${p.days >= 999 ? 'nunca trabajado' : `hace ${p.days} días`} · ${esc(p.exercises.map(displayName).join(', '))}</small></span></div>`).join('')}<div class="actions"><button class="btn small" data-action="start-plan">Empezar con estos ejercicios</button></div></div></section>` : '';
  const last = done[0];
  const lastCard = last ? `<section class="group"><h2><span>Último entreno</span><span>${esc(agoLabel(last.date, t))}</span></h2><ul class="list"><li class="row"><button class="body" data-action="open-session" data-id="${esc(last.id)}"><span class="title">${esc(summaryTitle(last))}</span><span class="meta">${esc(sessionMeta(last))}</span></button><span class="chev">›</span></li></ul></section>` : '';
  const recs = done.length ? allRecommendations() : null;
  const top = recs ? [...recs.perExercise, ...recs.muscles, ...recs.general].sort((a, b) => b.priority - a.priority).slice(0, 3) : [];
  const recCard = top.length ? `<section class="group"><h2><span>Consejos</span><button class="btn small" data-action="tab" data-v="advice">Ver todos</button></h2><div class="card">${top.map((r) => recHtml(r, { link: true })).join('')}</div></section>` : '';
  const empty = !done.length ? `<div class="empty"><b>Aún no has registrado ningún entreno</b>Pulsa «Empezar entrenamiento», añade ejercicios del catálogo y registra tus series. Con unas sesiones empezaré a darte consejos.</div>` : '';
  return `${header('Entreno', longDate(t))}${warn}${banner}
    <section class="group"><div class="card"><h3>Esta semana: ${week} de ${target}</h3><div>${dots}</div>${weekCardio ? `<p class="hint">🏃 Cardio: ${weekCardio} de ~${store.state.settings.cardioTargetMin} min</p>` : ''}</div></section>
    <button class="btn primary big block" data-action="start" style="margin-bottom:18px">Empezar entrenamiento</button>
    ${empty}${planCard}${lastCard}${recCard}`;
}

const summaryTitle = (s) => `${DOW_NAMES[isoDow(s.date)].replace(/^./, (c) => c.toUpperCase())} ${s.date.slice(8)}/${s.date.slice(5, 7)}`;
function sessionMeta(s) {
  const { map } = ex();
  const muscles = [...new Set(s.entries.map((e) => map.get(e.exerciseId)?.primary).filter((m) => m && m !== CARDIO_GROUP))].map((m) => musName(m).toLowerCase());
  const mins = sessionMinutes(s);
  const cardio = sessionCardioMinutes(s);
  const strength = s.entries.filter((e) => e.sets.length).length;
  return [
    strength ? `${strength} ${strength === 1 ? 'ejercicio' : 'ejercicios'} · ${sessionSetCount(s)} series` : '',
    sessionVolume(s) ? `${fmtNum(sessionVolume(s))} kg` : '',
    cardio ? `${cardio} min de cardio` : '',
    mins ? `${mins} min` : '',
    muscles.length ? muscles.slice(0, 3).join(', ') : '',
  ].filter(Boolean).join(' · ');
}

/* ---- sesión en curso ---- */
function viewSession(s) {
  const entries = s.entries.map((e) => entryCard(s, e)).join('');
  const sub = `${longDate(s.date)}`;
  return `<header class="top"><div class="titles"><h1>Entrenando</h1><div class="sub">${esc(sub)} · <span class="elapsed">${fmtElapsed(Date.now() - s.startedAt)}</span></div></div><button class="btn small" data-action="session-details" data-id="${esc(s.id)}">Detalles</button></header>
    ${entries || '<div class="empty"><b>Sesión vacía</b>Añade el primer ejercicio. Si no sabes cómo se llama, busca por músculo.</div>'}
    <button class="btn block big" data-action="add-exercise" data-id="${esc(s.id)}" style="margin-bottom:12px">+ Añadir ejercicio</button>
    <button class="btn primary block" data-action="finish" data-id="${esc(s.id)}">Terminar entrenamiento</button>`;
}

function stepper(exerciseId, field, value, unit, step) {
  return `<div class="stepper"><button type="button" data-action="step" data-ex="${esc(exerciseId)}" data-f="${field}" data-d="-${step}" aria-label="Menos ${unit}">−</button>
    <div class="val"><input type="number" inputmode="decimal" step="any" min="0" value="${value}" data-draft="${field}" data-ex="${esc(exerciseId)}" aria-label="${unit}" /><small>${unit}</small></div>
    <button type="button" data-action="step" data-ex="${esc(exerciseId)}" data-f="${field}" data-d="${step}" aria-label="Más ${unit}">+</button></div>`;
}

/** Tarjeta de un ejercicio de cardio: bloques (tiempo, distancia, nivel, inclinación, pulsaciones) y esfuerzo. */
function cardioCard(s, entry, e) {
  const done = doneSessions();
  const last = lastCardio(done, e.id);
  const draft = (ui.drafts[e.id] ??= nextCardioDraft(entry, last, e));
  const rec = cardioRecommendation(e, cardioHistory(done, e.id), today());
  const chips = (entry.blocks ?? []).map((b, i) => `<button class="setchip" data-action="edit-block" data-id="${esc(s.id)}" data-ex="${esc(e.id)}" data-i="${i}" aria-label="Bloque ${i + 1}: editar">${esc(describeBlocks([b]))}${b.rpe ? ` <small>${['', '😌', '👌', '🥵'][b.rpe]}</small>` : ''}</button>`).join('');
  const target = rec?.target ?? {};
  const suggest = rec && rec.priority > 0 && !entry.blocks?.length ? `<button class="suggest" data-action="apply-cardio-rec" data-ex="${esc(e.id)}" data-min="${target.min ?? ''}" data-level="${target.level ?? ''}" data-incline="${target.incline ?? ''}"><b>${esc(rec.title)}</b> · ${esc(rec.detail)}${rec.target ? ' <u>Aplicar</u>' : ''}</button>` : '';
  const metrics = (e.metrics ?? []).map((m) => stepper(e.id, m, draft[m] ?? 0, CARDIO_METRICS[m].unit, CARDIO_METRICS[m].step)).join('');
  return `<article class="entry" data-ex="${esc(e.id)}">
    <div class="entry-head"><div class="t"><b>${esc(displayName(e))}</b><small>Cardio · ${esc(EQUIPMENT[e.equipment] ?? '')}</small></div><button class="more" data-action="entry-menu" data-id="${esc(s.id)}" data-ex="${esc(e.id)}" aria-label="Más acciones">⋯</button></div>
    ${last ? `<p class="hint">Última vez (${esc(agoLabel(last.date, today()))}): ${esc(describeBlocks(last.blocks))}</p>` : '<p class="hint">Primera vez: empieza a un ritmo en el que puedas hablar.</p>'}
    ${entry.notes ? `<p class="hint">📝 ${esc(entry.notes)}</p>` : ''}
    ${suggest}
    ${chips ? `<div class="sets">${chips}</div>` : ''}
    <div class="draft">${stepper(e.id, 'min', draft.min, 'min', 5)}${metrics}</div>
    <div class="rpe" role="group" aria-label="Esfuerzo (opcional)">${[1, 2, 3].map((v) => `<button type="button" data-action="rpe" data-ex="${esc(e.id)}" data-v="${v}" aria-pressed="${draft.rpe === v}">${['', '😌', '👌', '🥵'][v]} ${RPE_LABELS[v]}</button>`).join('')}</div>
    <button class="btn primary block" data-action="register-block" data-id="${esc(s.id)}" data-ex="${esc(e.id)}">Registrar ${entry.blocks?.length ? `bloque ${entry.blocks.length + 1}` : 'cardio'}</button>
  </article>`;
}

function entryCard(s, entry) {
  const { list, map } = ex();
  const e = map.get(entry.exerciseId) ?? { id: entry.exerciseId, name: 'Ejercicio desconocido', primary: '', secondary: [], reps: [8, 12], step: 2.5, equipment: 'other' };
  if (isCardio(e)) return cardioCard(s, entry, e);
  const done = doneSessions();
  const last = lastPerformance(done, e.id);
  const draft = (ui.drafts[e.id] ??= nextDraft(entry, last, e));
  const alts = suggestExercises(list, e.primary, new Map(), 4).filter((a) => a.id !== e.id);
  const rec = exerciseRecommendation(e, exerciseHistory(done, e.id), today(), alts);
  const chips = entry.sets.map((st, i) => `<button class="setchip${st.warmup ? ' warm' : ''}" data-action="edit-set" data-id="${esc(s.id)}" data-ex="${esc(e.id)}" data-i="${i}" aria-label="Serie ${i + 1}: editar">${st.warmup ? '🔥 ' : ''}${st.kg > 0 ? `${fmtKg(st.kg)}×${st.reps}` : `${st.reps}`}${st.rpe ? ` <small>${['', '😌', '👌', '🥵'][st.rpe]}</small>` : ''}</button>`).join('');
  const suggest = rec && !entry.sets.length ? `<button class="suggest" data-action="apply-rec" data-ex="${esc(e.id)}" data-kg="${rec.target?.kg ?? ''}" data-reps="${rec.target?.reps ?? ''}"><b>${esc(rec.title)}</b> · ${esc(rec.detail)}${rec.target ? ' <u>Aplicar</u>' : ''}</button>` : '';
  const kgUnit = e.equipment === 'body' && e.step === 0 ? 'kg extra' : 'kg';
  return `<article class="entry" data-ex="${esc(e.id)}">
    <div class="entry-head"><div class="t"><b>${esc(displayName(e))}</b><small>${esc(musName(e.primary))} · ${esc(EQUIPMENT[e.equipment] ?? '')}</small></div><button class="more" data-action="entry-menu" data-id="${esc(s.id)}" data-ex="${esc(e.id)}" aria-label="Más acciones">⋯</button></div>
    ${last ? `<p class="hint">Última vez (${esc(agoLabel(last.date, today()))}): ${esc(describeSets(last.sets))}</p>` : '<p class="hint">Primera vez que lo haces: empieza ligero.</p>'}
    ${entry.notes ? `<p class="hint">📝 ${esc(entry.notes)}</p>` : ''}
    ${suggest}
    ${chips ? `<div class="sets">${chips}</div>` : ''}
    <div class="draft">${stepper(e.id, 'kg', draft.kg, kgUnit, kgStepOf(e))}${stepper(e.id, 'reps', draft.reps, repUnit(e), repStepOf(e))}</div>
    <div class="rpe" role="group" aria-label="Esfuerzo (opcional)">${[1, 2, 3].map((v) => `<button type="button" data-action="rpe" data-ex="${esc(e.id)}" data-v="${v}" aria-pressed="${draft.rpe === v}">${['', '😌', '👌', '🥵'][v]} ${RPE_LABELS[v]}</button>`).join('')}<button type="button" class="warm" data-action="warm" data-ex="${esc(e.id)}" aria-pressed="${draft.warmup}">🔥 Calent.</button></div>
    <button class="btn primary block" data-action="register" data-id="${esc(s.id)}" data-ex="${esc(e.id)}">Registrar serie ${workingSets(entry).length + 1}</button>
  </article>`;
}

/* ---- historial ---- */
function viewHistory() {
  const list = doneSessions();
  if (!list.length) return `${header('Historial', 'Tus entrenamientos')}<div class="empty"><b>Nada todavía</b>Aquí verás tus sesiones pasadas.</div>`;
  let month = '';
  let html = '';
  for (const s of list) {
    const m = monthName(s.date);
    if (m !== month) { if (month) html += '</ul></section>'; month = m; html += `<section class="group"><h2><span style="text-transform:capitalize">${esc(m)}</span></h2><ul class="list">`; }
    html += `<li class="row"><button class="body" data-action="open-session" data-id="${esc(s.id)}"><span class="title">${esc(summaryTitle(s))}</span><span class="meta">${esc(sessionMeta(s))}</span></button><span class="chev">›</span></li>`;
  }
  return `${header('Historial', `${list.length} entrenamientos`)}${html}</ul></section>`;
}

/* ---- estadísticas ---- */
function viewStats() {
  const t = today();
  const done = doneSessions();
  const { list, map } = ex();
  if (!done.length) return `${header('Estadísticas')}<div class="empty"><b>Sin datos todavía</b>Termina tu primer entrenamiento para ver estadísticas.</div>`;
  const tot = totals(done);
  const weeks = weeklyCounts(done, t, 8);
  const maxC = Math.max(1, ...weeks.map((w) => w.count));
  const bars = weeks.map((w) => `<div title="Semana del ${fmtDate(w.from)}: ${w.count}"><i class="${w.count ? '' : 'zero'}" style="height:${Math.max(3, (w.count / maxC) * 70)}px"></i><span>${w.count}</span></div>`).join('');
  const days = ui.statDays;
  const sets = muscleSets(done, map, addDays(t, -(days - 1)), t);
  const goal = (10 * days) / 7; // ~10 series efectivas por músculo y semana
  const intensity = Object.fromEntries(MUSCLE_IDS.map((m) => [m, Math.min(1, sets[m].effective / goal)]));
  const lastT = lastTrained(done, map);
  const rows = MUSCLE_IDS.map((m) => ({ m, v: sets[m].effective })).sort((a, b) => b.v - a.v).map(({ m, v }) => `<div class="mmrow"><span class="nm">${esc(musName(m))}</span><span class="bar"><i style="width:${Math.min(100, (v / goal) * 100)}%"></i></span><span class="n">${fmtNum(v, 1)} ser.${lastT[m] ? '' : ' ·nunca'}</span></div>`).join('');
  const trained = list.filter((e) => exerciseHistory(done, e.id).length);
  const sel = trained.find((e) => e.id === ui.statEx) ?? trained.sort((a, b) => (exerciseHistory(done, b.id).at(-1)?.date ?? '').localeCompare(exerciseHistory(done, a.id).at(-1)?.date ?? ''))[0];
  const hist = sel ? exerciseHistory(done, sel.id) : [];
  const rec = records(hist);
  const exBlock = sel ? `<div class="card"><h3>Progreso por ejercicio</h3><div class="field"><select id="stat-ex" aria-label="Ejercicio">${trained.sort((a, b) => displayName(a).localeCompare(displayName(b), 'es')).map((e) => `<option value="${esc(e.id)}" ${e.id === sel.id ? 'selected' : ''}>${esc(displayName(e))}</option>`).join('')}</select></div>
    ${lineChart(hist.slice(-20).map((h) => ({ label: shortDate(h.date), y: h.best1rm })), { unit: 'kg (1RM estimado)' })}
    <p>🏆 Peso máximo: <b>${fmtKg(rec.topKg)} kg</b> (${esc(fmtDate(rec.topKgDate))}) · 1RM estimado: <b>${fmtNum(rec.best1rm, 1)} kg</b> · ${hist.length} sesiones</p>
    <p class="hint">El 1RM estimado (fórmula de Epley) es el peso máximo que podrías levantar una vez; sirve para comparar sesiones con distintas repeticiones.</p></div>` : '';
  // Cardio: minutos por semana, progreso por actividad
  const ct = cardioTotals(done);
  const cw = weeklyCardio(done, t, 8);
  const maxCw = Math.max(1, ...cw.map((w) => w.minutes));
  const cardioBars = cw.map((w) => `<div title="Semana del ${fmtDate(w.from)}: ${w.minutes} min"><i class="${w.minutes ? '' : 'zero'}" style="height:${Math.max(3, (w.minutes / maxCw) * 70)}px"></i><span>${w.minutes}</span></div>`).join('');
  const cardioEx = list.filter((e) => isCardio(e) && cardioHistory(done, e.id).length);
  const cSel = cardioEx.find((e) => e.id === ui.statCardio) ?? cardioEx.sort((a, b) => cardioHistory(done, b.id).at(-1).date.localeCompare(cardioHistory(done, a.id).at(-1).date))[0];
  const cHist = cSel ? cardioHistory(done, cSel.id) : [];
  const withKm = cHist.filter((h) => h.speed);
  const cardioBlock = ct.minutes > 0 ? `<div class="card"><h3>Cardio por semana (minutos)</h3><div class="bars">${cardioBars}</div>
    <p class="hint">Referencia orientativa para adultos: ~${store.state.settings.cardioTargetMin} min/semana de actividad moderada (se cambia en Ajustes).</p></div>
    ${cSel ? `<div class="card"><h3>Progreso de cardio</h3><div class="field"><select id="stat-cardio" aria-label="Actividad de cardio">${[...cardioEx].sort((a, b) => displayName(a).localeCompare(displayName(b), 'es')).map((e) => `<option value="${esc(e.id)}" ${e.id === cSel.id ? 'selected' : ''}>${esc(displayName(e))}</option>`).join('')}</select></div>
      ${lineChart(cHist.slice(-20).map((h) => ({ label: shortDate(h.date), y: h.minutes })), { unit: 'min' })}
      ${withKm.length >= 2 ? `<p class="hint">Velocidad media (km/h)</p>${lineChart(withKm.slice(-20).map((h) => ({ label: shortDate(h.date), y: h.speed })), { unit: 'km/h' })}` : ''}
      <p>${cHist.length} ${cHist.length === 1 ? 'sesión' : 'sesiones'} · mejor: <b>${Math.max(...cHist.map((h) => h.minutes))} min</b>${withKm.length ? ` · velocidad máx. <b>${fmtNum(Math.max(...withKm.map((h) => h.speed)), 1)} km/h</b>` : ''}</p></div>` : ''}` : '';
  const bw = store.state.bodyweight;
  const bwBlock = bw.length >= 2 ? `<div class="card"><h3>Peso corporal</h3>${lineChart(bw.slice(-30).map((w) => ({ label: shortDate(w.date), y: w.kg })), { unit: 'kg' })}</div>` : '';
  return `${header('Estadísticas', `${tot.sessions} entrenamientos en total`)}
    <div class="kpis">
      <div class="kpi"><b>${fmtNum(avgPerWeek(done, t), 1)}</b><span>sesiones/semana (media)</span></div>
      <div class="kpi"><b>${weekStreak(done, t, store.state.settings.targetPerWeek)}</b><span>semanas seguidas con objetivo</span></div>
      <div class="kpi"><b>${fmtNum(tot.volume / 1000, 1)} t</b><span>volumen total levantado</span></div>
      <div class="kpi"><b>${fmtNum(tot.minutes / 60, 1)} h</b><span>tiempo entrenando</span></div>
      <div class="kpi"><b>${cw.at(-1).minutes} min</b><span>cardio esta semana</span></div>
      <div class="kpi"><b>${fmtNum(ct.minutes / 60, 1)} h</b><span>cardio en total</span></div>
    </div>
    <div class="card"><h3>Sesiones por semana (8 semanas)</h3><div class="bars">${bars}</div></div>
    <div class="card"><h3>Músculos trabajados</h3><div class="seg" role="group" aria-label="Periodo"><button data-action="stat-days" data-v="7" aria-pressed="${days === 7}">7 días</button><button data-action="stat-days" data-v="30" aria-pressed="${days === 30}">30 días</button></div>
      ${muscleMapSvg({ intensity })}<p class="hint">Más intenso = más series (secundarios cuentan la mitad). Objetivo orientativo: ~10 series por músculo y semana.</p>${rows}</div>
    ${exBlock}${cardioBlock}${bwBlock}`;
}

/* ---- consejos ---- */
function viewAdvice() {
  const done = doneSessions();
  if (done.length < 1) return `${header('Consejos')}<div class="empty"><b>Aún no puedo aconsejarte</b>Termina un par de entrenamientos y te diré cuándo subir peso, bajar, cambiar de ejercicio o entrenar un músculo olvidado.</div>`;
  const r = allRecommendations();
  const sec = (title, items) => (items.length ? `<section class="group"><h2><span>${title}</span></h2><div class="card">${items.map((x) => recHtml(x)).join('')}</div></section>` : '');
  const none = !r.perExercise.length && !r.muscles.length && !r.general.length;
  return `${header('Consejos', 'Reglas locales: sin IA, explicables')}
    ${sec('General', r.general)}${sec('Por ejercicio (últimos 60 días)', r.perExercise)}${sec('Músculos descuidados', r.muscles)}
    ${none ? '<div class="empty"><b>Todo en orden</b>No hay nada que ajustar ahora.</div>' : ''}
    <p class="hint">Fuerza: cuando llegas al tope de repeticiones en todas las series, sube el peso; si no llegas al mínimo dos sesiones seguidas, bájalo. Cardio: dos sesiones «fácil» seguidas → más intensidad; dos «al límite» → menos.</p>`;
}

/* ---- más ---- */
function viewMore() {
  const item = (id, title, meta) => `<li class="row"><button class="body" data-action="sub" data-v="${id}"><span class="title">${title}</span><span class="meta">${meta}</span></button><span class="chev">›</span></li>`;
  const bw = store.state.bodyweight.at(-1);
  return `${header('Más')}<ul class="list">
    ${item('exercises', 'Ejercicios', `Catálogo de ${CATALOG.length} (fuerza y cardio) + los tuyos: cómo se usa, foto y apodo`)}
    ${item('bodyweight', 'Peso corporal', bw ? `Último: ${fmtKg(bw.kg)} kg (${esc(fmtDate(bw.date))})` : 'Registra tu peso')}
    ${item('settings', 'Ajustes', 'Tema, descanso, objetivo semanal, copias')}</ul><p class="hint" style="text-align:center;margin-top:18px">Gym Record ${VERSION}</p>`;
}

function viewExercises() {
  const { list } = ex();
  const found = searchExercises(list, ui.search, ui.muscle).sort((a, b) => groupOrder(a.primary) - groupOrder(b.primary) || displayName(a).localeCompare(displayName(b), 'es'));
  const chips = `<div class="chips" role="group" aria-label="Filtrar por músculo o cardio"><button class="chipb" data-action="muscle" data-v="" aria-pressed="${!ui.muscle}">Todos</button>${GROUPS.map((m) => `<button class="chipb" data-action="muscle" data-v="${m}" aria-pressed="${ui.muscle === m}">${esc(musName(m))}</button>`).join('')}</div>`;
  const rows = found.map((e) => `<li class="row"><button class="body" data-action="exercise" data-id="${esc(e.id)}"><span class="title">${esc(displayName(e))}${e.nickname ? `<span class="tag">${esc(e.name)}</span>` : ''}${e.custom ? '<span class="tag">propio</span>' : ''}</span><span class="meta">${esc(musName(e.primary))} · ${esc(EQUIPMENT[e.equipment])}${e.alt && !e.nickname ? ` · ${esc(e.alt)}` : ''}</span></button><span class="chev">›</span></li>`).join('');
  return `${header('Ejercicios', `${found.length} ejercicios`, true)}
    <div class="toolbar"><input id="q" type="search" placeholder="Buscar: nombre, músculo, máquina…" value="${esc(ui.search)}" aria-label="Buscar ejercicio" /></div>
    ${chips}<ul class="list">${rows || '<li class="row"><span class="meta">Sin resultados.</span></li>'}</ul>
    <button class="btn block" data-action="new-exercise" style="margin-top:14px">+ Crear ejercicio propio</button>`;
}

function viewBodyweight() {
  const bw = [...store.state.bodyweight].reverse();
  return `${header('Peso corporal', '', true)}
    <form id="bw-form" class="card"><div class="toolbar"><input type="date" name="date" value="${today()}" max="${today()}" aria-label="Fecha" required /><input type="number" name="kg" inputmode="decimal" step="0.1" min="20" max="400" placeholder="kg" aria-label="Peso en kg" required /></div><button class="btn primary block" type="submit">Guardar peso</button></form>
    ${bw.length >= 2 ? `<div class="card">${lineChart([...bw].reverse().slice(-30).map((w) => ({ label: shortDate(w.date), y: w.kg })), { unit: 'kg' })}</div>` : ''}
    <ul class="list">${bw.map((w) => `<li class="row"><span class="body"><span class="title">${fmtKg(w.kg)} kg</span><span class="meta">${esc(fmtDate(w.date))}</span></span><button class="more" data-action="del-bw" data-id="${esc(w.date)}" aria-label="Borrar">🗑</button></li>`).join('') || '<li class="row"><span class="meta">Sin registros.</span></li>'}</ul>`;
}

function viewSettings() {
  const st = store.state.settings;
  const seg = (label, key, opts) => `<div class="line"><span>${label}</span><div class="seg">${opts.map(([v, l]) => `<button data-action="set" data-k="${key}" data-v="${v}" aria-pressed="${String(st[key]) === String(v)}">${l}</button>`).join('')}</div></div>`;
  const last = store.state.meta.lastExport ? fmtStamp(store.state.meta.lastExport) : 'nunca';
  return `${header('Ajustes', '', true)}
    <div class="card"><h3>Entreno</h3>
      ${seg('Objetivo semanal', 'targetPerWeek', [1, 2, 3, 4, 5].map((n) => [n, n]))}
      ${seg('Descanso entre series', 'restSeconds', [[60, '1:00'], [90, '1:30'], [120, '2:00'], [180, '3:00']])}
      ${seg('Sonido del temporizador', 'sound', [[true, 'Sí'], [false, 'No']])}
      ${seg('Cardio orientativo (min/semana)', 'cardioTargetMin', [[60, '60'], [90, '90'], [120, '120'], [150, '150'], [200, '200']])}
      <p>En iPhone el pitido solo suena con la app abierta y sin el interruptor de silencio; la vibración no está disponible en iOS.</p></div>
    <div class="card"><h3>Apariencia</h3>${seg('Tema', 'theme', [['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']])}</div>
    <div class="card"><h3>Copias de seguridad</h3><p>Tus datos solo están en este dispositivo. Última exportación: ${esc(last)}. ${ui.persisted === false ? 'Almacenamiento no persistente: exporta copias con frecuencia.' : ''}</p>
      <div class="actions"><button class="btn grow" data-action="export">Exportar</button><button class="btn grow" data-action="import">Importar</button><button class="btn grow" data-action="backups">Copias automáticas</button></div></div>
    <p class="hint" style="text-align:center">Gym Record ${VERSION}</p>`;
}

/* ---------- render ---------- */
function render() {
  if (!store) return;
  const y = window.scrollY;
  const views = { train: viewTrain, history: viewHistory, stats: viewStats, advice: viewAdvice, more: viewMore, exercises: viewExercises, bodyweight: viewBodyweight, settings: viewSettings };
  const tab = SUBVIEWS[ui.view] ? 'more' : ui.view;
  const focusId = document.activeElement?.id;
  $('#app').innerHTML = `${views[ui.view]()}
    <nav class="tabs" aria-label="Secciones"><div class="inner">${TABS.map(([id, label, icon]) => `<button data-action="tab" data-v="${id}" ${tab === id ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`).join('')}</div></nav>`;
  if (focusId === 'q') { const q = $('#q'); q?.focus(); q?.setSelectionRange(q.value.length, q.value.length); }
  window.scrollTo(0, y);
  applyTheme();
}

function applyTheme() {
  const th = store.state.settings.theme;
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('gr-theme', th); } catch { /* sin almacenamiento */ }
}

/* ---------- temporizador ---------- */
function tick() {
  let el = $('#timer-root');
  const s = activeSession(store.state?.sessions ?? []);
  const elapsed = $('.elapsed');
  if (elapsed && s) elapsed.textContent = fmtElapsed(Date.now() - s.startedAt);
  if (!timer.active || !s) { el?.remove(); if (!s) timer.stop(); return; }
  const rem = timer.remaining();
  if (timer.justFinished()) { if (store.state.settings.sound) beep(); ui.timerEndedAt = Date.now(); }
  if (rem === 0 && Date.now() - ui.timerEndedAt > 8000) { timer.stop(); el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'timer-root';
    el.className = 'timerbar';
    el.setAttribute('role', 'timer');
    el.innerHTML = '<span aria-hidden="true">⏱</span><span class="clock"></span><button data-action="timer-add">+15 s</button><button data-action="timer-stop">Saltar</button>';
    document.body.append(el);
  }
  el.classList.toggle('end', rem === 0);
  $('.clock', el).textContent = rem === 0 ? '¡Siguiente serie!' : fmtClock(rem);
}

/* ---------- hojas ---------- */
function summarySheet(s, recs) {
  const prs = recs.map((r) => `<li>🏆 <b>${esc(exName(r.exerciseId))}</b>: ${r.kind === 'peso' ? `nuevo peso máximo ${fmtKg(r.value)} kg (antes ${fmtKg(r.previous)})` : `1RM estimado ${fmtNum(r.value, 1)} kg (antes ${fmtNum(r.previous, 1)})`}</li>`).join('');
  openSheet(`<h2>¡Entreno guardado! 💪</h2><p>${esc(sessionMeta(s))}</p>${prs ? `<ul style="padding-left:18px">${prs}</ul>` : '<p class="hint">Sin récords esta vez; la constancia también cuenta.</p>'}<div class="actions"><button class="btn primary grow" data-ok>Cerrar</button></div>`, (sh) => $('[data-ok]', sh).addEventListener('click', closeSheet));
}

function sessionSheet(id) {
  const s = store.state.sessions.find((x) => x.id === id);
  if (!s) return;
  const body = s.entries.map((e) => `<div class="line"><span><b>${esc(exName(e.exerciseId))}</b><br><small class="hint">${esc(describeSets(workingSets(e)))}${e.blocks?.length ? esc(e.blocks.map((b) => describeBlocks([b])).join(' + ')) : ''}${e.sets.some((x) => x.warmup) ? ` · ${e.sets.filter((x) => x.warmup).length} calent.` : ''}${e.notes ? ` · 📝 ${esc(e.notes)}` : ''}</small></span></div>`).join('');
  openSheet(`<h2>${esc(summaryTitle(s))}</h2><p class="hint">${esc(sessionMeta(s))}</p>${s.notes ? `<p>📝 ${esc(s.notes)}</p>` : ''}${body}
    <div class="actions"><button class="btn grow" data-act="repeat">Repetir sesión</button><button class="btn grow" data-act="edit">Editar</button><button class="btn danger" data-act="delete">Borrar</button><button class="btn" data-act="close">Cerrar</button></div>`, (sh) => {
    sh.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'close') return closeSheet();
      if (activeSession(store.state.sessions) && act !== 'delete') return toast('Termina antes el entrenamiento en curso.');
      if (act === 'repeat') { closeSheet(); await startSession({ exerciseIds: s.entries.map((x) => x.exerciseId) }); }
      if (act === 'edit') { closeSheet(); ui.drafts = {}; await mutateSession(id, (x) => { x.endedAt = null; }); ui.view = 'train'; render(); }
      if (act === 'delete') confirmSheet('¿Borrar este entreno?', 'Se eliminará del historial y de las estadísticas.', 'Borrar', async () => { await store.update((d) => { d.sessions = d.sessions.filter((x) => x.id !== id); }); closeSheet(); });
    });
  });
}

function detailsSheet(id) {
  const s = store.state.sessions.find((x) => x.id === id);
  openSheet(`<h2>Detalles de la sesión</h2><form id="det-form"><div class="field"><label for="d-date">Fecha</label><input id="d-date" type="date" value="${esc(s.date)}" max="${today()}" required /></div><div class="field"><label for="d-notes">Notas (cómo te has sentido, sueño…)</label><textarea id="d-notes" maxlength="1000">${esc(s.notes)}</textarea></div>
    <div class="actions"><button class="btn primary grow" type="submit">Guardar</button><button class="btn danger" type="button" data-act="discard">Descartar sesión</button><button class="btn" type="button" data-act="close">Cerrar</button></div></form>`, (sh) => {
    $('[data-act=close]', sh).addEventListener('click', closeSheet);
    $('[data-act=discard]', sh).addEventListener('click', () => confirmSheet('¿Descartar el entrenamiento?', 'Se perderán las series registradas en esta sesión.', 'Descartar', async () => { await store.update((d) => { d.sessions = d.sessions.filter((x) => x.id !== id); }); ui.drafts = {}; timer.stop(); tick(); }));
    $('#det-form', sh).addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = $('#d-date', sh).value;
      if (!isValidKey(date)) return toast('Fecha no válida.');
      await mutateSession(id, (x) => { x.date = date; x.notes = $('#d-notes', sh).value.trim(); });
      closeSheet();
    });
  });
}

function addExerciseSheet(sid) {
  const state = { q: '', muscle: '' };
  const sh = openSheet('<div id="ae"></div>');
  const draw = () => {
    const { list } = ex();
    const s = store.state.sessions.find((x) => x.id === sid);
    const inSession = new Set(s?.entries.map((e) => e.exerciseId));
    const used = new Map();
    for (const x of store.state.sessions) for (const e of x.entries) used.set(e.exerciseId, (used.get(e.exerciseId) ?? 0) + 1);
    let found = searchExercises(list, state.q, state.muscle);
    found = found.sort((a, b) => (used.get(b.id) ?? 0) - (used.get(a.id) ?? 0) || groupOrder(a.primary) - groupOrder(b.primary) || displayName(a).localeCompare(displayName(b), 'es'));
    $('#ae', sh).innerHTML = `<h2>Añadir ejercicio</h2><input id="ae-q" type="search" placeholder="Buscar: «pecho», «polea», «sentadilla»…" value="${esc(state.q)}" aria-label="Buscar" autofocus />
      <div class="chips"><button class="chipb" data-m="" aria-pressed="${!state.muscle}">Todos</button>${GROUPS.map((m) => `<button class="chipb" data-m="${m}" aria-pressed="${state.muscle === m}">${esc(musName(m))}</button>`).join('')}</div>
      <ul class="list">${found.slice(0, 60).map((e) => `<li class="row"><button class="body" data-pick="${esc(e.id)}"><span class="title">${esc(displayName(e))}${used.get(e.id) ? '<span class="tag ok">usado</span>' : ''}${inSession.has(e.id) ? '<span class="tag">ya añadido</span>' : ''}</span><span class="meta">${esc(musName(e.primary))} · ${esc(EQUIPMENT[e.equipment])}${e.alt && !e.nickname ? ` · ${esc(e.alt)}` : ''}</span></button><button class="more" data-info="${esc(e.id)}" aria-label="Ver cómo se hace">ⓘ</button></li>`).join('') || '<li class="row"><span class="meta">Sin resultados.</span></li>'}</ul>
      <div class="actions"><button class="btn grow" data-new>+ Crear ejercicio propio</button><button class="btn" data-close>Cerrar</button></div>`;
    const q = $('#ae-q', sh);
    q.focus(); q.setSelectionRange(q.value.length, q.value.length);
  };
  sh.addEventListener('input', (e) => { if (e.target.id === 'ae-q') { state.q = e.target.value; draw(); } });
  sh.addEventListener('click', async (e) => {
    const m = e.target.closest('[data-m]');
    if (m) { state.muscle = m.dataset.m; return draw(); }
    const pick = e.target.closest('[data-pick]')?.dataset.pick;
    if (pick) { await addExercise(sid, pick); closeSheet(); return; }
    const info = e.target.closest('[data-info]')?.dataset.info;
    if (info) return exerciseSheet(info, () => addExerciseSheet(sid));
    if (e.target.closest('[data-new]')) return customExerciseSheet(null, async (id) => { await addExercise(sid, id); });
    if (e.target.closest('[data-close]')) closeSheet();
  });
  draw();
}

function entryMenuSheet(sid, exId) {
  const s = store.state.sessions.find((x) => x.id === sid);
  const entry = s?.entries.find((e) => e.exerciseId === exId);
  if (!entry) return;
  const i = s.entries.indexOf(entry);
  openSheet(`<h2>${esc(exName(exId))}</h2><div class="actions" style="flex-direction:column">
    <button class="btn" data-act="info">Cómo se hace / músculos</button><button class="btn" data-act="notes">Nota del ejercicio</button>
    ${i > 0 ? '<button class="btn" data-act="up">Subir en la lista</button>' : ''}
    <button class="btn danger" data-act="remove">Quitar de la sesión</button><button class="btn" data-act="close">Cerrar</button></div>`, (sh) => {
    sh.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') closeSheet();
      if (act === 'info') exerciseSheet(exId);
      if (act === 'up') { await mutateSession(sid, (x) => { const k = x.entries.findIndex((y) => y.exerciseId === exId); if (k > 0) [x.entries[k - 1], x.entries[k]] = [x.entries[k], x.entries[k - 1]]; }); closeSheet(); }
      if (act === 'remove') confirmSheet('¿Quitar el ejercicio?', entry.sets.length || entry.blocks?.length ? `Se perderán sus ${entry.sets.length + (entry.blocks?.length ?? 0)} registros de esta sesión.` : 'No tiene nada registrado.', 'Quitar', async () => { await mutateSession(sid, (x) => { x.entries = x.entries.filter((y) => y.exerciseId !== exId); }); delete ui.drafts[exId]; });
      if (act === 'notes') {
        openSheet(`<h2>Nota: ${esc(exName(exId))}</h2><form id="n-form"><div class="field"><textarea id="n-text" maxlength="500" placeholder="Ajuste del asiento, molestias, sensaciones…" autofocus>${esc(entry.notes)}</textarea></div><div class="actions"><button class="btn primary grow" type="submit">Guardar</button><button class="btn" type="button" data-close>Cancelar</button></div></form>`, (s2) => {
          $('[data-close]', s2).addEventListener('click', closeSheet);
          $('#n-form', s2).addEventListener('submit', async (ev) => { ev.preventDefault(); await mutateSession(sid, (x) => { const en = x.entries.find((y) => y.exerciseId === exId); if (en) en.notes = $('#n-text', s2).value.trim(); }); closeSheet(); });
        });
      }
    });
  });
}

function editSetSheet(sid, exId, index) {
  const s = store.state.sessions.find((x) => x.id === sid);
  const set = s?.entries.find((e) => e.exerciseId === exId)?.sets[index];
  if (!set) return;
  openSheet(`<h2>Serie ${index + 1} · ${esc(exName(exId))}</h2><form id="set-form">
    <div class="toolbar"><div class="field"><label for="s-kg">Peso (kg)</label><input id="s-kg" type="number" inputmode="decimal" step="any" min="0" value="${set.kg}" /></div><div class="field"><label for="s-reps">Repeticiones</label><input id="s-reps" type="number" inputmode="numeric" min="1" value="${set.reps}" /></div></div>
    <div class="field"><label for="s-rpe">Esfuerzo</label><select id="s-rpe"><option value="">Sin indicar</option>${[1, 2, 3].map((v) => `<option value="${v}" ${set.rpe === v ? 'selected' : ''}>${RPE_LABELS[v]}</option>`).join('')}</select></div>
    <label><input id="s-warm" type="checkbox" ${set.warmup ? 'checked' : ''} /> Serie de calentamiento (no cuenta en estadísticas)</label>
    <div class="actions"><button class="btn primary grow" type="submit">Guardar</button><button class="btn danger" type="button" data-del>Borrar serie</button><button class="btn" type="button" data-close>Cancelar</button></div></form>`, (sh) => {
    $('[data-close]', sh).addEventListener('click', closeSheet);
    $('[data-del]', sh).addEventListener('click', async () => { await mutateSession(sid, (x) => x.entries.find((e) => e.exerciseId === exId)?.sets.splice(index, 1)); closeSheet(); });
    $('#set-form', sh).addEventListener('submit', async (e) => {
      e.preventDefault();
      const next = sanitizeSet({ kg: $('#s-kg', sh).value, reps: $('#s-reps', sh).value, rpe: Number($('#s-rpe', sh).value) || undefined, warmup: $('#s-warm', sh).checked });
      if (!next) return toast('Revisa el peso y las repeticiones.');
      await mutateSession(sid, (x) => { const en = x.entries.find((y) => y.exerciseId === exId); if (en) en.sets[index] = next; });
      closeSheet();
    });
  });
}

function editBlockSheet(sid, exId, index) {
  const s = store.state.sessions.find((x) => x.id === sid);
  const b = s?.entries.find((e) => e.exerciseId === exId)?.blocks?.[index];
  const e = ex().map.get(exId);
  if (!b) return;
  const field = (m) => `<div class="field"><label for="b-${m}">${CARDIO_METRICS[m].label} (${CARDIO_METRICS[m].unit})</label><input id="b-${m}" type="number" inputmode="decimal" step="any" min="0" value="${b[m] ?? ''}" /></div>`;
  openSheet(`<h2>Bloque ${index + 1} · ${esc(exName(exId))}</h2><form id="blk-form">
    <div class="field"><label for="b-min">Minutos</label><input id="b-min" type="number" inputmode="numeric" min="1" max="600" value="${b.min}" /></div>
    ${(e?.metrics ?? Object.keys(CARDIO_METRICS)).map(field).join('')}
    <div class="field"><label for="b-rpe">Esfuerzo</label><select id="b-rpe"><option value="">Sin indicar</option>${[1, 2, 3].map((v) => `<option value="${v}" ${b.rpe === v ? 'selected' : ''}>${RPE_LABELS[v]}</option>`).join('')}</select></div>
    <div class="actions"><button class="btn primary grow" type="submit">Guardar</button><button class="btn danger" type="button" data-del>Borrar bloque</button><button class="btn" type="button" data-close>Cancelar</button></div></form>`, (sh) => {
    $('[data-close]', sh).addEventListener('click', closeSheet);
    $('[data-del]', sh).addEventListener('click', async () => { await mutateSession(sid, (x) => x.entries.find((en) => en.exerciseId === exId)?.blocks.splice(index, 1)); closeSheet(); });
    $('#blk-form', sh).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const raw = { min: $('#b-min', sh).value, rpe: Number($('#b-rpe', sh).value) || undefined };
      for (const m of Object.keys(CARDIO_METRICS)) { const el = $(`#b-${m}`, sh); if (el) raw[m] = el.value; }
      const next = sanitizeBlock(raw);
      if (!next) return toast('Indica al menos 1 minuto.');
      await mutateSession(sid, (x) => { const en = x.entries.find((y) => y.exerciseId === exId); if (en) en.blocks[index] = next; });
      closeSheet();
    });
  });
}

/** Ficha del ejercicio: silueta, cómo se usa, foto propia, apodo, salto de peso, rango de reps e historial. */
function exerciseSheet(id, onClose) {
  const e = ex().map.get(id);
  if (!e) return;
  const done = doneSessions();
  const hist = exerciseHistory(done, id);
  const rec = records(hist);
  const card = isCardio(e);
  const chist = card ? cardioHistory(done, id) : [];
  const stepOpts = [...new Set([...STEP_OPTIONS, e.step])].sort((a, b) => a - b);
  openSheet(`<h2>${esc(displayName(e))}</h2><p class="hint">${e.nickname ? `${esc(e.name)} · ` : ''}${e.alt ? `También: ${esc(e.alt)}` : ''}</p>
    <p><b>${esc(musName(e.primary))}</b>${card ? '' : ` (${esc(MUSCLES[e.primary]?.hint ?? '')})`}${e.secondary.length ? ` · también: ${esc(e.secondary.map(musName).join(', '))}` : ''} · ${esc(EQUIPMENT[e.equipment])}${card && e.metrics?.length ? ` · se anota: tiempo${e.metrics.map((m) => `, ${CARDIO_METRICS[m].label.toLowerCase()}`).join('')}` : ''}</p>
    ${card ? '' : muscleMapSvg({ primary: [e.primary], secondary: e.secondary, label: `Músculos de ${displayName(e)}` })}
    ${e.how ? `<p>${esc(e.how)}</p>` : ''}
    <div id="ph"></div><div class="actions"><label class="btn small">📷 Foto de la máquina<input id="ph-in" type="file" accept="image/*" hidden /></label><button class="btn small danger hidden" id="ph-del">Quitar foto</button></div>
    ${card ? (chist.length ? `<p>${chist.length} ${chist.length === 1 ? 'sesión' : 'sesiones'} · ${chist.reduce((a, h) => a + h.minutes, 0)} min en total · última ${esc(agoLabel(chist.at(-1).date, today()))}</p>` : '<p class="hint">Aún no lo has hecho.</p>') : ''}
    ${card ? '' : hist.length ? `<p>${rec.topKg > 0 ? `🏆 Peso máximo <b>${fmtKg(rec.topKg)} kg</b> · 1RM est. <b>${fmtNum(rec.best1rm, 1)} kg</b> · ` : ''}${hist.length} ${hist.length === 1 ? 'sesión' : 'sesiones'} · última ${esc(agoLabel(hist.at(-1).date, today()))}</p>` : '<p class="hint">Aún no lo has hecho.</p>'}
    <form id="ex-form"><div class="field"><label for="x-nick">Tu apodo para este ejercicio (opcional)</label><input id="x-nick" type="text" maxlength="60" value="${esc(e.nickname)}" placeholder="p. ej. «la de los brazos junto a la ventana»" /></div>
      ${card ? '' : `<div class="toolbar"><div class="field"><label for="x-step">Salto de peso (kg)</label><select id="x-step">${stepOpts.map((v) => `<option value="${v}" ${v === e.step ? 'selected' : ''}>${v === 0 ? 'Sin peso (corporal)' : String(v).replace('.', ',')}</option>`).join('')}</select></div>
      <div class="field"><label for="x-rmin">Reps mín.</label><input id="x-rmin" type="number" min="1" max="100" value="${e.reps[0]}" /></div><div class="field"><label for="x-rmax">Reps máx.</label><input id="x-rmax" type="number" min="1" max="100" value="${e.reps[1]}" /></div></div>`}
      <div class="field"><label for="x-notes">Notas fijas (altura del asiento, agarre…)</label><textarea id="x-notes" maxlength="500">${esc(e.notes)}</textarea></div>
      <div class="actions"><button class="btn primary grow" type="submit">Guardar</button>${e.custom ? '<button class="btn" type="button" data-edit>Editar ejercicio</button>' : ''}<button class="btn" type="button" data-close>Cerrar</button></div></form>`, (sh) => {
    const close = () => { closeSheet(); onClose?.(); };
    $('[data-close]', sh).addEventListener('click', close);
    $('[data-edit]', sh)?.addEventListener('click', () => customExerciseSheet(id));
    const showPhoto = async () => {
      const url = e.hasPhoto ? await store.getPhoto(id) : null;
      $('#ph', sh).innerHTML = url ? `<img class="photo" src="${url}" alt="Foto de ${esc(displayName(e))}" />` : '';
      $('#ph-del', sh).classList.toggle('hidden', !url);
    };
    showPhoto();
    $('#ph-in', sh).addEventListener('change', async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      try { await store.savePhoto(id, await shrinkImage(f)); e.hasPhoto = true; await showPhoto(); toast('Foto guardada.'); } catch (err) { toast(`No se pudo guardar la foto: ${err.message}`); }
    });
    $('#ph-del', sh).addEventListener('click', async () => { await store.deletePhoto(id); e.hasPhoto = false; await showPhoto(); });
    $('#ex-form', sh).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const a = card ? 1 : Math.round(Number($('#x-rmin', sh).value));
      const b = card ? 1 : Math.round(Number($('#x-rmax', sh).value));
      if (!(a >= 1 && b >= a && b <= 100)) return toast('El rango de repeticiones no es válido.');
      await store.update((d) => {
        const o = { ...(d.exerciseSettings[id] ?? {}) };
        const nick = $('#x-nick', sh).value.trim();
        if (nick) o.nickname = nick; else delete o.nickname;
        if (!card) { o.step = Number($('#x-step', sh).value); o.reps = [a, b]; }
        const nt = $('#x-notes', sh).value.trim();
        if (nt) o.notes = nt; else delete o.notes;
        d.exerciseSettings[id] = o;
      });
      close();
    });
  });
}

function customExerciseSheet(id, onCreated) {
  const cur = id ? store.state.customExercises.find((x) => x.id === id) : null;
  const v = cur ?? { name: '', alt: '', primary: 'chest', secondary: [], equipment: 'machine', step: 5, reps: [8, 12], how: '' };
  openSheet(`<h2>${cur ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h2><form id="cx-form">
    <div class="field"><label for="c-name">Nombre</label><input id="c-name" type="text" maxlength="80" required value="${esc(v.name)}" autofocus /></div>
    <div class="field"><label for="c-primary">Músculo principal</label><select id="c-primary">${MUSCLE_IDS.map((m) => `<option value="${m}" ${v.primary === m ? 'selected' : ''}>${esc(musName(m))} (${esc(MUSCLES[m].hint)})</option>`).join('')}</select></div>
    <div class="field"><span class="lbl">Músculos secundarios</span><div class="chips">${MUSCLE_IDS.map((m) => `<label class="chipb" style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" name="sec" value="${m}" ${v.secondary.includes(m) ? 'checked' : ''}/>${esc(musName(m))}</label>`).join('')}</div></div>
    <div class="toolbar"><div class="field"><label for="c-eq">Tipo</label><select id="c-eq">${Object.entries(EQUIPMENT).map(([k, n]) => `<option value="${k}" ${v.equipment === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div><div class="field"><label for="c-step">Salto (kg)</label><input id="c-step" type="number" step="any" min="0" value="${v.step}" /></div></div>
    <div class="toolbar"><div class="field"><label for="c-rmin">Reps mín.</label><input id="c-rmin" type="number" min="1" max="100" value="${v.reps[0]}" /></div><div class="field"><label for="c-rmax">Reps máx.</label><input id="c-rmax" type="number" min="1" max="100" value="${v.reps[1]}" /></div></div>
    <div class="field"><label for="c-how">Cómo se hace (opcional)</label><textarea id="c-how" maxlength="600">${esc(v.how)}</textarea></div>
    <div class="actions"><button class="btn primary grow" type="submit">Guardar</button>${cur ? '<button class="btn danger" type="button" data-del>Borrar</button>' : ''}<button class="btn" type="button" data-close>Cancelar</button></div></form>`, (sh) => {
    $('[data-close]', sh).addEventListener('click', closeSheet);
    $('[data-del]', sh)?.addEventListener('click', () => confirmSheet('¿Borrar el ejercicio?', 'Los entrenos que lo usen conservarán sus series, pero se mostrará como desconocido.', 'Borrar', async () => { await store.update((d) => { d.customExercises = d.customExercises.filter((x) => x.id !== id); }); }));
    $('#cx-form', sh).addEventListener('submit', async (e) => {
      e.preventDefault();
      const primary = $('#c-primary', sh).value;
      const item = {
        id: cur?.id ?? `custom-${newId()}`, name: $('#c-name', sh).value.trim(), alt: '', primary,
        secondary: [...sh.querySelectorAll('[name=sec]:checked')].map((c) => c.value).filter((m) => m !== primary),
        equipment: $('#c-eq', sh).value, step: Number($('#c-step', sh).value) || 0,
        reps: [Math.round(Number($('#c-rmin', sh).value)), Math.round(Number($('#c-rmax', sh).value))], how: $('#c-how', sh).value.trim(),
      };
      if (!item.name) return toast('Pon un nombre.');
      if (!(item.reps[0] >= 1 && item.reps[1] >= item.reps[0])) return toast('El rango de repeticiones no es válido.');
      await store.update((d) => { const i = d.customExercises.findIndex((x) => x.id === item.id); if (i >= 0) d.customExercises[i] = item; else d.customExercises.push(item); });
      closeSheet();
      await onCreated?.(item.id);
    });
  });
}

/* ---------- copias, exportar e importar ---------- */
async function doExport() {
  const json = await store.exportJson();
  const name = `gym-record-${today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Copia de Gym Record' });
    else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    await store.markExported();
    toast('Copia exportada.');
  } catch (err) {
    if (err?.name !== 'AbortError') toast(`No se pudo exportar: ${err.message}`);
  }
}

function importSheet() {
  openSheet(`<h2>Importar copia</h2><form id="imp-form"><div class="field"><label for="imp-file">Fichero .json exportado</label><input id="imp-file" type="file" accept="application/json,.json" /></div>
    <div class="field"><span class="lbl">¿Qué hacer con lo importado?</span><select id="imp-mode"><option value="merge">Fusionar: añadir lo que falte, sin tocar lo actual</option><option value="replace">Reemplazar todo (se guarda una copia antes)</option></select></div>
    <div class="actions"><button class="btn primary grow" type="submit">Importar</button><button class="btn" type="button" data-close>Cancelar</button></div></form>`, (sheet) => {
    $('[data-close]', sheet).addEventListener('click', closeSheet);
    $('#imp-form', sheet).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = $('#imp-file', sheet).files[0];
      if (!f) return toast('Elige un fichero.');
      try {
        const r = await store.importJson(await f.text(), $('#imp-mode', sheet).value);
        closeSheet();
        toast(`Importado. Ahora hay ${r.sessions} sesiones.`);
      } catch (err) { toast(err.message); }
    });
  });
}

async function backupsSheet() {
  const list = await store.listBackups();
  openSheet(`<h2>Copias automáticas</h2><p class="hint">Se guardan una al día y antes de migrar, importar o restaurar (las últimas 7). Restaurar guarda antes el estado actual. No incluyen las fotos.</p>
    ${list.length ? list.map((b) => `<div class="line"><span>${fmtStamp(b.createdAt)}<br><small class="hint">${esc(b.reason)} · ${b.sessions} sesiones</small></span><button class="btn small" data-restore="${esc(b.key)}">Restaurar</button></div>`).join('') : '<p>Todavía no hay copias.</p>'}
    <div class="actions"><button class="btn" data-close>Cerrar</button></div>`, (sheet) => {
    sheet.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]')) return closeSheet();
      const key = e.target.closest('[data-restore]')?.dataset.restore;
      if (!key) return;
      try { await store.restoreBackup(key); closeSheet(); toast('Copia restaurada.'); } catch (err) { toast(err.message); }
    });
  });
}

/* ---------- eventos ---------- */
function changeDraft(exId, field, value) {
  const e = ex().map.get(exId);
  const d = (ui.drafts[exId] ??= { kg: 0, reps: e?.reps?.[0] ?? 10, rpe: null, warmup: false });
  const INTEGER = new Set(['reps', 'min', 'bpm', 'level']);
  const MIN1 = new Set(['reps', 'min']);
  d[field] = INTEGER.has(field) ? Math.max(MIN1.has(field) ? 1 : 0, Math.round(value)) : Math.max(0, Math.round(value * 100) / 100);
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('#sheet-root')) return;
  const { action, id, v, ex: exId } = el.dataset;
  try {
    if (action === 'tab') { ui.view = v; ui.search = ''; ui.muscle = ''; render(); window.scrollTo(0, 0); }
    else if (action === 'sub') { ui.view = v; ui.search = ''; render(); window.scrollTo(0, 0); }
    else if (action === 'back') { ui.view = 'more'; render(); }
    else if (action === 'start') await startSession();
    else if (action === 'start-plan') {
      const { list, map } = ex();
      await startSession({ exerciseIds: suggestWorkout(doneSessions(), list, map, today()).flatMap((p) => p.exercises.slice(0, 1).map((x) => x.id)) });
    }
    else if (action === 'finish') await finishSession(id);
    else if (action === 'add-exercise') addExerciseSheet(id);
    else if (action === 'session-details') detailsSheet(id);
    else if (action === 'entry-menu') entryMenuSheet(id, exId);
    else if (action === 'edit-set') editSetSheet(id, exId, Number(el.dataset.i));
    else if (action === 'edit-block') editBlockSheet(id, exId, Number(el.dataset.i));
    else if (action === 'step') { changeDraft(exId, el.dataset.f, Number(ui.drafts[exId]?.[el.dataset.f] ?? 0) + Number(el.dataset.d)); render(); }
    else if (action === 'rpe') { const d = (ui.drafts[exId] ??= {}); d.rpe = d.rpe === Number(v) ? null : Number(v); render(); }
    else if (action === 'warm') { const d = (ui.drafts[exId] ??= {}); d.warmup = !d.warmup; render(); }
    else if (action === 'register') await registerSet(id, exId);
    else if (action === 'register-block') await registerBlock(id, exId);
    else if (action === 'apply-cardio-rec') { for (const f of ['min', 'level', 'incline']) if (el.dataset[f] !== '') changeDraft(exId, f, Number(el.dataset[f])); render(); }
    else if (action === 'apply-rec') { if (el.dataset.kg !== '') changeDraft(exId, 'kg', Number(el.dataset.kg)); if (el.dataset.reps !== '') changeDraft(exId, 'reps', Number(el.dataset.reps)); render(); }
    else if (action === 'open-session') sessionSheet(id);
    else if (action === 'stat-days') { ui.statDays = Number(v); render(); }
    else if (action === 'muscle') { ui.muscle = v; render(); }
    else if (action === 'exercise') exerciseSheet(id);
    else if (action === 'new-exercise') customExerciseSheet(null);
    else if (action === 'del-bw') await store.update((d) => { d.bodyweight = d.bodyweight.filter((w) => w.date !== id); });
    else if (action === 'set') { const val = v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v; await store.update((d) => { d.settings[el.dataset.k] = val; }); }
    else if (action === 'export') await doExport();
    else if (action === 'import') importSheet();
    else if (action === 'backups') await backupsSheet();
    else if (action === 'timer-add') { timer.add(15); tick(); }
    else if (action === 'timer-stop') { timer.stop(); tick(); }
  } catch (err) {
    toast(`Error: ${err.message}`);
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches?.('[data-draft]')) { changeDraft(t.dataset.ex, t.dataset.draft, Number(t.value) || 0); render(); }
  if (t.id === 'stat-ex') { ui.statEx = t.value; render(); }
  if (t.id === 'stat-cardio') { ui.statCardio = t.value; render(); }
});
document.addEventListener('input', (e) => { if (e.target.id === 'q') { ui.search = e.target.value; render(); } });
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'bw-form') return;
  e.preventDefault();
  const f = e.target.elements;
  const kg = Number(String(f.kg.value).replace(',', '.'));
  if (!isValidKey(f.date.value) || !(kg > 20 && kg < 400)) return toast('Revisa la fecha y el peso.');
  await store.update((d) => { d.bodyweight = [...d.bodyweight.filter((w) => w.date !== f.date.value), { date: f.date.value, kg }]; });
  toast('Peso guardado.');
});

/* ---------- arranque ---------- */
function scheduleMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  setTimeout(() => { render(); scheduleMidnight(); }, next - now);
}

async function boot() {
  let adapter;
  try {
    adapter = indexedDbAdapter();
    await adapter.get('probe');
  } catch {
    adapter = memoryAdapter();
    ui.storageWarning = 'Este navegador no permite guardar datos (¿modo privado?). Lo que añadas se perderá al cerrar. Exporta una copia.';
  }
  store = createStore(adapter);
  try {
    const info = await store.load();
    if (info.migratedFrom !== null) toast('Datos actualizados a la nueva versión (copia previa guardada).');
  } catch (err) {
    $('#app').innerHTML = `<div class="fatal"><h1>No se pueden abrir los datos</h1><p>${esc(err.message)}</p><p>No se ha modificado nada.</p></div>`;
    return;
  }
  store.subscribe(render);
  try { ui.persisted = (await navigator.storage?.persist?.()) ?? null; } catch { ui.persisted = null; }
  if (FAKE_OK) window.__store = () => store;
  render();
  store.autoBackup().catch(() => {});
  setInterval(tick, 250);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); tick(); } });
  scheduleMidnight();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
