# ADR 0002 — Cardio

- Estado: aceptada · Fecha: 2026-11-24 · Cambio de esquema 1 → 2 (0.2.0).

## Contexto
La 0.1.0 solo cubría fuerza. El usuario echó en falta el cardio (cinta, elíptica, bici).

## Decisiones
1. **Mismo entreno**: el cardio se añade como un ejercicio más de la sesión (antes o después de la fuerza). Una sola sesión por día y un solo historial.
2. **Bloque de cardio** = minutos (obligatorio) + distancia (km), nivel/resistencia, inclinación (%), pulsaciones medias y esfuerzo (fácil/justo/al límite), todos opcionales y limitados a las métricas de cada actividad. Velocidad media y ritmo se **calculan**; las calorías de las máquinas no se guardan (poco fiables).
3. **Catálogo**: cinta, elíptica, bici estática, spinning, remo ergómetro, escaladora, comba, andar al aire libre, natación e intervalos (HIIT). Sin cardio propio en v2.
4. **Modelo**: `kind: 'cardio'` y `primary: 'cardio'` (no es un músculo: no entra en el mapa de músculos, el volumen ni los músculos descuidados). Datos en `entry.blocks`, `sets` queda vacío.
5. **Consejos** (`js/cardio.js`, umbrales en `CARDIO_THRESHOLDS`): dos sesiones «fácil» seguidas → subir nivel/inclinación/velocidad; dos «al límite» → bajar; tres sesiones con el mismo tiempo → +~10 %; parón ≥ 21 días → volver con ~80 %; sin cardio registrado o < 40 % del objetivo semanal (por defecto 150 min, orientativo y configurable) → añadir cardio; solo cardio en 4 semanas → añadir fuerza.
6. **Esquema 2**: migración trivial (las entradas antiguas ganan `blocks: []`, los ajustes `cardioTargetMin`).

## Consecuencias
- Los 150 min/semana son una referencia general para adultos (actividad moderada, contando todo el movimiento), no una prescripción.
- Fuera de v2: cardio por intervalos estructurado, zonas de pulsaciones, importación desde relojes, calorías.
