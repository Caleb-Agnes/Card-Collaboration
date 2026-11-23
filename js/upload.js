// Upload processing (U1, U2, U5, T8). Turns a PNG or JPG into one trimmed PNG plus the
// transform that places it on the canvas. Nothing is sent anywhere here.
//
// Flow: readImage() decodes the file. If it has no transparency at all (JPG, MS Paint),
// removeBackground() can make the background see-through (T8). placeUpload() then trims
// it and works out where it goes.
import { makeCanvas, shapeBounds } from './canvas/draw.js';

export const MAX_BYTES = 20 * 1024 * 1024;  // U5
const TOL = 40;  // colour distance (largest channel difference) still counted as "the background"

/**
 * @param {File} file
 * @returns {Promise<{canvas, opaque: boolean, jpeg: boolean}>}
 */
export async function readImage(file) {
  if (file.size > MAX_BYTES) throw new Error(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is 20 MB.`);
  const ext = file.name.split('.').pop().toLowerCase();
  const jpeg = ['jpg', 'jpeg'].includes(ext) || file.type === 'image/jpeg';
  if (!jpeg && ext !== 'png' && file.type !== 'image/png') {
    throw new Error('Upload a PNG (or a JPG). In your drawing app, hide every layer except your character and export as PNG.');
  }
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('That image could not be read.'); });
  const canvas = makeCanvas(bmp.width, bmp.height);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const a = g.getImageData(0, 0, bmp.width, bmp.height).data;
  let opaque = true;
  for (let i = 3; i < a.length; i += 4) if (a[i] < 255) { opaque = false; break; }
  return { canvas, opaque, jpeg };
}

/** Most common colour around the image's edge, as [r, g, b]: the likely background. */
export function findBackground(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const counts = new Map();
  const add = (x, y) => {
    const i = (y * w + x) * 4;
    const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);  // 5 bits per channel
    const c = counts.get(key);
    if (c) c.n++; else counts.set(key, { n: 1, rgb: [d[i], d[i + 1], d[i + 2]] });
  };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 0; y < h; y++) { add(0, y); add(w - 1, y); }
  let best = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best.rgb;
}

/**
 * T8: make the background see-through. Removes the area of `colour` that touches the edges,
 * plus the area under each clicked point, so the same colour inside the drawing (eyes,
 * highlights) is kept. Pixels just outside each area fade out to soften JPG fringes.
 * @param {HTMLCanvasElement} src
 * @param {{colour: number[], points: {x, y}[]}} o
 * @returns {HTMLCanvasElement} a new canvas
 */
export function removeBackground(src, { colour, points = [] }) {
  const { width: w, height: h } = src;
  const out = makeCanvas(w, h);
  const g = out.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const dist = (i, c) => Math.max(Math.abs(d[i] - c[0]), Math.abs(d[i + 1] - c[1]), Math.abs(d[i + 2] - c[2]));

  const flood = (seeds, c) => {
    const mask = new Uint8Array(w * h);
    const stack = [];
    for (const p of seeds) if (dist(p * 4, c) <= TOL && !mask[p]) { mask[p] = 1; stack.push(p); }
    while (stack.length) {
      const p = stack.pop(), x = p % w;
      const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of next) if (q >= 0 && q < w * h && !mask[q] && dist(q * 4, c) <= TOL) { mask[q] = 1; stack.push(q); }
    }
    for (let p = 0; p < w * h; p++) {
      if (mask[p]) { d[p * 4 + 3] = 0; continue; }
      const x = p % w;
      const touches = (x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (p >= w && mask[p - w]) || (p + w < w * h && mask[p + w]);
      if (touches) {
        const k = dist(p * 4, c);
        if (k < TOL * 2) d[p * 4 + 3] = Math.min(d[p * 4 + 3], Math.round(255 * (k - TOL) / TOL));
      }
    }
  };

  const edge = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) edge.push(y * w, y * w + w - 1);
  flood(edge, colour);
  for (const pt of points) {
    const p = Math.floor(pt.y) * w + Math.floor(pt.x);
    if (p < 0 || p >= w * h) continue;
    flood([p], [d[p * 4], d[p * 4 + 1], d[p * 4 + 2]]);
  }
  g.putImageData(img, 0, 0);
  return out;
}

/**
 * Trim the image and work out where it goes (U2).
 * @param {HTMLCanvasElement} canvas
 * @param {{project, layer, opaque: boolean}} ctx  layer = the target layer (for its shape)
 * @returns {{canvas, transform, warnings: string[]}}
 */
export function placeUpload(canvas, { project, layer, opaque }) {
  const warnings = [];
  if (opaque) warnings.push('This image has no transparent background, so the whole rectangle will cover the art behind it.');

  // An image exactly the size of the card was drawn on a template, so it lands at its exact position.
  if (canvas.width === project.width_px && canvas.height === project.height_px) {
    const t = trim(canvas);
    if (!t) throw new Error('That image is completely transparent. Did you export the layer you drew on?');
    return { canvas: t.canvas, transform: { x: t.dx, y: t.dy, scale: 1, flip: false, rotation: 0 }, warnings };
  }

  // Any other image fits into its space's bounds, keeping its proportions.
  const t = trim(canvas);
  if (!t) throw new Error('That image is completely transparent.');
  const b = shapeBounds(layer.shape) || { x: 0, y: 0, w: project.width_px, h: project.height_px };
  const scale = Math.min(b.w / t.canvas.width, b.h / t.canvas.height);
  if (scale > 1.01) warnings.push(`This image is smaller than your space and has been enlarged ${scale.toFixed(1)}×, so it will print blurry.`);
  const w = t.canvas.width * scale, h = t.canvas.height * scale;
  return {
    canvas: t.canvas,
    transform: { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, scale, flip: false, rotation: 0 },
    warnings,
  };
}

/**
 * Crop away fully transparent edges, so a full-canvas layer stores only the art.
 * @returns {{canvas, dx, dy} | null} null when every pixel is transparent
 */
export function trim(canvas) {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let top = -1, bottom = -1, left = w, right = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let first = -1, last = -1;
    for (let x = 0; x < w; x++) if (data[row + x * 4 + 3]) { first = x; break; }
    if (first < 0) continue;
    for (let x = w - 1; x >= first; x--) if (data[row + x * 4 + 3]) { last = x; break; }
    if (top < 0) top = y;
    bottom = y;
    if (first < left) left = first;
    if (last > right) right = last;
  }
  if (top < 0) return null;
  if (left === 0 && top === 0 && right === w - 1 && bottom === h - 1) return { canvas, dx: 0, dy: 0 };
  const out = makeCanvas(right - left + 1, bottom - top + 1);
  out.getContext('2d').drawImage(canvas, -left, -top);
  return { canvas: out, dx: left, dy: top };
}
