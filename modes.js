// Switches between game modes (Sudoku / Groups / Sort) and remembers the last one,
// and holds the pieces the three games share: timers, pop-ups and messages.
(function () {
  'use strict';

  const KEY = 'game-mode';
  const MODES = ['sudoku', 'groups', 'sort'];
  const isActive = (mode) => document.body.dataset.mode === mode;

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
      if (!isActive(tab.dataset.mode)) setMode(tab.dataset.mode, true);
    });
  });

  // Size the app to the height that is actually visible. On phones, 100dvh can
  // disagree with what the browser really shows (sliding address bar, notch,
  // navigation bar), which made the page scroll. Seen in Android Chrome /
  // Samsung Internet. --app-h is used by `main` and the board sizes.
  let appH = '';
  function setAppHeight() {
    const vv = window.visualViewport;
    // Multiply by scale so pinch-zoom doesn't shrink the layout.
    const h = `${Math.round(vv ? vv.height * vv.scale : window.innerHeight)}px`;
    // Only on change: each change re-lays out the page.
    if (h !== appH) document.documentElement.style.setProperty('--app-h', appH = h);
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

  // ---------- Shared by the games ----------

  function formatTime(ms) {
    const secs = Math.floor(ms / 1000);
    return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  }

  // A game's timer: runs only while its tab shows and the app is in front, and
  // saves the game when it stops. `canRun()`: is there an unfinished game?
  // One shared tick redraws just the showing timer, when its text changes.
  const timers = {};
  function timer(mode, el, canRun, save) {
    let elapsed = 0, runStart = 0, shown = '';
    const ms = () => elapsed + (runStart ? Date.now() - runStart : 0);
    const t = timers[mode] = {
      ms,
      start() { if (!runStart && canRun() && isActive(mode) && !document.hidden) runStart = Date.now(); },
      pause() { if (runStart) { elapsed += Date.now() - runStart; runStart = 0; } },
      reset(from) { elapsed = from || 0; runStart = 0; t.show(); },
      show() { const s = formatTime(ms()); if (s !== shown) el.textContent = shown = s; },
      save,
    };
    return t;
  }
  const activeTimer = () => timers[document.body.dataset.mode];
  setInterval(() => { const t = activeTimer(); if (t && !document.hidden) t.show(); }, 250);
  const stopAll = () => { for (const t of Object.values(timers)) { t.pause(); t.save(); } };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAll();
    else if (activeTimer()) activeTimer().start();
  });
  window.addEventListener('pagehide', stopAll);
  window.addEventListener('modechange', () => {
    for (const [mode, t] of Object.entries(timers)) {
      if (isActive(mode)) { t.start(); t.show(); } else { t.pause(); t.save(); }
    }
  });

  // Pop-up (`el` is the .modal backdrop); returns show(open). Tapping outside or
  // Escape calls `dismiss` (default: close). Closing refocuses the opening button.
  const popups = [];
  function popup(el, btn, focusEl, dismiss) {
    const show = (open) => {
      el.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      (open ? focusEl : btn).focus();
    };
    dismiss = dismiss || (() => show(false));
    el.addEventListener('click', (e) => { if (e.target === el) dismiss(); });
    popups.push({ el, dismiss });
    return show;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = popups.find((p) => !p.el.hidden);
    if (open) open.dismiss();
  });

  function message(el) {
    return (text, cls) => {
      el.textContent = text;
      el.className = 'message' + (cls ? ' ' + cls : '');
    };
  }

  function buzz(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  // Run `fn` the first time `mode` is showing (now, if it already is).
  function whenShown(mode, fn) {
    if (isActive(mode)) return fn();
    window.addEventListener('modechange', function first() {
      if (!isActive(mode)) return;
      window.removeEventListener('modechange', first);
      fn();
    });
  }

  window.GameMode = { isActive, formatTime, timer, popup, message, buzz, whenShown };
})();
