// App entry point: state, rendering and wiring for every button and modal.
// Requirement IDs (C1, P2, ...) refer to requirements.md.
import { profileByName, swatch } from './profiles.js';
import { createStore } from './store/index.js';
import { createDropdown } from './ui/dropdown.js';
import { initModals, onModalOpen, openModal, closeModal } from './ui/modals.js';
import { renderLayers } from './ui/layers-panel.js';
import { initZoom } from './ui/zoom.js';
import { notice } from './ui/notice.js';
import { createReserveDemo } from './ui/reserve-demo.js';
import { CanvasView } from './canvas/view.js';
import { layerBounds, overlapFraction, shapeBounds, canvasToBlob, makeCanvas } from './canvas/draw.js';
import { APPS, buildTemplate, saveBlob } from './templates.js';
import { readImage, findBackground, removeBackground, placeUpload } from './upload.js';
import { exportPng, exportPdf, exportBackup } from './export.js';

const $ = id => document.getElementById(id);

// ---------- State ----------
const state = {
  project: { title: 'Collab Card', width_px: 1748, height_px: 2480, dpi: 300, background: '#ffffff', locked: false, host_profile_id: null },
  profiles: [],
  layers: [],
  me: null,            // signed-in profile row
  selectedId: null,
  showGuides: true,    // false = reservations hidden, i.e. the final image (C4)
  images: new Map(),   // storage path -> ImageBitmap (loaded)
  thumbs: new Map(),   // storage path -> data URL
  bgImage: null,
};
let store;

const isHost = () => !!state.me && state.project.host_profile_id === state.me.id;
const canEdit = l => !!state.me && (isHost() || (l.owner_id === state.me.id && !state.project.locked));
const layersAsc = () => [...state.layers].sort((a, b) => a.stack_order - b.stack_order);
const layersDesc = () => layersAsc().reverse();
const selectedLayer = () => state.layers.find(l => l.id === state.selectedId) || null;
const profileById = id => state.profiles.find(p => p.id === id);
const styleFor = profileId => {
  const p = profileById(profileId);
  const s = profileByName(p?.name);
  return { ...s, colour: p?.colour || s.colour };
};
const getImage = path => store.getImage(path);

// ---------- Canvas ----------
const view = new CanvasView($('canvas-frame'), $('canvas'), {
  getScene: () => ({
    project: state.project,
    layersAsc: layersAsc(),
    images: state.images,
    bgImage: state.bgImage,
    selectedId: state.selectedId,
    editableIds: new Set(state.layers.filter(canEdit).map(l => l.id)),
    showGuides: state.showGuides,
    ownerStyle: styleFor,
    meStyle: state.me ? styleFor(state.me.id) : profileByName('?'),
  }),
  onReserve: shape => startReserve(shape),
  onCommit: (id, patch) => saveLayer(id, patch),
  onZoom: (z, anchor) => zoom.set(z, anchor),
});

// ---------- Rendering ----------
const reserveDemo = createReserveDemo($('reserve-demo'));
// The X hides the how-to (animation and text) on this device; the ? beside Exit reservation brings it back.
let demoDismissed = false;
try { demoDismissed = localStorage.getItem('collab-card-hide-demo') === '1'; } catch {}
function setHelpHidden(hidden) {
  demoDismissed = hidden;
  try { localStorage.setItem('collab-card-hide-demo', hidden ? '1' : '0'); } catch {}
  render();
}
$('demo-close').addEventListener('click', () => setHelpHidden(true));
$('btn-help').addEventListener('click', () => setHelpHidden(!demoDismissed));

function renderAccount() {
  const box = $('acct-box');
  box.hidden = !state.me;
  box.replaceChildren();
  if (state.me) box.append(swatch(profileByName(state.me.name)), state.me.name);
  $('btn-switch').textContent = state.me ? 'Switch' : 'Sign in';
}

