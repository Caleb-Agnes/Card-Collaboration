// The seven preset profiles (P1, P6). Database rows (supabase/seed.sql) carry the same
// names and colours; this table is the source for styling. cssVar points at the matching
// token in css/app.css; colour is the same value for drawing on the canvas.
export const PROFILES = [
  { name: 'Caleb',  cssVar: '--p-caleb',  colour: '#F7B2B7', text: '#000' },
  { name: 'Sander', cssVar: '--p-sander', colour: '#F4845F', text: '#000' },
  { name: 'Nam',    cssVar: '--p-nam',    colour: '#A3D65C', text: '#000' },
  { name: 'Maks',   cssVar: '--p-maks',   colour: '#2E9E6B', text: '#000' },
  { name: 'Anna',   cssVar: '--p-anna',   colour: '#067BC2', text: '#fff' },
  { name: 'Adam',   cssVar: '--p-adam',   colour: '#8E7CE6', text: '#000' },
  { name: 'Josh',   cssVar: '--p-josh',   colour: '#D77FD1', text: '#000' },
];

const UNKNOWN = { name: '?', cssVar: '--sky', colour: '#84BCDA', text: '#000' };
export const profileByName = name => PROFILES.find(p => p.name === name) || { ...UNKNOWN, name: name || '?' };

/** Rounded colour square used in the account box and profile dropdowns. */
export function swatch(profile) {
  const i = document.createElement('i');
  i.className = 'sw';
  i.style.background = `var(${profile.cssVar})`;
  return i;
}
