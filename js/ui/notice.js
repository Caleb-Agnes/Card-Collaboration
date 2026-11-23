// Message and confirm boxes in the app's modal style (instead of alert/confirm).
const $ = id => document.getElementById(id);
let resolver = null;

function finish(value) {
  const r = resolver;
  resolver = null;
  if ($('modal-notice').open) $('modal-notice').close();
  r?.(value);
}

$('notice-ok').addEventListener('click', () => finish(true));
$('modal-notice').addEventListener('close', () => finish(false));

/**
 * Show a message. With confirm: true, shows Cancel and resolves true only for OK.
 * @returns {Promise<boolean>}
 */
export function notice(title, text, { confirm = false, ok = 'OK' } = {}) {
  if (resolver) finish(false);
  $('notice-title').textContent = title;
  $('notice-text').textContent = text;
  $('notice-ok').textContent = ok;
  $('notice-cancel').hidden = !confirm;
  $('modal-notice').showModal();
  $('notice-ok').focus();
  return new Promise(res => { resolver = res; });
}
