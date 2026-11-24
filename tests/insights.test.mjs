import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCompound, repRangeFor, restFor } from '../js/goals.js';
import { activePains, newPain, painRecommendations, painsFor, sanitizePain } from '../js/pains.js';
import { allRecords, prsInRange } from '../js/records.js';
import { compareSessions, monthBounds, monthReport, reportHtml, shiftMonth } from '../js/report.js';
import { calendarGrid, daysSinceLast, muscleVolumeTable } from '../js/stats.js';
import { exerciseRecommendation } from '../js/recommend.js';
import { exerciseIndex, resolveExercises } from '../js/catalog.js';

const list = resolveExercises({});
const map = exerciseIndex(list);
const by = (id) => list.find((e) => e.id === id);
const sess = (id, date, entries) => ({ id, date, startedAt: Date.parse(`${date}T10:00:00Z`), endedAt: Date.parse(`${date}T11:00:00Z`), notes: '', entries });
const st = (exerciseId, ...sets) => ({ exerciseId, notes: '', sets: sets.map(([kg, reps]) => ({ kg, reps })), blocks: [] });
const cd = (exerciseId, ...blocks) => ({ exerciseId, notes: '', sets: [], blocks });

/* ---- objetivo y descanso ---- */
test('compuesto = varios músculos; plancha y cardio no cuentan', () => {
  assert.equal(isCompound(by('press-pecho-maquina')), true);
  assert.equal(isCompound(by('curl-biceps-mancuernas')), false);
  assert.equal(isCompound(by('plancha')), false);
  assert.equal(isCompound(by('cinta')), false);
});

test('rangos por objetivo: fuerza baja las repeticiones, hipertrofia/mantenimiento usan el catálogo y el usuario manda', () => {
  const press = { ...by('press-pecho-maquina') };
  assert.deepEqual(repRangeFor(press, 'strength'), [3, 6]);
  assert.deepEqual(repRangeFor(by('curl-biceps-mancuernas'), 'strength'), [6, 10]);
  assert.deepEqual(repRangeFor(press, 'hypertrophy'), [8, 12]);
  assert.deepEqual(repRangeFor(by('plancha'), 'strength'), [30, 60]);
  const strength = exerciseIndex(resolveExercises({ settings: { goal: 'strength' } })).get('press-pecho-maquina');
  assert.deepEqual(strength.reps, [3, 6]);
  const own = exerciseIndex(resolveExercises({ settings: { goal: 'strength' }, exerciseSettings: { 'press-pecho-maquina': { reps: [5, 8] } } })).get('press-pecho-maquina');
  assert.deepEqual(own.reps, [5, 8]);
});

test('descanso: override del ejercicio > objetivo; aislamiento 30 s menos y nunca bajo 45', () => {
  const press = by('press-pecho-maquina');
  const curl = by('curl-biceps-mancuernas');
  assert.equal(restFor(press, { restSeconds: 90, goal: 'hypertrophy' }), 90);
  assert.equal(restFor(curl, { restSeconds: 90, goal: 'hypertrophy' }), 60);
  assert.equal(restFor(press, { restSeconds: 90, goal: 'strength' }), 150);
  assert.equal(restFor(press, { restSeconds: 90, goal: 'maintenance' }), 60);
  assert.equal(restFor(curl, { restSeconds: 60, goal: 'maintenance' }), 45);
  assert.equal(restFor(press, { restSeconds: 90, goal: 'strength' }, 45), 45);
  assert.equal(restFor(press, { restSeconds: 90 }, 5), 90, 'un override fuera de rango se ignora');
});

test('mantenimiento: consejos prudentes (no sube por «fácil» ni propone cambios por estancamiento)', () => {
  const e = { ...by('press-pecho-maquina'), reps: [8, 12], step: 5 };
  const hist = [['2026-11-13', [40, 11, 1], [40, 11, 1]], ['2026-11-20', [40, 11, 1], [40, 11, 1]]].map(([date, ...sets], i) => ({
    date, sessionId: `s${i}`, startedAt: i, sets: sets.map(([kg, reps, rpe]) => ({ kg, reps, rpe })),
    get topKg() { return 40; }, get best1rm() { return 40 * (1 + 11 / 30); }, get avgReps() { return 11; }, volume: 0,
  }));
  assert.equal(exerciseRecommendation(e, hist, '2026-11-24').kind, 'raise_weight');
  assert.equal(exerciseRecommendation(e, hist, '2026-11-24', [], { conservative: true }).kind, 'more_reps');
});