function render() {
  const reserving = view.mode === 'reserve';
  // Undo any "reserving" disables from last time; the normal rules below then apply.
  document.querySelectorAll('[data-reserve-off]').forEach(b => { b.disabled = false; delete b.dataset.reserveOff; });
  $('project-title').textContent = state.project.title;
  document.title = state.project.title + (store?.demo ? ' (demo)' : '');
  renderAccount();
  renderLayers($('layers'), {
    disabled: reserving,
    layersDesc: layersDesc(),
    ownerStyle: l => styleFor(l.owner_id),
    canEdit,
    thumb: l => (l.image_path ? state.thumbs.get(l.image_path) : null),
    selectedId: state.selectedId,
    canReorder: isHost() && !reserving,
    onSelect: select,
    onDrop: moveToIndex,
  });

  const sel = selectedLayer();
  const editable = sel && canEdit(sel);
  for (const id of ['btn-download', 'btn-upload', 'btn-rename', 'btn-delete']) $(id).disabled = !editable;
  $('btn-flip').disabled = !(editable && sel.image_path);
  const cantReserve = !state.me || (state.project.locked && !isHost());
  $('btn-reserve').disabled = cantReserve && !reserving;  // you can always exit
  $('btn-reserve').textContent = reserving ? 'Exit reservation' : 'Reserve an area';
  $('btn-preview').textContent = state.showGuides ? 'Hide reservations' : 'Show reservations';
  $('tools-note').textContent = !state.me ? 'Sign in to see the card.'
    : view.mode === 'reserve' ? (demoDismissed ? '' : 'Click to place each corner, then click the first point to finish. Backspace removes a point; Esc cancels.')
    : state.project.locked ? (isHost() ? 'Editing is locked for everyone else.' : 'The card is locked, so it can’t be changed.') : '';
  $('btn-help').hidden = !reserving;
  reserveDemo.show(view.mode === 'reserve' && !demoDismissed, state.me ? styleFor(state.me.id).colour : undefined);
  $('host-panel').hidden = !isHost();
  $('btn-lock').textContent = state.project.locked ? 'Unlock editing' : 'Lock editing';
  // While reserving, every other button is off until the shape is finished or reserving is exited.
  if (reserving) {
    document.querySelectorAll('.topbar button, .tools button').forEach(b => {
      if (!['btn-reserve', 'btn-help', 'demo-close'].includes(b.id) && !b.disabled) { b.disabled = true; b.dataset.reserveOff = ''; }
    });
  }
  view.redraw();
}

function select(id) {
  state.selectedId = id;
  render();
}

// ---------- Data loading ----------
let reloadTimer = 0, reloading = null;

/** Fetch everything and redraw. Called on sign-in and whenever anyone changes something (C5). */
async function reload() {
  if (!state.me) return;
  if (reloading) return reloading.then(() => reload());
  reloading = (async () => {
    try {
      const { project, profiles, layers } = await store.loadAll();
      Object.assign(state, { project, profiles, layers });
      if (state.selectedId && !layers.some(l => l.id === state.selectedId && canEdit(l))) state.selectedId = null;
      loadImages();
      render();
    } catch (e) {
      console.error(e);
      notice('Could not load the card', e.message || String(e));
    } finally { reloading = null; }
  })();
  return reloading;
}
const scheduleReload = () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(reload, 250); };

/** Load any images not yet decoded; redraw as each arrives. */
function loadImages() {
  for (const l of state.layers) {
    const p = l.image_path;
    if (!p || state.images.has(p)) continue;
    state.images.set(p, null);  // mark as loading
    getImage(p).then(img => {
      state.images.set(p, img);
      state.thumbs.set(p, makeThumb(img));
      render();
    }).catch(e => { console.error('Image failed', p, e); state.images.delete(p); });
  }
  // Drop placeholders so Map.get returns undefined, not null, for the view.
  const bg = state.project.background;
  if (bg && !bg.startsWith('#')) {
    if (state.bgPath !== bg) {
      state.bgPath = bg;
      getImage(bg).then(img => { state.bgImage = img; view.redraw(); }).catch(console.error);
    }
  } else { state.bgPath = null; state.bgImage = null; }
}

