// MILESTONE 1 ONLY: sample data so the shell has something to show.
// Replaced by database rows in milestone 3. Shape follows the Layer record in
// requirements.md, trimmed to what the shell uses.
// Array order = stack order, index 0 = top of stack (front-most).
export const mockProject = {
  title: 'Happy Birthday Card!!',
  width_px: 1748,
  height_px: 2480,
};

export const mockLayers = [
  { id: 'l1', owner: 'Caleb',  label: 'Happy birthday text' },
  { id: 'l2', owner: 'Caleb',  label: 'image 1' },
  { id: 'l3', owner: 'Sander', label: 'image 2' },
  { id: 'l4', owner: 'Sander', label: 'image 3' },
  { id: 'l5', owner: 'Nam',    label: 'image 4' },
  { id: 'l6', owner: 'Maks',   label: 'image 5' },
  { id: 'l7', owner: 'Anna',   label: 'image 6' },
  { id: 'l8', owner: 'Adam',   label: 'image 7' },
  { id: 'l9', owner: 'Josh',   label: 'image 8' },
];
