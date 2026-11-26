(function () {
  'use strict';

  const SAVE_KEY = 'arrows-save-v1';
  const NAMES = ['up', 'right', 'down', 'left'];
  const SLIDE_MS = 260;
  const isActive = () => GameMode.isActive('arrows');

  const boardEl = document.getElementById('a-board');
  const sizeEl = document.getElementById('a-size');
  const levelEl = document.getElementById('a-level');
  const timerEl = document.getElementById('a-timer');
  const bestEl = document.getElementById('a-best');
  const mistakesEl = document.getElementById('a-mistakes');
  const messageEl = document.getElementById('a-message');
  const rulesBtn = document.getElementById('a-rules');
  const rulesEl = document.getElementById('a-rules-text');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const state = {
    size: 0,
    level: 'medium',
    pieces: [],     // { r, c, len, dir }, see arrows.js
    removed: [],    // removed[id]: piece is off the board
    order: [],      // pieces in the order they were removed (for Undo)
    mistakes: 0,
    finished: false,
    hintsUsed: false,
  };

  let owner = null;   // owner[square] = piece id
  let els = [];       // els[id] = the piece's button
  let hinted = -1;

  const setMessage = GameMode.message(messageEl);
  const { buzz, formatTime } = GameMode;
  const board = () => ({ size: state.size, pieces: state.pieces });

  // ---------- Timer ----------

  const timer = GameMode.timer('arrows', timerEl, () => state.size > 0 && !state.finished, save);

  // ---------- Saving ----------

  function save() {
    if (!state.size) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        size: state.size,
        level: state.level,
        pieces: state.pieces,
        order: state.order,
        mistakes: state.mistakes,
        elapsed: timer.ms(),
        finished: state.finished,
        hintsUsed: state.hintsUsed,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d || !d.size || !Array.isArray(d.pieces) || !Array.isArray(d.order)) return false;
      const removed = d.pieces.map(() => false);
      for (const id of d.order) removed[id] = true;
      Object.assign(state, {
        size: d.size, level: d.level, pieces: d.pieces, removed, order: d.order,
        mistakes: d.mistakes || 0, finished: !!d.finished, hintsUsed: !!d.hintsUsed,
      });
      timer.reset(d.elapsed);
      sizeEl.value = String(d.size);
      levelEl.value = d.level;
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- Board ----------

  // The arrow drawn in cell units: a shaft from the tail to the head, and a
  // solid head. Drawn pointing right, then turned to face `dir`.
  function arrowSvg(len, dir) {
    const vertical = dir === 0 || dir === 2;
    const w = vertical ? 1 : len, h = vertical ? len : 1;
    const turn = [
      `translate(0 ${len}) rotate(-90)`,
      '',
      'translate(1 0) rotate(90)',
      `translate(${len} 1) rotate(180)`,
    ][dir];
    const tip = len - 0.14, base = len - 0.5;
    return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><g transform="${turn}">` +
      `<line x1="${len === 1 ? 0.22 : 0.4}" y1="0.5" x2="${base + 0.05}" y2="0.5"/>` +
      `<polygon points="${tip},0.5 ${base},0.2 ${base},0.8"/></g></svg>`;
  }

  function buildBoard() {
    const n = state.size;
    boardEl.style.setProperty('--n', n);
    owner = Arrows.ownerGrid(board());
    els = state.pieces.map((p, id) => {
      const sq = Arrows.cells(p, n);
      const rows = sq.map((i) => Math.floor(i / n)), cols = sq.map((i) => i % n);
      const el = document.createElement('button');
      el.className = 'a-piece';
      el.dataset.id = id;
      el.style.gridRow = `${Math.min(...rows) + 1} / span ${new Set(rows).size}`;
      el.style.gridColumn = `${Math.min(...cols) + 1} / span ${new Set(cols).size}`;
      el.innerHTML = arrowSvg(p.len, p.dir);
      el.setAttribute('aria-label', `Arrow ${NAMES[p.dir]}, row ${p.r + 1}, column ${p.c + 1}`);
      return el;
    });
    boardEl.replaceChildren(...els);
    hinted = -1;
  }

  function render() {
    els.forEach((el, id) => {
      el.hidden = state.removed[id];
      el.classList.remove('leaving', 'hint');
      el.style.transform = '';
    });
    mistakesEl.textContent = `Mistakes: ${state.mistakes}`;
    boardEl.classList.toggle('solved', state.finished);
    timer.show();
    renderBest();
  }

  function scoreKey() {
    return state.size ? `${state.size}-${state.level}` : `${sizeEl.value}-${levelEl.value}`;
  }

  function renderBest() {
    bestEl.textContent = Scores.bestLabel('arrows', scoreKey());
  }
  window.addEventListener('scoreschange', renderBest);

  function clearHint() {
    if (hinted >= 0) els[hinted].classList.remove('hint');
    hinted = -1;
  }

  // ---------- Game flow ----------

  function newGame() {
    const n = Number(sizeEl.value);
    const level = levelEl.value;
    setMessage('Generating…');
    setTimeout(() => {
      const b = Arrows.generate(n, level);
      Object.assign(state, {
        size: n,
        level,
        pieces: b.pieces,
        removed: b.pieces.map(() => false),
        order: [],
        mistakes: 0,
        finished: false,
        hintsUsed: false,
      });
      timer.reset(0);
      timer.start();
      buildBoard();
      render();
      setMessage('');
      save();
    }, 20);
  }

  const inProgress = () => !state.finished && (state.order.length > 0 || state.mistakes > 0);

  // Slide a piece off the board in the direction it points.
  function slideOut(id) {
    const el = els[id], p = state.pieces[id], n = state.size;
    if (reducedMotion.matches) { el.hidden = true; return; }
    // Far enough that the whole piece leaves the board, which clips it.
    const step = boardEl.clientWidth / n;
    const dist = (p.dir === 0 ? p.r + 1 : p.dir === 1 ? n - p.c : p.dir === 2 ? n - p.r : p.c + 1) + p.len;
    el.classList.add('leaving');
    el.style.transform = `translate(${Arrows.DC[p.dir] * dist * step}px, ${Arrows.DR[p.dir] * dist * step}px)`;
    setTimeout(() => { if (state.removed[id]) el.hidden = true; }, SLIDE_MS);
  }

  // Restart an animation class on an element.
  function flash(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 600);
  }

  function tap(id) {
    if (state.finished || state.removed[id]) return;
    const b = Arrows.blocker(board(), owner, state.removed, id);
    if (b >= 0) {
      state.mistakes++;
      mistakesEl.textContent = `Mistakes: ${state.mistakes}`;
      flash(els[id], state.pieces[id].dir % 2 ? 'shake-x' : 'shake-y');
      flash(els[b], 'blocking');
      buzz(80);
      setMessage('Blocked! Something is in the way.', 'bad');
      save();
      return;
    }
    clearHint();
    state.removed[id] = true;
    state.order.push(id);
    slideOut(id);
    setMessage('');
    if (state.order.length === state.pieces.length) finish();
    save();
  }

  function finish() {
    timer.pause();
    state.finished = true;
    boardEl.classList.add('solved');
    buzz([60, 60, 60]);
    const ms = timer.ms();
    const result = Scores.record('arrows', scoreKey(), ms, !state.hintsUsed);
    const m = state.mistakes;
    setMessage(`Cleared in ${formatTime(ms)} with ${m} mistake${m === 1 ? '' : 's'}!` +
      Scores.verdict(result, state.hintsUsed), 'win');
    renderBest();
  }

  function undo() {
    if (state.finished) return;
    const id = state.order.pop();
    if (id === undefined) return setMessage('Nothing to undo.');
    state.removed[id] = false;
    clearHint();
    render();
    setMessage('');
    save();
  }

  function restart() {
    if (state.finished || !inProgress()) return;
    if (!confirm('Restart this puzzle from the beginning?')) return;
    state.removed = state.pieces.map(() => false);
    state.order = [];
    state.mistakes = 0;
    clearHint();
    render();
    setMessage('');
    save();
  }

  function hint() {
    if (state.finished || !state.size) return;
    const f = Arrows.free(board(), state.removed, owner);
    if (!f.length) return;
    state.hintsUsed = true;
    clearHint();
    hinted = f[Math.floor(Math.random() * f.length)];
    els[hinted].classList.add('hint');
    setMessage('This one can go.');
    save();
  }

  // ---------- Buttons ----------

  boardEl.addEventListener('click', (e) => {
    const el = e.target.closest('.a-piece');
    if (el) tap(Number(el.dataset.id));
  });

  function confirmNew() {
    return !inProgress() || confirm('Start a new puzzle? Your current progress will be lost.');
  }

  document.getElementById('a-new').addEventListener('click', () => {
    if (!confirmNew()) return;
    showOptions();   // New keeps the current game's preferences
    newGame();
  });

  // Preferences pop-up: menu changes only take effect on "New puzzle"; Cancel puts them back.
  const prefsEl = document.getElementById('a-prefs-modal');
  const prefsBtn = document.getElementById('a-prefs');
  function showOptions() {
    if (state.size) sizeEl.value = String(state.size);
    if (state.size) levelEl.value = state.level;
  }
  function cancelPrefs() {
    showOptions();
    showPrefs(false);
  }
  const showPrefs = GameMode.popup(prefsEl, prefsBtn, levelEl, cancelPrefs);
  prefsBtn.addEventListener('click', () => { showOptions(); showPrefs(true); });
  document.getElementById('a-prefs-cancel').addEventListener('click', cancelPrefs);
  document.getElementById('a-prefs-apply').addEventListener('click', () => {
    if (!confirmNew()) return;
    showPrefs(false);
    newGame();
  });

  document.getElementById('a-undo').addEventListener('click', undo);
  document.getElementById('a-restart').addEventListener('click', restart);
  document.getElementById('a-hint').addEventListener('click', hint);
  const showRules = GameMode.popup(rulesEl, rulesBtn, document.getElementById('a-rules-close'));
  rulesBtn.addEventListener('click', () => showRules(true));
  document.getElementById('a-rules-close').addEventListener('click', () => showRules(false));

  document.addEventListener('keydown', (e) => {
    if (isActive() && (e.ctrlKey || e.metaKey) && e.key === 'z') undo();
  });

  // ---------- Start ----------

  if (load()) {
    buildBoard();
    render();
    if (state.finished) setMessage('Tap New to play again.');
    else timer.start();
  } else {
    // First time here: make a puzzle once the tab is opened, and show the rules.
    renderBest();
    GameMode.whenShown('arrows', () => { newGame(); showRules(true); });
  }
})();
