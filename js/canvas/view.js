// On-screen canvas (C2, C3, U3, S1, S2).
//
// The .canvas div is the scrollable content, sized by the zoom (--z), so the frame's
// scrollbars do the panning. A single <canvas> sits inside it with position: sticky,
// always the size of the visible frame, and each frame draws only what is visible.
// This keeps memory flat at x10 zoom instead of allocating a giant bitmap.
//
// Interaction (desktop mouse/pen):
//   - layers are selected only in the Layers panel; the canvas never changes the selection
//   - drag the selected layer to move it; drag any corner square to scale it (art keeps its
//     proportions, a claimed shape resizes freely); drag the round handle above uploaded
//     art to rotate it (Shift snaps to 15 degrees)
//   - drag anywhere else to pan; ctrl + wheel to zoom at the pointer
//   - "reserve" mode: click to place corners, click the first point to close the shape;
//     a point whose line would cross the shape is refused
// Touch keeps native scrolling for phone viewing, except while reserving.
import {
  drawLayerImageScaled, drawBackground, layerBounds, layerFrame, frameCorners, layerContains,
  traceShape, moveShape, resizeShape, shapeBounds, segmentsTouch,
} from './draw.js';

const HANDLE = 10;      // corner handle size, screen px
const ROT_OFFSET = 24;  // distance of the rotate handle above the top edge, screen px
const ROT_R = 6;        // rotate handle radius, screen px
const CLOSE_R = 10;     // how close to the first point a click closes the polygon, screen px
const MIN_SIZE = 20;    // smallest reservable rectangle, canvas px
const MIN_ART = 8;      // smallest art can be scaled to, canvas px
const CORNER_CURSORS = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize'];

