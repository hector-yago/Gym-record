// Pantalla encendida durante el entreno (Screen Wake Lock API; iOS 16.4+ en PWA instalada).
// Tolerante a navegadores sin soporte y a rechazos (batería baja, pestaña oculta): nunca lanza.
export function createWakeLock({ nav = globalThis.navigator } = {}) {
  let sentinel = null;
  let wanted = false;
  const supported = () => Boolean(nav?.wakeLock?.request);

  async function request() {
    if (!supported() || !wanted || sentinel) return false;
    try {
      const s = await nav.wakeLock.request('screen');
      sentinel = s;
      s.addEventListener?.('release', () => { if (sentinel === s) sentinel = null; });
      return true;
    } catch {
      sentinel = null;
      return false;
    }
  }

  return {
    get supported() { return supported(); },
    get held() { return Boolean(sentinel); },
    /** Pide mantener la pantalla encendida y lo recuerda para poder reintentarlo. */
    acquire() { wanted = true; return request(); },
    /** Reintenta si se deseaba y se perdió (p. ej. al volver a la app). */
    reacquire() { return request(); },
    async release() {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      try { await s?.release?.(); } catch { /* ya liberado */ }
    },
  };
}
