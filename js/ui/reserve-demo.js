// How-to animation for "Reserve an area" (S1), shown in the Tools panel while reserving.
// A scripted pointer places three corners, tries a point whose line would cross the shape
// (it goes dashed and the click is refused), places a fourth and closes on the first point.
// It is drawn with the same function and rules as the real tool, in the viewer's colour.
import { drawPolyDraft, canAdd, canClose } from '../canvas/view.js';

const W = 234, H = 140;       // drawing size in CSS px (the Tools panel's inner width)
const CLOSE_R = 10;

const P = [[50, 40], [180, 32], [196, 108], [70, 118]];
const CROSS = [120, 14];      // line from the third corner to here crosses the first edge
const SCRIPT = [
  ['move', [20, 128], 0],
  ['move', P[0], 700], ['click'],
  ['move', P[1], 700], ['click'],
  ['move', P[2], 600], ['click'],
  ['move', CROSS, 700], ['wait', 500], ['click'], ['wait', 400],
  ['move', P[3], 800], ['click'],
  ['move', P[0], 800], ['wait', 300], ['click'],
  ['wait', 1600],
];
const FADE = 400;
const DURATION = SCRIPT.reduce((t, s) => t + (s[0] === 'click' ? 0 : s[0] === 'wait' ? s[1] : s[2]), 0) + FADE;
const STILL_AT = 3000;        // reduced motion: a single frame showing the refused, dashed line

/** Replay the script up to time t. */
function stateAt(t) {
  let pos = SCRIPT[0][1], from = pos, clock = 0, clickAt = -1;
  const points = [];
  let closed = false;
  for (const step of SCRIPT) {
    if (step[0] === 'move') {
      const [, to, d] = step;
      if (t < clock + d) {
        const k = ease((t - clock) / d);
        pos = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
        return { pos, points, closed, clickAt };
      }
      clock += d; pos = from = to;
    } else if (step[0] === 'wait') {
      if (t < clock + step[1]) return { pos, points, closed, clickAt };
      clock += step[1];
    } else { // click: same rules as the real tool
      clickAt = clock;
      if (points.length >= 3 && Math.hypot(pos[0] - points[0][0], pos[1] - points[0][1]) <= CLOSE_R) {
        if (canClose(points)) closed = true;
      } else if (canAdd(points, pos)) points.push(pos);
    }
  }
  return { pos, points, closed, clickAt, fade: Math.min(1, (t - clock) / FADE) };
}
const ease = k => (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {{ show(on: boolean, colour?: string): void }}
 */
export function createReserveDemo(canvas) {
  const ctx = canvas.getContext('2d');
  let raf = 0, start = 0, colour = '#000';
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  function frame(now) {
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const t = still.matches ? STILL_AT : (now - start) % DURATION;
    draw(ctx, dpr, stateAt(t), t, colour);
    raf = still.matches ? 0 : requestAnimationFrame(frame);
  }

  return {
    show(on, c) {
      if (c) colour = c;
      canvas.hidden = !on;
      if (on && !raf) { start = performance.now(); raf = requestAnimationFrame(frame); }
      if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
    },
  };
}

function draw(ctx, dpr, st, t, colour) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = st.fade ? 1 - st.fade : 1;
  const { pos, points } = st;
  if (st.closed) {
    // Finished: drawn like a claimed space on the canvas.
    ctx.save();
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = colour; ctx.globalAlpha *= .25; ctx.fill();
    ctx.globalAlpha = st.fade ? 1 - st.fade : 1; ctx.lineWidth = 2; ctx.strokeStyle = colour; ctx.stroke();
    ctx.restore();
  } else {
    const closing = points.length >= 3 && Math.hypot(pos[0] - points[0][0], pos[1] - points[0][1]) <= CLOSE_R;
    drawPolyDraft(ctx, points, points.length ? pos : null, {
      colour, closing,
      ok: closing ? canClose(points) : canAdd(points, pos),
      closable: canClose(points),
    });
  }
  // Click ripple, then the pointer on top.
  const since = t - st.clickAt;
  if (st.clickAt >= 0 && since < 350) {
    ctx.save();
    ctx.globalAlpha = .35 * (1 - since / 350);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(pos[0], pos[1], 4 + since / 25, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  drawPointer(ctx, pos[0], pos[1]);
  ctx.globalAlpha = 1;
}

function drawPointer(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  [[0, 0], [0, 15], [4, 11.5], [7, 18], [9.5, 17], [6.5, 10.5], [11.5, 10.5]].forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fillStyle = '#000'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();
}
