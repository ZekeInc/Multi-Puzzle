(function () {
  'use strict';

  const SAVE_KEY = 'arrows-save-v1';
  const NAMES = ['up', 'right', 'down', 'left'];
  const SLIDE_MS = 420;
  const isActive = () => GameMode.isActive('arrows');

  const boardEl = document.getElementById('a-board');
  const sizeEl = document.getElementById('a-size');
  const levelEl = document.getElementById('a-level');
  const shapeEl = document.getElementById('a-shape');
  const timerEl = document.getElementById('a-timer');
  const bestEl = document.getElementById('a-best');
  const mistakesEl = document.getElementById('a-mistakes');
  const messageEl = document.getElementById('a-message');
  const rulesBtn = document.getElementById('a-rules');
  const rulesEl = document.getElementById('a-rules-text');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const state = {
    size: 0,
    shape: 'flat',  // 'flat' board or 3D 'cube'
    level: 'medium',
    pieces: [],     // { cells, dir }, see arrows.js
    removed: [],    // removed[id]: piece is off the board
    order: [],      // pieces in the order they were removed (for Undo)
    mistakes: 0,
    finished: false,
    hintsUsed: false,
  };

  let owner = null;   // owner[square] = piece id
  let els = [];       // flat board: els[id] = the piece's group
  let hinted = -1;
  let view = null;    // flatView or cubeView (same calls)

  const setMessage = GameMode.message(messageEl);
  const { buzz, formatTime } = GameMode;
  const board = () => ({ size: state.size, depth: state.shape === 'cube' ? state.size : 1, pieces: state.pieces });

  // ---------- Timer ----------

  const timer = GameMode.timer('arrows', timerEl, () => state.size > 0 && !state.finished, save);

  // ---------- Saving ----------

  function save() {
    if (!state.size) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        size: state.size,
        shape: state.shape,
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
      // Games from before pieces could bend: their Hard is now Easy; the old
      // Easy and Medium are gone, so those games are dropped.
      if (!d.pieces[0].cells) {
        if (d.level !== 'hard') return false;
        d.level = 'easy';
        d.pieces = d.pieces.map((p) => Arrows.fromStraight(p, d.size));
      }
      const removed = d.pieces.map(() => false);
      for (const id of d.order) removed[id] = true;
      Object.assign(state, {
        size: d.size, shape: d.shape === 'cube' ? 'cube' : 'flat', level: d.level, pieces: d.pieces, removed, order: d.order,
        mistakes: d.mistakes || 0, finished: !!d.finished, hintsUsed: !!d.hintsUsed,
      });
      timer.reset(d.elapsed);
      showOptions();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- Board ----------
  // One SVG for the whole board, in square units (square r, c has its centre
  // at c + 0.5, r + 0.5). Each piece is a group: a thick rounded "tube" along
  // its path, a thin shaft and a solid arrow head. All three are drawn along a
  // line that runs from just behind the tail, through the piece, past its head
  // and off the board. Dashes show only the piece's own part of that line, so
  // sliding the dashes along it (and the head with them) moves the piece out
  // along its own path, like a snake.

  const SVG = 'http://www.w3.org/2000/svg';
  const TAIL = 0.3;   // the shaft starts this far behind the tail's centre

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  }

  // Geometry of a piece: the line's points, how far along it the head is, and
  // how far the head travels to take the whole piece off the board.
  function geometry(p) {
    const n = state.size, len = p.cells.length;
    const at = (i) => [i % n + 0.5, Math.floor(i / n) + 0.5];
    const unit = (d) => [Arrows.DC[d], Arrows.DR[d]];
    const tail = p.cells[len - 1];
    const back = unit(len > 1 ? Arrows.stepDir(tail, p.cells[len - 2], n) : p.dir);
    const [hx, hy] = at(p.cells[0]);
    const [ux, uy] = unit(p.dir);
    const toEdge = ux > 0 ? n - hx : ux < 0 ? hx : uy > 0 ? n - hy : hy;
    const travel = toEdge + len + 1;
    const [tx, ty] = at(tail);
    const points = [[tx - back[0] * TAIL, ty - back[1] * TAIL]];
    for (let k = len - 1; k >= 0; k--) points.push(at(p.cells[k]));
    points.push([hx + ux * travel, hy + uy * travel]);
    return { points: points.map((xy) => xy.join(',')).join(' '), len, head: [hx, hy], u: [ux, uy], travel };
  }

  function buildFlat() {
    const n = state.size;
    boardEl.style.setProperty('--n', n);
    boardEl.classList.remove('cube');
    const svg = svgEl('svg', { viewBox: `0 0 ${n} ${n}`, class: 'a-svg' });
    els = state.pieces.map((p, id) => {
      const g = geometry(p);
      const body = Math.max(g.len - 1, 0.001);   // tube: tail centre to head centre
      const [hx, hy] = g.head, [ux, uy] = g.u;
      const el = svgEl('g', { class: 'a-piece', 'data-id': id, role: 'button', tabindex: 0 });
      const line = (cls, dash, offset) => {
        const pl = svgEl('polyline', { class: cls, points: g.points, 'stroke-dasharray': `${dash} 9999` });
        pl.dataset.offset = offset;
        pl.style.strokeDashoffset = offset;
        return pl;
      };
      const pt = (along, side) => `${hx + ux * along - uy * side},${hy + uy * along + ux * side}`;
      const head = svgEl('polygon', { class: 'a-head', points: `${pt(0.36, 0)} ${pt(-0.08, 0.27)} ${pt(-0.08, -0.27)}` });
      el.append(
        line('a-halo', body, -TAIL),
        line('a-tube', body, -TAIL),
        line('a-shaft', g.len - 1 + TAIL - 0.05, 0),
        head,
      );
      el.dataset.travel = g.travel;
      const r = Math.floor(p.cells[0] / n) + 1, c = p.cells[0] % n + 1;
      const turns = Arrows.bends(p, n);
      el.setAttribute('aria-label', `Arrow ${NAMES[p.dir]}, head at row ${r}, column ${c}` +
        (turns ? `, ${turns} bend${turns > 1 ? 's' : ''}` : ''));
      svg.appendChild(el);
      return el;
    });
    boardEl.replaceChildren(svg);
  }

  // Put a piece back where it started (no animation: transitions only run while leaving).
  function placeFlat(id, gone) {
    const el = els[id];
    el.classList.remove('leaving', 'hint');
    el.classList.toggle('gone', gone);
    for (const pl of el.querySelectorAll('polyline')) pl.style.strokeDashoffset = pl.dataset.offset;
    el.querySelector('.a-head').style.transform = '';
  }

  const flatView = {
    build: buildFlat,
    place: placeFlat,
    refresh() {},
    leave: leaveFlat,
    el: (id) => els[id],
    shakeClass: (id) => (state.pieces[id].dir % 2 ? 'shake-x' : 'shake-y'),
  };
  const cubeView = ArrowsCube.create(boardEl, { onTap: (id) => tap(id) });

  function buildBoard() {
    owner = Arrows.ownerGrid(board());
    view = state.shape === 'cube' ? cubeView : flatView;
    view.build(board());
    hinted = -1;
  }

  function render() {
    state.pieces.forEach((p, id) => view.place(id, state.removed[id]));
    view.refresh(state.removed);
    mistakesEl.textContent = `Mistakes: ${state.mistakes}`;
    boardEl.classList.toggle('solved', state.finished);
    timer.show();
    renderBest();
  }

  // Best-time key: `size-level` on the flat board, `cube-size-level` in 3D.
  function scoreKey() {
    const [shape, n, level] = state.size ? [state.shape, state.size, state.level] : [shapeEl.value, sizeEl.value, levelEl.value];
    return `${shape === 'cube' ? 'cube-' : ''}${n}-${level}`;
  }

  function renderBest() {
    bestEl.textContent = Scores.bestLabel('arrows', scoreKey());
  }
  window.addEventListener('scoreschange', renderBest);

  function clearHint() {
    if (hinted >= 0) view.el(hinted).classList.remove('hint');
    hinted = -1;
  }

  // ---------- Game flow ----------

  function newGame() {
    const n = Number(sizeEl.value);
    const level = levelEl.value;
    const shape = shapeEl.value === 'cube' ? 'cube' : 'flat';
    setMessage('Generating…');
    setTimeout(() => {
      const b = shape === 'cube' ? Arrows.generateCube(n, level) : Arrows.generate(n, level);
      Object.assign(state, {
        size: n,
        shape,
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

  // Slide a piece off the board: head first, along its own path.
  function leaveFlat(id) {
    const el = els[id], p = state.pieces[id];
    if (reducedMotion.matches) { el.classList.add('gone'); return; }
    const travel = Number(el.dataset.travel);
    el.classList.add('leaving');
    el.getBoundingClientRect();   // start the transition from where it is now
    for (const pl of el.querySelectorAll('polyline')) pl.style.strokeDashoffset = Number(pl.dataset.offset) - travel;
    el.querySelector('.a-head').style.transform =
      `translate(${Arrows.DC[p.dir] * travel}px, ${Arrows.DR[p.dir] * travel}px)`;
    setTimeout(() => { if (state.removed[id]) el.classList.add('gone'); }, SLIDE_MS);
  }

  // Restart an animation class on an element.
  function flash(el, cls) {
    el.classList.remove(cls);
    el.getBoundingClientRect();
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 600);
  }

  function tap(id) {
    if (state.finished || state.removed[id]) return;
    const b = Arrows.blocker(board(), owner, state.removed, id);
    if (b >= 0) {
      state.mistakes++;
      mistakesEl.textContent = `Mistakes: ${state.mistakes}`;
      flash(view.el(id), view.shakeClass(id));
      flash(view.el(b), 'blocking');
      buzz(80);
      setMessage('Blocked! Something is in the way.', 'bad');
      save();
      return;
    }
    clearHint();
    state.removed[id] = true;
    state.order.push(id);
    view.leave(id);
    view.refresh(state.removed);
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
    view.el(hinted).classList.add('hint');
    setMessage('This one can go.');
    save();
  }

  // ---------- Buttons ----------

  boardEl.addEventListener('click', (e) => {
    const el = e.target.closest('.a-piece');
    if (el) tap(Number(el.dataset.id));
  });
  boardEl.addEventListener('keydown', (e) => {
    const el = e.target.closest('.a-piece');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tap(Number(el.dataset.id)); }
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
  // The size menu lists 5–10 for the flat board and 3–5 for the cube.
  const SIZES = { flat: [5, 6, 7, 8, 9, 10], cube: [3, 4, 5] };
  const DEFAULT_SIZE = { flat: 7, cube: 4 };
  function sizeOptions(shape, value) {
    const list = SIZES[shape];
    if (!list.includes(Number(value))) value = DEFAULT_SIZE[shape];
    sizeEl.replaceChildren(...list.map((k) => {
      const o = document.createElement('option');
      o.value = String(k);
      o.textContent = shape === 'cube' ? `${k} × ${k} × ${k}` : `${k} × ${k}`;
      return o;
    }));
    sizeEl.value = String(value);
  }
  shapeEl.addEventListener('change', () => sizeOptions(shapeEl.value, sizeEl.value));

  // Set the menus to the current game's preferences.
  function showOptions() {
    if (!state.size) return;
    shapeEl.value = state.shape;
    sizeOptions(state.shape, state.size);
    levelEl.value = state.level;
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