function makeThumb(img) {
  const size = 76;  // 38px box at 2x
  const k = Math.min(size / img.width, size / img.height);
  const c = makeCanvas(Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k)));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL();
}

// ---------- Layer writes ----------
/** Save a change to a layer, then refresh. Errors are shown, and the refresh undoes the change on screen. */
async function saveLayer(id, patch) {
  const l = state.layers.find(x => x.id === id);
  if (l) Object.assign(l, patch);  // optimistic
  render();
  try { await store.updateLayer(id, patch); }
  catch (e) { notice('That change was not saved', explain(e)); }
  await reload();
}

const explain = e => {
  const m = e?.message || String(e);
  if (/row-level security|not allowed|violates/i.test(m)) {
    return state.project.locked ? 'The card is locked.' : 'You can only change your own layers.';
  }
  return m;
};

// ---------- Modals ----------
initModals();

// Sign in (P2-P5)
const signinName = createDropdown($('signin-name'), { profiles: true, placeholder: 'Choose your name…' });
// While nobody is signed in the sign-in box can't be closed: no X, and Escape and the backdrop do nothing.
const signinRequired = () => !state.me;
$('modal-signin').addEventListener('cancel', e => { if (signinRequired()) e.preventDefault(); });
// Some browsers let a second Escape close a dialog anyway, so reopen it.
$('modal-signin').addEventListener('close', () => { if (signinRequired()) $('modal-signin').showModal(); });
onModalOpen('modal-signin', dlg => {
  dlg.querySelector('.modal-close').hidden = signinRequired();
  dlg.dataset.required = signinRequired() ? 'true' : '';
  signinName.setValue(null);
  $('signin-password').value = '';
  $('signin-error').textContent = '';
  $('signin-demo').hidden = !store?.demo;
});
$('signin-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!signinName.value) { $('signin-error').textContent = 'Pick your name first.'; return; }
  if (!$('signin-password').value) { $('signin-error').textContent = 'Enter your password.'; return; }
  const btn = $('signin-continue');
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const profile = await store.signIn(signinName.value, $('signin-password').value);
    state.me = profile;
    state.selectedId = null;
    closeModal('modal-signin');
    startSession();
  } catch (err) {
    $('signin-error').textContent = err.message || 'Could not sign in.';
  } finally { btn.disabled = false; btn.textContent = 'Continue'; }
});

// Reserve an area (S1)
let pendingShape = null;
function startReserve(shape) {
  pendingShape = shape;
  render();  // reserve mode has ended: hide the how-to animation
  openModal('modal-reserve');
}
onModalOpen('modal-reserve', () => { $('reserve-label').value = ''; $('reserve-error').textContent = ''; });
$('modal-reserve').addEventListener('close', () => { pendingShape = null; render(); });
$('reserve-save').addEventListener('click', async () => {
  const label = $('reserve-label').value.trim();
  if (!label) { $('reserve-error').textContent = 'Give your space a short label.'; return; }
  const shape = pendingShape;
  const top = state.layers.reduce((m, l) => Math.max(m, l.stack_order), 0);
  try {
    const layer = await store.createLayer({ owner_id: state.me.id, label, shape, stack_order: top + 1 });
    closeModal('modal-reserve');
    state.selectedId = layer.id;
    await reload();
    warnOverlap(layer);
  } catch (e) { $('reserve-error').textContent = explain(e); }
});
$('reserve-label').addEventListener('keydown', e => { if (e.key === 'Enter') $('reserve-save').click(); });

/** S3: warn when a shape covers most of another. */
function warnOverlap(layer) {
  const b = shapeBounds(layer.shape);
  if (!b) return;
  const hits = state.layers.filter(o => o.id !== layer.id && overlapFraction(b, layerBounds(o, state.images.get(o.image_path)) || b) > 0.6 && layerBounds(o, state.images.get(o.image_path)));
  if (hits.length) {
    const names = hits.map(o => `${profileById(o.owner_id)?.name}'s "${o.label}"`).join(', ');
    notice('Heads up', `Your space covers most of ${names}. Overlapping at the edges is fine; you may want to move it.`);
  }
}

