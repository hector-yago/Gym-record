// Utilidades de interfaz: escape, formato, toast, hojas modales e iconos. Sin estado de la app.
export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmtDate = (k) => (k ? `${k.slice(8)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : '');
export const shortDate = (k) => `${k.slice(8)}/${k.slice(5, 7)}`;
export const longDate = (k) => new Date(`${k}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
export const monthName = (k) => new Date(`${k}T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
export const fmtStamp = (ms) => new Date(ms).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
export const fmtNum = (n, d = 0) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: 0 });

const svg = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
export const ICON = {
  train: svg('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'),
  history: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
  stats: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  advice: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'),
  more: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
};

let toastTimer;
export function toast(text, actionLabel, onAction) {
  $('#toast-root')?.remove();
  const el = document.createElement('div');
  el.id = 'toast-root';
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(text)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
  if (actionLabel) el.querySelector('button').addEventListener('click', () => { clearTimeout(toastTimer); el.remove(); onAction(); });
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), actionLabel ? 6000 : 3200);
}

export function openSheet(html, mount) {
  closeSheet();
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'sheet-root';
  overlay.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
  document.body.append(overlay);
  const sheet = overlay.firstElementChild;
  mount?.(sheet);
  sheet.querySelector('[autofocus]')?.focus({ preventScroll: true });
  return sheet;
}
export function closeSheet() {
  $('#sheet-root')?.remove();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/** Confirmación en hoja (más fiable en iOS PWA que window.confirm). */
export function confirmSheet(title, text, okLabel, onOk, { danger = true } = {}) {
  openSheet(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="actions"><button class="btn ${danger ? 'danger' : 'primary'} grow" data-ok>${esc(okLabel)}</button><button class="btn grow" data-no>Cancelar</button></div>`, (sh) => {
    $('[data-no]', sh).addEventListener('click', closeSheet);
    $('[data-ok]', sh).addEventListener('click', async () => { closeSheet(); await onOk(); });
  });
}

/** Gráfica de líneas simple: points = [{ label, y }]. */
export function lineChart(points, { unit = '', width = 320, height = 150 } = {}) {
  if (points.length < 2) return '<p class="hint">Hacen falta al menos 2 registros para dibujar la gráfica.</p>';
  const pad = { l: 34, r: 8, t: 10, b: 20 };
  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi - lo < 1) { hi += 1; lo -= 1; }
  const pr = (hi - lo) * 0.1;
  lo -= pr; hi += pr;
  const X = (i) => pad.l + (i * (width - pad.l - pad.r)) / (points.length - 1);
  const Y = (v) => pad.t + ((hi - v) * (height - pad.t - pad.b)) / (hi - lo);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
  const ticks = [lo + pr, (lo + hi) / 2, hi - pr].map((v) => `<line class="ax" x1="${pad.l}" x2="${width - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${pad.l - 4}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${fmtNum(v, 1)}</text>`).join('');
  const dots = points.map((p, i) => `<circle class="dot" cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3"><title>${esc(p.label)}: ${fmtNum(p.y, 1)} ${unit}</title></circle>`).join('');
  const first = points[0].label;
  const lastL = points.at(-1).label;
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución ${unit}">${ticks}<path class="ln" d="${path}"/>${dots}<text x="${pad.l}" y="${height - 4}">${esc(first)}</text><text x="${width - pad.r}" y="${height - 4}" text-anchor="end">${esc(lastL)}</text></svg>`;
}
