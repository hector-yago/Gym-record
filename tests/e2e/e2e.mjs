// Prueba de extremo a extremo en Edge/Chrome headless (sin dependencias: CDP por WebSocket de Node 22).
// Uso: node tests/e2e/e2e.mjs [--shots=carpeta]   (por defecto no guarda capturas)
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) throw new Error('No hay Edge ni Chrome instalados.');
const shots = process.argv.find((a) => a.startsWith('--shots='))?.slice(8);
if (shots) mkdirSync(shots, { recursive: true });

const PORT = 8198;
const CDP = 9334;
const profile = mkdtempSync(join(tmpdir(), 'gr-e2e-'));
const server = spawn(process.execPath, ['serve.mjs', String(PORT)], { stdio: 'ignore' });
const proc = spawn(browser, [`--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => { proc.kill(); server.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* en uso */ } };
process.on('exit', cleanup);

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* aún arrancando */ }
    await sleep(250);
  }
  throw new Error('No se pudo conectar con el navegador.');
}

const ws = new WebSocket(await connect());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  pending.set(i, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const goto = async (url) => { await send('Page.navigate', { url }); await sleep(900); };
const shot = async (name) => {
  if (!shots) return;
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(shots, `${name}.png`), Buffer.from(data, 'base64'));
};
const click = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);
const text = () => evaluate('document.body.innerText');

const setVal = (sel, v) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const tab = async (v) => { await evaluate(`document.querySelector('[data-action=tab][data-v=${v}]').click()`); await sleep(150); };

try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const base = `http://localhost:${PORT}/`;
  await goto(`${base}?hoy=2026-11-25`); // miércoles
  assert.match(await text(), /Aún no has registrado/i);
  await shot('01-inicio-vacio');

  // Empezar sesión y añadir ejercicio buscando por músculo
  await click('[data-action=start]');
  await sleep(150);
  assert.match(await text(), /Sesión vacía/);
  await click('[data-action=add-exercise]');
  await sleep(150);
  await setVal('#ae-q', 'pecho');
  await sleep(100);
  await shot('02-anadir-ejercicio');
  assert.equal(await evaluate(`!!document.querySelector('[data-pick=press-pecho-maquina]')`), true, 'no aparece el press de pecho al buscar «pecho»');
  await click('[data-pick=press-pecho-maquina]');
  await sleep(200);
  assert.match(await text(), /Press de pecho en máquina/);

  // Registrar 3 series (peso 40, reps 10) y comprobar temporizador de descanso
  for (let i = 0; i < 8; i++) await click('[data-ex="press-pecho-maquina"][data-f=kg][data-d="5"]');
  await setVal('[data-draft=reps][data-ex="press-pecho-maquina"]', '10');
  await sleep(100);
  // Calentamiento sugerido para el primer ejercicio pesado (40 kg → 20×8 y 30×5), registrado como calentamiento
  assert.match(await text(), /Calentamiento · 20×8, 30×5/);
  await click('[data-action=add-warmup]');
  await sleep(150);
  assert.equal(await evaluate(`document.querySelectorAll('.setchip.warm').length`), 2);
  assert.equal(await evaluate(`!!document.querySelector('#timer-root')`), false, 'el calentamiento no debe arrancar el descanso');
  await click('[data-action=rpe][data-v="2"]');
  await click('[data-action=register]');
  await sleep(400);
  assert.equal(await evaluate(`!!document.querySelector('#timer-root')`), true, 'no arrancó el temporizador');
  assert.match(await evaluate(`document.querySelector('#timer-root .clock').textContent`), /1:(29|30)/);
  await click('[data-action=register]');
  await click('[data-action=register]');
  await sleep(150);
  assert.equal(await evaluate(`document.querySelectorAll('.setchip').length`), 5, '2 de calentamiento + 3 de trabajo');
  assert.match(await text(), /40×10/);
  await shot('03-sesion-series');
  await click('[data-action=timer-stop]');

  // Segundo ejercicio y terminar
  await click('[data-action=add-exercise]');
  await sleep(100);
  await click('[data-pick=jalon-pecho]');
  await sleep(150);
  await click('[data-ex="jalon-pecho"][data-action=register]');
  await sleep(100);

  // Cardio dentro del mismo entreno: cinta 25 min, 2,5 km, inclinación 2 %
  await click('[data-action=add-exercise]');
  await sleep(100);
  await setVal('#ae-q', 'cinta');
  await sleep(100);
  await click('[data-pick=cinta]');
  await sleep(200);
  assert.match(await text(), /Cardio · Máquina/);
  for (let i = 0; i < 1; i++) await click('[data-ex="cinta"][data-f=min][data-d="5"]');
  await setVal('[data-draft=km][data-ex="cinta"]', '2.5');
  await sleep(100);
  await click('[data-ex="cinta"][data-f=incline][data-d="0.5"]');
  await click('[data-ex="cinta"][data-f=incline][data-d="0.5"]');
  await click('[data-ex="cinta"][data-action=rpe][data-v="1"]');
  await click('[data-action=register-block]');
  await sleep(200);
  assert.ok((await text()).includes('25 min · 2,5 km · 6 km/h · 1 % incl.'), 'no se ve el bloque de cardio registrado');
  assert.equal(await evaluate('document.querySelectorAll("[data-action=edit-block]").length'), 1);
  await shot('03b-cardio');
  await click('[data-action=finish]');
  await sleep(200);
  assert.match(await text(), /Entreno guardado/);
  await shot('04-resumen');
  await click('[data-save]'); // Guardar como rutina
  await sleep(150);
  assert.equal(await evaluate(`document.querySelector('#sr-name').value`), 'Día A');
  await evaluate(`document.querySelector('#sr-form').requestSubmit()`);
  await sleep(250);
  assert.match(await text(), /Rutina «Día A» guardada/);

  // Persiste tras recargar y aparece en el historial
  await goto(`${base}?hoy=2026-11-25`);
  assert.match(await text(), /Esta semana: 1 de 2/);
  await tab('history');
  assert.match(await text(), /2 ejercicios · 4 series.*25 min de cardio/);
  await shot('05-historial');

  // Rutinas: «Día A» guardada desde la sesión; se crea «Día B» desde Más → Rutinas; rotación A → B al hacer A
  await tab('train');
  assert.match(await text(), /Toca: Día A/);
  await tab('more');
  await click('[data-action=sub][data-v=routines]');
  await sleep(100);
  await click('[data-action=new-routine]');
  await sleep(100);
  assert.equal(await evaluate(`document.querySelector('#r-name').value`), 'Día B');
  await click('[data-add]');
  await sleep(100);
  await setVal('#ae-q', 'goblet');
  await sleep(100);
  await click('[data-pick=sentadilla-goblet]');
  await sleep(200);
  assert.match(await text(), /Sentadilla goblet/);
  await click('[data-save]');
  await sleep(250);
  assert.match(await text(), /Día B/);
  await shot('05b-rutinas');
  await tab('train');
  assert.match(await text(), /Toca: Día A/);
  await click('[data-action=start-routine]'); // la primera tarjeta es la que toca
  await sleep(250);
  assert.match(await text(), /Entrenando/);

  // Sustituir «Press de pecho» (hoy no puedo usarlo) por otro de pecho
  await click('[data-action=entry-menu][data-ex="press-pecho-maquina"]');
  await sleep(100);
  await click('[data-act=subst]');
  await sleep(100);
  await shot('05c-sustituir');
  await click('[data-pick=aperturas-mariposa]');
  await sleep(250);
  assert.match(await text(), /Aperturas en máquina \(mariposa\)/);
  assert.doesNotMatch(await text(), /Press de pecho en máquina/);
  await click('[data-ex="aperturas-mariposa"][data-action=register]');
  await sleep(100);
  await click('[data-action=timer-stop]');
  await click('[data-action=finish]');
  await sleep(250);
  assert.match(await text(), /Actualizar «Día A»/);
  await click('[data-ok]');
  await sleep(100);
  await tab('train');
  assert.match(await text(), /Toca: Día B/);
  await shot('05d-rotacion');

  // Superserie curl + extensión de tríceps: el descanso solo llega al cerrar la ronda
  await click('[data-action=start]');
  await sleep(200);
  for (const [q, id] of [['curl', 'curl-biceps-mancuernas'], ['extension de', 'extension-triceps-polea']]) {
    await click('[data-action=add-exercise]');
    await sleep(100);
    await setVal('#ae-q', q);
    await sleep(100);
    await click(`[data-pick=${id}]`);
    await sleep(200);
  }
  await click('[data-action=entry-menu][data-ex="curl-biceps-mancuernas"]');
  await sleep(100);
  await click('[data-act=ss]');
  await sleep(250);
  assert.match(await text(), /Superserie/);
  await click('[data-ex="curl-biceps-mancuernas"][data-action=register]');
  await sleep(250);
  assert.equal(await evaluate(`!!document.querySelector('#timer-root')`), false, 'en una superserie no se descansa a mitad de ronda');
  assert.match(await text(), /te toca/);
  await shot('05e-superserie');
  await click('[data-ex="extension-triceps-polea"][data-action=register]');
  await sleep(250);
  assert.equal(await evaluate(`!!document.querySelector('#timer-root')`), true, 'al cerrar la ronda sí se descansa');
  await click('[data-action=timer-stop]');

  // Molestia anotada desde el ejercicio: aviso en la tarjeta
  await click('[data-action=entry-menu][data-ex="curl-biceps-mancuernas"]');
  await sleep(100);
  await click('[data-act=pain]');
  await sleep(100);
  await setVal('#p-note', 'al subir el brazo');
  await evaluate(`document.querySelector('#pain-form').requestSubmit()`);
  await sleep(300);
  assert.match(await text(), /Molestia en bíceps/);
  await shot('05f-molestia');

  // Ejercicio por tiempo: cuenta atrás
  await click('[data-action=add-exercise]');
  await sleep(100);
  await setVal('#ae-q', 'plancha');
  await sleep(100);
  await click('[data-pick=plancha]');
  await sleep(200);
  await click('[data-action=countdown]');
  await sleep(300);
  assert.equal(await evaluate(`!!document.querySelector('#timer-root')`), true, 'no arrancó la cuenta atrás');
  await click('[data-action=timer-stop]');
  await click('[data-action=finish]');
  await sleep(250);
  assert.match(await text(), /Entreno guardado/);
  await click('[data-ok]');
  await sleep(100);

  // Molestias: lista y marcar como resuelta
  await tab('more');
  await click('[data-action=sub][data-v=pains]');
  await sleep(150);
  assert.match(await text(), /bíceps/i);
  await click('[data-action=resolve-pain]');
  await sleep(200);
  assert.match(await text(), /Resueltas/i);
  assert.match(await text(), /Sin molestias activas/);

  // Objetivo: fuerza cambia el rango del press a 3-6; descanso propio del ejercicio; se restaura después
  await tab('more');
  await click('[data-action=sub][data-v=settings]');
  await sleep(100);
  await click('[data-action=set][data-k=goal][data-v=strength]');
  await sleep(200);
  await tab('more');
  await click('[data-action=sub][data-v=exercises]');
  await sleep(100);
  await click('[data-action=exercise][data-id=press-pecho-maquina]');
  await sleep(200);
  assert.equal(await evaluate(`document.querySelector('#x-rmin').value`), '3');
  assert.equal(await evaluate(`document.querySelector('#x-rmax').value`), '6');
  assert.match(await evaluate(`document.querySelector('#x-rest option').textContent`), /Automático \(150 s/);
  await setVal('#x-rest', '45');
  await evaluate(`document.querySelector('#x-rmin').value = '3'; document.querySelector('#x-rmax').value = '6'; document.querySelector('#ex-form').requestSubmit()`);
  await sleep(250);
  assert.equal(await evaluate(`window.__store().state.exerciseSettings['press-pecho-maquina'].rest`), 45);
  // restaurar: objetivo hipertrofia y sin ajustes propios del press (para el resto de la prueba)
  await evaluate(`window.__store().update((d) => { d.settings.goal = 'hypertrophy'; delete d.exerciseSettings['press-pecho-maquina']; })`);
  await sleep(200);
  assert.equal(await evaluate(`window.__store().state.settings.goal`), 'hypertrophy');

  // Semilla de datos ficticios para estadísticas y consejos (mismas fechas relativas al día simulado)
  await evaluate(`(async () => {
    const st = window.__store();
    const mk = (id, date, entries) => ({ id, date, startedAt: Date.parse(date + 'T10:00:00'), endedAt: Date.parse(date + 'T11:00:00'), notes: '', entries });
    const sets = (kg, reps, n, rpe) => Array.from({ length: n }, () => ({ kg, reps, ...(rpe ? { rpe } : {}) }));
    await st.update((d) => {
      d.sessions.push(
        mk('h1', '2026-11-04', [{ exerciseId: 'press-pecho-maquina', notes: '', sets: sets(35, 10, 3) }, { exerciseId: 'sentadilla-goblet', notes: '', sets: sets(16, 12, 3) }, { exerciseId: 'eliptica', notes: '', sets: [], blocks: [{ min: 20, level: 6, rpe: 1 }] }]),
        mk('h2', '2026-11-11', [{ exerciseId: 'press-pecho-maquina', notes: '', sets: sets(40, 12, 3) }, { exerciseId: 'sentadilla-goblet', notes: '', sets: sets(16, 15, 3) }, { exerciseId: 'eliptica', notes: '', sets: [], blocks: [{ min: 20, level: 6, rpe: 1 }] }]),
        mk('h3', '2026-11-18', [{ exerciseId: 'press-pecho-maquina', notes: '', sets: sets(40, 12, 3) }, { exerciseId: 'extension-triceps-polea', notes: '', sets: sets(20, 12, 3, 1) }]),
      );
      d.bodyweight.push({ date: '2026-11-01', kg: 80.4 }, { date: '2026-11-15', kg: 79.8 });
    });
  })()`);
  await sleep(200);
  await tab('stats');
  let t = await text();
  for (const s of ['sesiones/semana', 'Músculos trabajados', 'Progreso por ejercicio', 'Cardio por semana', 'Progreso de cardio', 'Peso corporal']) assert.match(t, new RegExp(s, 'i'), `falta «${s}» en estadísticas`);
  assert.equal(await evaluate(`!!document.querySelector('svg.mm')`), true);
  await shot('06-estadisticas');
  await tab('advice');
  t = await text();
  assert.match(t, /Sube a 18/i, 'debería recomendar subir la sentadilla goblet (tope de reps)');
  assert.match(t, /Intenta 11 reps con 40 kg/i, 'press de pecho: mismo peso, +1 rep');
  assert.match(t, /Sube a nivel 7/i, 'elíptica: dos sesiones fáciles → nivel 7');
  assert.match(t, /Entrena/i, 'debería sugerir algún músculo olvidado');
  await shot('07-consejos');
  await tab('train');
  assert.match(await text(), /Sugerencia para hoy/i);
  await shot('08-inicio-con-datos');

  // Más de 10 días sin entrenar: aviso amable en Inicio
  await evaluate(`window.__setToday('2026-12-20')`);
  await sleep(150);
  assert.match(await text(), /Llevas 25 días sin entrenar/);
  await evaluate(`window.__setToday('2026-11-25')`);
  await sleep(150);

  // Estadísticas: calendario de constancia y volumen por músculo
  await tab('stats');
  t = await text();
  assert.match(t, /Constancia \(16 semanas\)/);
  assert.match(t, /Volumen por músculo/);
  assert.ok((await evaluate(`document.querySelectorAll('.cal i.l2, .cal i.l3').length`)) >= 3, 'el calendario debe marcar los días entrenados');
  await shot('08b-constancia');

  // Récords
  await tab('more');
  await click('[data-action=sub][data-v=records]');
  await sleep(150);
  t = await text();
  assert.match(t, /Press de pecho en máquina/);
  assert.match(t, /🏆/);
  await shot('08c-records');

  // Informe mensual: se ve el mes actual, se puede ir al anterior y el HTML es autónomo
  await tab('more');
  await click('[data-action=sub][data-v=report]');
  await sleep(250);
  assert.ok((await evaluate(`document.querySelector('#report-frame').srcdoc`)).includes('Informe de noviembre de 2026'));
  assert.equal(await evaluate(`document.querySelector('#report-frame').srcdoc.includes('<script')`), false);
  await shot('08d-informe');
  await click('[data-action=report-month][data-v="-1"]');
  await sleep(200);
  assert.match(await text(), /Sin entrenos este mes/);
  await click('[data-action=report-month][data-v="1"]');
  await sleep(200);

  // Comparar dos sesiones desde el historial
  await tab('history');
  await click('[data-action=open-session]');
  await sleep(200);
  await click('[data-act=compare]');
  await sleep(200);
  await click('[data-pick]');
  await sleep(250);
  assert.match(await text(), /Comparar sesiones/);
  assert.match(await text(), /Las diferencias son B − A/);
  await shot('08e-comparar');
  await click('[data-close]');
  await sleep(100);

  // Ejercicios: búsqueda y ficha con silueta
  await tab('more');
  await click('[data-action=sub][data-v=exercises]');
  await sleep(150);
  await setVal('#q', 'espalda');
  await sleep(150);
  assert.match(await text(), /Jalón al pecho/);
  await click('[data-action=exercise][data-id=jalon-pecho]');
  await sleep(200);
  assert.equal(await evaluate(`!!document.querySelector('#sheet-root svg.mm .m.l3')`), true, 'la silueta no resalta el músculo');
  await shot('09-ficha-ejercicio');
  await setVal('#x-nick', 'La de la polea alta');
  await evaluate(`document.querySelector('#ex-form').requestSubmit()`);
  await sleep(250);
  assert.match(await text(), /La de la polea alta/);

  // Peso corporal y ajustes
  await tab('more');
  await click('[data-action=sub][data-v=bodyweight]');
  await sleep(100);
  await setVal('#bw-form [name=kg]', '79.5');
  await evaluate(`document.querySelector('#bw-form').requestSubmit()`);
  await sleep(200);
  assert.match(await text(), /79,5 kg/);
  await shot('10-peso');

  // Tema oscuro
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await tab('more');
  await click('[data-action=sub][data-v=settings]');
  await sleep(150);
  await shot('11-ajustes-oscuro');
  await tab('stats');
  await shot('12-estadisticas-oscuro');

  // Exportar → contenido válido
  const exported = JSON.parse(await evaluate(`window.__store().exportJson()`));
  assert.equal(exported.app, 'gym-record');
  assert.equal(exported.data.sessions.length, 6);
  assert.equal(exported.data.routines.length, 2);
  assert.equal(exported.data.schemaVersion, 4);

  // Service worker activo y manifiesto
  const sw = await evaluate(`navigator.serviceWorker.ready.then(r => !!r.active)`);
  assert.equal(sw, true, 'el service worker no se activó');
  const manifest = await evaluate(`fetch('manifest.webmanifest').then(r => r.json()).then(j => j.icons.length)`);
  assert.ok(manifest >= 3);
  console.log('E2E correcto');
} finally {
  cleanup();
}
process.exit(0);
