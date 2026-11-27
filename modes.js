// Switches between game modes (Sudoku / Groups / Sort / Arrows) and remembers the last one,
// and holds the pieces the games share: timers, pop-ups, preferences and messages.
(function () {
  'use strict';

  const MODE_KEY = 'game-mode';
  const MODES = ['sudoku', 'groups', 'sort', 'arrows'];
  const isActive = (mode) => document.body.dataset.mode === mode;
  const byId = (id) => document.getElementById(id);

  function setMode(mode, announce) {
    if (!MODES.includes(mode)) mode = 'sudoku';
    document.body.dataset.mode = mode;
    for (const other of MODES) {
      byId(`${other}-view`).hidden = other !== mode;
      const tab = byId(`tab-${other}`);
      tab.setAttribute('aria-selected', String(other === mode));
      tab.tabIndex = other === mode ? 0 : -1;
    }
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* ignore */ }
    if (announce) window.dispatchEvent(new CustomEvent('modechange', { detail: mode }));
  }

  let savedMode = 'sudoku';
  try { savedMode = localStorage.getItem(MODE_KEY) || 'sudoku'; } catch (e) { /* ignore */ }
  setMode(savedMode, false);

  document.querySelectorAll('.tabs [data-mode]').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (!isActive(tab.dataset.mode)) setMode(tab.dataset.mode, true);
    });
  });

  // Size the app to the height that is actually visible. On phones, 100dvh can
  // disagree with what the browser really shows (sliding address bar, notch,
  // navigation bar), which made the page scroll. Seen in Android Chrome /
  // Samsung Internet. --app-h is used by `main` and the board sizes.
  let appHeight = '';
  function setAppHeight() {
    const viewport = window.visualViewport;
    // Multiply by scale so pinch-zoom doesn't shrink the layout.
    const height = `${Math.round(viewport ? viewport.height * viewport.scale : window.innerHeight)}px`;
    // Only on change: each change re-lays out the page.
    if (height !== appHeight) document.documentElement.style.setProperty('--app-h', appHeight = height);
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

  // iOS Safari ignores user-scalable=no, so stop pinch-zoom here too.
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // ---------- Shared by the games ----------

  function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  // A game's timer: runs only while its tab shows and the app is in front, and
  // saves the game when it stops. `canRun()`: is there an unfinished game?
  // One shared tick redraws just the showing timer, when its text changes.
  const timers = {};
  function timer(mode, displayEl, canRun, save) {
    let elapsed = 0, runningSince = 0, shownText = '';
    const ms = () => elapsed + (runningSince ? Date.now() - runningSince : 0);
    const gameTimer = timers[mode] = {
      ms,
      start() { if (!runningSince && canRun() && isActive(mode) && !document.hidden) runningSince = Date.now(); },
      pause() { if (runningSince) { elapsed += Date.now() - runningSince; runningSince = 0; } },
      reset(from) { elapsed = from || 0; runningSince = 0; gameTimer.show(); },
      show() {
        const text = formatTime(ms());
        if (text !== shownText) displayEl.textContent = shownText = text;
      },
      save,
    };
    return gameTimer;
  }
  const activeTimer = () => timers[document.body.dataset.mode];
  setInterval(() => { const showing = activeTimer(); if (showing && !document.hidden) showing.show(); }, 250);
  const stopAll = () => { for (const gameTimer of Object.values(timers)) { gameTimer.pause(); gameTimer.save(); } };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAll();
    else if (activeTimer()) activeTimer().start();
  });
  window.addEventListener('pagehide', stopAll);
  window.addEventListener('modechange', () => {
    for (const [mode, gameTimer] of Object.entries(timers)) {
      if (isActive(mode)) { gameTimer.start(); gameTimer.show(); } else { gameTimer.pause(); gameTimer.save(); }
    }
  });

  // Pop-up (`modal` is the .modal backdrop); returns show(open). Tapping outside
  // or Escape calls `dismiss` (default: close). Closing refocuses the opening
  // button. The phone's back button (Android) also calls `dismiss`: opening a
  // pop-up adds a history entry, back removes it (popstate), and closing the
  // pop-up any other way takes the entry off again, so back then leaves the app
  // as usual.
  const popups = [];
  function popup(modal, openButton, focusEl, dismiss) {
    const entry = { modal, dismiss: null, inHistory: false };
    const show = (open) => {
      modal.hidden = !open;
      // Always open at the top, not wherever it was scrolled to last time.
      if (open) for (const box of modal.querySelectorAll('.rules')) box.scrollTop = 0;
      openButton.setAttribute('aria-expanded', String(open));
      (open ? focusEl : openButton).focus();
      if (open && !entry.inHistory) {
        history.pushState({ popup: true }, '');
        entry.inHistory = true;
      } else if (!open && entry.inHistory) {
        entry.inHistory = false;
        history.back();
      }
    };
    entry.dismiss = dismiss || (() => show(false));
    modal.addEventListener('click', (e) => { if (e.target === modal) entry.dismiss(); });
    popups.push(entry);
    return show;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = popups.find((entry) => !entry.modal.hidden);
    if (open) open.dismiss();
  });
  window.addEventListener('popstate', () => {
    const open = popups.find((entry) => !entry.modal.hidden && entry.inHistory);
    if (!open) return;
    open.inHistory = false;   // back already took its entry off
    open.dismiss();
  });

  // A game's "How to play" pop-up (`#<prefix>-rules-text`), opened by its Rules
  // button and closed by "Got it". It focuses the dialog itself, so it opens
  // at the top of the rules (and the version). Returns show(open).
  function rulesPopup(prefix) {
    const modal = byId(`${prefix}-rules-text`), openButton = byId(`${prefix}-rules`);
    const box = modal.querySelector('.rules');
    box.tabIndex = -1;
    const show = popup(modal, openButton, box);
    openButton.addEventListener('click', () => show(true));
    byId(`${prefix}-rules-close`).addEventListener('click', () => show(false));
    return show;
  }

  // Ask before a new puzzle throws away a game in progress.
  function confirmNewGame(inProgress) {
    return !inProgress() || confirm('Start a new puzzle? Your current progress will be lost.');
  }

  // A game's ⚙ Preferences pop-up (`#<prefix>-prefs-modal`) and New button.
  // Menu changes only take effect on "New puzzle"; Cancel, Escape, tapping
  // outside and back put the menus back (`showOptions` sets them to the current
  // game). New starts another puzzle with the current game's preferences.
  //   focus      – the menu to focus when it opens
  //   onOpen     – optional, after the menus are set and before it shows
  //   inProgress – is there a game that a new one would throw away?
  //   newGame    – starts a puzzle from the menus
  function preferences(prefix, { focus, showOptions, onOpen, inProgress, newGame }) {
    const cancel = () => { showOptions(); show(false); };
    const openButton = byId(`${prefix}-prefs`);
    const show = popup(byId(`${prefix}-prefs-modal`), openButton, focus, cancel);
    openButton.addEventListener('click', () => {
      showOptions();
      if (onOpen) onOpen();
      show(true);
    });
    byId(`${prefix}-prefs-cancel`).addEventListener('click', cancel);
    byId(`${prefix}-prefs-apply`).addEventListener('click', () => {
      if (!confirmNewGame(inProgress)) return;
      show(false);
      newGame();
    });
    byId(`${prefix}-new`).addEventListener('click', () => {
      if (!confirmNewGame(inProgress)) return;
      showOptions();
      newGame();
    });
  }

  // Ctrl+Z (⌘Z) undoes in the game that is showing.
  function undoShortcut(mode, undo) {
    document.addEventListener('keydown', (e) => {
      if (isActive(mode) && (e.ctrlKey || e.metaKey) && e.key === 'z') undo();
    });
  }

  function message(messageEl) {
    return (text, className) => {
      messageEl.textContent = text;
      messageEl.className = 'message' + (className ? ' ' + className : '');
    };
  }

  function buzz(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  // Run `callback` the first time `mode` is showing (now, if it already is).
  function whenShown(mode, callback) {
    if (isActive(mode)) return callback();
    window.addEventListener('modechange', function first() {
      if (!isActive(mode)) return;
      window.removeEventListener('modechange', first);
      callback();
    });
  }

  // The app's version, shown in the corner of the rules pop-ups: major.minor.
  // Major = one more for each new game; minor = one more for any other
  // release (4.9 is followed by 4.10). Keep CACHE in sw.js the same.
  const VERSION = '4.3';
  document.querySelectorAll('.app-version').forEach((el) => { el.textContent = `v${VERSION}`; });

  window.GameMode = {
    isActive, formatTime, timer, popup, rulesPopup, preferences, confirmNewGame, undoShortcut,
    message, buzz, whenShown, VERSION,
  };
})();
