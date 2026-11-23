// Zoom box (C2): slider and number box stay in sync; typed values clamp to 1-10.
// onZoom lets the canvas react; for the shell it just sets the --z CSS variable.
export function initZoom({ slider, number, onZoom }) {
  const set = v => {
    slider.value = v;
    number.value = Number(slider.value).toFixed(1);
    onZoom(Number(slider.value));
  };
  const applyNumber = () => {
    const v = parseFloat(number.value);
    set(isNaN(v) ? slider.value : Math.min(10, Math.max(1, v)));
  };
  slider.addEventListener('input', () => set(slider.value));
  number.addEventListener('change', applyNumber);
  number.addEventListener('keydown', e => { if (e.key === 'Enter') { applyNumber(); number.blur(); } });
  return { set };
}
