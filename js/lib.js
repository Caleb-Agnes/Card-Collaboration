// Third-party libraries, loaded from jsDelivr as ES modules (no build step).
// Exact versions pinned. Heavy ones load on first use so the page opens fast.
const CDN = 'https://cdn.jsdelivr.net/npm';

export const loadSupabase = () => import(`${CDN}/@supabase/supabase-js@2.118.0/+esm`);
export const loadAgPsd    = () => import(`${CDN}/ag-psd@34.1.0/+esm`);
export const loadJSZip    = () => import(`${CDN}/jszip@3.10.2/+esm`).then(m => m.default);
export const loadJsPDF    = () => import(`${CDN}/jspdf@4.2.1/+esm`).then(m => m.jsPDF);
