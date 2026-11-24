# Gym-record

PWA personal para iPhone: registro de entrenamientos de gimnasio, estadísticas y recomendaciones. Proyecto **nuevo**, contexto **personal**. Base: `task-reminder` (mismo patrón de PWA). Se instala en el iPhone desde GitHub Pages (sin App Store) y se lanza en el PC desde My Tools.

## Stack y comandos
- JS plano modular (ES modules), **sin build ni dependencias**. Node 22 solo para tests, servidor local y e2e.
- `npm test` (unitarios, `node --test`) · `node tests/e2e/e2e.mjs [--shots=carpeta]` (Edge/Chrome headless por CDP) · `npm run icons` · `npm run version:sync`.
- Servidor local: `node serve.mjs [puerto] [--lan]` (8098). My Tools lo arranca con `abrir-gym-record.ps1` (`-Parar`, `-SoloComprobar`).
- `serve.mjs` solo sirve `index.html`, `sw.js`, manifest y `css|js|icons/<fichero>` (un nivel). Cada módulo JS nuevo se añade a `SHELL` en `sw.js`.

## Reglas de diseño (decisiones en `docs/adr/`)
- Registro **por sesión libre**: sesión → ejercicios → series `{kg, reps, rpe?, warmup?}`; los ejercicios de **cardio** (`kind: 'cardio'`, `primary: 'cardio'`) guardan `blocks: [{min, km?, level?, incline?, bpm?, rpe?}]` y no usan `sets` (ADR 0002). Rutinas A/B con rotación, calentamiento, descarga y sustituciones: ADR 0003. Una sola sesión activa (`endedAt: null`). Series de calentamiento no cuentan en volumen, récords ni estadísticas.
- Lógica **pura** (sin DOM ni reloj; «hoy» como clave `YYYY-MM-DD`): `dates`, `workouts`, `cardio`, `routines`, `stats`, `recommend`, `timer`, `catalog`, `wakelock` (este último con `navigator` inyectable). El cardio no cuenta como músculo trabajado ni en volumen. La UI (`app.js`, `ui.js`) no calcula reglas.
- Catálogo (`js/catalog.js`) en código, no en el documento; el usuario guarda solo `exerciseSettings` (apodo, salto de kg, rango de reps, notas, foto) y `customExercises`.
- Recomendaciones = **reglas locales explicables** (`js/recommend.js`, umbrales en `THRESHOLDS`), sin IA ni red. Toda regla nueva lleva `why` y un test (`tests/recommend.test.mjs`, `tests/cardio.test.mjs`).
- Persistencia: documento JSON único (`js/store.js`, IndexedDB `gym-record`); fotos aparte (`photo:<id>`, data URL ~800 px). **Datos entre versiones: `docs/datos-y-migraciones.md`.** Prohibido cambiar la forma de los datos sin migración + fixture + test.
- Sin push, sin backend, sin telemetría. Export/import JSON (incluye fotos) + copias automáticas (no incluyen fotos).
- Tema claro/oscuro con tokens CSS; interfaz en castellano; código en inglés; nombres de músculos «populares» con su nombre técnico entre paréntesis.
- `?hoy=AAAA-MM-DD` y `window.__setToday/__store` solo en `localhost` (pruebas). Usar siempre `localhost`, no `127.0.0.1` (IndexedDB es por origen).
- iOS: el pitido del temporizador solo suena con la app abierta (WebAudio tras un toque); `navigator.vibrate` no existe en iOS.

## Release (regla general del usuario; cada cambio)
1. Subir `version` en `package.json` y `npm run version:sync`.
2. `npm test` + e2e en verde.
3. Cerrar solo la instancia en marcha (`abrir-gym-record.ps1 -Parar`); My Tools la lanza de nuevo con lo último.
4. Publicar: `git push` a `main` (GitHub Pages; repo `hector-yago/Gym-record`, URL `https://hector-yago.github.io/Gym-record/`). Subir a Pages requiere autorización expresa del usuario.
5. En el iPhone la PWA se actualiza al abrirla con conexión (service worker red-primero).

## Pendiente conocido
- Prueba manual en iPhone real (instalación, persistencia, cámara para la foto, pitido): `docs/pruebas.md`.
- Sincronización PC↔iPhone y notificaciones push: fuera de v1 (ADR 0001).
