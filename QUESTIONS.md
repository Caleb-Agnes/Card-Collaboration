# Decisions

Caleb answered the overnight questions on 23 Nov 2026. This file records what was decided and what changed. Only the items under "Still open" need anything more.

## Still open (sorted out during setup)

- **23. Placeholder emails.** Accounts sign in with `name@example.com`, which nobody ever sees. We'll check during setup that Supabase accepts `example.com`. If it doesn't, SETUP.md step 3 switches the domain with one setting.
- **25. Git and GitHub.** GitHub Pages hosts from a GitHub repository, so the local repo gets pushed there during setup (SETUP.md step 5). The repo can be public: it contains no passwords or secrets.

## Decided

| # | Topic | Decision | Change made |
| --- | --- | --- | --- |
| 1 | Switching profile | Pink "Switch" button beside the account box | none |
| 2 | Close button corner | 9px | radius changed |
| 3 | Canvas visuals | Handles on all four corners. Proportions always locked, for art **and** claimed spaces | built |
| 4 | Layer controls | Remove Move up / Move down | removed; only the host reorders, by dragging rows |
| 5 | Host box | As built | none |
| 6 | Modal backdrop | Black at 35% | none |
| 7 | Layer order | Top of list = front | none |
| 8 | Aquamarine | Left out | none |
| 9 | Unusable buttons | Fade them | none |
| 10 | Host drag reorder | Show the new position live while dragging; holding near the top or bottom edge scrolls | built (mouse and pen; touch keeps normal scrolling) |
| 11 | Canvas size | Keep the 420px frame | none |
| 12 | Rotation | Rotate handle on the canvas | built: round handle above uploaded art, Shift snaps to 15° |
| 13 | Custom shapes | Click-to-place polygon: lines can't cross, so a point that would cross is refused | built as "Reserve a custom shape" |
| 14 | Coulds | Build T8 (make a flat background see-through) | built; U4 restore not built |
| 15 | Deleting | Delete outright | none |
| 16 | Upload formats | PNG, or failing that JPG | PSD and ORA uploads removed |
| 17 | Layer names in templates | Only there to avoid confusion; people can rename | nothing reads the name any more |
| 18 | Apps | Every format will be used | none |
| 19 | New spaces | On top | none |
| 20 | Empty canvas | Click deselects, drag pans | none |
| 21 | Sign out | Not needed | none |
| 22 | Sign-in box | Can't be closed while signed out | built; it can still be closed when using Switch |
| 24 | Wording | Preview toggle reads "Show reservations" | it now reads "Hide reservations" / "Show reservations" |

## Built differently from the answer, or worth checking

- **Polygon button label.** Answer 13 named the button "Reserve (freehand)", but the shape is straight lines, so it's called **"Reserve a custom shape"**. It's one word in `index.html` if you'd rather have the other.
- **Polygon controls.** You can also Backspace to remove the last point, Esc to cancel, and drag to pan while placing points. A line that would cross shows dashed black, and the first point fills in when a click there would close the shape.
- **Rotation is for uploaded art only.** An empty reserved space has no rotate handle.
- **T8 (making the background see-through)**
  - **When it appears:** the upload box offers it whenever an image has no transparent pixels at all, such as a JPG or an MS Paint PNG. It is ticked by default.
  - **What it removes:** the colour touching the image's edges. Clicking a spot in the preview removes that area too, such as a gap under an arm. The same colour inside the drawing, such as the white of an eye, is kept.
  - **New UI:** the preview sits on a grey-and-white check made from existing colours. The checkbox is the browser's own.
- **Upload hint.** The upload box now says "A PNG of just your character (hide the other template layers before exporting). A JPG works too." The template download box gives the same advice for PSD and ORA.
- **Drag feedback.** While the host drags a row, it keeps the pressed look (scaled to 95%) that rows already have when clicked. The old black drop line is gone.
