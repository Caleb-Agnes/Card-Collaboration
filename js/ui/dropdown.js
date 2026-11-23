// Custom dropdown from the design reference (native select lists can't be styled).
// Behaviour copied from the reference mock; wrapped so the app can read and set values.
import { PROFILES, profileByName, swatch } from '../profiles.js';

const CHEVRON = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="#000" stroke-width="1.8"/></svg>';

/**
 * Turn an empty <div class="dd"> into a dropdown.
 * @param {HTMLElement} el
 * @param {object} opts
 * @param {string[]} [opts.options]  plain option labels (ignored when profiles is true)
 * @param {boolean}  [opts.profiles] list the profiles with colour squares and pale colour hover (P2)
 * @param {string}   [opts.placeholder]
 * @param {number}   [opts.selected] starting index, -1 for none
 * @param {(value:string|null)=>void} [opts.onChange]
 */
export function createDropdown(el, { options = [], profiles = false, placeholder = '', selected = -1, onChange } = {}) {
  const labels = profiles ? PROFILES.map(p => p.name) : options;
  let sel = selected;

  el.innerHTML = `<button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false"><span class="dd-val"></span>${CHEVRON}</button><div class="dd-list" role="listbox"></div>`;
  const btn = el.querySelector('.dd-btn');
  const val = el.querySelector('.dd-val');
  const list = el.querySelector('.dd-list');

  const optButtons = labels.map((label, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dd-opt';
    b.setAttribute('role', 'option');
    if (profiles) {
      const p = profileByName(label);
      b.style.setProperty('--hov', `color-mix(in srgb, var(${p.cssVar}) 25%, #fff)`);
      b.append(swatch(p));
    }
    b.append(label);
    b.addEventListener('click', () => { set(i); setOpen(false); btn.focus(); });
    list.append(b);
    return b;
  });

  function render() {
    val.replaceChildren();
    if (sel < 0) { val.textContent = placeholder; val.style.opacity = .6; }
    else {
      if (profiles) val.append(swatch(profileByName(labels[sel])));
      val.append(labels[sel]);
      val.style.opacity = 1;
    }
    optButtons.forEach((b, i) => b.setAttribute('aria-selected', i === sel));
  }

  function setOpen(open) {
    el.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open);
  }

  function set(i) {
    const changed = i !== sel;
    sel = i;
    render();
    if (changed) onChange?.(value());
  }

  const value = () => (sel < 0 ? null : labels[sel]);

  btn.addEventListener('click', () => setOpen(!el.classList.contains('open')));
  el.addEventListener('keydown', e => {
    // Escape closes the list first; stop it also closing the modal the dropdown sits in.
    if (e.key === 'Escape' && el.classList.contains('open')) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btn.focus();
    }
  });
  document.addEventListener('click', e => { if (!el.contains(e.target)) setOpen(false); });

  render();
  return {
    get value() { return value(); },
    /** Select by label, or null to clear. */
    setValue(label) { set(label == null ? -1 : labels.indexOf(label)); },
    close() { setOpen(false); },
  };
}
