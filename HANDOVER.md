# Handover: Collab Card Builder

You (Claude Code) are building a small web app for Caleb. Read this file first, then `requirements.md` (what it must do) and `design-reference.html` (how it must look). Open the HTML file in a browser before writing UI code.

## The short version

Seven friends (preset profiles) build one layered birthday card in parallel. Each person claims a space on a shared A5 canvas, downloads a template file for their drawing app that shows the art around their space, draws their character, and uploads it. Everyone sees the card update live. Caleb (the host) arranges the final layer order and exports a print-ready file.

Deadline: usable by early December 2026, so friends have time to draw before the birthday. Favour a working Must-only version early over a polished partial one.

## Files in this handover

| File | What it is | How to use it |
| --- | --- | --- |
| `requirements.md` | Signed-off requirements with IDs (C1, P2, T4...) and Must/Should/Could priorities | Source of truth for behaviour. Reference IDs in commits and comments |
| `design-reference.html` | Static mock of the agreed look: main page plus the four modals, with sample data | Copy its tokens and component CSS as they are. Replace the sample data and mock JS |
| `HANDOVER.md` | This file: stack, setup, build order, open questions | Follow the build order; raise the open questions with Caleb when you reach them |

## Stack (decided, don't change without asking)

- **Front end:** plain HTML, CSS and JavaScript (ES modules). No framework unless the canvas work clearly needs one; ask first. Libraries load as ES modules from a CDN (jsDelivr / esm.sh) so there is no build step.
- **Backend:** Supabase free tier.
  - Auth: one email-and-password account per profile, placeholder emails (e.g. `caleb@example.com`), public sign-ups turned off. The UI only ever shows names.
  - Postgres: projects, profiles, layers (see data model in `requirements.md`).
  - Storage: one bucket for layer images and their old versions.
  - Realtime: subscribe to layer changes so other people's edits appear within about 5 seconds (C5).
- **Hosting:** GitHub Pages, from the repo.
- **Likely libraries:** `@supabase/supabase-js`, `ag-psd` (PSD read/write), `JSZip` (OpenRaster files and the backup zip), `jsPDF` (A5 PDF export). Pin exact versions.
- **Font:** Lexend from Google Fonts (400, 500, 600).

Note: Supabase free projects pause after a period of inactivity. Mention this to Caleb in the setup README so he knows to wake it before friends use it.

## Security rules to get right

- Passwords never appear in front-end code or the repo. Supabase Auth handles them.
- The Supabase anon key will be public (GitHub Pages), so all protection lives in Row Level Security:
  - Any signed-in profile can read the project, profiles and layers, and read images.
  - A profile can insert, update and delete only its own layers and files. The host profile can do this for any layer.
  - Only the host can update the project (lock, size, background).
  - When the project is locked, no one but the host can change layers.
- Store image paths that include the layer id and a version number, e.g. `layers/{layer_id}/v{n}.png`, and never overwrite old versions (U4).

## Setup Caleb will do (write a SETUP.md that walks him through it)

1. Create a Supabase project. Note the project URL and anon key.
2. Run your `schema.sql` (tables, RLS policies, storage bucket and policies) in the SQL editor.
3. Turn off public sign-ups. Create the 7 users in the Auth dashboard (auto-confirmed) with the passwords he chooses.
4. Run your `seed.sql` to create the project row and the 7 profile rows linked to those users, with their colours.
5. Put the URL and anon key in a `config.js` and push to GitHub. Turn on GitHub Pages.

Profiles and colours (badge text is black except Anna, which is white):

| Profile | Colour | Role |
| --- | --- | --- |
| Caleb | #F7B2B7 | Host |
| Sander | #F4845F | Contributor |
| Nam | #A3D65C | Contributor |
| Maks | #2E9E6B | Contributor |
| Anna | #067BC2 | Contributor |
| Adam | #8E7CE6 | Contributor |
| Josh | #D77FD1 | Contributor |

## Build order

Get each milestone working and let Caleb try it before moving on. Small commits.

1. **Static shell.** Recreate the page and modals from `design-reference.html` as the real app structure, with modals opening as overlays. Mock data only.
2. **Sign-in (P1–P5).** Supabase client, sign-in modal (name dropdown and password), the account box showing the signed-in profile, staying signed in on the device.
3. **Canvas and layers (C1–C3, L1–L3).** Load layers from the database, draw them on the canvas in stack order, fill the layer panel with locked / editable / selected states, zoom (slider plus number box). Add the realtime subscription.
4. **Claim a space (S1–S3).** Rectangle first; freehand outline later if time allows. Label it, show it on the canvas in the owner's colour, edit and delete your own.
5. **Upload (U1–U5).** PNG upload to Storage, placement at exact position for full-canvas files, version history, re-upload.
6. **Templates (T1–T5, T7).** The app picker, then the formats in this order: flat PNG pair (T5), OpenRaster for Krita and GIMP, then PSD with ag-psd.
7. **Layered upload (T6).** Read PSD and ORA files back and extract the "My character - [Label]" layer by name.
8. **Host tools (H1–H5).** Lock and unlock, PNG export, A5 PDF export, backup zip.
9. **Acceptance test.** Run every check at the end of `requirements.md`, using Caleb's real "Happy Birthday" lettering file.

## Design rules (from the reference)

- Use the CSS variables in the reference. Don't introduce new colours, fonts, radii or shadows without asking.
- Boxes (Tools, Layer Options, Layers, modals): white, 1px black border, 12px rounded top corners, square bottom corners, faint divider under the heading. The zoom box is the one exception: rounded on all corners.
- Buttons: flat colour, square corners, no border or shadow. Brighten slightly on hover, shrink to 95% when pressed. Buttons inside the tool boxes are compact and centred.
- Layer rows: 50px tall, 2px apart. Only editable rows react to hover and click. Locked rows fade to 55%. The selected row is amber.
- Text boxes and dropdowns: white, 1px black border, square corners. Dropdowns are the custom component in the reference, because native select lists can't be styled.
- Both side columns are the same width (`--side`), so the canvas sits directly under the centred title.

## Open questions (ask Caleb when you reach them, don't guess)

1. **Switching profile.** The account box is a plain box, so there is currently no way to open the sign-in modal once signed in. Suggest a small "Switch" or "Sign out" button beside it.
2. **Close button corner.** 12px (matching the modal) or 9px. The reference uses 12px.
3. **Canvas visuals.** Not designed yet: how claimed shapes, their labels, the selected layer and transform handles look on the canvas. Propose options in the existing style.
4. **Move/scale/flip controls (U3).** Where these live (on-canvas handles, Layer Options, or both) isn't designed.
5. **Host-only UI.** Where lock, export and canvas setup go (probably a host-only box). Not designed.
6. **Modal backdrop.** Colour and opacity of the overlay behind modals isn't decided.
7. **Layer order direction.** Confirm that the top of the layer list is the top of the stack (front-most).
8. **Unused colour.** Aquamarine (#A9FFCB) was in the original palette but is no longer used anywhere. Leave it out unless Caleb wants it back.

## Working with Caleb

- He iterates in VS Code and likes direct, practical explanations with the reasoning behind choices.
- When styling is unclear, show two or three concrete options rather than picking silently.
- Keep the app simple; prefer the plainest approach that meets the requirement.
