# Pruebas

## Automáticas
- `npm test`: dates/workouts/stats (cálculos), recommend (tabla de casos de cada regla) y store/migraciones (fixture v1, esquema 0, versión futura, copias, export/import con fotos).
- `node tests/e2e/e2e.mjs [--shots=carpeta]`: flujo completo en Edge/Chrome headless a 390×844: sesión, series, temporizador, resumen, historial, estadísticas, consejos, ficha de ejercicio con silueta, peso corporal, tema oscuro, exportación y service worker.

- `tests/insights.test.mjs`: objetivo y descansos, molestias, récords (y del mes), informe mensual (incluido el HTML), comparación de sesiones, calendario, días sin entrenar y volumen por músculo.
- `tests/routines.test.mjs`: rutinas (saneado, rotación, borrados, mover) y wake lock con `navigator` simulado. `tests/recommend.test.mjs` incluye aproximación, descarga y sustituciones.
- `tests/cardio.test.mjs`: saneado de bloques, historial, precarga, cada regla de consejos de cardio y minutos por semana.

## Manuales en iPhone (pendientes)
1. Servir en LAN (`node serve.mjs --lan`) o abrir la URL de GitHub Pages en Safari → Compartir → «Añadir a pantalla de inicio».
2. Registrar una sesión real con una mano: ¿los botones −/+ son cómodos? ¿cabe todo sin hacer scroll en exceso?
3. Foto de la máquina: «Foto de la máquina» abre cámara/fototeca; se ve en la ficha tras cerrar y reabrir la app.
4. Temporizador: con la app abierta suena el pitido al acabar (interruptor de silencio apagado); en segundo plano al volver muestra «¡Siguiente serie!».
5. Cerrar la app del todo y reabrir: la sesión en curso y el historial siguen ahí.
6. Pantalla encendida: con una sesión en curso y el ajuste activo, la pantalla no se apaga entre series (iOS 16.4+, app instalada); tras bloquear y desbloquear sigue encendida.
7. Rutinas A/B: guarda dos entrenos como «Día A»/«Día B» y comprueba que «Toca» rota; prueba «Hoy no puedo usarlo» y el calentamiento con una mano.
8. Superserie: crea una con dos ejercicios y comprueba que el descanso solo suena al cerrar la ronda; «Cronometrar» en la plancha.
9. Informe mensual: «Guardar / compartir» guarda un HTML que se abre en Safari; «Imprimir / PDF» puede no estar en la app instalada.
10. Calendario, volumen por músculo, récords y comparación: legibles a 390 px y con el tema oscuro.
11. Exportar con «Compartir» (guardar en Archivos) e importar ese fichero tras borrar datos del sitio.