export class CanvasView {
  /**
   * @param {HTMLElement} frame   .canvas-frame (scroll container)
   * @param {HTMLElement} content .canvas (zoomed content)
   * @param {object} hooks { getScene, onReserve, onCommit, onZoom }
   */
  constructor(frame, content, hooks) {
    this.frame = frame;
    this.content = content;
    this.hooks = hooks;
    this.zoom = 1;
    this.mode = 'idle';        // 'idle' | 'reserve'
    this.drag = null;          // active drag state
    this.override = null;      // { id, layer } live preview of a layer while dragging
    this.poly = null;         // { points, hover } polygon in progress

    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { position: 'sticky', top: '0', left: '0', display: 'block', touchAction: 'pan-x pan-y pinch-zoom' });
    content.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    frame.addEventListener('scroll', () => this.redraw());
    new ResizeObserver(() => this.redraw()).observe(frame);
    this.canvas.addEventListener('pointerdown', e => this.#down(e));
    this.canvas.addEventListener('pointermove', e => this.#move(e));
    this.canvas.addEventListener('pointerup', e => this.#up(e));
    this.canvas.addEventListener('pointercancel', () => this.#cancel());
    this.canvas.addEventListener('pointerleave', () => { if (this.poly) { this.poly.hover = null; this.redraw(); } });
    frame.addEventListener('wheel', e => this.#wheel(e), { passive: false });
  }

  // ---------- Geometry ----------

  /** Screen px per canvas px. */
  get scale() {
    const { project } = this.hooks.getScene();
    return this.content.clientWidth / project.width_px;
  }

  /** Pointer event -> canvas px. */
  toCanvas(e) {
    const r = this.canvas.getBoundingClientRect();
    const s = this.scale;
    return { x: (e.clientX - r.left + this.frame.scrollLeft) / s, y: (e.clientY - r.top + this.frame.scrollTop) / s };
  }

  /** Match the frame's shape to the project's size. */
  setAspect(w, h) {
    const ar = `${w} / ${h}`;
    if (this.frame.style.aspectRatio !== ar) {
      this.frame.style.aspectRatio = ar;
      this.content.style.aspectRatio = ar;
    }
  }

  /** Set zoom, keeping the canvas point under `anchor` (client coords; default frame centre) still. */
  setZoom(z, anchor) {
    const f = this.frame, r = f.getBoundingClientRect();
    const ax = anchor ? anchor.x - r.left - f.clientLeft : f.clientWidth / 2;
    const ay = anchor ? anchor.y - r.top - f.clientTop : f.clientHeight / 2;
    const s0 = this.scale;
    const cx = (f.scrollLeft + ax) / s0, cy = (f.scrollTop + ay) / s0;
    this.zoom = z;
    this.content.style.setProperty('--z', z);
    const s1 = this.scale;
    f.scrollLeft = cx * s1 - ax;
    f.scrollTop = cy * s1 - ay;
    this.redraw();
  }

  setMode(mode) {
    this.mode = mode;
    this.poly = mode === 'reserve' ?{ points: [], hover: null } : null;
    this.canvas.style.cursor = mode === 'idle' ? '' : 'crosshair';
    this.canvas.style.touchAction = mode === 'idle' ? 'pan-x pan-y pinch-zoom' : 'none';
    this.redraw();
  }

  /** Remove the last polygon point (Backspace). */
  undoPoint() {
    if (this.poly?.points.length) { this.poly.points.pop(); this.redraw(); }
  }

  // ---------- Rendering ----------

  redraw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.#render(); });
  }

  /** Scene layers with any live drag preview applied. */
  #layers(scene) {
    if (!this.override) return scene.layersAsc;
    return scene.layersAsc.map(l => (l.id === this.override.id ? this.override.layer : l));
  }

  #render() {
    const scene = this.hooks.getScene();
    const { project } = scene;
    this.setAspect(project.width_px, project.height_px);
    const dpr = window.devicePixelRatio || 1;
    const cw = this.frame.clientWidth, ch = this.frame.clientHeight;
    if (this.canvas.width !== Math.round(cw * dpr) || this.canvas.height !== Math.round(ch * dpr)) {
      this.canvas.width = Math.round(cw * dpr);
      this.canvas.height = Math.round(ch * dpr);
      this.canvas.style.width = cw + 'px';
      this.canvas.style.height = ch + 'px';
    }
    const ctx = this.ctx, s = this.scale, sx = this.frame.scrollLeft, sy = this.frame.scrollTop;
    // Sticky positioning keeps the canvas at the frame's top-left; the content can be
    // smaller than the canvas only by rounding, so clear first.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, -sx * dpr, -sy * dpr);

    drawBackground(ctx, project, scene.bgImage);
    const layers = this.#layers(scene);
    for (const l of layers) {
      const img = l.image_path && scene.images.get(l.image_path);
      if (img && l.transform) drawLayerImageScaled(ctx, img, l.transform, s * dpr);
    }

    // Overlays in screen space so lines and text stay crisp at any zoom.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toScreen = b => ({ x: b.x * s - sx, y: b.y * s - sy, w: b.w * s, h: b.h * s });

    if (scene.showGuides) {
      for (const l of layers) {
        if (l.image_path || !l.shape) continue;   // art replaces the placeholder (C3)
        const owner = scene.ownerStyle(l.owner_id);
        ctx.save();
        ctx.setTransform(dpr * s, 0, 0, dpr * s, -sx * dpr, -sy * dpr);
        traceShape(ctx, l.shape);
        ctx.globalAlpha = 0.25; ctx.fillStyle = owner.colour; ctx.fill();
        ctx.globalAlpha = 1; ctx.lineWidth = 2 / s; ctx.strokeStyle = owner.colour; ctx.stroke();
        ctx.restore();
        const b = toScreen(layerBounds(l, null));
        this.#label(ctx, b.x + 4, b.y + 4, `${owner.name} · ${l.label}`, owner, b.w - 8);
      }

      const sel = layers.find(l => l.id === scene.selectedId);
      const f = sel && layerFrame(sel, scene.images.get(sel.image_path));
      if (f) this.#renderSelection(ctx, sel, f, scene.editableIds.has(sel.id), s, sx, sy);
    }

    if (this.poly?.points.length) this.#renderPoly(ctx, scene.meStyle, s, sx, sy);
  }

  /** Dashed black/amber outline (rotated with the art), corner squares and, for art, the rotate handle. */
  #renderSelection(ctx, sel, f, editable, s, sx, sy) {
    const pts = frameCorners(f).map(c => ({ x: c.x * s - sx, y: c.y * s - sy }));
    const snap = f.angle ? v => v : v => Math.round(v) + .5;
    ctx.save();
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(snap(q.x), snap(q.y)) : ctx.moveTo(snap(q.x), snap(q.y))));
    ctx.closePath();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]); ctx.stroke();
    ctx.strokeStyle = getCss('--amber'); ctx.lineDashOffset = 5; ctx.stroke();
    ctx.restore();
    if (!editable) return;
    ctx.save();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    if (sel.image_path && sel.transform) {
      const r = this.#rotHandle(f, s);
      const top = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const hx = r.x * s - sx, hy = r.y * s - sy;
      ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, hy, ROT_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const q of pts) {
      const hx = Math.round(q.x - HANDLE / 2), hy = Math.round(q.y - HANDLE / 2);
      ctx.fillRect(hx, hy, HANDLE, HANDLE);
      ctx.strokeRect(hx + .5, hy + .5, HANDLE - 1, HANDLE - 1);
    }
    ctx.restore();
  }

  /** Polygon in progress: placed lines, a line to the pointer (dashed black if it would cross), and the start point. */
  #renderPoly(ctx, me, s, sx, sy) {
    const { points, hover } = this.poly;
    const sc = ([x, y]) => [x * s - sx, y * s - sy];
    const closing = !!hover && this.#nearStart(hover, s);
    drawPolyDraft(ctx, points.map(sc), hover && sc([hover.x, hover.y]), {
      colour: me.colour,
      closing,
      ok: !!hover && (closing ? canClose(points) : canAdd(points, [hover.x, hover.y])),
      closable: canClose(points),
    });
  }

  /** Owner-coloured pill with "Name · Label", matching the layer-row badge. */
  #label(ctx, x, y, text, owner, maxW) {
    ctx.save();
    ctx.font = '500 12px Lexend, sans-serif';
    let t = text;
    const room = Math.max(40, maxW);
    while (t.length > 3 && ctx.measureText(t).width + 12 > room) t = t.slice(0, -2);
    if (t !== text) t = t.slice(0, -1) + '…';
    const w = ctx.measureText(t).width + 12, h = 18;
    ctx.fillStyle = owner.colour;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = owner.text; ctx.textBaseline = 'middle';
    ctx.fillText(t, x + 6, y + h / 2 + .5);
    ctx.restore();
  }

  // ---------- Hit testing ----------

  #nearStart(p, s = this.scale) {
    const pts = this.poly?.points;
    if (!pts || pts.length < 3) return false;
    return Math.hypot(p.x - pts[0][0], p.y - pts[0][1]) * s <= CLOSE_R;
  }

  /** Rotate handle position in canvas px: above the middle of the top edge, in the art's own "up". */
  #rotHandle(f, s = this.scale) {
    const d = f.h / 2 + ROT_OFFSET / s;
    return { x: f.cx + Math.sin(f.angle) * d, y: f.cy - Math.cos(f.angle) * d };
  }

  /** Handle under the point on the selected editable layer: { kind: 'scale', corner } or { kind: 'rotate' }. */
  #hitHandle(scene, p) {
    const sel = scene.layersAsc.find(l => l.id === scene.selectedId);
    if (!sel || !scene.editableIds.has(sel.id)) return null;
    const f = layerFrame(sel, scene.images.get(sel.image_path));
    if (!f) return null;
    const s = this.scale, tol = HANDLE / s;
    if (sel.image_path && sel.transform) {
      const r = this.#rotHandle(f, s);
      if (Math.hypot(p.x - r.x, p.y - r.y) <= (ROT_R + 3) / s) return { kind: 'rotate', layer: sel, f };
    }
    const corner = frameCorners(f).findIndex(c => Math.abs(p.x - c.x) <= tol && Math.abs(p.y - c.y) <= tol);
    return corner >= 0 ? { kind: 'scale', corner, layer: sel, f } : null;
  }

  /** The selected layer if it is editable and under the point. Other layers can't be grabbed on the canvas. */
  #hitLayer(scene, p) {
    const sel = scene.layersAsc.find(l => l.id === scene.selectedId);
    return sel && scene.editableIds.has(sel.id) && layerContains(sel, scene.images.get(sel.image_path), p) ? sel : null;
  }

  /** Cursor for whatever is under the pointer in idle mode. */
  #cursorFor(scene, p) {
    const h = this.#hitHandle(scene, p);
    if (h) return h.kind === 'rotate' ? 'grab' : CORNER_CURSORS[h.corner];
    return this.#hitLayer(scene, p) ? 'move' : '';
  }

  // ---------- Pointer handling ----------

  #down(e) {
    // Touch in normal mode is left to the browser so phones can scroll (view only).
    if (this.mode === 'idle' && e.pointerType === 'touch') return;
    if (e.button !== 0 && e.button !== 1) return;
    const scene = this.hooks.getScene();
    const p = this.toCanvas(e);
    this.canvas.setPointerCapture(e.pointerId);
    const pan = () => ({ kind: 'pan', cx: e.clientX, cy: e.clientY, sl: this.frame.scrollLeft, st: this.frame.scrollTop });

    if (e.button === 1) { this.drag = pan(); e.preventDefault(); return; }  // middle button always pans
    if (this.mode === 'reserve') {
      // A click places a point; a drag pans instead (decided as the pointer moves).
      this.drag = { ...pan(), kind: 'poly' };
      return;
    }

    if (scene.showGuides) {
      const h = this.#hitHandle(scene, p);
      if (h) { this.drag = { ...h, start: p }; return; }
      const hit = this.#hitLayer(scene, p);
      if (hit) { this.drag = { kind: 'move', layer: hit, start: p }; return; }
    }
    this.drag = pan();  // anything else pans; the selection stays as it is
  }

  #move(e) {
    const scene = this.hooks.getScene();
    const p = this.toCanvas(e);
    const d = this.drag;
    if (this.poly) {
      this.poly.hover = p;
      this.canvas.style.cursor = this.#nearStart(p) ? (canClose(this.poly.points) ? 'pointer' : 'not-allowed') : 'crosshair';
      this.redraw();
    }
    if (!d) {
      if (this.mode === 'idle' && scene.showGuides) this.canvas.style.cursor = this.#cursorFor(scene, p);
      return;
    }
    if (d.kind === 'poly' && !d.panning && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) > 5) d.panning = true;
    if (d.kind === 'pan' || d.panning) {
      this.frame.scrollLeft = d.sl - (e.clientX - d.cx);
      this.frame.scrollTop = d.st - (e.clientY - d.cy);
      return;
    }
    if (d.kind === 'poly') return;

    const l = d.layer, dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 0) d.moved = true;
    const art = !!(l.image_path && l.transform);
    let patched;
    if (d.kind === 'move') {
      patched = art
        ? { ...l, transform: { ...l.transform, x: l.transform.x + dx, y: l.transform.y + dy } }
        : { ...l, shape: moveShape(l.shape, dx, dy) };
    } else if (d.kind === 'scale' && art) {
      // Art scales about the opposite corner with proportions locked: project the pointer onto the diagonal.
      const f = d.f, corners = frameCorners(f), A = corners[(d.corner + 2) % 4], P0 = corners[d.corner];
      const vx = P0.x - A.x, vy = P0.y - A.y;
      const kMin = Math.min(1, MIN_ART / Math.max(1e-6, Math.min(f.w, f.h)));
      const k = Math.max(kMin, ((p.x - A.x) * vx + (p.y - A.y) * vy) / (vx * vx + vy * vy));
      const cx = A.x + (f.cx - A.x) * k, cy = A.y + (f.cy - A.y) * k, w = f.w * k, h = f.h * k;
      patched = { ...l, transform: { ...l.transform, x: cx - w / 2, y: cy - h / 2, scale: l.transform.scale * k } };
    } else if (d.kind === 'scale') {
      // A claimed shape is stored as points, so it can stretch freely: the dragged corner follows
      // the pointer, the opposite corner stays put, and it can't shrink below MIN_SIZE.
      const corners = frameCorners(d.f), A = corners[(d.corner + 2) % 4], P0 = corners[d.corner];
      const sxn = Math.sign(P0.x - A.x) || 1, syn = Math.sign(P0.y - A.y) || 1;
      const w = Math.max(MIN_SIZE, (P0.x + dx - A.x) * sxn), h = Math.max(MIN_SIZE, (P0.y + dy - A.y) * syn);
      patched = { ...l, shape: resizeShape(l.shape, { x: sxn > 0 ? A.x : A.x - w, y: syn > 0 ? A.y : A.y - h, w, h }) };
    } else { // rotate about the centre
      const f = d.f;
      const a0 = Math.atan2(d.start.y - f.cy, d.start.x - f.cx), a1 = Math.atan2(p.y - f.cy, p.x - f.cx);
      let deg = (l.transform.rotation || 0) + (a1 - a0) * 180 / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = ((deg % 360) + 540) % 360 - 180;  // keep within -180..180
      patched = { ...l, transform: { ...l.transform, rotation: Math.round(deg * 10) / 10 } };
      this.canvas.style.cursor = 'grabbing';
    }
    this.override = { id: l.id, layer: patched };
    this.redraw();
  }

  #up(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (d.kind === 'poly') {
      if (!d.panning) this.#addPoint(this.toCanvas(e));
      return;
    }
    if (d.kind === 'rotate') this.canvas.style.cursor = 'grab';
    if (['move', 'scale', 'rotate'].includes(d.kind) && this.override && d.moved) {
      const l = this.override.layer;
      const patch = l.image_path && l.transform ? { transform: l.transform } : { shape: l.shape };
      // Keep showing the preview until the scene catches up with the saved values.
      this.hooks.onCommit(l.id, patch).finally(() => { this.override = null; this.redraw(); });
    } else this.override = null;
  }

  #cancel() {
    this.drag = null; this.override = null;
    this.redraw();
  }

  /** Place a polygon point, or close the shape when the first point is clicked. */
  #addPoint(p) {
    const pts = this.poly.points, s = this.scale;
    if (this.#nearStart(p, s)) {
      if (!canClose(pts)) return;
      const shape = { type: 'path', points: pts.map(([x, y]) => [Math.round(x), Math.round(y)]) };
      this.setMode('idle');
      this.hooks.onReserve(shape);
      return;
    }
    const last = pts[pts.length - 1];
    if (last && Math.hypot(p.x - last[0], p.y - last[1]) * s < 3) return;  // double click
    if (!canAdd(pts, [p.x, p.y])) return;
    pts.push([p.x, p.y]);
    this.redraw();
  }

  #wheel(e) {
    if (!e.ctrlKey && !e.metaKey) return;  // plain wheel scrolls (pans) as normal
    e.preventDefault();
    const z = Math.min(10, Math.max(1, this.zoom * Math.exp(-e.deltaY * 0.0015)));
    this.hooks.onZoom(z, { x: e.clientX, y: e.clientY });
  }
}

