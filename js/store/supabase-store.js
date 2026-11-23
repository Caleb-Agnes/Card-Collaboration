// Supabase backend. All permission checks happen on the server (RLS in supabase/schema.sql);
// this file only talks to the API. Same interface as demo-store.js.
import { loadSupabase } from '../lib.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL_DOMAIN } from '../config.js';

const BUCKET = 'card';

export async function createSupabaseStore() {
  const { createClient } = await loadSupabase();
  // persistSession (default) keeps you signed in on this device until you sign out or switch (P5).
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const imageCache = new Map(); // storage path -> Promise<ImageBitmap>
  let projectId = null;

  const check = ({ data, error }) => { if (error) throw error; return data; };
  const one = rows => { if (!rows?.length) throw new Error('Not allowed.'); return rows[0]; };
  const emailFor = name => `${name.toLowerCase()}@${EMAIL_DOMAIN}`;

  async function profileForUser(userId) {
    return check(await sb.from('profiles').select('*').eq('user_id', userId).maybeSingle());
  }

  return {
    demo: false,

    /** Profile of the user signed in on this device, or null. */
    async currentProfile() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      return profileForUser(data.session.user.id);
    },

    /** P2, P4: the password is checked by Supabase Auth on the server. */
    async signIn(name, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email: emailFor(name), password });
      if (error) {
        if (error.status === 400) throw new Error('Wrong password.');
        if (!error.status || /fetch/i.test(error.message)) {
          throw new Error('Couldn’t reach the server. If nobody has used the card for a while, ask Caleb to wake it up.');
        }
        throw new Error(error.message);
      }
      const profile = await profileForUser(data.user.id);
      if (!profile) throw new Error('This account has no profile yet. Check seed.sql has been run.');
      return profile;
    },

    async signOut() { await sb.auth.signOut(); },

    async loadAll() {
      const project = check(await sb.from('projects').select('*').order('created_at').limit(1).maybeSingle());
      if (!project) throw new Error('No project found. Run supabase/seed.sql.');
      projectId = project.id;
      const [profiles, layers] = await Promise.all([
        sb.from('profiles').select('*').eq('project_id', projectId).then(check),
        sb.from('layers').select('*').eq('project_id', projectId).then(check),
      ]);
      return { project, profiles, layers };
    },

    /** C5: call onChange whenever anyone changes a layer or the project. */
    subscribe(onChange) {
      const ch = sb.channel('card-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'layers' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, onChange)
        .subscribe();
      return () => sb.removeChannel(ch);
    },

    async createLayer(fields) {
      return check(await sb.from('layers').insert({ ...fields, project_id: projectId }).select().single());
    },

    // When RLS blocks an update or delete, PostgREST silently matches 0 rows, so treat
    // "nothing changed" as refused.
    async updateLayer(id, patch) {
      return one(check(await sb.from('layers').update(patch).eq('id', id).select()));
    },

    async deleteLayer(id) { one(check(await sb.from('layers').delete().eq('id', id).select())); },

    async updateProject(patch) {
      return one(check(await sb.from('projects').update(patch).eq('id', projectId).select()));
    },

    /** Upload a new file. upsert: false means an existing path is never overwritten (U4). */
    async uploadFile(path, blob) {
      check(await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png', upsert: false }));
      return path;
    },

    async downloadFile(path) { return check(await sb.storage.from(BUCKET).download(path)); },

    /** Decoded image for a storage path. The bucket is private, so files come through the API. */
    getImage(path) {
      if (!imageCache.has(path)) {
        const p = this.downloadFile(path).then(b => createImageBitmap(b));
        p.catch(() => imageCache.delete(path));
        imageCache.set(path, p);
      }
      return imageCache.get(path);
    },
  };
}
