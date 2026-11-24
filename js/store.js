// Almacén: un único documento JSON guardado de forma atómica (IndexedDB en el navegador, Map en tests),
// con copias de seguridad automáticas (antes de migrar y una al día) y exportación/importación versionada.
// Las fotos de las máquinas viven aparte (clave `photo:<id>`, data URL) para no engordar el documento.
import { APP_ID, CURRENT_SCHEMA, emptyDoc, migrate } from './migrations.js';

const DOC_KEY = 'doc';
const BACKUP_PREFIX = 'backup:';
const PHOTO_PREFIX = 'photo:';
export const BACKUP_KEEP = 7;
const DAY_MS = 86400000;

/** Adaptador en memoria (tests y respaldo cuando IndexedDB no está disponible). */
export function memoryAdapter() {
  const m = new Map();
  return {
    async get(k) {
      return m.has(k) ? structuredClone(m.get(k)) : undefined;
    },
    async put(k, v) {
      m.set(k, structuredClone(v));
    },
    async del(k) {
      m.delete(k);
    },
    async keys() {
      return [...m.keys()];
    },
  };
}

/** Adaptador IndexedDB (un solo almacén clave-valor). */
export function indexedDbAdapter(name = 'gym-record') {
  const open = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = async (mode, fn) => {
    const db = await open;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', mode);
      const out = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(out?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    get: (k) => run('readonly', (s) => s.get(k)),
    put: (k, v) => run('readwrite', (s) => s.put(v, k)),
    del: (k) => run('readwrite', (s) => s.delete(k)),
    keys: () => run('readonly', (s) => s.getAllKeys()),
  };
}

export function createStore(adapter, { now = () => Date.now() } = {}) {
  let doc = emptyDoc();
  const listeners = new Set();
  let saving = Promise.resolve();

  async function snapshot(reason, source) {
    const stamp = now();
    await adapter.put(`${BACKUP_PREFIX}${String(stamp).padStart(15, '0')}`, { reason, createdAt: stamp, doc: source });
    const keys = (await adapter.keys()).filter((k) => k.startsWith(BACKUP_PREFIX)).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - BACKUP_KEEP))) await adapter.del(old);
  }

  const hasData = (d) => d.sessions.length > 0 || d.bodyweight.length > 0 || d.customExercises.length > 0 || d.routines.length > 0;

  return {
    /** Carga (y migra) los datos. Devuelve info de lo ocurrido para avisar al usuario. */
    async load() {
      const raw = await adapter.get(DOC_KEY);
      const info = { created: false, migratedFrom: null };
      if (raw === undefined) {
        doc = emptyDoc();
        await adapter.put(DOC_KEY, doc);
        info.created = true;
        return info;
      }
      const result = migrate(raw); // si es de una versión más nueva lanza error y NO se toca nada
      if (result.from !== result.to) {
        await snapshot(`antes de migrar del esquema ${result.from} al ${result.to}`, raw);
        info.migratedFrom = result.from;
      }
      doc = result.doc;
      if (result.from !== result.to) await adapter.put(DOC_KEY, doc);
      return info;
    },

    get state() {
      return doc;
    },

    /** Aplica un cambio sobre una copia, valida y persiste. `fn` recibe el documento y devuelve el nuevo (o lo muta). */
    async update(fn) {
      const draft = structuredClone(doc);
      const result = fn(draft);
      const next = result && typeof result === 'object' ? result : draft;
      doc = migrate({ ...next, schemaVersion: CURRENT_SCHEMA }).doc;
      listeners.forEach((l) => l(doc));
      saving = saving.then(() => adapter.put(DOC_KEY, doc));
      await saving;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Copia diaria automática (como máximo una cada 24 h). */
    async autoBackup() {
      const last = doc.meta.lastAutoBackup ?? 0;
      if (now() - last < DAY_MS || !hasData(doc)) return false;
      await snapshot('copia automática diaria', doc);
      await this.update((d) => {
        d.meta.lastAutoBackup = now();
      });
      return true;
    },

    async listBackups() {
      const keys = (await adapter.keys()).filter((k) => k.startsWith(BACKUP_PREFIX)).sort().reverse();
      const out = [];
      for (const key of keys) {
        const b = await adapter.get(key);
        out.push({ key, reason: b.reason, createdAt: b.createdAt, sessions: b.doc?.sessions?.length ?? 0 });
      }
      return out;
    },

    /** Restaura una copia; antes guarda el estado actual por si hubo error. */
    async restoreBackup(key) {
      const b = await adapter.get(key);
      if (!b) throw new Error('La copia ya no existe.');
      const restored = migrate(b.doc).doc;
      await snapshot('antes de restaurar una copia', doc);
      doc = restored;
      listeners.forEach((l) => l(doc));
      await adapter.put(DOC_KEY, doc);
    },

    /* ---- fotos de máquinas ---- */
    async savePhoto(exerciseId, dataUrl) {
      await adapter.put(PHOTO_PREFIX + exerciseId, dataUrl);
      await this.update((d) => {
        d.exerciseSettings[exerciseId] = { ...(d.exerciseSettings[exerciseId] ?? {}), photo: true };
      });
    },
    getPhoto: (exerciseId) => adapter.get(PHOTO_PREFIX + exerciseId),
    async deletePhoto(exerciseId) {
      await adapter.del(PHOTO_PREFIX + exerciseId);
      await this.update((d) => {
        if (d.exerciseSettings[exerciseId]) delete d.exerciseSettings[exerciseId].photo;
      });
    },

    /** Exporta datos y (opcionalmente) fotos. */
    async exportJson({ photos = true } = {}) {
      const out = { app: APP_ID, schemaVersion: CURRENT_SCHEMA, exportedAt: new Date(now()).toISOString(), data: doc };
      if (photos) {
        const map = {};
        for (const k of (await adapter.keys()).filter((x) => x.startsWith(PHOTO_PREFIX))) map[k.slice(PHOTO_PREFIX.length)] = await adapter.get(k);
        if (Object.keys(map).length) out.photos = map;
      }
      return JSON.stringify(out, null, 2);
    },

    async markExported() {
      await this.update((d) => {
        d.meta.lastExport = now();
      });
    },

    /** Importa un fichero exportado. mode: 'replace' (sustituye todo, con copia previa) o 'merge' (añade lo que falte). */
    async importJson(text, mode = 'replace') {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('El fichero no es un JSON válido.');
      }
      if (parsed?.app !== APP_ID || !parsed.data) throw new Error('El fichero no es una exportación de Gym Record.');
      const incoming = migrate({ ...parsed.data, schemaVersion: parsed.schemaVersion ?? parsed.data.schemaVersion }).doc;
      await snapshot(`antes de importar (${mode})`, doc);
      if (mode === 'replace') {
        doc = { ...incoming, meta: { ...incoming.meta, lastExport: doc.meta.lastExport } };
      } else {
        const ids = new Set(doc.sessions.map((s) => s.id));
        const exIds = new Set(doc.customExercises.map((e) => e.id));
        const routineIds = new Set(doc.routines.map((r) => r.id));
        const dates = new Set(doc.bodyweight.map((w) => w.date));
        const settings = { ...incoming.exerciseSettings, ...doc.exerciseSettings }; // lo local manda
        doc = migrate({
          ...doc,
          sessions: [...doc.sessions, ...incoming.sessions.filter((s) => !ids.has(s.id))],
          routines: [...doc.routines, ...incoming.routines.filter((r) => !routineIds.has(r.id))],
          customExercises: [...doc.customExercises, ...incoming.customExercises.filter((e) => !exIds.has(e.id))],
          bodyweight: [...doc.bodyweight, ...incoming.bodyweight.filter((w) => !dates.has(w.date))],
          exerciseSettings: settings,
        }).doc;
      }
      for (const [id, url] of Object.entries(parsed.photos ?? {})) {
        if (typeof url === 'string' && url.startsWith('data:image/') && (mode === 'replace' || !(await adapter.get(PHOTO_PREFIX + id)))) {
          await adapter.put(PHOTO_PREFIX + id, url);
          doc.exerciseSettings[id] = { ...(doc.exerciseSettings[id] ?? {}), photo: true };
        }
      }
      listeners.forEach((l) => l(doc));
      await adapter.put(DOC_KEY, doc);
      return { sessions: doc.sessions.length };
    },

    /** ¿Toca recordar la copia manual? */
    backupDue() {
      if (!doc.sessions.length) return false;
      // Sin exportaciones previas se cuenta desde la sesión más antigua, para no avisar nada más empezar.
      const since = doc.meta.lastExport ?? Math.min(...doc.sessions.map((s) => s.startedAt));
      return now() - since > doc.settings.backupReminderDays * DAY_MS;
    },
  };
}
