// Layer panel (L2). Rows are rendered in stack order, top of list = top of stack.
// States from the design reference: is-edit (yours, or any layer for the host),
// is-locked (everyone else's, faded), is-selected (amber, one editable layer).
import { profileByName } from '../profiles.js';

/** Can this profile edit this layer? Host edits everything; others edit their own. */
export const canEdit = (layer, me) => !!me && (me.host || layer.owner === me.name);

/**
 * @param {HTMLElement} panel  the #layers panel (its .panel-head is kept)
 * @param {object[]} layers    in stack order
 * @param {object|null} me     signed-in profile
 * @param {string|null} selectedId
 * @param {(id:string)=>void} onSelect
 */
export function renderLayers(panel, layers, me, selectedId, onSelect) {
  panel.querySelectorAll('.layer').forEach(r => r.remove());
  for (const layer of layers) {
    const owner = profileByName(layer.owner);
    const editable = canEdit(layer, me);
    const row = document.createElement('button');
    row.className = 'layer ' + (layer.id === selectedId ? 'is-selected' : editable ? 'is-edit' : 'is-locked');
    row.style.setProperty('--oc', `var(${owner.cssVar})`);
    row.style.setProperty('--ot', owner.text);
    row.innerHTML = '<span class="thumb"></span><span class="layer-text"><span class="badge"></span><span class="layer-label"></span></span>';
    row.querySelector('.badge').textContent = owner.name;
    row.querySelector('.layer-label').textContent = layer.label;
    if (editable) row.addEventListener('click', () => onSelect(layer.id));
    else row.setAttribute('aria-disabled', 'true');
    panel.append(row);
  }
}
