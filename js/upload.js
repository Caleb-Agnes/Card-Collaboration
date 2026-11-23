// Upload processing (U1, U2, U5, T6). Turns whatever was dropped in into one trimmed PNG
// plus the transform that places it on the canvas. Nothing is sent anywhere here.
import { loadAgPsd, loadJSZip } from './lib.js';
import { makeCanvas, shapeBounds } from './canvas/draw.js';
import { myLayerName } from './templates.js';

export const MAX_BYTES = 20 * 1024 * 1024;  // U5

/**
 * @param {File} file
 * @param {{project, layer}} ctx  layer = the target layer (for its label and shape)
 * @returns {Promise<{canvas, transform, warnings: string[]}>}
 */
export async function processUpload(file, { project, layer }) {
  if (file.size > MAX_BYTES) throw new Error(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is 20 MB.`);
  const ext = file.name.split('.').pop().toLowerCase();
  const warnings = [];
  let src; // { canvas, left, top, docW, docH } in document px; docW/H null for loose images

  if (ext === 'psd') src = await fromPsd(file, layer.label);
  else if (ext === 'ora') src = await fromOra(file, layer.label);
  else if (['png', 'jpg', 'jpeg'].includes(ext) || file.type.startsWith('image/')) {
    const bmp = await createImageBitmap(file).catch(() => { throw new Error('That image could not be read.'); });
    const c = makeCanvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0);
    if (ext === 'jpg' || ext === 'jpeg' || file.type === 'image/jpeg') {
      warnings.push('JPG files have no transparency, so the whole rectangle (including its background) will cover the art behind it. A PNG with a transparent background works better.');
    }
    // A loose image at exactly canvas size is treated as full-canvas (drawn on blank.png).
    const full = bmp.width === project.width_px && bmp.height === project.height_px;
    src = { canvas: c, left: 0, top: 0, docW: full ? bmp.width : null, docH: full ? bmp.height : null };
  } else throw new Error('Upload a PNG, JPG, PSD or ORA file.');

  // Template / full-canvas files land at their exact position (U2, T3).
  if (src.docW) {
    const k = project.width_px / src.docW;
    if (Math.abs(src.docH * k - project.height_px) > 2) {
      warnings.push(`This file is ${src.docW} × ${src.docH}, which is not the shape of the card. It has been scaled to the card's width.`);
    }
    if (k > 1.01) warnings.push(`This file is smaller than the card (${src.docW} px wide, the card is ${project.width_px} px), so it will print blurry.`);
    const t = trim(src.canvas);
    if (!t) throw new Error('That layer is empty. Did you draw on the "My character" layer?');
    return {
      canvas: t.canvas,
      transform: { x: (src.left + t.dx) * k, y: (src.top + t.dy) * k, scale: k, flip: false, rotation: 0 },
      warnings,
    };
  }

  // Any other image fits into its shape's bounds, keeping aspect ratio (U2).
  const t = trim(src.canvas);
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

// ---------- Layered files (T6) ----------

/** Find the "My character" layer: exact name first, then any name starting "My character". */
function pickMine(nodes, label, nameOf, childrenOf) {
  const all = [];
  const walk = list => list.forEach(n => { all.push(n); const c = childrenOf(n); if (c) walk(c); });
  walk(nodes);
  const want = myLayerName(label).toLowerCase();
  const exact = all.filter(n => nameOf(n).trim().toLowerCase() === want);
  if (exact.length) return exact[0];
  const loose = all.filter(n => nameOf(n).trim().toLowerCase().startsWith('my character'));
  if (loose.length === 1) return loose[0];
  const names = all.map(nameOf).filter(Boolean).slice(0, 12).join('", "');
  if (loose.length > 1) throw new Error(`There are ${loose.length} layers called "My character…". Keep one, named "${myLayerName(label)}".`);
  throw new Error(`No layer called "${myLayerName(label)}" was found (layers in the file: "${names}"). Rename your art layer, or export a PNG instead.`);
}

async function fromPsd(file, label) {
  const { readPsd } = await loadAgPsd();
  let psd;
  try { psd = readPsd(await file.arrayBuffer(), { skipCompositeImageData: true, skipThumbnail: true }); }
  catch (e) { throw new Error('That PSD could not be read: ' + e.message); }
  const mine = pickMine(psd.children || [], label, n => n.name || '', n => n.children);
  const canvas = makeCanvas(psd.width, psd.height);
  drawPsdNode(canvas.getContext('2d'), mine, true);
  return { canvas, left: 0, top: 0, docW: psd.width, docH: psd.height };
}

/** Draw a PSD layer, or a group's visible children, onto a document-size canvas. Blend modes are drawn as Normal. */
function drawPsdNode(ctx, node, isRoot) {
  if (node.hidden && !isRoot) return;
  ctx.save();
  ctx.globalAlpha *= node.opacity ?? 1;
  if (node.children) [...node.children].forEach(c => drawPsdNode(ctx, c, false));  // children are bottom-first
  else if (node.canvas) ctx.drawImage(node.canvas, node.left || 0, node.top || 0);
  ctx.restore();
}

async function fromOra(file, label) {
  const JSZip = await loadJSZip();
  let zip;
  try { zip = await JSZip.loadAsync(file); } catch { throw new Error('That ORA file could not be opened.'); }
  const xml = await zip.file('stack.xml')?.async('string');
  if (!xml) throw new Error('That ORA file has no stack.xml.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const image = doc.querySelector('image');
  const W = +image.getAttribute('w'), H = +image.getAttribute('h');
  const kids = el => [...el.children].filter(c => c.tagName === 'layer' || c.tagName === 'stack');
  const mine = pickMine(kids(image.querySelector('stack')), label, n => n.getAttribute('name') || '', n => (n.tagName === 'stack' ? kids(n) : null));
  const canvas = makeCanvas(W, H);
  await drawOraNode(canvas.getContext('2d'), zip, mine, true);
  return { canvas, left: 0, top: 0, docW: W, docH: H };
}

/** Draw an ORA layer, or a stack's visible children (listed top-first), onto a document-size canvas. */
async function drawOraNode(ctx, zip, el, isRoot) {
  if (!isRoot && el.getAttribute('visibility') === 'hidden') return;
  ctx.save();
  ctx.globalAlpha *= parseFloat(el.getAttribute('opacity') ?? '1');
  if (el.tagName === 'stack') {
    const children = [...el.children].filter(c => c.tagName === 'layer' || c.tagName === 'stack').reverse();
    for (const c of children) await drawOraNode(ctx, zip, c, false);
  } else {
    const f = zip.file(el.getAttribute('src'));
    if (f) {
      const bmp = await createImageBitmap(await f.async('blob'));
      ctx.drawImage(bmp, +(el.getAttribute('x') || 0), +(el.getAttribute('y') || 0));
    }
  }
  ctx.restore();
}
