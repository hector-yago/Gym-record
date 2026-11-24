# ADR 0003 — Rutinas y mejoras de sesión

- Estado: aceptada · Fecha: 2026-11-24 · Cambio de esquema 2 → 3 (0.3.0).

## Contexto
Con ~2 entrenos por semana, empezar cada sesión añadiendo los mismos ejercicios a mano es fricción. En el gimnasio, además, la pantalla del iPhone se apaga entre series y a veces falta una máquina.

## Decisiones
1. **Rutinas** (`doc.routines`: `{ id, name, exerciseIds[], createdAt }`). Se crean desde el resumen de una sesión («Guardar como rutina») o desde Más → Rutinas, y se pueden reordenar y borrar. Las sesiones empezadas desde una rutina guardan `routineId`.
2. **Rotación**: «Toca» es la rutina siguiente (cíclica, por orden de creación) a la de la última sesión terminada con `routineId`. Sin historial, o si esa rutina se borró, la primera. Las sesiones libres no alteran la rotación. Al terminar una sesión de rutina se puede «Actualizar» la rutina con los ejercicios realmente hechos.
3. **Pantalla encendida** (Screen Wake Lock, `js/wakelock.js`): solo con una sesión activa, se reintenta al volver a la app y se puede desactivar en Ajustes. Sin soporte o con rechazo del sistema no hace nada ni falla.
4. **Series de aproximación**: solo en el primer ejercicio de fuerza de la sesión, sin series de fuerza aún, con peso ≥ 20 kg y salto > 0: 50 % × 8 y 70 % × 5 redondeadas al salto. Se registran como `warmup` (sin descanso, fuera de estadísticas).
5. **Semana de descarga** (`deloadRecommendation`): ≥ 8 semanas de historia y ≥ 6 semanas completas seguidas con volumen ≥ 60 % de la mediana de las últimas 12; una semana ligera o un parón reinicia la cuenta. Es una referencia general, no una prescripción.
6. **Sustituir un ejercicio** («Hoy no puedo usarlo», `alternativesFor`): mismo músculo y mismo tipo (fuerza o cardio); primero los ya usados, luego mismo equipo, luego máquinas. Sin registros se reemplaza; con registros el sustituto se añade debajo (no se pierde nada). No se recuerda la elección.
7. **Esquema 3**: migración trivial (`routines: []`, `keepAwake: true`); la importación fusiona rutinas por id (lo local manda).

## Consecuencias
- Borrar una rutina no toca los entrenos ya hechos; un `routineId` huérfano solo reinicia la rotación.
- El historial de «a qué ejercicio sustituí» no se guarda; si se quiere, sería una lista de «evitar» (idea futura).
- Fuera de esta versión: reconocer la máquina por foto, superseries, calendario de constancia, informe mensual, medidas corporales, importar CSV, sincronización PC↔iPhone, libras/placas.
