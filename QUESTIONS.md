# Open questions for Caleb

For each question, I've built a provisional choice so the app works now. Reply with the number and a letter, e.g. "3: B, 6: A". **(Built)** marks what's in the code today. Anything you don't answer stays as built.

## Where things stand (23 Nov 2026)

- **Done in code:** milestones 1 to 8, i.e. every Must and most Shoulds. The app runs in **demo mode** with no server. Open it through Live Server or `python -m http.server` (see SETUP.md) and try it as different people.
- **Tested headless in Edge (demo mode):**
  - sign-in and switching profile
  - claiming a space, renaming, deleting
  - PNG upload landing at its exact pixel position
  - all three template formats (PSD, ORA, flat zip)
  - uploading a PSD with grouped layers and an edited ORA back in
  - version history and flipping
  - move up/down
  - lock and unlock
  - PNG, PDF and backup exports
  - phone layout
- **Tested in a local Postgres:** `schema.sql` and `seed.sql` run, and 29 permission checks pass. These cover own layers only, host can do anything, the lock, never overwriting files, and signed-out visitors seeing nothing.
- **Not tested yet (needs you):**
  - The real Supabase project. I have no access, so follow SETUP.md.
  - Opening the templates in real Krita and Photoshop/Photopea.
  - The acceptance test with your real lettering file.

---

## Design: how things look

**1. Switching profile** (handover question 1)
- **A (Built):** a compact pink "Switch" button beside the account box. It reads "Sign in" when nobody is signed in.
- B: a "Sign out" button instead.
- C: both buttons.
- D: make the account box itself clickable (it would then no longer be a "plain box").

**2. Close button corner radius** (handover question 2)
- **A (Built):** 12px, matching the modal.
- B: 9px.

**3. Canvas visuals** (handover question 3). Built:
- A claimed space is filled with the owner's colour at 25% plus a 2px outline in that colour.
- Its label is a pill at its top-left in the owner's colour reading "Name · Label", styled like the layer badges.
- The selected layer gets a dashed black-and-amber outline and a small white square with a black border at the bottom-right corner, which you drag to resize.
- Uploaded art replaces the coloured box.

Alternatives (pick any):
- A: label above the shape instead of inside it.
- B: dashed outline for unfilled spaces.
- C: handles on all four corners.
- D: also show a small name label on finished art.

**4. Move, scale and flip controls (U3)** (handover question 4). Built:
- Drag the selected layer on the canvas to move it.
- Drag the corner square to scale. Art keeps its proportions; a claimed rectangle resizes freely.
- Arrow keys nudge by 1px; Shift + arrow nudges by 10px.
- "Flip horizontally", "Move up" and "Move down" are in Layer Options.

OK as is? See also question 12 (rotation).

**5. Host-only UI** (handover question 5). Built: a third box called **Host** under Layer Options, visible only to Caleb. It has Canvas setup, Lock/Unlock editing, Export PNG, Export A5 PDF and Download backup. The host also drags rows in the Layers panel to reorder them. OK, or somewhere else?

**6. Modal backdrop** (handover question 6)
- **A (Built):** black at 35%.
- B: black at 20%.
- C: page pink (`--page`) at 80%.

**7. Layer order direction** (handover question 7). Built: top of the list is the front-most layer. Confirm?

**8. Aquamarine #A9FFCB** (handover question 8). Left out. Shout if you want it back.

**9. Buttons that can't be used right now.** With no layer selected, or with someone else's layer, the Layer Options buttons fade to 55%, matching locked rows, and do nothing.
- **A (Built):** fade them.
- B: hide them.
- C: leave them normal and show a message when clicked.

**10. Drop marker when the host drags a layer row.** A 3px black line above or below the row it will land next to. OK?

**11. Canvas size on screen.** The reference caps the canvas frame at 420px wide, which is small on a big monitor (you zoom to see detail).
- **A (Built):** keep 420px.
- B: let it grow to fill the window height.

## Behaviour

**12. Rotation (U3, a Should).** Not built yet. Exports and templates already honour a rotation value; only the control is missing.
- A: a rotate handle on the canvas.
- B: "Rotate left" and "Rotate right" buttons (15°) in Layer Options.
- C: skip it.

**13. Freehand outline (S1).** Only rectangles so far, as the handover suggested starting with. The canvas can already draw freehand shapes; only the drawing tool is missing.
- A: add a second Tools button, "Reserve (freehand)".
- B: rectangles are enough.

**14. "Could" features not built:**
- Restore an old version (U4).
- Pick a background colour to make transparent on flat uploads (T8).

Do you want either? T8 matters if anyone really uses MS Paint (see question 18).

**15. Deleting a layer** removes it for everyone. Its uploaded image files stay in storage, but nothing lists them any more, so the backup zip won't include them either.
- **A (Built):** delete the layer outright.
- B: hide it instead (a soft delete), so you can bring it back.
- C: only the host can delete layers that already have art.

**16. People who draw on many layers.** Upload accepts a **group** (PSD) or **stack** (ORA) named "My character - …" and merges its visible layers. Blend modes such as Multiply, and clipping masks, are merged as Normal, so they may look different.
- A: add a line to the upload modal: "Put all your layers in the My character group, or merge them into it."
- B: say nothing; you'll tell people in the group chat.

**17. Renamed layers.** If someone renames their space after downloading the template, the layer name in the file no longer matches. Built: any single layer whose name starts with "My character" is accepted. OK?

**18. Who draws in what?** This tells me which formats need real-world testing first:
- Krita and GIMP get `.ora` files.
- Photoshop, Photopea, Procreate, Ibis Paint and Clip Studio get `.psd` files.
- MS Paint can't save transparency, so a Paint upload would cover the art behind it with a white box unless T8 is built.

**19. Where new spaces go in the stack.**
- **A (Built):** on top of everything.
- B: just behind the lettering.
- C: at the bottom.

**20. Clicking empty canvas** clears the selection, and dragging it pans. Ctrl + scroll zooms at the pointer; plain scroll scrolls. OK?

**21. Signing out completely** isn't offered, only Switch. That matters if someone uses a shared computer. Add "Sign out" (see question 1)?

**22. The sign-in box can be closed** while signed out. The page then shows an empty canvas and "Sign in to see the card". Should it be impossible to close instead?

**23. Placeholder emails.** I used `name@example.com` as the handover suggested, and I'm not sure Supabase accepts `example.com` addresses. If it refuses one when you create the users, SETUP.md step 3 says how to switch domain. It's a single setting.

**24. Wording.** Any changes to these texts I wrote?
- "Reserve an area" drag hint: "Drag on the canvas to draw your space. Esc cancels."
- Name-your-space modal: "What will you draw here?"
- Locked message: "The card is locked, so it can't be changed."
- Preview toggle: "Preview final image" / "Show spaces and labels".

## Housekeeping

**25. Git.** I made a git repo on `main` with a commit per milestone, with no remote and nothing pushed. When you create the GitHub repo, push it (SETUP.md step 5). Should I keep committing like this?
