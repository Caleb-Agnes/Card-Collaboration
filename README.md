# Collab Card Builder

Seven friends build one layered birthday card in parallel. Each claims a space on a shared A5 canvas, downloads a template for their drawing app, draws their character, and uploads it. Everyone sees the card update live, and the host arranges the final layer order and exports a print-ready file.

- **Setup:** [SETUP.md](SETUP.md) (Supabase, accounts, GitHub Pages)

## How it fits together

Plain HTML, CSS and ES modules, with no build step. Libraries load from jsDelivr at pinned versions ([js/lib.js](js/lib.js)).

| File | What it does |
| --- | --- |
| [index.html](index.html) | Page structure and all modals (native `<dialog>`) |
| [css/app.css](css/app.css) | Signed-off styles from the design reference, plus a marked "App additions" section |
| [js/main.js](js/main.js) | App state and wiring for every button and modal |
| [js/store/](js/store/) | Data layer: `supabase-store.js` (real) and `demo-store.js` (in memory, used when `config.js` is empty) |
| [js/canvas/view.js](js/canvas/view.js) | On-screen canvas: zoom, pan, select, move, scale, rotate, rectangle and polygon reserving, labels |
| [js/canvas/draw.js](js/canvas/draw.js) | Drawing maths shared by the view, templates and exports |
| [js/templates.js](js/templates.js) | PSD, OpenRaster and flat PNG template builders |
| [js/upload.js](js/upload.js) | Reads PNG/JPG uploads, removes a flat background (T8), trims, places |
| [js/export.js](js/export.js) | Full-size PNG, A5 PDF and backup zip |
| [supabase/schema.sql](supabase/schema.sql) | Tables, Row Level Security, storage bucket, realtime |
| [supabase/seed.sql](supabase/seed.sql) | The project row and the 7 profiles |

## Data model

- `projects`: one row, holding title, size, dpi, background, `locked` and `host_profile_id`.
- `profiles`: the seven people, each linked to a Supabase Auth user.
- `layers`: a claimed space and its art are the same row.
  - `shape`: the claimed outline, in canvas pixels.
  - `image_path`: the current art, or empty until uploaded.
  - `transform`: where the art sits (`x`, `y`, `scale`, `flip`, `rotation`).
  - `stack_order`: higher numbers are further in front.
  - `versions`: the paths of earlier uploads.

Moving a layer up or down only changes that layer's `stack_order`, to a value between its new neighbours. That way contributors never need to edit anyone else's row.

Images go in the private `card` bucket as `layers/{layer_id}/v{n}.png` and are never overwritten. Uploads are trimmed to their visible pixels and keep their exact offset, so a full-canvas template layer lands where it was drawn without storing acres of transparency.
