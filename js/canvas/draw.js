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

/** Axis-aligned bounds of a shape. */
export function shapeBounds(shape) {
  if (!shape) return null;
  if (shape.type === 'rect') return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  const xs = shape.points.map(p => p[0]), ys = shape.points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Bounds of a layer: its art if uploaded (img given), else its claimed shape. Rotation is ignored. */
export function layerBounds(layer, img) {
  if (layer.image_path && img && layer.transform) {
    const t = layer.transform;
    return { x: t.x, y: t.y, w: img.width * t.scale, h: img.height * t.scale };
  }
  return shapeBounds(layer.shape);
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

/** Fit a shape into new bounds (used when resizing with the corner handle). */
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