/**
 * Draw a shape in progress, in screen px. Shared with the how-to animation (js/ui/reserve-demo.js)
 * so both look identical.
 * @param {number[][]} pts   placed points
 * @param {number[]|null} hover  pointer position, or null
 * @param {{colour, closing, ok, closable}} o  closing: pointer is on the first point;
 *   ok: the line to the pointer is allowed; closable: the shape could be closed now
 */
export function drawPolyDraft(ctx, pts, hover, { colour, closing, ok, closable }) {
  if (!pts.length) return;
  ctx.save();
  ctx.lineWidth = 2; ctx.strokeStyle = colour; ctx.fillStyle = colour;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (pts.length >= 3) { ctx.globalAlpha = .25; ctx.fill(); ctx.globalAlpha = 1; }
  ctx.stroke();
  if (hover) {
    const [lx, ly] = pts[pts.length - 1], [hx, hy] = closing ? pts[0] : hover;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(hx, hy);
    if (!ok) { ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); }
    ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 2; ctx.strokeStyle = colour;
  }
  for (const [x, y] of pts.slice(1)) ctx.fillRect(x - 3, y - 3, 6, 6);
  const [fx, fy] = pts[0];
  ctx.beginPath(); ctx.arc(fx, fy, 6, 0, Math.PI * 2);
  ctx.fillStyle = closing && closable ? colour : '#fff';
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

