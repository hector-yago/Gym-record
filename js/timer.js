// Temporizador de descanso basado en marcas de tiempo (sigue siendo exacto si la app pasa a segundo plano).
export function createTimer({ now = () => Date.now() } = {}) {
  let endsAt = 0;
  let total = 0;
  let fired = true;
  return {
    start(seconds) {
      total = Math.max(1, Math.round(seconds));
      endsAt = now() + total * 1000;
      fired = false;
    },
    add(seconds) {
      if (!this.active) return;
      endsAt += seconds * 1000;
      total += seconds;
      fired = false;
    },
    stop() {
      endsAt = 0;
      fired = true;
    },
    get active() {
      return endsAt > 0;
    },
    /** Segundos restantes (0 si ya terminó). */
    remaining() {
      return endsAt ? Math.max(0, Math.ceil((endsAt - now()) / 1000)) : 0;
    },
    get total() {
      return total;
    },
    /** true una sola vez cuando se agota. */
    justFinished() {
      if (this.active && !fired && this.remaining() === 0) {
        fired = true;
        return true;
      }
      return false;
    },
  };
}

export const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

let audioCtx;
/** Pitido corto (WebAudio). En iOS solo suena si antes hubo un toque del usuario; se prepara con prepareAudio(). */
export function prepareAudio() {
  try {
    audioCtx ??= new (globalThis.AudioContext ?? globalThis.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* sin audio */ }
}
export function beep() {
  try {
    if (!audioCtx) return;
    for (const [i, f] of [880, 880, 1175].entries()) {
      const t = audioCtx.currentTime + i * 0.22;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.2);
    }
    navigator.vibrate?.([200, 100, 200]);
  } catch { /* sin audio */ }
}
