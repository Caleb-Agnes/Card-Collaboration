// Drawing helpers shared by the on-screen view, templates and exports, so all three
// place art identically. Everything here works in canvas pixels.

/** Default transform: image top-left at (x, y), drawn at scale, optional horizontal flip and rotation (degrees, about the centre). */
export const defaultTransform = () => ({ x: 0, y: 0, scale: 1, flip: false, rotation: 0 });

/** Draw a layer's image with its transform (U3). */
export function drawLayerImage(ctx, img, t) {
  const w = img.width * t.scale, h = img.height * t.scale;
  ctx.save();
  ctx.translate(t.x + w / 2, t.y + h / 2);
  if (t.rotation) ctx.rotate(t.rotation * Math.PI / 180);
  if (t.flip) ctx.scale(-1, 1);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/**
 * Smooth downscaling. Browsers shrink a big image in one drawImage step by sampling only some
 * of its pixels, so a large upload shown small looks jagged. Instead keep a chain of copies,
 * each half the size of the last (made once per image and cached), and draw from the
 * smallest copy that is still at least as big as it will appear.
 */
const mipCache = new WeakMap();  // image -> [image, 1/2 copy, 1/4 copy, ...]
function mipChain(img) {
  let chain = mipCache.get(img);
  if (!chain) {
    chain = [img];
    let src = img;
    while (src.width > 64 && src.height > 64) {
      const c = makeCanvas(Math.max(1, Math.round(src.width / 2)), Math.max(1, Math.round(src.height / 2)));
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, c.width, c.height);
      chain.push(c);
      src = c;
    }
    mipCache.set(img, chain);
  }
  return chain;
}

/**
 * Draw a layer's image smoothly when it appears smaller than its real size.
 * @param {number} pxPerCanvasPx  device pixels per canvas pixel for this context
 */
export function drawLayerImageScaled(ctx, img, t, pxPerCanvasPx) {
  const shown = t.scale * pxPerCanvasPx;  // device pixels per image pixel
  if (!(shown < 0.75)) return drawLayerImage(ctx, img, t);
  const chain = mipChain(img);
  // Smallest copy that is still at least as large as it will be drawn.
  let i = 0;
  while (i + 1 < chain.length && chain[i + 1].width >= img.width * shown) i++;
  const src = chain[i];
  return drawLayerImage(ctx, src, { ...t, scale: t.scale * img.width / src.width });
}

/** Shrink an image smoothly into a w x h canvas (for thumbnails). */
export function scaledCopy(img, w, h) {
  const chain = mipChain(img);
  let i = 0;
  while (i + 1 < chain.length && chain[i + 1].width >= w) i++;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(chain[i], 0, 0, w, h);
  return c;
}

/** Axis-aligned bounds of a shape. */
export function shapeBounds(shape) {
  if (!shape) return null;
  if (shape.type === 'rect') return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  const xs = shape.points.map(p => p[0]), ys = shape.points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * A layer's box as centre, size and rotation (radians): its art if uploaded (img given),
 * else its claimed shape's bounds (never rotated).
 */
export function layerFrame(layer, img) {
  if (layer.image_path && img && layer.transform) {
    const t = layer.transform, w = img.width * t.scale, h = img.height * t.scale;
    return { cx: t.x + w / 2, cy: t.y + h / 2, w, h, angle: (t.rotation || 0) * Math.PI / 180 };
  }
  const b = shapeBounds(layer.shape);
  return b && { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, angle: 0 };
}

/** Frame corners in canvas px, clockwise from top-left: [tl, tr, br, bl]. */
export function frameCorners(f) {
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const x = sx * f.w / 2, y = sy * f.h / 2;
    return { x: f.cx + x * c - y * s, y: f.cy + x * s + y * c };
  });
}

/** A canvas point in the frame's own unrotated coordinates, relative to its centre. */
export function toFrame(f, p) {
  const c = Math.cos(f.angle), s = Math.sin(f.angle), dx = p.x - f.cx, dy = p.y - f.cy;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** Axis-aligned bounds of a layer, including any rotation of its art. */
export function layerBounds(layer, img) {
  const f = layerFrame(layer, img);
  if (!f) return null;
  if (!f.angle) return { x: f.cx - f.w / 2, y: f.cy - f.h / 2, w: f.w, h: f.h };
  const pts = frameCorners(f), xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Is the point inside the layer (its rotated art box, or its claimed shape)? */
export function layerContains(layer, img, p) {
  const f = layerFrame(layer, img);
  if (!f) return false;
  if (layer.image_path && img && layer.transform) {
    const q = toFrame(f, p);
    return Math.abs(q.x) <= f.w / 2 && Math.abs(q.y) <= f.h / 2;
  }
  return layer.shape.type === 'path' ? pointInPolygon(layer.shape.points, p)
    : Math.abs(p.x - f.cx) <= f.w / 2 && Math.abs(p.y - f.cy) <= f.h / 2;
}

/** Even-odd test for a point in a polygon given as [[x, y], ...]. */
export function pointInPolygon(pts, p) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Do segments ab and cd touch? Shared endpoints count as touching, so callers skip the
 * neighbouring segment. Collinear overlaps count too.
 */
export function segmentsTouch(a, b, c, d) {
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const onSeg = (o, p, q) => Math.min(o[0], p[0]) <= q[0] && q[0] <= Math.max(o[0], p[0]) && Math.min(o[1], p[1]) <= q[1] && q[1] <= Math.max(o[1], p[1]);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (d1 === 0 && onSeg(c, d, a)) || (d2 === 0 && onSeg(c, d, b)) || (d3 === 0 && onSeg(a, b, c)) || (d4 === 0 && onSeg(a, b, d));
}

/** Trace a shape as the current path. */
export function traceShape(ctx, shape) {
  ctx.beginPath();
  if (shape.type === 'rect') ctx.rect(shape.x, shape.y, shape.w, shape.h);
  else {
    shape.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
}

/** Move a shape by (dx, dy). */
export function moveShape(shape, dx, dy) {
  if (shape.type === 'rect') return { ...shape, x: shape.x + dx, y: shape.y + dy };
  return { ...shape, points: shape.points.map(([x, y]) => [x + dx, y + dy]) };
}

/** Fit a shape into new bounds (the corner handles keep its proportions, so sx = sy). */
export function resizeShape(shape, b) {
  if (shape.type === 'rect') return { type: 'rect', ...b };
  const o = shapeBounds(shape);
  const sx = b.w / (o.w || 1), sy = b.h / (o.h || 1);
  return { ...shape, points: shape.points.map(([x, y]) => [b.x + (x - o.x) * sx, b.y + (y - o.y) * sy]) };
}

/** Fill a canvas with the project background (colour, or a loaded image stretched to fit). */
export function drawBackground(ctx, project, bgImage) {
  if (bgImage) ctx.drawImage(bgImage, 0, 0, project.width_px, project.height_px);
  else {
    ctx.fillStyle = project.background?.startsWith('#') ? project.background : '#ffffff';
    ctx.fillRect(0, 0, project.width_px, project.height_px);
  }
}

/** New full-size canvas. */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export const canvasToBlob = (canvas, type = 'image/png', quality) =>
  new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not encode image'))), type, quality));

/** Overlap of two bounds as a fraction of the smaller one (S3). */
export function overlapFraction(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.w * a.h, b.w * b.h);
}