// Download template (T1-T5, T7)
let lastApp = null;
try { lastApp = localStorage.getItem('collab-card-app'); } catch {}
const appNames = Object.keys(APPS);
const formatNote = app => ({
  psd: 'You’ll get a layered PSD file. Draw on the “My character” layer, then hide the other layers and export a PNG to upload.',
  ora: 'You’ll get a layered OpenRaster (.ora) file. Draw on the “My character” layer, then hide the other layers and export a PNG to upload.',
  flat: 'You’ll get a zip with a faded reference PNG and a blank PNG to draw on and upload.',
}[APPS[app]]);
const downloadApp = createDropdown($('download-app'), {
  options: appNames,
  selected: Math.max(0, appNames.indexOf(lastApp)),
  onChange: v => { $('download-format').textContent = formatNote(v); },
});
onModalOpen('modal-download', () => {
  $('download-format').textContent = formatNote(downloadApp.value);
  $('download-error').textContent = '';
});
$('download-go').addEventListener('click', async () => {
  const layer = selectedLayer();
  if (!layer) return;
  const btn = $('download-go');
  btn.disabled = true; btn.textContent = 'Building…';
  try {
    try { localStorage.setItem('collab-card-app', downloadApp.value); } catch {}
    const { blob, filename } = await buildTemplate(downloadApp.value, {
      project: state.project, layersAsc: layersAsc(), getImage, bgImage: state.bgImage,
      target: layer, ownerColour: styleFor(layer.owner_id).colour,
    });
    saveBlob(blob, filename);
    closeModal('modal-download');
  } catch (e) {
    console.error(e);
    $('download-error').textContent = 'Could not build the template: ' + (e.message || e);
  } finally { btn.disabled = false; btn.textContent = 'Download'; }
});

// Upload (U1-U5, T8)
let uploadSrc = null;       // Promise of { canvas, opaque, jpeg, colour, points, result } for the chosen file
let uploadPrepared = null;  // placeUpload() result awaiting confirmation of warnings
function resetUploadMessages() {
  uploadPrepared = null;
  $('upload-warnings').replaceChildren();
  $('upload-error').textContent = '';
  $('upload-go').textContent = 'Upload';
}
onModalOpen('modal-upload', () => {
  $('upload-file').value = '';
  uploadSrc = null;
  $('upload-bg').hidden = true;
  resetUploadMessages();
  const l = selectedLayer();
  const n = (l?.versions?.length || 0) + (l?.image_path ? 1 : 0);
  $('upload-versions').textContent = n ? `${n} version${n > 1 ? 's' : ''} uploaded so far, all kept on the server.` : '';
});

/** Read the chosen file straight away, so an image with no transparency can offer background removal (T8). */
function chooseUpload(file) {
  resetUploadMessages();
  $('upload-bg').hidden = true;
  if (!file) { uploadSrc = null; return; }
  uploadSrc = readImage(file).then(src => {
    const u = { ...src, points: [], colour: null, result: null };
    if (u.opaque) {
      u.colour = findBackground(u.canvas);
      $('upload-bg-on').checked = true;
      $('upload-bg').hidden = false;
      refreshBackground(u);
    }
    return u;
  });
  uploadSrc.catch(e => { $('upload-error').textContent = e.message || String(e); });
}

/** Recompute the see-through version and draw the preview. */
function refreshBackground(u) {
  const on = $('upload-bg-on').checked;
  u.result = on ? removeBackground(u.canvas, { colour: u.colour, points: u.points }) : null;
  $('upload-bg-reset').hidden = !(on && u.points.length);
  const pv = $('upload-preview'), img = u.result || u.canvas;
  const k = Math.min(1, 360 / img.width, 220 / img.height);
  pv.width = Math.max(1, Math.round(img.width * k));
  pv.height = Math.max(1, Math.round(img.height * k));
  const g = pv.getContext('2d');
  g.clearRect(0, 0, pv.width, pv.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, pv.width, pv.height);
  resetUploadMessages();
}

