// Zoom box (C2): slider and number box stay in sync; typed values clamp to 1-10.
// onZoom(z, anchor) lets the canvas zoom around a point (ctrl + wheel) or its centre.
export function initZoom({ slider, number, onZoom }) {
  const set = (v, anchor) => {
    slider.value = v;
    number.value = Number(slider.value).toFixed(1);
    // Use the unrounded value for smooth wheel zoom; the slider shows it rounded to 0.1.
    onZoom(Math.min(10, Math.max(1, Number(v))), anchor);
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
