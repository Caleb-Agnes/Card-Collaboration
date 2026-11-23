// App entry point. Milestone 1: static shell wired to mock data.
import { profileByName, swatch } from './profiles.js';
import { mockProject, mockLayers } from './mock-data.js';
import { createDropdown } from './ui/dropdown.js';
import { initModals, onModalOpen, openModal, closeModal } from './ui/modals.js';
import { renderLayers, canEdit } from './ui/layers-panel.js';
import { initZoom } from './ui/zoom.js';

const $ = id => document.getElementById(id);

// ---------- State ----------
const state = {
  project: mockProject,
  layers: structuredClone(mockLayers),
  me: null,          // signed-in profile
  selectedId: null,  // selected layer id
};
const selectedLayer = () => state.layers.find(l => l.id === state.selectedId) || null;

// ---------- Rendering ----------
function renderAccount() {
  const box = $('acct-box');
  box.hidden = !state.me;
  box.replaceChildren();
  if (state.me) box.append(swatch(state.me), state.me.name);
}

function render() {
  $('project-title').textContent = state.project.title;
  renderAccount();
  renderLayers($('layers'), state.layers, state.me, state.selectedId, id => {
    state.selectedId = id;
    render();
  });
}

// ---------- Modals ----------
initModals();

// Sign in (P2). Mock: any password works. Real check arrives in milestone 2.
const signinName = createDropdown($('signin-name'), { profiles: true, placeholder: 'Choose your name…' });
onModalOpen('modal-signin', () => {
  signinName.setValue(state.me?.name ?? null);
  $('signin-password').value = '';
  $('signin-error').textContent = '';
});
$('signin-continue').addEventListener('click', () => {
  if (!signinName.value) { $('signin-error').textContent = 'Pick your name first.'; return; }
  state.me = profileByName(signinName.value);
  // Drop a selection the new profile can't edit.
  if (selectedLayer() && !canEdit(selectedLayer(), state.me)) state.selectedId = null;
  closeModal('modal-signin');
  render();
});
$('signin-password').addEventListener('keydown', e => { if (e.key === 'Enter') $('signin-continue').click(); });

// Download template (T1). Mock: closes only.
const downloadApp = createDropdown($('download-app'), {
  options: ['Krita', 'Photoshop / Photopea', 'Procreate', 'Ibis Paint', 'Clip Studio', 'GIMP', 'MS Paint / other'],
  selected: 0,
});
$('download-go').addEventListener('click', () => closeModal('modal-download'));

// Upload (U1). Mock: closes only.
onModalOpen('modal-upload', () => { $('upload-file').value = ''; });
$('upload-go').addEventListener('click', () => closeModal('modal-upload'));

// Rename
onModalOpen('modal-rename', () => { $('rename-input').value = selectedLayer()?.label ?? ''; });
$('rename-save').addEventListener('click', () => {
  const label = $('rename-input').value.trim();
  if (label && selectedLayer()) selectedLayer().label = label;
  closeModal('modal-rename');
  render();
});
$('rename-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('rename-save').click(); });

// Delete
onModalOpen('modal-delete', () => { $('delete-name').textContent = selectedLayer()?.label ?? ''; });
$('delete-go').addEventListener('click', () => {
  state.layers = state.layers.filter(l => l.id !== state.selectedId);
  state.selectedId = null;
  closeModal('modal-delete');
  render();
});

// ---------- Tool buttons ----------
// Layer Options act on the selected layer; with nothing selected they do nothing for now.
const needsLayer = (id, modal) => $(id).addEventListener('click', () => { if (selectedLayer()) openModal(modal); });
needsLayer('btn-download', 'modal-download');
needsLayer('btn-upload', 'modal-upload');
needsLayer('btn-rename', 'modal-rename');
needsLayer('btn-delete', 'modal-delete');
// Reserve an area (milestone 4) and Preview final image (C4) have no behaviour yet.

// ---------- Zoom ----------
initZoom({ slider: $('zoom'), number: $('zoom-num'), onZoom: z => $('canvas').style.setProperty('--z', z) });

// ---------- Start ----------
render();
if (!state.me) openModal('modal-signin');
