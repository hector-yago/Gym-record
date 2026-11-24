# Gym Record

PWA para iPhone (y PC) para registrar tus entrenamientos de gimnasio, con estadísticas y recomendaciones. Pensada para quien no recuerda los nombres de las máquinas ni de los músculos: catálogo en castellano con silueta del músculo, descripción y foto propia de cada máquina.

- **Entreno**: sesión libre, series con −/+ de peso y repeticiones, esfuerzo opcional, calentamiento, temporizador de descanso y resumen con récords.
- **Historial**, **Estadísticas** (semanas, volumen, mapa de músculos, progreso por ejercicio, peso corporal) y **Consejos** (subir/bajar peso, más repeticiones, añadir/quitar serie, cambiar de ejercicio, músculos descuidados).
- Datos solo en tu dispositivo; exportar/importar JSON y copias automáticas. Sin cuentas, sin servidor, sin telemetría.

## Uso
```
npm start            # http://localhost:8098/
node serve.mjs --lan # para abrirla desde el iPhone en tu red local
npm test
node tests/e2e/e2e.mjs --shots=capturas
```
Detalles de diseño en `CLAUDE.md` y `docs/`.
