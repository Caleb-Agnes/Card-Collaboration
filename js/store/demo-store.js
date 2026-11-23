// Demo backend: everything lives in memory and is lost on refresh. Used when config.js
// has no Supabase URL, so the app can be tried (and tested) without a server.
// Mirrors the permission rules of supabase/schema.sql so the UI behaves the same.
import { PROFILES } from '../profiles.js';

export function createDemoStore() {
  const profiles = PROFILES.map(p => ({ id: 'p-' + p.name.toLowerCase(), name: p.name, project_id: 'demo' }));
  const pid = name => 'p-' + name.toLowerCase();
  const project = {
    id: 'demo', title: 'Happy Birthday Card!!', width_px: 1748, height_px: 2480, dpi: 300,
    background: '#ffffff', locked: false, host_profile_id: pid('Caleb'),
  };
  const rect = (x, y, w, h) => ({ type: 'rect', x, y, w, h });
  let n = 0;
  const mk = (owner, label, shape, stack_order) => ({
    id: 'l' + (++n), project_id: 'demo', owner_id: pid(owner), label, shape, image_path: null,
    transform: null, stack_order, versions: [], updated_at: new Date().toISOString(),
  });
  let layers = [
    mk('Caleb', 'Happy Birthday', rect(374, 940, 1000, 600), 5),
    mk('Sander', 'Nami - League of Legends', rect(120, 1500, 520, 800), 6),
    mk('Nam', 'Totoro', rect(1100, 1550, 520, 760), 4),
    mk('Anna', 'Cat', rect(200, 200, 600, 600), 3),
  ];
  const files = new Map();      // path -> Blob
  const imageCache = new Map();
  const listeners = new Set();
  let me = null;

  const isHost = () => me && project.host_profile_id === me.id;
  const mayEdit = layer => isHost() || (me && layer.owner_id === me.id && !project.locked);
  const deny = () => { throw new Error('Not allowed.'); };
  const changed = () => setTimeout(() => listeners.forEach(f => f()), 50);
  const copy = x => structuredClone(x);

  return {
    demo: true,
    async currentProfile() { return me; },
    async signIn(name, password) {
      if (!password) throw new Error('Wrong password.');
      me = profiles.find(p => p.name === name);
      return me;
    },
    async signOut() { me = null; },
    async loadAll() { return { project: copy(project), profiles: copy(profiles), layers: copy(layers) }; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async createLayer(fields) {
      if (!me || (!isHost() && (fields.owner_id !== me.id || project.locked))) deny();
      const layer = { ...mk('Caleb', '', null, 0), image_path: null, transform: null, versions: [], ...fields };
      layers.push(layer); changed(); return copy(layer);
    },
    async updateLayer(id, patch) {
      const layer = layers.find(l => l.id === id);
      if (!layer || !mayEdit(layer)) deny();
      Object.assign(layer, copy(patch), { updated_at: new Date().toISOString() });
      changed(); return copy(layer);
    },
    async deleteLayer(id) {
      const layer = layers.find(l => l.id === id);
      if (!layer || !mayEdit(layer)) deny();
      layers = layers.filter(l => l.id !== id); changed();
    },
    async updateProject(patch) {
      if (!isHost()) deny();
      Object.assign(project, copy(patch)); changed(); return copy(project);
    },
    async uploadFile(path, blob) {
      if (files.has(path)) throw new Error('File already exists.');
      files.set(path, blob); return path;
    },
    async downloadFile(path) {
      if (!files.has(path)) throw new Error('File not found.');
      return files.get(path);
    },
    getImage(path) {
      if (!imageCache.has(path)) imageCache.set(path, this.downloadFile(path).then(b => createImageBitmap(b)));
      return imageCache.get(path);
    },
  };
}
