// Template downloads (T1-T5, T7). Everything is built in the browser at full canvas size (T3),
// so a "My character" layer drawn in the template drops back in at its exact pixel position.
import { loadAgPsd, loadJSZip } from './lib.js';
import { drawLayerImage, drawBackground, traceShape, makeCanvas, canvasToBlob } from './canvas/draw.js';

/** T1: app -> format. */
export const APPS = {
  'Krita': 'ora',
  'Photoshop / Photopea': 'psd',
  'Procreate': 'psd',
  'Ibis Paint': 'psd',
  'Clip Studio': 'psd',
  'GIMP': 'ora',
  'MS Paint / other': 'flat',
};

/** Name of the empty layer people draw on. It only tells people which layer is theirs; they can rename it. */
export const myLayerName = label => `My character - ${label}`;

/**
 * Build the four T2 layers for `target` from the scene as it is right now.
 * @returns {{behind, mine, front, guide}} full-size canvases
 */
async function buildLayers({ project, layersAsc, getImage, bgImage, target, ownerColour }) {
  const W = project.width_px, H = project.height_px;
  const idx = layersAsc.findIndex(l => l.id === target.id);
  const paint = async (list, ctx) => {
    for (const l of list) {
      if (!l.image_path || !l.transform) continue;
      drawLayerImage(ctx, await getImage(l.image_path), l.transform);
    }
  };

  const behind = makeCanvas(W, H);
  const bctx = behind.getContext('2d');
  drawBackground(bctx, project, bgImage);
  await paint(layersAsc.slice(0, idx), bctx);

  const front = makeCanvas(W, H);
  await paint(layersAsc.slice(idx + 1), front.getContext('2d'));

  const guide = makeCanvas(W, H);
  if (target.shape) {
    const g = guide.getContext('2d');
    traceShape(g, target.shape);
    g.lineWidth = Math.max(4, Math.round(W / 300));
    g.setLineDash([g.lineWidth * 4, g.lineWidth * 2]);
    g.strokeStyle = ownerColour;
    g.stroke();
  }

  return { behind, mine: makeCanvas(W, H), front, guide };
}

const safe = s => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'layer';

/**
 * Build the template for `app` and return { blob, filename }.
 * ctx: { project, layersAsc, getImage, bgImage, target, ownerColour }
 */
export async function buildTemplate(app, ctx) {
  const format = APPS[app];
  const L = await buildLayers(ctx);
  const base = `${safe(ctx.project.title)}_${safe(ctx.target.label)}_template`;
  if (format === 'psd') return { blob: await buildPsd(L, ctx), filename: base + '.psd' };
  if (format === 'ora') return { blob: await buildOra(L, ctx), filename: base + '.ora' };
  return { blob: await buildFlat(L, ctx), filename: base + '.zip' };
}

/** Flattened preview of the template (for PSD composite / ORA mergedimage). */
function merged(L) {
  const c = makeCanvas(L.behind.width, L.behind.height);
  const g = c.getContext('2d');
  g.drawImage(L.behind, 0, 0);
  g.globalAlpha = 0.5; g.drawImage(L.front, 0, 0); g.globalAlpha = 1;
  g.drawImage(L.guide, 0, 0);
  return c;
}

// ---------- PSD (Photoshop, Photopea, Procreate, Ibis Paint, Clip Studio) ----------

async function buildPsd(L, ctx) {
  const { writePsd } = await loadAgPsd();
  const W = ctx.project.width_px, H = ctx.project.height_px;
  const layer = (name, canvas, extra = {}) => ({ name, canvas, left: 0, top: 0, right: W, bottom: H, ...extra });
  const psd = {
    width: W, height: H,
    canvas: merged(L),
    imageResources: {
      resolutionInfo: {
        horizontalResolution: ctx.project.dpi, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches',
        verticalResolution: ctx.project.dpi, verticalResolutionUnit: 'PPI', heightUnit: 'Inches',
      },
    },
    // ag-psd lists children bottom-first.
    children: [
      layer('Behind', L.behind),
      layer(myLayerName(ctx.target.label), L.mine),
      layer('In front', L.front, { opacity: 0.5 }),
      layer('Space guide', L.guide),
    ],
  };
  return new Blob([writePsd(psd, { generateThumbnail: true, noBackground: true })], { type: 'image/vnd.adobe.photoshop' });
}

// ---------- OpenRaster (Krita, GIMP): a zip of PNGs plus stack.xml ----------

async function buildOra(L, ctx) {
  const JSZip = await loadJSZip();
  const W = ctx.project.width_px, H = ctx.project.height_px, dpi = ctx.project.dpi;
  const zip = new JSZip();
  // The spec requires "mimetype" first and uncompressed.
  zip.file('mimetype', 'image/openraster', { compression: 'STORE' });
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // stack.xml lists layers top-first.
  const layers = [
    ['Space guide', 'guide', L.guide, 1],
    ['In front', 'front', L.front, 0.5],
    [myLayerName(ctx.target.label), 'mine', L.mine, 1],
    ['Behind', 'behind', L.behind, 1],
  ];
  for (const [, file, canvas] of layers) zip.file(`data/${file}.png`, await canvasToBlob(canvas));
  const stack = layers.map(([name, file, , op]) =>
    `    <layer name="${esc(name)}" src="data/${file}.png" x="0" y="0" opacity="${op}" visibility="visible"/>`).join('\n');
  zip.file('stack.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<image version="0.0.3" w="${W}" h="${H}" xres="${dpi}" yres="${dpi}">\n  <stack>\n${stack}\n  </stack>\n</image>\n`);
  const m = merged(L);
  zip.file('mergedimage.png', await canvasToBlob(m));
  const k = 256 / Math.max(W, H);
  const thumb = makeCanvas(Math.round(W * k), Math.round(H * k));
  thumb.getContext('2d').drawImage(m, 0, 0, thumb.width, thumb.height);
  zip.file('Thumbnails/thumbnail.png', await canvasToBlob(thumb));
  return zip.generateAsync({ type: 'blob', mimeType: 'image/openraster', compression: 'DEFLATE' });
}

// ---------- Flat (MS Paint / other, T5): faded reference + blank PNG, zipped ----------

async function buildFlat(L, ctx) {
  const JSZip = await loadJSZip();
  const W = ctx.project.width_px, H = ctx.project.height_px;
  const ref = makeCanvas(W, H);
  const g = ref.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.35;               // surroundings faded
  g.drawImage(L.behind, 0, 0);
  g.drawImage(L.front, 0, 0);
  g.globalAlpha = 1;
  g.drawImage(L.guide, 0, 0);         // their shape outlined at full strength
  const zip = new JSZip();
  zip.file('reference.png', await canvasToBlob(ref));
  zip.file('blank.png', await canvasToBlob(L.mine));
  zip.file('README.txt',
    `reference.png shows the card around your space (faded) with your space outlined.\r\n` +
    `blank.png is a transparent image the size of the whole card.\r\n\r\n` +
    `Draw your character on blank.png in the outlined position and upload it.\r\n` +
    `This is a snapshot: download again later to see newer art.\r\n`);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Trigger a browser download. */
export function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
