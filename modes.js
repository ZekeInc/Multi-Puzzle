// Switches between game modes (Sudoku / Groups / Sort) and remembers the last one.
// Each game listens for the "modechange" event to pause or resume its timer.
(function () {
  'use strict';

  const KEY = 'game-mode';
  const MODES = ['sudoku', 'groups', 'sort'];

  function setMode(mode, announce) {
    if (!MODES.includes(mode)) mode = 'sudoku';
    document.body.dataset.mode = mode;
    for (const m of MODES) {
      document.getElementById(`${m}-view`).hidden = m !== mode;
      const tab = document.getElementById(`tab-${m}`);
      tab.setAttribute('aria-selected', String(m === mode));
      tab.tabIndex = m === mode ? 0 : -1;
    }
    try { localStorage.setItem(KEY, mode); } catch (e) { /* ignore */ }
    if (announce) window.dispatchEvent(new CustomEvent('modechange', { detail: mode }));
  }

  let saved = 'sudoku';
  try { saved = localStorage.getItem(KEY) || 'sudoku'; } catch (e) { /* ignore */ }
  setMode(saved, false);

  document.querySelectorAll('.tabs [data-mode]').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (document.body.dataset.mode !== tab.dataset.mode) setMode(tab.dataset.mode, true);
    });
  });

  // Size the app to the height that is actually visible. On phones, 100dvh can
  // disagree with what Safari really shows (toolbars, notch, home bar), which
  // made the page scroll. --app-h is used by `main` and the board sizes.
  function setAppHeight() {
    const vv = window.visualViewport;
    // Multiply by scale so pinch-zoom doesn't shrink the layout.
    const h = vv ? vv.height * vv.scale : window.innerHeight;
    document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
  }
  setAppHeight();
  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 300));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', setAppHeight);

  window.GameMode = { isActive: (mode) => document.body.dataset.mode === mode };
})();