$('upload-file').addEventListener('change', () => chooseUpload($('upload-file').files[0]));
const drop = $('upload-drop');
drop.addEventListener('dragover', e => { e.preventDefault(); });
drop.addEventListener('drop', e => {
  e.preventDefault();
  if (!e.dataTransfer.files.length) return;
  const dt = new DataTransfer();
  dt.items.add(e.dataTransfer.files[0]);
  $('upload-file').files = dt.files;
  chooseUpload(dt.files[0]);
});
$('upload-bg-on').addEventListener('change', async () => { const u = await uploadSrc; if (u) refreshBackground(u); });
$('upload-bg-reset').addEventListener('click', async () => { const u = await uploadSrc; if (u) { u.points = []; refreshBackground(u); } });
$('upload-preview').addEventListener('click', async e => {
  const u = await uploadSrc;
  if (!u || !$('upload-bg-on').checked) return;
  const r = $('upload-preview').getBoundingClientRect();
  u.points.push({ x: (e.clientX - r.left) / r.width * u.canvas.width, y: (e.clientY - r.top) / r.height * u.canvas.height });
  refreshBackground(u);
});

$('upload-go').addEventListener('click', async () => {
  const layer = selectedLayer();
  if (!layer) return;
  if (!uploadSrc) { $('upload-error').textContent = 'Choose a file first.'; return; }
  const btn = $('upload-go');
  btn.disabled = true;
  try {
    if (!uploadPrepared) {
      btn.textContent = 'Reading…';
      const u = await uploadSrc;
      const cleaned = u.opaque && $('upload-bg-on').checked;
      uploadPrepared = placeUpload(cleaned ? u.result : u.canvas, { project: state.project, layer, opaque: u.opaque && !cleaned });
      if (uploadPrepared.warnings.length) {
        $('upload-warnings').replaceChildren(...uploadPrepared.warnings.map(w => Object.assign(document.createElement('p'), { textContent: '⚠ ' + w })));
        btn.textContent = 'Upload anyway';
        return;
      }
    }
    btn.textContent = 'Uploading…';
    await uploadArt(layer, uploadPrepared);
    closeModal('modal-upload');
  } catch (e) {
    console.error(e);
    $('upload-error').textContent = explain(e);
    btn.textContent = uploadPrepared ? 'Upload anyway' : 'Upload';
  } finally { btn.disabled = false; }
});

/** Store a new version (never overwriting, U4) and point the layer at it. */
async function uploadArt(layer, { canvas, transform }) {
  const blob = await canvasToBlob(canvas);
  if (blob.size > 20 * 1024 * 1024) throw new Error('The processed image is over 20 MB. Try a smaller file.');
  let n = (layer.versions?.length || 0) + (layer.image_path ? 1 : 0) + 1;
  let path;
  for (let tries = 0; ; tries++) {
    path = `layers/${layer.id}/v${n}.png`;
    try { await store.uploadFile(path, blob); break; }
    catch (e) {
      // Someone (or another tab) already used this version number: take the next one.
      if (tries < 5 && /exists|duplicate|409/i.test(e.message || e.statusCode || '')) { n++; continue; }
      throw e;
    }
  }
  const versions = layer.image_path ? [...(layer.versions || []), layer.image_path] : (layer.versions || []);
  await store.updateLayer(layer.id, { image_path: path, versions, transform });
  await reload();
}

