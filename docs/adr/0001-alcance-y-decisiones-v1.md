# ADR 0001 — Alcance y decisiones de la v1

- Estado: aceptada · Fecha: 2026-11-24 · Contexto: personal, proyecto nuevo.

## Contexto
El usuario va al gimnasio ~2 veces por semana (variable) desde hace un par de años y no recuerda los nombres de máquinas ni de músculos. Quiere registrar entrenos, ver estadísticas y recibir recomendaciones (cambiar de ejercicio, subir/bajar peso, repeticiones o series). Se usa en iPhone y en el PC (My Tools).

## Decisiones
1. **PWA de JS plano, sin build ni dependencias**, igual que `task-reminder` (reutiliza servidor local, service worker, almacén, migraciones, copias, tests y e2e).
2. **Registro por sesión libre**, ejercicio a ejercicio, con precarga de la última vez y estepers de peso/repeticiones (uso con una mano). Sin rutinas fijas en v1.
3. **Catálogo en castellano** (~70 ejercicios) con músculo principal/secundarios, equipo, rango de repeticiones y salto de peso típicos, descripción breve, silueta SVG y **foto propia** de la máquina y apodo. Se pueden crear ejercicios propios.
4. **Recomendaciones por reglas locales explicables** (doble progresión, bajada tras dos fallos, estancamiento en 3 sesiones, vuelta tras 3 semanas, músculos descuidados ≥ 10 días, equilibrio empuje/tirón, frecuencia vs objetivo). Sin IA: funciona sin conexión, es predecible y cada consejo explica su porqué.
5. **Esfuerzo percibido opcional** por serie (fácil / justo / al límite): mejora las reglas sin estorbar.
6. **Extras de v1**: temporizador de descanso (por marcas de tiempo), récords y 1RM estimado (Epley), mapa de músculos (7/30 días), peso corporal, notas, series de calentamiento.
7. **Solo kg**, con salto configurable por ejercicio; no se modelan «placas».
8. **Datos solo en el dispositivo** (IndexedDB) + export/import JSON (con fotos) + copias automáticas. Sin backend ni telemetría.
9. Publicación en GitHub Pages con autorización expresa; My Tools lo lanza en local (puerto 8098).

## Consecuencias
- Frecuencia objetivo configurable (por defecto 2/semana): las recomendaciones de frecuencia usan la media real de 8 semanas.
- Las fotos no entran en las copias automáticas (pesan); sí en la exportación.
- El cardio se añadió en la 0.2.0 (ADR 0002).
- Fuera de v1: rutinas/plantillas, sincronización PC↔iPhone, notificaciones push, unidades en libras, importación desde otras apps.
