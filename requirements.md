# Collab Card Builder — Requirements

## Purpose and scope

A small web app where up to 7 friends build one layered illustration in parallel: each claims a space on a shared canvas, draws their character offline in their own app, then uploads it into that space for everyone to see and plan around.

First use: a birthday card for Diana, with a central "Happy Birthday" lettering layer and characters packed around it, some in front of the lettering and some behind it. The app should not be card-specific, so it can be reused for later collab pieces.

## Who uses it

Two roles and seven preset profiles: Caleb, Sander, Nam, Maks, Anna, Adam and Josh. Nobody signs up; each profile has a colour and a password that Caleb hands out.

| Role | Who | Can do |
| --- | --- | --- |
| Host | Caleb's profile | Everything contributors can, plus: set profile passwords, set up the canvas, edit or delete any slot, reorder any layer, lock the piece, export the final image |
| Contributor | Sander, Nam, Maks, Anna, Adam and Josh, via a shared link | View the canvas, claim and edit their own slots, download templates, upload and replace their own art, move their own art up or down the layer stack |

The recipient (Diana) never uses the app. She gets the exported image or a printed card.

## Core workflow

Each contributor runs the same loop, and any number of them can be at different steps at the same time.

1. **Host sets up** the canvas: final size (A5 portrait, 1748 × 2480 px) and background, and sets each profile's password.
2. **Contributor opens the link**, signs in by picking their name and entering their password, and sees the canvas as it stands: finished art, plus coloured shapes for spaces others have claimed.
3. **Claim a space:** draw a shape where their character will go and give it a short label ("Nami - League of Legends"). Everyone now sees it, and who claimed it.
4. **Download a template:** pick their drawing app. Layered apps get the current art split into "Behind" and "In front" layers, with an empty "My character - [Label]" layer between them. Other apps get a flat reference PNG plus a blank one.
5. **Draw** on the "My character" layer, in any app.
6. **Upload** the layered file or a PNG. The art lands at its exact position, replacing the placeholder.
7. **Adjust:** nudge, scale, flip, and change its place in the layer stack. Re-upload any time to replace it.
8. **Host finishes:** fine-tunes layer order, locks the piece, and exports.

## Functional requirements

Priority uses Must / Should / Could. A Must-only build is a usable card tool.

### Canvas and viewing

| ID | Requirement | Priority |
| --- | --- | --- |
| C1 | Fixed canvas size in pixels, set by the host (default A5 portrait at 300 dpi: 1748 × 2480 px) | Must |
| C2 | Pan and zoom; canvas fits the screen on open. Editing on desktop, viewing works on phone | Must |
| C3 | Shows finished art plus claimed-space shapes, each with owner name, label and a per-person colour | Must |
| C4 | Toggle to hide shapes and labels for a clean preview of the current piece | Should |
| C5 | Other people's changes appear within about 5 seconds without a page refresh (Supabase Realtime) | Should |

### Profiles and sign-in

| ID | Requirement | Priority |
| --- | --- | --- |
| P1 | Seven preset profiles (Caleb, Sander, Nam, Maks, Anna, Adam, Josh), each with a fixed colour. No sign-up | Must |
| P2 | Sign-in modal: pick a name from a dropdown (each name highlights in a pale version of its colour), then enter that profile's password | Must |
| P3 | Signed-in profile shown at the top right of the heading bar: a rounded colour square and the name. It is a plain box, not a dropdown. Switching profile means signing in again through the sign-in modal with the other person's password | Must |
| P4 | Passwords are set by the host, stored hashed and checked on the server, never in front-end code | Must |
| P5 | Stay signed in on that device until signing out or switching profile | Should |
| P6 | A profile's colour is used for its owner badge on layers and its name highlights | Must |

### Claiming space

| ID | Requirement | Priority |
| --- | --- | --- |
| S1 | Draw a shape (rectangle or freehand outline) to claim a space; add a short label. No limit on spaces per person | Must |
| S2 | Owner can move, resize and delete their own shape; host can edit or delete any shape | Must |
| S3 | Shapes may overlap (characters are meant to overlap at the edges); warn when one shape covers most of another | Should |

### Templates

| ID | Requirement | Priority |
| --- | --- | --- |
| T1 | On download, the contributor picks their app (Krita, Photoshop / Photopea, Procreate, Ibis Paint, Clip Studio, GIMP, MS Paint / other). The app decides the file format | Must |
| T2 | Layered template: "Behind" (all art below theirs in the stack), an empty "My character - [Label]" layer at their exact place in the stack, "In front" (all art above theirs, at 50% opacity so they can see through it), and a "Space guide" layer outlining their claimed shape. Layer order matches the live canvas at download time | Must |
| T3 | Template covers the full canvas at final resolution, so an uploaded layer drops back in at its exact pixel position with no fitting | Must |
| T4 | Formats: PSD for Photoshop, Photopea, Procreate, Ibis Paint and Clip Studio; OpenRaster (.ora) for Krita and GIMP. Built in the browser (e.g. the ag-psd library for PSD; .ora is a zip of PNGs plus stack.xml) | Must |
| T5 | Apps without layers (MS Paint etc.): a flat PNG with the surroundings faded and their shape outlined, plus a blank transparent PNG at canvas size | Must |
| T6 | Upload accepts the layered file back and pulls out the "My character" layer by name, so nobody has to export a PNG by hand | Should |
| T7 | Template download states it is a snapshot; re-download to see newer art | Should |
| T8 | For flat uploads with no transparency, the uploader picks one solid background colour to make transparent | Could |

