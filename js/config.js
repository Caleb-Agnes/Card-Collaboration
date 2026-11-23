// Supabase connection. Both values are safe to publish: all protection lives in
// Row Level Security (see supabase/schema.sql). See SETUP.md step 5.
// Leave SUPABASE_URL empty to run in demo mode (in-memory data, any password works).
export const SUPABASE_URL = 'https://pfyycevjnbbnadmhthdq.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable___kxgbX6FHGgErytJTKAyQ_6INsSebI';  // the "publishable" key

// Each profile signs in with a placeholder email: <name in lower case>@<EMAIL_DOMAIN>.
// Must match the users you create in the Supabase Auth dashboard. The UI never shows it.
export const EMAIL_DOMAIN = 'example.com';