/* ---- molestias ---- */
test('molestias: saneado, activas y qué ejercicios cargan la zona', () => {
  assert.equal(sanitizePain({ id: 'x', area: 'nada', date: '2026-11-01' }), null);
  assert.equal(newPain('shoulders', '  me duele  ', '2026-11-20').note, 'me duele');
  const pains = [newPain('shoulders', 'a', '2026-11-20'), { ...newPain('chest', 'b', '2026-11-01'), resolved: true }];
  assert.equal(activePains(pains).length, 1);
  assert.equal(painsFor(by('elevaciones-laterales'), pains)[0].role, 'main');
  assert.equal(painsFor(by('press-pecho-maquina'), pains)[0].role, 'side', 'el hombro es secundario en el press de pecho');
  assert.deepEqual(painsFor(by('jalon-pecho'), pains), []);
  assert.deepEqual(painsFor(by('cinta'), pains), [], 'el cardio no se asocia a zonas');
  const recs = painRecommendations(pains, list, '2026-11-24');
  assert.equal(recs.length, 1);
  assert.match(recs[0].detail, /profesional sanitario/);
});

/* ---- récords ---- */
const hist = [
  sess('a', '2026-10-05', [st('press-pecho-maquina', [40, 10], [40, 10]), cd('cinta', { min: 20, km: 2 })]),
  sess('b', '2026-10-20', [st('press-pecho-maquina', [45, 8]), cd('cinta', { min: 30, km: 3.6 })]),
  sess('c', '2026-11-10', [st('press-pecho-maquina', [50, 6]), st('jalon-pecho', [45, 10]), cd('cinta', { min: 30, km: 4 })]),
];

test('lista de récords: mejores marcas con su fecha, ordenadas por la más reciente', () => {
  const rows = allRecords(hist, map);
  assert.equal(rows.length, 3);
  const press = rows.find((r) => r.exerciseId === 'press-pecho-maquina');
  assert.deepEqual([press.topKg.value, press.topKg.date], [50, '2026-11-10']);
  assert.equal(press.volume.value, 800, 'mejor volumen de sesión: 2×40×10 = 800');
  assert.equal(press.volume.date, '2026-10-05');
  const cinta = rows.find((r) => r.exerciseId === 'cinta');
  assert.deepEqual([cinta.minutes.value, cinta.minutes.date], [30, '2026-10-20'], 'empate: la fecha más antigua');
  assert.equal(cinta.km.value, 4);
  assert.ok(Math.abs(cinta.speed.value - 8) < 1e-9);
  assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].latest >= r.latest), 'ordenadas por la marca más reciente');
});

test('récords del mes: la primera vez no cuenta y se distingue peso, 1RM, tiempo y velocidad', () => {
  const prs = prsInRange(hist, map, '2026-11-01', '2026-11-30');
  const kinds = Object.fromEntries(prs.map((p) => [p.exerciseId, p.kind]));
  assert.equal(kinds['press-pecho-maquina'], 'peso');
  assert.equal(kinds['jalon-pecho'], undefined, 'primera vez: referencia, no récord');
  assert.equal(kinds.cinta, 'velocidad', 'mismo tiempo (30) pero más rápida (8 > 7,2 km/h)');
  assert.deepEqual(prsInRange(hist, map, '2026-09-01', '2026-09-30'), []);
});