### Upload and placement

| ID | Requirement | Priority |
| --- | --- | --- |
| U1 | Upload a PNG with transparency preserved; accept JPG with a warning that it has no transparency | Must |
| U2 | Uploads made from a template land at their exact position; any other PNG fits into its shape's bounds, keeping aspect ratio | Must |
| U3 | Owner can move, scale and flip their art; rotate | Must (rotate: Should) |
| U4 | Re-uploading replaces the art; the previous version is kept on the server | Must (restore button: Could) |
| U5 | Warn when the upload's resolution is lower than the canvas's (it will print blurry); cap file size at about 20 MB | Should |

### Layering

| ID | Requirement | Priority |
| --- | --- | --- |
| L1 | One layer stack. The lettering is a normal layer, uploaded through the same flow | Must |
| L2 | Layer panel listing every layer: thumbnail, owner, label and position in the stack | Must |
| L3 | Owners move their own art up or down the stack; the host can drag any layer to any position | Must |

### Host tools

| ID | Requirement | Priority |
| --- | --- | --- |
| H1 | Canvas setup: size and background (colour or uploaded image) | Must |
| H2 | Lock and unlock all editing | Must |
| H3 | Export the full-resolution composite as PNG, without boxes or labels | Must |
| H4 | Export as print-ready A5 PDF | Should |
| H5 | Download every source PNG as a zip, as a backup | Should |

## Constraints

- **Cost:** £0. Free hosting and a free-tier backend only.
- **Preset profiles, no sign-up.** Seven profiles with passwords set by Caleb. Signing in is picking your name and typing your password; switching profile always asks for the other person's password.
- **Scale:** one project, 7 profiles, about 30 layers, images up to about 20 MB each.
- **Image quality:** art is stored and exported at full resolution; the browser view may use downscaled previews.
- **Simplicity:** plain HTML/CSS/JS front end preferred over a framework unless the canvas work clearly needs one. One repo, deployable from VS Code.
- **Privacy:** links are unguessable but not secret, and nothing sensitive is stored. Passwords are hashed and checked on the server; the Supabase public key in the front end cannot read them.

## Data model sketch

Three records and a folder of image files. Claude Code can refine names and types.

| Record | Fields |
| --- | --- |
| Project | id, title, width_px, height_px, dpi, background, locked, host_profile_id |
| Profile | id, project_id, name, colour, auth account (password handled by Supabase Auth) |
| Layer | id, project_id, owner_id, label, shape (outline points in canvas px), image_path (empty until uploaded), transform (x, y, scale, flip, rotation), stack_order, versions (past image paths), updated_at |

A claimed space and the art that fills it are the same Layer record: claiming creates it with an empty image_path, uploading fills it. The lettering is a host-owned Layer like any other. Records live in Supabase Postgres, images in Supabase Storage.

## Out of scope

- Drawing tools inside the app. People draw in their own software.
- Live cursors, chat or comments. The group chat already does this.
- Background removal (beyond T8's single-colour key), colour correction or any image editing beyond move, scale, flip and rotate.
- Self sign-up, password resets or email. Caleb sets and changes passwords.
- Undo history beyond keeping previous uploads.

## Technical decisions

| Area | Decision |
| --- | --- |
| Backend | Supabase free tier: Postgres for records, Storage for images, Realtime for live updates. Check current free-tier limits before building |
| Sign-in | Supabase Auth, one email-and-password account per profile using placeholder emails. The app only ever shows names |
| Front-end hosting | GitHub Pages |
| Final format | Printed A5 portrait, 1748 × 2480 px at 300 dpi (C1, H4) |
| Layer order rights | Contributors move only their own art; the host can reorder anything (L3) |
| Spaces per person | No limit; the host tidies up (S1, S2) |
| Profile colours | Caleb Cherry Blossom #F7B2B7, Sander Coral #F4845F, Nam Lime #A3D65C, Maks Jade #2E9E6B, Anna Bright Teal Blue #067BC2 (white text), Adam Violet #8E7CE6, Josh Orchid #D77FD1 |

## Acceptance test: the lettering layer

The build counts as done when the "Happy Birthday" lettering goes through the full contributor flow with no special handling.

- [ ] Signing in as Caleb needs Caleb's password; a wrong password is refused.
- [ ] Host creates the project and claims a centre space labelled "Happy Birthday".
- [ ] Krita template download gives a full-canvas layered file with the T2 layers.
- [ ] The lettering (shapes in Inkscape, finished in Krita) uploads and lands exactly where it was drawn.
- [ ] A second browser, signed in as another profile, sees it appear within about 5 seconds and sees it as locked.
- [ ] Switching profile asks for that person's password.
- [ ] A test character moved below the lettering in the layer panel shows behind it; moved above, it shows in front.
- [ ] Re-uploading an edited lettering file replaces it and keeps the old version.
- [ ] Full-size PNG and A5 PDF exports show the lettering crisp, with no shapes or labels.
