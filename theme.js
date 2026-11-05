// Light/dark theme switch. Dark is the default; the choice is saved on the device.
(function () {
  'use strict';

  const btn = document.getElementById('theme-toggle');
  const meta = document.getElementById('theme-color');

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    meta.content = theme === 'dark' ? '#12151c' : '#f6f7f9';
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  apply(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
  });
})();
