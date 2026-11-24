# ADR 0004 — Superseries, descansos, récords, constancia, informe, comparación, molestias y objetivo

- Estado: aceptada · Fecha: 2026-11-24 · Cambio de esquema 3 → 4 (0.4.0).

## Decisiones
1. **Superseries**: las entradas de una sesión pueden compartir `ss` (id de grupo). Se crean desde «⋯ → Superserie con el siguiente» y se agrupan visualmente. El descanso solo arranca al **cerrar la ronda** (todos los ejercicios del grupo con el mismo número de series de trabajo); mientras tanto, un aviso indica «Ahora: …» y la tarjeta que toca lleva «👉 te toca». No se mezcla cardio en superseries.
2. **Descanso por ejercicio** (`exerciseSettings[id].rest`, 10–600 s). Sin él, `restFor` (`js/goals.js`): descanso base de Ajustes + ajuste del objetivo (fuerza +60 s, mantenimiento −30 s); los ejercicios de aislamiento descansan 30 s menos que los compuestos (mínimo 45 s). Los ejercicios por tiempo (plancha…) tienen cuenta atrás («⏱ Cronometrar») con aviso sonoro.
3. **Récords** (`js/records.js`): mejor peso, 1RM estimado y volumen de sesión por ejercicio (cardio: tiempo, distancia y velocidad media), con la fecha en que se logró por primera vez, más los récords batidos en el mes. La primera vez que se hace un ejercicio no es récord, es la referencia.
4. **Constancia**: calendario de 16 semanas (lunes→domingo) en Estadísticas y aviso amable en Inicio con 10 o más días sin entrenar.
5. **Volumen por músculo** (`muscleVolumeTable`): series efectivas de la semana en curso frente a la media de las 4 semanas completas anteriores; «se queda corto» si la media es < 6 series/semana con actividad real (≥ 4 sesiones en esas 4 semanas).
6. **Informe mensual** (`js/report.js`): resumen del mes (sesiones, series, volumen, tiempo, cardio, récords, ejercicios y músculos principales, comparación con el mes anterior) como **HTML autónomo** (sin scripts ni red) que se guarda/comparte o se imprime a PDF. Se genera en el dispositivo.
7. **Comparar dos sesiones** desde el historial: ejercicio a ejercicio, diferencias B − A (A = la más antigua), ejercicios presentes en una sola y cardio.
8. **Molestias** (`doc.pains`: zona = músculo, nota, fechas, resuelta): se anotan desde el ejercicio o en Más → Molestias. La app avisa en las tarjetas y al añadir ejercicios que cargan la zona (principal o secundaria), sustituye «sube peso» por «no subas peso» y añade un consejo general. **No es consejo médico**; el texto remite a un profesional si el dolor es fuerte, dura o empeora.
9. **Objetivo** (`settings.goal`: fuerza / hipertrofia / mantenimiento): cambia el rango de repeticiones por defecto (fuerza: 3-6 en compuestos y 6-10 en aislamiento; el rango propio del ejercicio manda), el descanso y la prudencia de los consejos (mantenimiento: no sube peso solo por «fácil» ni propone cambios por estancamiento).
10. **Esquema 4**: migración trivial (`pains: []`, `goal: 'hypertrophy'`; `ss` y `rest` opcionales); fixture `v4.json`; la importación fusiona molestias por id (lo local manda).

## Ya hechas en la 0.3.0 (ADR 0003)
Semana de descarga, «hoy no puedo usar X» y series de aproximación.

## Consecuencias
- Las molestias están asociadas a zonas musculares, no a articulaciones (rodilla, muñeca…): es una simplificación deliberada para reutilizar el catálogo.
- «Imprimir / PDF» puede no estar disponible en la PWA instalada de iOS; el HTML guardado se abre y se imprime desde Safari.
- Fuera de esta versión: reconocer la máquina por foto, medidas corporales, importar CSV, sincronización PC↔iPhone, libras/placas.