// Rename
onModalOpen('modal-rename', () => { $('rename-input').value = selectedLayer()?.label ?? ''; });
$('rename-save').addEventListener('click', async () => {
  const label = $('rename-input').value.trim();
  const l = selectedLayer();
  closeModal('modal-rename');
  if (label && l && label !== l.label) await saveLayer(l.id, { label });
});
$('rename-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('rename-save').click(); });

// Delete
$('btn-delete').addEventListener('click', async () => {
  const l = selectedLayer();
  if (!l) return;
  const ok = await notice('Delete layer', `Delete “${l.label}”? This removes the layer and its space for everyone.`, { confirm: true, ok: 'Delete' });
  if (!ok) return;
  try { await store.deleteLayer(l.id); state.selectedId = null; }
  catch (e) { notice('Could not delete', explain(e)); }
  await reload();
});

// Flip (U3)
$('btn-flip').addEventListener('click', () => {
  const l = selectedLayer();
  if (l?.transform) saveLayer(l.id, { transform: { ...l.transform, flip: !l.transform.flip } });
});

// Reorder (L3, host drags rows in the Layers panel). Only the moved layer's stack_order
// changes: it takes a value between its new neighbours, so no other row is touched.
function orderForIndex(desc, index) {
  // desc excludes the moving layer; index is where it goes (0 = front).
  const above = desc[index - 1], below = desc[index];
  if (!above && !below) return 0;
  if (!above) return below.stack_order + 1;
  if (!below) return above.stack_order - 1;
  return (above.stack_order + below.stack_order) / 2;
}
/** Move a layer so it ends up at position `to` in the list (0 = front). */
async function moveToIndex(id, to) {
  const d = layersDesc();
  const from = d.findIndex(l => l.id === id);
  if (from < 0 || to === from) return;
  await saveLayer(id, { stack_order: orderForIndex(d.filter(l => l.id !== id), to) });
}

// ---------- Tools ----------
$('btn-switch').addEventListener('click', () => openModal('modal-signin'));
const toggleReserve = mode => {
  view.setMode(view.mode === mode ? 'idle' : mode);
  if (view.mode === mode) state.selectedId = null;  // reserving starts with nothing selected
  if (!state.showGuides) state.showGuides = true;
  render();
};
$('btn-reserve').addEventListener('click', () => toggleReserve('reserve'));
$('btn-preview').addEventListener('click', () => { state.showGuides = !state.showGuides; render(); });

const needsLayer = (id, modal) => $(id).addEventListener('click', () => { if (selectedLayer()) openModal(modal); });
needsLayer('btn-download', 'modal-download');
needsLayer('btn-upload', 'modal-upload');
needsLayer('btn-rename', 'modal-rename');

// Keyboard: Esc cancels reserving, Backspace removes the last polygon point;
// arrow keys nudge the selected layer (Shift = 10 px).
let nudgeTimer = 0;
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (view.mode === 'reserve' && e.key.startsWith('Arrow')) return;  // no nudging while reserving
  if (e.key === 'Escape' && view.mode !== 'idle') { view.setMode('idle'); render(); return; }
  if (e.key === 'Backspace' && view.mode === 'reserve') { e.preventDefault(); view.undoPoint(); return; }
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  const l = selectedLayer();
  if (!dir || !l || !canEdit(l)) return;
  e.preventDefault();
  const step = e.shiftKey ? 10 : 1;
  if (l.image_path && l.transform) l.transform = { ...l.transform, x: l.transform.x + dir[0] * step, y: l.transform.y + dir[1] * step };
  else if (l.shape?.type === 'rect') l.shape = { ...l.shape, x: l.shape.x + dir[0] * step, y: l.shape.y + dir[1] * step };
  else if (l.shape) l.shape = { ...l.shape, points: l.shape.points.map(([x, y]) => [x + dir[0] * step, y + dir[1] * step]) };
  view.redraw();
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => saveLayer(l.id, l.image_path ? { transform: l.transform } : { shape: l.shape }), 500);
});