/** May the line from the last point to q join the shape without crossing it? */
export function canAdd(pts, q) {
  const n = pts.length;
  if (n < 2) return true;
  const last = pts[n - 1], prev = pts[n - 2];
  // Doubling back along the previous line would overlap it.
  const cross = (prev[0] - last[0]) * (q[1] - last[1]) - (prev[1] - last[1]) * (q[0] - last[0]);
  const dot = (prev[0] - last[0]) * (q[0] - last[0]) + (prev[1] - last[1]) * (q[1] - last[1]);
  if (Math.abs(cross) < 1e-9 && dot > 0) return false;
  for (let i = 0; i < n - 2; i++) if (segmentsTouch(pts[i], pts[i + 1], last, q)) return false;
  return true;
}

/** May the shape be closed (last point back to the first) without crossing itself? */
export function canClose(pts) {
  const n = pts.length;
  if (n < 3) return false;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) area += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  if (Math.abs(area) / 2 < 1) return false;           // all points in a line
  // The closing line must not cross any line except its two neighbours (which share its ends).
  const last = pts[n - 1], first = pts[0];
  for (let i = 1; i < n - 2; i++) if (segmentsTouch(pts[i], pts[i + 1], last, first)) return false;
  // Nor double back along either neighbour.
  const back = (a, b, c) => {  // does going a -> b -> c reverse direction along a line?
    const cr = (a[0] - b[0]) * (c[1] - b[1]) - (a[1] - b[1]) * (c[0] - b[0]);
    const dt = (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]);
    return Math.abs(cr) < 1e-9 && dt > 0;
  };
  if (back(pts[n - 2], last, first) || back(last, first, pts[1])) return false;
  const b = shapeBounds({ type: 'path', points: pts });
  return b.w >= 1 && b.h >= 1;
}

const cssCache = {};
const getCss = name => (cssCache[name] ??= getComputedStyle(document.documentElement).getPropertyValue(name).trim());
