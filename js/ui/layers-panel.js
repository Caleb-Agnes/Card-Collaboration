// Layer panel (L2, L3). Rows are listed front-most first (top of list = top of stack).
// States from the design reference: is-edit (yours, or any layer for the host),
// is-locked (everyone else's, faded), is-selected (amber, one editable layer).
// The host can drag any row to any position.

/**
 * @param {HTMLElement} panel   the #layers panel (its .panel-head is kept)
 * @param {object} o
 * @param {object[]} o.layersDesc  front-most first
 * @param {(layer)=>{name,cssVar,text}} o.ownerStyle
 * @param {(layer)=>boolean} o.canEdit
 * @param {(layer)=>string|null} o.thumb   data URL or null
 * @param {string|null} o.selectedId
 * @param {boolean} o.canReorder  host drag-and-drop
 * @param {(id)=>void} o.onSelect
 * @param {(id, index)=>void} o.onDrop   move layer to this index in layersDesc
 */
export function renderLayers(panel, o) {
  panel.querySelectorAll('.layer, .panel-note').forEach(r => r.remove());
  if (!o.layersDesc.length) {
    const p = document.createElement('p');
    p.className = 'panel-note';
    p.textContent = 'No layers yet. Use "Reserve an area" to claim a space.';
    panel.append(p);
    return;
  }
  o.layersDesc.forEach((layer, index) => {
    const owner = o.ownerStyle(layer);
    const editable = o.canEdit(layer);
    const row = document.createElement('button');
    row.className = 'layer ' + (layer.id === o.selectedId ? 'is-selected' : editable ? 'is-edit' : 'is-locked');
    row.dataset.id = layer.id;
    row.style.setProperty('--oc', `var(${owner.cssVar})`);
    row.style.setProperty('--ot', owner.text);
    row.innerHTML = '<span class="thumb"></span><span class="layer-text"><span class="badge"></span><span class="layer-label"></span></span>';
    const src = o.thumb(layer);
    if (src) { const img = new Image(); img.src = src; img.alt = ''; row.querySelector('.thumb').append(img); }
    row.querySelector('.badge').textContent = owner.name;
    row.querySelector('.layer-label').textContent = layer.label || '(no name)';
    row.title = `${owner.name}: ${layer.label}\nPosition ${index + 1} of ${o.layersDesc.length} from the front`;
    if (editable) row.addEventListener('click', () => o.onSelect(layer.id));
    else row.setAttribute('aria-disabled', 'true');

    if (o.canReorder) {
      row.draggable = true;
      row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-layer', layer.id); e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragover', e => {
        if (!e.dataTransfer.types.includes('text/x-layer')) return;
        e.preventDefault();
        const r = row.getBoundingClientRect();
        const below = e.clientY - r.top > r.height / 2;
        row.classList.toggle('drop-below', below);
        row.classList.toggle('drop-above', !below);
      });
      row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
      row.addEventListener('drop', e => {
        e.preventDefault();
        const below = row.classList.contains('drop-below');
        row.classList.remove('drop-above', 'drop-below');
        const id = e.dataTransfer.getData('text/x-layer');
        if (id) o.onDrop(id, index + (below ? 1 : 0));
      });
    }
    panel.append(row);
  });
}
