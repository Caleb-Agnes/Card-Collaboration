// Modals are native <dialog> elements. showModal() gives the overlay, keeps focus
// inside the modal and closes on Escape, so this module only adds:
//  - [data-close] buttons (the corner X and Cancel) close their modal
//  - clicking the backdrop closes the modal
//  - an optional onOpen hook to reset fields each time a modal opens

const hooks = new Map();

export function initModals() {
  document.querySelectorAll('dialog.modal').forEach(dlg => {
    dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
    // The dialog has no padding, so a click whose target is the dialog itself landed on the backdrop.
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  });
}

/** Run fn(dialog, data) every time openModal is called for this id. */
export function onModalOpen(id, fn) { hooks.set(id, fn); }

export function openModal(id, data) {
  const dlg = document.getElementById(id);
  hooks.get(id)?.(dlg, data);
  dlg.showModal();
}

export function closeModal(id) { document.getElementById(id).close(); }
