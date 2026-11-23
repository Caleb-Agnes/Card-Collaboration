// Picks the backend: Supabase when config.js has a URL, otherwise the in-memory demo.
import { SUPABASE_URL } from '../config.js';
import { createDemoStore } from './demo-store.js';

export async function createStore() {
  if (!SUPABASE_URL) return createDemoStore();
  const { createSupabaseStore } = await import('./supabase-store.js');
  return createSupabaseStore();
}
