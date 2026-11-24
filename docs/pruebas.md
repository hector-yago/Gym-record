# Pruebas

## Automáticas
- `npm test`: dates/workouts/stats (cálculos), recommend (tabla de casos de cada regla) y store/migraciones (fixture v1, esquema 0, versión futura, copias, export/import con fotos).
- `node tests/e2e/e2e.mjs [--shots=carpeta]`: flujo completo en Edge/Chrome headless a 390×844: sesión, series, temporizador, resumen, historial, estadísticas, consejos, ficha de ejercicio con silueta, peso corporal, tema oscuro, exportación y service worker.

## Manuales en iPhone (pendientes)
1. Servir en LAN (`node serve.mjs --lan`) o abrir la URL de GitHub Pages en Safari → Compartir → «Añadir a pantalla de inicio».
2. Registrar una sesión real con una mano: ¿los botones −/+ son cómodos? ¿cabe todo sin hacer scroll en exceso?
3. Foto de la máquina: «Foto de la máquina» abre cámara/fototeca; se ve en la ficha tras cerrar y reabrir la app.
4. Temporizador: con la app abierta suena el pitido al acabar (interruptor de silencio apagado); en segundo plano al volver muestra «¡Siguiente serie!».
5. Cerrar la app del todo y reabrir: la sesión en curso y el historial siguen ahí.
6. Exportar con «Compartir» (guardar en Archivos) e importar ese fichero tras borrar datos del sitio.