// ---------- Host tools (H1-H5) ----------
onModalOpen('modal-setup', () => {
  const p = state.project;
  $('setup-title').value = p.title;
  $('setup-width').value = p.width_px;
  $('setup-height').value = p.height_px;
  $('setup-dpi').value = p.dpi;
  $('setup-bg').value = p.background.startsWith('#') ? p.background : '';
  $('setup-bg-file').value = '';
  $('setup-bg-current').textContent = p.background.startsWith('#') ? '' : 'Currently using a background image. Enter a colour to switch back.';
  $('setup-error').textContent = '';
});
$('setup-save').addEventListener('click', async () => {
  const w = parseInt($('setup-width').value, 10), h = parseInt($('setup-height').value, 10), dpi = parseInt($('setup-dpi').value, 10);
  const colour = $('setup-bg').value.trim();
  const file = $('setup-bg-file').files[0];
  if (!(w >= 16 && w <= 10000 && h >= 16 && h <= 10000)) { $('setup-error').textContent = 'Width and height must be between 16 and 10000 px.'; return; }
  if (!(dpi > 0)) { $('setup-error').textContent = 'DPI must be a positive number.'; return; }
  if (colour && !/^#[0-9a-f]{6}$/i.test(colour)) { $('setup-error').textContent = 'Background colour must look like #ffffff.'; return; }
  const patch = { title: $('setup-title').value.trim() || 'Untitled card', width_px: w, height_px: h, dpi };
  const btn = $('setup-save');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (file) {
      if (file.size > 20 * 1024 * 1024) throw new Error('The background image must be under 20 MB.');
      const bmp = await createImageBitmap(file);
      const c = makeCanvas(bmp.width, bmp.height);
      c.getContext('2d').drawImage(bmp, 0, 0);
      patch.background = await store.uploadFile(`background/v${Date.now()}.png`, await canvasToBlob(c));
    } else if (colour) patch.background = colour.toLowerCase();
    await store.updateProject(patch);
    closeModal('modal-setup');
    await reload();
  } catch (e) { $('setup-error').textContent = explain(e); }
  finally { btn.disabled = false; btn.textContent = 'Save'; }
});
$('btn-setup').addEventListener('click', () => openModal('modal-setup'));

$('btn-lock').addEventListener('click', async () => {
  try { await store.updateProject({ locked: !state.project.locked }); }
  catch (e) { notice('Could not change the lock', explain(e)); }
  await reload();
});

const fileBase = () => state.project.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'card';
async function busy(btnId, label, fn) {
  const btn = $(btnId), old = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  try { await fn(t => { btn.textContent = t; }); }
  catch (e) { console.error(e); notice('Export failed', e.message || String(e)); }
  finally { btn.disabled = false; btn.textContent = old; }
}
const exportScene = () => ({ project: state.project, layersAsc: layersAsc(), getImage, bgImage: state.bgImage });
$('btn-export-png').addEventListener('click', () => busy('btn-export-png', 'Exporting…', async () => {
  saveBlob(await exportPng(exportScene()), fileBase() + '.png');
}));
$('btn-export-pdf').addEventListener('click', () => busy('btn-export-pdf', 'Exporting…', async () => {
  saveBlob(await exportPdf(exportScene()), fileBase() + '-A5.pdf');
}));
$('btn-backup').addEventListener('click', () => busy('btn-backup', 'Zipping…', async setText => {
  const blob = await exportBackup(
    { project: state.project, layersAsc: layersAsc(), profiles: state.profiles, downloadFile: p => store.downloadFile(p) },
    (i, n) => setText(`Zipping ${i}/${n}…`),
  );
  saveBlob(blob, `${fileBase()}-backup-${new Date().toISOString().slice(0, 10)}.zip`);
}));

// ---------- Zoom (C2) ----------
const zoom = initZoom({ slider: $('zoom'), number: $('zoom-num'), onZoom: (z, anchor) => view.setZoom(z, anchor) });

// ---------- Start ----------
let unsubscribe = null, pollTimer = 0;
function startSession() {
  unsubscribe?.();
  unsubscribe = store.subscribe(scheduleReload);
  // Fallback in case a realtime message is missed (e.g. laptop asleep): refresh every 30 s while visible.
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (!document.hidden) reload(); }, 30_000);
  render();
  reload();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleReload(); });

(async () => {
  render();
  try {
    store = await createStore();
    if (store.demo) window.__card = state;  // demo mode only: lets the automated tests inspect state
    state.me = await store.currentProfile();
  } catch (e) {
    console.error(e);
    notice('Could not connect', 'The server could not be reached. If nobody has used the card for a while, Caleb may need to wake the Supabase project.\n\n' + (e.message || e));
    return;
  }
  if (state.me) startSession();
  else { render(); openModal('modal-signin'); }
})();
