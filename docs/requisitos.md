# Requisitos (v1)

Estado: implementados salvo la prueba manual en iPhone real. Referencias a pruebas en `docs/pruebas.md`.

| Id | Requisito | Verificación |
|---|---|---|
| R1 | Registrar una sesión: añadir ejercicios y series (peso, repeticiones, esfuerzo opcional, calentamiento). Precarga de la última vez. | e2e |
| R2 | Temporizador de descanso al registrar una serie de trabajo (+15 s, saltar, aviso sonoro). | e2e (arranque), manual iPhone (sonido) |
| R3 | Catálogo en castellano con músculo, equipo, cómo se hace, silueta y foto/apodo propios; ejercicios propios. | e2e, manual |
| R4 | Historial: ver, repetir, editar (reabrir) y borrar sesiones. | e2e, manual |
| R5 | Estadísticas: sesiones/semana, racha semanal, volumen, tiempo, mapa de músculos 7/30 días, progreso (1RM estimado) y récords por ejercicio, peso corporal. | tests `stats`, e2e |
| R6 | Recomendaciones explicables: subir/bajar peso, más reps, añadir/quitar serie, cambiar de ejercicio, entrenar músculo olvidado, equilibrio, frecuencia. | tests `recommend` |
| R7 | Sugerencia de entreno del día según músculos más descansados. | e2e |
| R8 | Datos solo en el dispositivo; exportar/importar JSON con fotos; copias automáticas; migraciones. | tests `store` |
| R10 | Cardio (cinta, elíptica, bici, spinning, remo, escaladora, comba, andar, natación, HIIT): bloques con minutos, distancia, nivel, inclinación, pulsaciones y esfuerzo dentro del mismo entreno; estadísticas (min/semana, progreso, velocidad media) y consejos (progresión, frecuencia, equilibrio con la fuerza). | tests `cardio`, e2e |
| R11 | Rutinas guardables con rotación («Toca: Día A»), crear/editar/borrar, guardar o actualizar desde una sesión. | tests `routines`, e2e |
| R12 | Pantalla encendida durante la sesión (configurable), series de aproximación sugeridas, consejo de semana de descarga y sustitución de ejercicios. | tests `routines` (wake lock), `recommend`, e2e |
| R13 | Superseries (descanso al cerrar la ronda), descanso por ejercicio y cuenta atrás en ejercicios por tiempo. | tests `insights` (restFor), e2e |
| R14 | Lista de récords (fuerza y cardio) y récords del mes. | tests `insights`, e2e |
| R15 | Calendario de constancia, aviso tras ≥ 10 días sin entrenar y volumen por músculo (semana vs media 4 semanas, «se queda corto»). | tests `insights`, e2e |
| R16 | Informe mensual (HTML autónomo, compartir/imprimir) y comparación de dos sesiones. | tests `insights`, e2e |
| R17 | Molestias por zona (avisos, sin subir peso, consejo general; sin pretensión médica). | tests `insights`, e2e |
| R18 | Objetivo configurable (fuerza/hipertrofia/mantenimiento): rangos, descansos y prudencia de los consejos. | tests `insights`, e2e |
| R9 | Funciona sin conexión; instalable en iPhone; tema claro/oscuro; objetivo de sesiones/semana configurable. | e2e (SW), manual |

## Ambigüedades resueltas con valor por defecto
- Rango de repeticiones: 8–12 si el ejercicio no indica otro (catálogo y ajustable por ejercicio).
- «Músculo descuidado»: sin trabajo como músculo principal en ≥ 10 días (con ≥ 2 sesiones registradas).
- Estancamiento: 3 sesiones consecutivas sin superar el mejor 1RM estimado anterior.
- Series efectivas: músculo secundario cuenta la mitad; objetivo orientativo ~10 series/músculo/semana (mapa).
