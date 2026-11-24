// Silueta frontal y trasera con los músculos resaltados (SVG propio, sin dependencias ni red).
// Dibujo esquemático: sirve para ubicar el músculo, no para anatomía exacta.
// shapes: [músculo, tipo, atributos...] sobre un lienzo de 100 × 190 por vista.
const FRONT = [
  ['shoulders', 'e', 29, 38, 7, 6.5], ['shoulders', 'e', 71, 38, 7, 6.5],
  ['chest', 'e', 41, 49, 10, 7.5], ['chest', 'e', 59, 49, 10, 7.5],
  ['biceps', 'e', 22.5, 56, 4.6, 9], ['biceps', 'e', 77.5, 56, 4.6, 9],
  ['forearms', 'e', 19.5, 77, 4.2, 11], ['forearms', 'e', 80.5, 77, 4.2, 11],
  ['abs', 'r', 43, 59, 14, 30, 5],
  ['adductors', 'e', 50, 106, 3.2, 12],
  ['quads', 'e', 40.5, 112, 8, 21], ['quads', 'e', 59.5, 112, 8, 21],
  ['calves', 'e', 38.5, 152, 5, 14], ['calves', 'e', 61.5, 152, 5, 14],
];
const BACK = [
  ['upper_back', 'e', 50, 40, 15, 8],
  ['shoulders', 'e', 29, 38, 7, 6.5], ['shoulders', 'e', 71, 38, 7, 6.5],
  ['lats', 'e', 39.5, 58, 8, 13], ['lats', 'e', 60.5, 58, 8, 13],
  ['triceps', 'e', 22.5, 56, 4.6, 9], ['triceps', 'e', 77.5, 56, 4.6, 9],
  ['forearms', 'e', 19.5, 77, 4.2, 11], ['forearms', 'e', 80.5, 77, 4.2, 11],
  ['lower_back', 'e', 50, 80, 9, 7],
  ['glutes', 'e', 42.5, 98, 8.5, 8], ['glutes', 'e', 57.5, 98, 8.5, 8],
  ['hamstrings', 'e', 40.5, 120, 7.5, 16], ['hamstrings', 'e', 59.5, 120, 7.5, 16],
  ['calves', 'e', 38.5, 152, 5, 14], ['calves', 'e', 61.5, 152, 5, 14],
];

// Contorno del cuerpo (cabeza, tronco, brazos, piernas), común a ambas vistas.
const BODY = `<circle cx="50" cy="14" r="9"/><rect x="46" y="21" width="8" height="9" rx="3"/>
<rect x="32" y="28" width="36" height="72" rx="10"/>
<rect x="17" y="31" width="11" height="40" rx="5.5"/><rect x="72" y="31" width="11" height="40" rx="5.5"/>
<rect x="15" y="68" width="9" height="32" rx="4.5"/><rect x="76" y="68" width="9" height="32" rx="4.5"/>
<rect x="32" y="96" width="17" height="50" rx="8"/><rect x="51" y="96" width="17" height="50" rx="8"/>
<rect x="33.5" y="138" width="11" height="38" rx="5"/><rect x="55.5" y="138" width="11" height="38" rx="5"/>`;

function shape([id, type, a, b, c, d, r], level, id2cls) {
  const l = level[id] ?? 0;
  const cls = `m ${id2cls}${l ? ` on l${l}` : ''}`;
  if (type === 'e') return `<ellipse class="${cls}" data-m="${id}" cx="${a}" cy="${b}" rx="${c}" ry="${d}"/>`;
  return `<rect class="${cls}" data-m="${id}" x="${a}" y="${b}" width="${c}" height="${d}" rx="${r}"/>`;
}

/**
 * level: { músculoId: 1|2|3 } — 3 = principal, 2 = secundario/intenso, 1 = suave. Si se pasa `intensity`
 * (0..1), se convierte a 1-3. Devuelve un <svg> con la vista frontal y trasera.
 */
export function muscleMapSvg({ primary = [], secondary = [], intensity = null, label = '' } = {}) {
  const level = {};
  for (const m of secondary) level[m] = 1;
  for (const m of primary) level[m] = 3;
  if (intensity) for (const [m, v] of Object.entries(intensity)) level[m] = v > 0.66 ? 3 : v > 0.33 ? 2 : v > 0 ? 1 : 0;
  const view = (shapes, title, dx) => `<g transform="translate(${dx} 0)"><g class="body">${BODY}</g>${shapes.map((s) => shape(s, level, '')).join('')}<text x="50" y="186" text-anchor="middle" class="cap">${title}</text></g>`;
  return `<svg class="mm" viewBox="0 0 210 192" role="img" aria-label="${label || 'Músculos trabajados'}" xmlns="http://www.w3.org/2000/svg">${view(FRONT, 'Delante', 0)}${view(BACK, 'Detrás', 110)}</svg>`;
}
