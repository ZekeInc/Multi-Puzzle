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
  // disagree with what the browser really shows (sliding address bar, notch,
  // navigation bar), which made the page scroll. Seen in Android Chrome /
  // Samsung Internet. --app-h is used by `main` and the board sizes.
  function setAppHeight() {
    const vv = window.visualViewport;
    // Multiply by scale so pinch-zoom doesn't shrink the layout.
    const h = vv ? vv.height * vv.scale : window.innerHeight;
    document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
    // The app always fits, so it should never sit part-way scrolled.
    if (window.scrollY) window.scrollTo(0, 0);
  }
  // After a pull-to-refresh, the browser can restore the old scroll position
  // while its address bar is still animating, so start at the top and measure
  // again once things settle.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  setAppHeight();
  const settle = () => { setAppHeight(); setTimeout(setAppHeight, 350); };
  window.addEventListener('load', settle);
  window.addEventListener('pageshow', settle);
  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 300));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', setAppHeight);

  window.GameMode = { isActive: (mode) => document.body.dataset.mode === mode };
})();
