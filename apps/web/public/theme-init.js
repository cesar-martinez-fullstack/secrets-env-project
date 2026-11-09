// Evita el "flash" de tema incorrecto antes de montar Vue.
// Archivo externo (no inline) para cumplir la CSP `script-src 'self'`.
(function () {
  try {
    var mode = localStorage.getItem('sv-theme') || 'system';
    var dark =
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    /* sin localStorage: tema del sistema */
  }
})();
