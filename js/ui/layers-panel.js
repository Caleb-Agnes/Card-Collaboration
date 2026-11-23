// Layer panel (L2, L3). Rows are listed front-most first (top of list = top of stack).
// States from the design reference: is-edit (yours, or any layer for the host),
// is-locked (everyone else's, faded), is-selected (amber, one editable layer).
//
// The host can drag any row to a new position with the mouse or a pen. The row moves through
// the list as you drag, so you see where it will land, and holding it near the top or bottom
// edge of the window (or of the panel, if the panel scrolls) scrolls that way.

const EDGE = 48;        // px from an edge where autoscroll starts
const MAX_SPEED = 14;   // px per frame at the very edge
const THRESHOLD = 4;    // px of movement before a press becomes a drag

let dragging = false;       // a drag is in progress: hold re-renders until it ends
let deferred = null;        // latest render() call made during a drag
let suppressClick = false;  // swallow the click that follows a drag

/**
 * @param {HTMLElement} panel   the #layers panel (its .panel-head is kept)
 * @param {object} o
 * @param {object[]} o.layersDesc  front-most first
 * @param {(layer)=>{name,cssVar,text}} o.ownerStyle
 * @param {(layer)=>boolean} o.canEdit
 * @param {(layer)=>string|null} o.thumb   data URL or null
 * @param {string|null} o.selectedId
 * @param {boolean} o.canReorder  host drag to reorder
 * @param {(id)=>void} o.onSelect
 * @param {(id, index)=>void} o.onDrop   layer dropped at this position (0 = front)
 */
export function renderLayers(panel, o) {
  if (dragging) { deferred = [panel, o]; return; }
  panel.querySelectorAll('.layer, .panel-note').forEach(r => r.remove());
  if (!o.layersDesc.length) {
    const p = document.createElement('p');
    p.className = 'panel-note';
    p.textContent = 'No layers yet. Use "Reserve an area" to claim a space.';
    panel.append(p);
    return;
  }
  o.layersDesc.forEach((layer, index) => {
    const owner = o.ownerStyle(layer);
    const editable = o.canEdit(layer);
    const row = document.createElement('button');
    row.className = 'layer ' + (layer.id === o.selectedId ? 'is-selected' : editable ? 'is-edit' : 'is-locked');
    row.dataset.id = layer.id;
    row.style.setProperty('--oc', `var(${owner.cssVar})`);
    row.style.setProperty('--ot', owner.text);
    row.innerHTML = '<span class="thumb"></span><span class="layer-text"><span class="badge"></span><span class="layer-label"></span></span>';
    const src = o.thumb(layer);
    if (src) { const img = new Image(); img.src = src; img.alt = ''; row.querySelector('.thumb').append(img); }
    row.querySelector('.badge').textContent = owner.name;
    row.querySelector('.layer-label').textContent = layer.label || '(no name)';
    row.title = `${owner.name}: ${layer.label}\nPosition ${index + 1} of ${o.layersDesc.length} from the front`;
    if (editable) row.addEventListener('click', () => { if (!suppressClick) o.onSelect(layer.id); });
    else row.setAttribute('aria-disabled', 'true');
    if (o.canReorder) row.addEventListener('pointerdown', e => startDrag(e, panel, row, o));
    panel.append(row);
  });
}

function startDrag(e, panel, row, o) {
  if (e.button !== 0 || e.pointerType === 'touch') return;  // touch keeps normal scrolling
  e.preventDefault();  // no text selection while dragging
  const id = row.dataset.id;
  const rows = () => [...panel.querySelectorAll('.layer')];
  const from = rows().indexOf(row);
  const startY = e.clientY;
  let y = e.clientY, active = false, raf = 0;
  // Listen on the window, not the row: moving the row in the DOM would drop pointer capture.
  const pid = e.pointerId;

  // Put the row in the slot under the pointer.
  const place = () => {
    const before = rows().find(r => {
      if (r === row) return false;
      const b = r.getBoundingClientRect();
      return y < b.top + b.height / 2;
    });
    if (before) { if (row.nextElementSibling !== before) panel.insertBefore(row, before); }
    else if (panel.lastElementChild !== row) panel.append(row);
  };

  const tick = () => {
    const sc = scroller(panel);
    const top = Math.max(0, sc ? sc.getBoundingClientRect().top : 0);
    const bottom = Math.min(window.innerHeight, sc ? sc.getBoundingClientRect().bottom : window.innerHeight);
    let v = 0;
    if (y < top + EDGE) v = -MAX_SPEED * Math.min(1, (top + EDGE - y) / EDGE);
    else if (y > bottom - EDGE) v = MAX_SPEED * Math.min(1, (y - (bottom - EDGE)) / EDGE);
    if (v) { if (sc) sc.scrollTop += v; else window.scrollBy(0, v); place(); }
    raf = requestAnimationFrame(tick);
  };

  const move = ev => {
    if (ev.pointerId !== pid) return;
    y = ev.clientY;
    if (!active) {
      if (Math.abs(y - startY) < THRESHOLD) return;
      active = dragging = true;
      row.classList.add('is-dragging');
      raf = requestAnimationFrame(tick);
    }
    place();
  };

  const end = ev => {
    if (ev.pointerId !== pid) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    cancelAnimationFrame(raf);
    if (!active) return;
    row.classList.remove('is-dragging');
    dragging = false;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const to = rows().indexOf(row);
    if (deferred) { const [p, opts] = deferred; deferred = null; renderLayers(p, opts); }
    if (to !== from) o.onDrop(id, to);
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

/** The panel itself if it scrolls, else its nearest scrolling ancestor, else null (the window). */
function scroller(el) {
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}
