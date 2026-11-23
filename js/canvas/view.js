// On-screen canvas (C2, C3, U3, S1, S2).
//
// The .canvas div is the scrollable content, sized by the zoom (--z), so the frame's
// scrollbars do the panning. A single <canvas> sits inside it with position: sticky,
// always the size of the visible frame, and each frame draws only what is visible.
// This keeps memory flat at x10 zoom instead of allocating a giant bitmap.
//
// Interaction (desktop mouse/pen):
//   - click a layer you can edit to select it; drag it to move; drag the corner square to scale
//   - drag on empty space to pan; ctrl + wheel to zoom at the pointer
//   - "Reserve an area" mode: drag out a rectangle
// Touch keeps native scrolling for phone viewing, except while reserving.
import {
  drawLayerImage, drawBackground, layerBounds, traceShape, moveShape, resizeShape,
} from './draw.js';

const HANDLE = 10;      // corner handle size, screen px
const MIN_SIZE = 20;    // smallest reservable rectangle, canvas px

export class CanvasView {
  /**
   * @param {HTMLElement} frame   .canvas-frame (scroll container)
   * @param {HTMLElement} content .canvas (zoomed content)
   * @param {object} hooks { getScene, onSelect, onReserve, onCommit, onZoom }
   */
  constructor(frame, content, hooks) {
    this.frame = frame;
    this.content = content;
    this.hooks = hooks;
    this.zoom = 1;
    this.mode = 'idle';        // 'idle' | 'reserve'
    this.drag = null;          // active drag state
    this.override = null;      // { id, layer } live preview of a layer while dragging
    this.draft = null;         // reserve rectangle in progress

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
    this.draft = null;
    this.canvas.style.cursor = mode === 'reserve' ? 'crosshair' : '';
    this.canvas.style.touchAction = mode === 'reserve' ? 'none' : 'pan-x pan-y pinch-zoom';
    this.redraw();
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
      if (img && l.transform) drawLayerImage(ctx, img, l.transform);
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
      if (sel) {
        const b = layerBounds(sel, scene.images.get(sel.image_path));
        if (b) {
          const r = toScreen(b);
          ctx.save();
          ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
          ctx.strokeRect(Math.round(r.x) + .5, Math.round(r.y) + .5, Math.round(r.w), Math.round(r.h));
          ctx.strokeStyle = getCss('--amber'); ctx.lineDashOffset = 5;
          ctx.strokeRect(Math.round(r.x) + .5, Math.round(r.y) + .5, Math.round(r.w), Math.round(r.h));
          ctx.restore();
          if (scene.editableIds.has(sel.id)) {
            const hx = r.x + r.w - HANDLE / 2, hy = r.y + r.h - HANDLE / 2;
            ctx.fillStyle = '#fff'; ctx.fillRect(hx, hy, HANDLE, HANDLE);
            ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(hx) + .5, Math.round(hy) + .5, HANDLE - 1, HANDLE - 1);
          }
        }
      }
    }

    if (this.draft) {
      const r = toScreen(normRect(this.draft));
      const me = scene.meStyle;
      ctx.save();
      ctx.fillStyle = me.colour; ctx.globalAlpha = .25; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalAlpha = 1; ctx.strokeStyle = me.colour; ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    }
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

  // ---------- Pointer handling ----------

  #hitHandle(scene, p) {
    const sel = scene.layersAsc.find(l => l.id === scene.selectedId);
    if (!sel || !scene.editableIds.has(sel.id)) return null;
    const b = layerBounds(sel, scene.images.get(sel.image_path));
    if (!b) return null;
    const tol = HANDLE / this.scale;
    return Math.abs(p.x - (b.x + b.w)) <= tol && Math.abs(p.y - (b.y + b.h)) <= tol ? sel : null;
  }

  /** Top-most editable layer under the point (selected layer wins if under it). */
  #hitLayer(scene, p) {
    const inside = l => { const b = layerBounds(l, scene.images.get(l.image_path)); return b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; };
    const sel = scene.layersAsc.find(l => l.id === scene.selectedId);
    if (sel && scene.editableIds.has(sel.id) && inside(sel)) return sel;
    for (let i = scene.layersAsc.length - 1; i >= 0; i--) {
      const l = scene.layersAsc[i];
      if (scene.editableIds.has(l.id) && inside(l)) return l;
    }
    return null;
  }

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
      this.draft = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      this.drag = { kind: 'reserve' };
      return;
    }

    if (scene.showGuides) {
      const h = this.#hitHandle(scene, p);
      if (h) { this.drag = { kind: 'scale', layer: h, start: p, b0: layerBounds(h, scene.images.get(h.image_path)) }; return; }
      const hit = this.#hitLayer(scene, p);
      if (hit) {
        if (hit.id !== scene.selectedId) this.hooks.onSelect(hit.id);
        this.drag = { kind: 'move', layer: hit, start: p };
        return;
      }
    }
    // Clicking empty space clears the selection; dragging it pans.
    if (scene.selectedId) this.hooks.onSelect(null);
    this.drag = pan();
  }

  #move(e) {
    const scene = this.hooks.getScene();
    const p = this.toCanvas(e);
    const d = this.drag;
    if (!d) {
      if (this.mode === 'idle' && scene.showGuides) {
        this.canvas.style.cursor = this.#hitHandle(scene, p) ? 'nwse-resize' : this.#hitLayer(scene, p) ? 'move' : '';
      }
      return;
    }
    if (d.kind === 'reserve') { this.draft.x1 = p.x; this.draft.y1 = p.y; this.redraw(); return; }
    if (d.kind === 'pan') {
      this.frame.scrollLeft = d.sl - (e.clientX - d.cx);
      this.frame.scrollTop = d.st - (e.clientY - d.cy);
      return;
    }
    const l = d.layer, dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 0) d.moved = true;
    let patched;
    if (d.kind === 'move') {
      patched = l.image_path && l.transform
        ? { ...l, transform: { ...l.transform, x: l.transform.x + dx, y: l.transform.y + dy } }
        : { ...l, shape: moveShape(l.shape, dx, dy) };
    } else { // scale from the top-left corner
      const b0 = d.b0;
      if (l.image_path && l.transform) {
        const k = Math.max(0.02, Math.max((b0.w + dx) / b0.w, (b0.h + dy) / b0.h)); // keep aspect ratio
        patched = { ...l, transform: { ...l.transform, scale: l.transform.scale * k } };
      } else {
        patched = { ...l, shape: resizeShape(l.shape, { x: b0.x, y: b0.y, w: Math.max(MIN_SIZE, b0.w + dx), h: Math.max(MIN_SIZE, b0.h + dy) }) };
      }
    }
    this.override = { id: l.id, layer: patched };
    this.redraw();
  }

  #up(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (d.kind === 'reserve') {
      const r = normRect(this.draft);
      this.draft = null;
      this.setMode('idle');
      if (r.w >= MIN_SIZE && r.h >= MIN_SIZE) this.hooks.onReserve({ type: 'rect', ...roundRect(r) });
      return;
    }
    if ((d.kind === 'move' || d.kind === 'scale') && this.override && d.moved) {
      const l = this.override.layer;
      const patch = l.image_path && l.transform ? { transform: l.transform } : { shape: l.shape };
      // Keep showing the preview until the scene catches up with the saved values.
      this.hooks.onCommit(l.id, patch).finally(() => { this.override = null; this.redraw(); });
    } else this.override = null;
  }

  #cancel() {
    this.drag = null; this.override = null; this.draft = null;
    if (this.mode === 'reserve') this.setMode('idle');
    this.redraw();
  }

  #wheel(e) {
    if (!e.ctrlKey && !e.metaKey) return;  // plain wheel scrolls (pans) as normal
    e.preventDefault();
    const z = Math.min(10, Math.max(1, this.zoom * Math.exp(-e.deltaY * 0.0015)));
    this.hooks.onZoom(z, { x: e.clientX, y: e.clientY });
  }
}

const normRect = d => ({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) });
const roundRect = r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
const cssCache = {};
const getCss = name => (cssCache[name] ??= getComputedStyle(document.documentElement).getPropertyValue(name).trim());
