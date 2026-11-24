# Datos entre versiones

Los datos no se pierden al actualizar la app. Mecanismo (igual que `task-reminder`):

1. **Documento versionado**: `schemaVersion` (actual: `CURRENT_SCHEMA` en `js/migrations.js`). Todo se guarda como un único documento en IndexedDB (`js/store.js`), escrito de forma atómica.
2. **Migraciones**: un paso por versión (`N → N+1`), puro e idempotente, que no elimina datos del usuario. Un paso publicado **nunca se edita**; se añade otro.
3. **Copia previa**: antes de migrar se guarda un snapshot del documento original (últimas 7 copias). También antes de importar o restaurar.
4. **Datos de una versión más nueva** (app vieja en caché): se muestra un error y **no se toca nada**.
5. **Saneado** al migrar/importar: se descarta solo lo irrecuperable (fecha inválida, serie con peso o repeticiones imposibles, peso corporal fuera de 20–400 kg) y se deja una única sesión activa.
6. **Copias manuales**: Ajustes → Exportar (JSON versionado vía «Compartir» en iOS, **incluye fotos**) e Importar (fusionar o reemplazar). Aviso tras 14 días sin exportar.
7. **Almacenamiento**: `navigator.storage.persist()`; en iOS, la PWA instalada en pantalla de inicio no se purga por inactividad (Safari en pestaña sí).

## Historial de esquemas
- **1**: versión inicial (0.1.0).
- **2** (0.2.0, cardio): las entradas ganan `blocks` (vacío por defecto) y los ajustes `cardioTargetMin` (150). Migración 1→2 trivial; fixtures `tests/fixtures/v1.json` y `v2.json`.

## Forma del documento (esquema 2)
```
{ schemaVersion, sessions:[{ id, date, startedAt, endedAt|null, notes,
    entries:[{ exerciseId, notes, sets:[{ kg, reps, rpe?:1|2|3, warmup?:true }],
      blocks:[{ min, km?, level?, incline?, bpm?, rpe?:1|2|3 }] }] }],
  customExercises:[{ id, name, alt, primary, secondary[], equipment, step, reps:[min,max], how }],
  exerciseSettings:{ [exerciseId]:{ nickname?, step?, reps?, notes?, photo?, hidden? } },
  bodyweight:[{ date, kg }],
  settings:{ theme, targetPerWeek, restSeconds, backupReminderDays, sound, cardioTargetMin },
  meta:{ lastExport?, lastAutoBackup? } }
```
Los ids del catálogo (`js/catalog.js`) son **estables**: no se renombran ni reutilizan, porque las sesiones los referencian. Si un ejercicio desaparece del catálogo, se muestra como «Ejercicio desconocido» y se conservan sus series. Las fotos viven en la clave `photo:<exerciseId>` (data URL JPEG).

## Cómo cambiar el esquema
1. Subir `CURRENT_SCHEMA` y añadir `steps[N]` en `migrations.js`.
2. Guardar el fixture de la versión anterior en `tests/fixtures/vN.json` (el de la v1 ya existe).
3. Añadir un test que lo migre a la actual comprobando que no se pierde nada (`tests/store.test.mjs`).
4. Anotarlo aquí y subir la versión de la app.
