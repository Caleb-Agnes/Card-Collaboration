// Host exports (H3-H5). Composites use the full-resolution stored images, never the
// on-screen view, and never include shapes or labels.
import { loadJsPDF, loadJSZip } from './lib.js';
import { drawLayerImage, drawBackground, makeCanvas, canvasToBlob } from './canvas/draw.js';

/** Full-size composite of every layer with art, in stack order. */
export async function composite({ project, layersAsc, getImage, bgImage }) {
  const c = makeCanvas(project.width_px, project.height_px);
  const ctx = c.getContext('2d');
  drawBackground(ctx, project, bgImage);
  for (const l of layersAsc) {
    if (l.image_path && l.transform) drawLayerImage(ctx, await getImage(l.image_path), l.transform);
  }
  return c;
}

/** H3: PNG at full resolution. */
export async function exportPng(scene) {
  return canvasToBlob(await composite(scene));
}

/** H4: print-ready A5 portrait PDF (148 x 210 mm), image filling the page. */
export async function exportPdf(scene) {
  const jsPDF = await loadJsPDF();
  const c = await composite(scene);
  const landscape = c.width > c.height;
  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a5', compress: true });
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
  // Fit inside the page keeping aspect ratio (A5 canvases fill it exactly).
  const k = Math.min(pw / c.width, ph / c.height);
  const w = c.width * k, h = c.height * k;
  pdf.addImage(c, 'PNG', (pw - w) / 2, (ph - h) / 2, w, h, undefined, 'SLOW');
  return pdf.output('blob');
}

/**
 * H5: every source PNG (current and old versions) plus the layer records, as a zip.
 * @param {{project, layersAsc, profiles, downloadFile}} data
 */
export async function exportBackup({ project, layersAsc, profiles, downloadFile }, onProgress) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const nameOf = id => profiles.find(p => p.id === id)?.name ?? 'unknown';
  const safe = s => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'layer';
  const paths = [];
  layersAsc.forEach((l, i) => {
    const folder = `${String(i + 1).padStart(2, '0')}_${nameOf(l.owner_id)}_${safe(l.label)}`;
    for (const p of [...(l.versions || []), l.image_path].filter(Boolean)) {
      // The highest version number is the current image; project.json records it too.
      paths.push([p, `${folder}/${p.split('/').pop()}`]);
    }
  });
  if (project.background && !project.background.startsWith('#')) paths.push([project.background, `background/${project.background.split('/').pop()}`]);
  let done = 0;
  for (const [src, dest] of paths) {
    zip.file(dest, await downloadFile(src));
    onProgress?.(++done, paths.length);
  }
  zip.file('project.json', JSON.stringify({
    exported_at: new Date().toISOString(),
    project,
    layers_bottom_to_top: layersAsc.map(l => ({ ...l, owner: nameOf(l.owner_id) })),
  }, null, 2));
  return zip.generateAsync({ type: 'blob' });
}