/* ---- informe y comparación ---- */
test('meses: límites y desplazamiento', () => {
  assert.deepEqual(monthBounds('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('informe mensual: totales, comparación con el mes anterior, récords y HTML autónomo', () => {
  const r = monthReport(hist, map, '2026-11');
  assert.equal(r.sessions, 1);
  assert.equal(r.previous.sessions, 2, 'octubre tuvo 2 sesiones');
  assert.equal(r.sets, 2);
  assert.equal(r.cardioMinutes, 30);
  assert.equal(r.cardioKm, 4);
  assert.ok(r.prs.some((p) => p.exerciseId === 'press-pecho-maquina'));
  assert.equal(r.topExercises[0].exerciseId, 'jalon-pecho', 'empate a series: gana el de más volumen (450 > 300)');
  const oct = monthReport(hist, map, '2026-10');
  assert.equal(oct.sessions, 2);
  const html = reportHtml(r, { nameOf: (id) => map.get(id).name, muscleName: (m) => m });
  assert.match(html, /<!doctype html>/);
  assert.match(html, /Informe de noviembre de 2026/);
  assert.match(html, /Press de pecho en máquina/);
  assert.doesNotMatch(html, /<script/i, 'el informe no lleva scripts');
  assert.match(reportHtml({ ...r, topExercises: [{ exerciseId: 'x', sets: 1, volume: 1 }] }, { nameOf: () => '<b>mal</b>', muscleName: (m) => m }), /&lt;b&gt;mal&lt;\/b&gt;/, 'se escapa el HTML');
});

test('comparar dos sesiones: diferencias B − A, ejercicios solo en una y cardio', () => {
  const c = compareSessions(hist[0], hist[2], map);
  const press = c.rows.find((x) => x.exerciseId === 'press-pecho-maquina');
  assert.equal(press.dTop, 10);
  assert.equal(press.dVolume, 300 - 800);
  const jalon = c.rows.find((x) => x.exerciseId === 'jalon-pecho');
  assert.equal(jalon.a, null);
  assert.equal(jalon.dTop, null);
  const cinta = c.rows.find((x) => x.exerciseId === 'cinta');
  assert.equal(cinta.dMinutes, 10);
  assert.equal(c.common, 2);
  assert.equal(c.a.sets, 2);
});

/* ---- calendario y volumen por músculo ---- */
test('calendario de constancia: 16 semanas lunes→domingo, con futuros marcados', () => {
  const T = '2026-11-24'; // martes
  const grid = calendarGrid(hist, T, 16);
  assert.equal(grid.length, 16);
  assert.ok(grid.every((w) => w.length === 7));
  assert.equal(grid.at(-1)[0].date, '2026-11-23');
  assert.equal(grid.at(-1)[1].future, false);
  assert.equal(grid.at(-1)[2].future, true);
  assert.equal(grid.flat().find((d) => d.date === '2026-11-10').count, 1);
  assert.equal(grid.flat().reduce((a, d) => a + d.count, 0), 3);
});

test('días desde el último entreno', () => {
  assert.equal(daysSinceLast(hist, '2026-11-24'), 14);
  assert.equal(daysSinceLast([], '2026-11-24'), null);
});

test('volumen por músculo: semana en curso vs media de las 4 anteriores y «se queda corto»', () => {
  const weekly = ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'].map((d, i) => sess(`w${i}`, d, [st('press-pecho-maquina', [40, 10], [40, 10], [40, 10])]));
  const rows = muscleVolumeTable([...weekly, sess('now', '2026-11-24', [st('press-pecho-maquina', [40, 10], [40, 10])])], map, '2026-11-24');
  const chest = rows.find((r) => r.muscle === 'chest');
  assert.equal(chest.current, 2);
  assert.equal(chest.avgPrev, 3);
  assert.equal(chest.delta, -1);
  assert.equal(chest.short, true, '3 series/semana de media (< 6)');
  assert.equal(rows.find((r) => r.muscle === 'lats').short, true);
  assert.equal(rows.some((r) => r.muscle === 'forearms'), false);
  const few = muscleVolumeTable([sess('x', '2026-11-16', [st('press-pecho-maquina', [40, 10])])], map, '2026-11-24');
  assert.ok(few.every((r) => r.short === false), 'con poca actividad no se acusa a ningún músculo');
});

test('récords: un ejercicio sin peso (0 kg) no rompe la lista y no inventa marcas', () => {
  const rows = allRecords([sess('z', '2026-11-01', [st('jalon-pecho', [0, 10])])], map);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].topKg, null);
  assert.equal(rows[0].best1rm, null);
  assert.equal(rows[0].volume, null);
});
