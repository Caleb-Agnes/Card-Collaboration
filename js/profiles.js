// The seven preset profiles (P1, P6). In milestone 2 the rows come from the database,
// but names, colours and badge text colours stay fixed, so this table remains the
// source for styling. cssVar points at the matching token in css/app.css.
export const PROFILES = [
  { name: 'Caleb',  cssVar: '--p-caleb',  text: '#000', host: true },
  { name: 'Sander', cssVar: '--p-sander', text: '#000' },
  { name: 'Nam',    cssVar: '--p-nam',    text: '#000' },
  { name: 'Maks',   cssVar: '--p-maks',   text: '#000' },
  { name: 'Anna',   cssVar: '--p-anna',   text: '#fff' },
  { name: 'Adam',   cssVar: '--p-adam',   text: '#000' },
  { name: 'Josh',   cssVar: '--p-josh',   text: '#000' },
];

export const profileByName = name => PROFILES.find(p => p.name === name);

/** Rounded colour square used in the account box and profile dropdowns. */
export function swatch(profile) {
  const i = document.createElement('i');
  i.className = 'sw';
  i.style.background = `var(${profile.cssVar})`;
  return i;
}
