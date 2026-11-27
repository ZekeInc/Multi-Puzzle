// Arrows UI: game flow, saving, the flat board's view, and the Preferences and
// Rules pop-ups. The 3D cube's view is in arrows-cube.js; the puzzle logic is
// in arrows.js.
(function () {
  'use strict';

  const SAVE_KEY = 'arrows-save-v1';
  const DIRECTION_NAMES = ['up', 'right', 'down', 'left'];
  const SLIDE_MS = 420;

  const boardEl = document.getElementById('a-board');
  const sizeEl = document.getElementById('a-size');
  const levelEl = document.getElementById('a-level');
  const shapeEl = document.getElementById('a-shape');
  const timerEl = document.getElementById('a-timer');
  const bestEl = document.getElementById('a-best');
  const mistakesEl = document.getElementById('a-mistakes');
  const messageEl = document.getElementById('a-message');
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

  let owner = null;     // owner[square] = piece id
  let hinted = -1;      // the piece Hint is pointing at
  let view = null;      // flatView or cubeView (same calls)

  const setMessage = GameMode.message(messageEl);
  const { buzz, formatTime } = GameMode;
  const currentBoard = () => ({ size: state.size, depth: state.shape === 'cube' ? state.size : 1, pieces: state.pieces });

  // ---------- Timer ----------

  const timer = GameMode.timer('arrows', timerEl, () => state.size > 0 && !state.finished, save);

  // ---------- Saving ----------

  function save() {
    if (!state.size) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        size: state.size,
        levels: 2,      // flat levels since the harder Hard (see load)
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
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!saved || !saved.size || !Array.isArray(saved.pieces) || !Array.isArray(saved.order)) return false;
      // Games from before pieces could bend: their Hard is now Easy; the old
      // Easy and Medium are gone, so those games are dropped.
      if (!saved.pieces[0].cells) {
        if (saved.level !== 'hard') return false;
        saved.level = 'easy';
        saved.pieces = saved.pieces.map((oldPiece) => Arrows.fromStraight(oldPiece, saved.size));
      }
      // Flat games from before the harder Hard: their Hard is now Medium; the
      // old Medium (1 bend) is gone, so those games are dropped.
      if (saved.shape !== 'cube' && !saved.levels) {
        if (saved.level === 'medium') return false;
        if (saved.level === 'hard') saved.level = 'medium';
      }
      const removed = saved.pieces.map(() => false);
      for (const id of saved.order) removed[id] = true;
      Object.assign(state, {
        size: saved.size, shape: saved.shape === 'cube' ? 'cube' : 'flat', level: saved.level,
        pieces: saved.pieces, removed, order: saved.order,
        mistakes: saved.mistakes || 0, finished: !!saved.finished, hintsUsed: !!saved.hintsUsed,
      });
      timer.reset(saved.elapsed);
      showOptions();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- Flat board view ----------
  // One SVG for the whole board, in square units (square at row r, column c has
  // its centre at c + 0.5, r + 0.5). Each piece is a group: a thick rounded
  // "tube" along its path, a thin shaft and a solid arrow head. All three are
  // drawn along a line that runs from just behind the tail, through the piece,
  // past its head and off the board. Dashes show only the piece's own part of
  // that line, so sliding the dashes along it (and the head with them) moves
  // the piece out along its own path, like a snake.

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const TAIL = 0.3;   // the shaft starts this far behind the tail's centre

  let pieceEls = [];   // pieceEls[id] = the piece's group

  function svgElement(tag, attributes) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes || {})) el.setAttribute(name, value);
    return el;
  }

  // Geometry of a piece: the line's points, where the head is and which way it
  // points, and how far the head travels to take the whole piece off the board.
  function geometry(piece) {
    const size = state.size, length = piece.cells.length;
    const centre = (square) => {
      const { row, column } = Arrows.coordinatesOf(square, size);
      return [column + 0.5, row + 0.5];
    };
    const unit = (dir) => [Arrows.COLUMN_STEP[dir], Arrows.ROW_STEP[dir]];
    const tail = piece.cells[length - 1];
    const tailDirection = unit(length > 1 ? Arrows.stepDirection(tail, piece.cells[length - 2], size) : piece.dir);
    const [headX, headY] = centre(piece.cells[0]);
    const [stepX, stepY] = unit(piece.dir);
    const toEdge = stepX > 0 ? size - headX : stepX < 0 ? headX : stepY > 0 ? size - headY : headY;
    const travel = toEdge + length + 1;
    const [tailX, tailY] = centre(tail);
    const points = [[tailX - tailDirection[0] * TAIL, tailY - tailDirection[1] * TAIL]];
    for (let k = length - 1; k >= 0; k--) points.push(centre(piece.cells[k]));
    points.push([headX + stepX * travel, headY + stepY * travel]);
    return {
      points: points.map((point) => point.join(',')).join(' '),
      length, head: [headX, headY], step: [stepX, stepY], travel,
    };
  }

  function buildFlat() {
    const size = state.size;
    boardEl.style.setProperty('--n', size);
    boardEl.classList.remove('cube');
    const svg = svgElement('svg', { viewBox: `0 0 ${size} ${size}`, class: 'a-svg' });
    pieceEls = state.pieces.map((piece, id) => {
      const shape = geometry(piece);
      const body = Math.max(shape.length - 1, 0.001);   // tube: tail centre to head centre
      const [headX, headY] = shape.head, [stepX, stepY] = shape.step;
      const pieceEl = svgElement('g', { class: 'a-piece', 'data-id': id, role: 'button', tabindex: 0 });
      const line = (className, dash, offset) => {
        const polyline = svgElement('polyline', { class: className, points: shape.points, 'stroke-dasharray': `${dash} 9999` });
        polyline.dataset.offset = offset;
        polyline.style.strokeDashoffset = offset;
        return polyline;
      };
      // A point `along` the arrow from the head's centre and `side` across it.
      const point = (along, side) => `${headX + stepX * along - stepY * side},${headY + stepY * along + stepX * side}`;
      const head = svgElement('polygon', {
        class: 'a-head', points: `${point(0.36, 0)} ${point(-0.08, 0.27)} ${point(-0.08, -0.27)}`,
      });
      pieceEl.append(
        line('a-halo', body, -TAIL),
        line('a-tube', body, -TAIL),
        line('a-shaft', shape.length - 1 + TAIL - 0.05, 0),
        head,
      );
      pieceEl.dataset.travel = shape.travel;
      const { row, column } = Arrows.coordinatesOf(piece.cells[0], size);
      const turns = Arrows.bends(piece, size);
      pieceEl.setAttribute('aria-label', `Arrow ${DIRECTION_NAMES[piece.dir]}, head at row ${row + 1}, column ${column + 1}` +
        (turns ? `, ${turns} bend${turns > 1 ? 's' : ''}` : ''));
      svg.appendChild(pieceEl);
      return pieceEl;
    });
    boardEl.replaceChildren(svg);
  }

  // Put a piece back where it started (no animation: transitions only run while leaving).
  function placeFlat(id, gone) {
    const pieceEl = pieceEls[id];
    pieceEl.classList.remove('leaving', 'hint');
    pieceEl.classList.toggle('gone', gone);
    for (const polyline of pieceEl.querySelectorAll('polyline')) polyline.style.strokeDashoffset = polyline.dataset.offset;
    pieceEl.querySelector('.a-head').style.transform = '';
  }

  // Slide a piece off the board: head first, along its own path.
  function leaveFlat(id) {
    const pieceEl = pieceEls[id], piece = state.pieces[id];
    if (reducedMotion.matches) { pieceEl.classList.add('gone'); return; }
    const travel = Number(pieceEl.dataset.travel);
    pieceEl.classList.add('leaving');
    pieceEl.getBoundingClientRect();   // start the transition from where it is now
    for (const polyline of pieceEl.querySelectorAll('polyline')) {
      polyline.style.strokeDashoffset = Number(polyline.dataset.offset) - travel;
    }
    pieceEl.querySelector('.a-head').style.transform =
      `translate(${Arrows.COLUMN_STEP[piece.dir] * travel}px, ${Arrows.ROW_STEP[piece.dir] * travel}px)`;
    setTimeout(() => { if (state.removed[id]) pieceEl.classList.add('gone'); }, SLIDE_MS);
  }

  const flatView = {
    build: buildFlat,
    place: placeFlat,
    refresh() {},
    leave: leaveFlat,
    el: (id) => pieceEls[id],
    shakeClass: (id) => (state.pieces[id].dir % 2 ? 'shake-x' : 'shake-y'),
  };
  const cubeView = ArrowsCube.create(boardEl, { onTap: (id) => tap(id) });

  // ---------- Board ----------

  function buildBoard() {
    owner = Arrows.ownerGrid(currentBoard());
    view = state.shape === 'cube' ? cubeView : flatView;
    view.build(currentBoard());
    hinted = -1;
  }

  function render() {
    state.pieces.forEach((piece, id) => view.place(id, state.removed[id]));
    view.refresh(state.removed);
    mistakesEl.textContent = `Mistakes: ${state.mistakes}`;
    boardEl.classList.toggle('solved', state.finished);
    timer.show();
    renderBest();
  }

  // Best-time key: `size-level` on the flat board, `cube-size-level` in 3D.
  function scoreKey() {
    const [shape, size, level] = state.size
      ? [state.shape, state.size, state.level]
      : [shapeEl.value, sizeEl.value, levelEl.value];
    return `${shape === 'cube' ? 'cube-' : ''}${size}-${level}`;
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
    const size = Number(sizeEl.value);
    const level = levelEl.value;
    const shape = shapeEl.value === 'cube' ? 'cube' : 'flat';
    setMessage('Generating…');
    setTimeout(() => {
      const board = shape === 'cube' ? Arrows.generateCube(size, level) : Arrows.generate(size, level);
      Object.assign(state, {
        size,
        shape,
        level,
        pieces: board.pieces,
        removed: board.pieces.map(() => false),
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

  // Restart an animation class on an element.
  function flash(el, className) {
    el.classList.remove(className);
    el.getBoundingClientRect();
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), 600);
  }

  function tap(id) {
    if (state.finished || state.removed[id]) return;
    const inTheWay = Arrows.blocker(currentBoard(), owner, state.removed, id);
    if (inTheWay >= 0) {
      state.mistakes++;
      mistakesEl.textContent = `Mistakes: ${state.mistakes}`;
      flash(view.el(id), view.shakeClass(id));
      flash(view.el(inTheWay), 'blocking');
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
    const mistakes = state.mistakes;
    setMessage(`Cleared in ${formatTime(ms)} with ${mistakes} mistake${mistakes === 1 ? '' : 's'}!` +
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
    const freeNow = Arrows.free(currentBoard(), state.removed, owner);
    if (!freeNow.length) return;
    state.hintsUsed = true;
    clearHint();
    hinted = freeNow[Shared.randomInt(freeNow.length)];
    view.el(hinted).classList.add('hint');
    setMessage('This one can go.');
    save();
  }

  // ---------- Buttons and pop-ups ----------

  boardEl.addEventListener('click', (e) => {
    const pieceEl = e.target.closest('.a-piece');
    if (pieceEl) tap(Number(pieceEl.dataset.id));
  });
  boardEl.addEventListener('keydown', (e) => {
    const pieceEl = e.target.closest('.a-piece');
    if (pieceEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tap(Number(pieceEl.dataset.id)); }
  });

  // The size menu lists 5–10 for the flat board and 3–10 for the cube.
  const SIZES = { flat: [5, 6, 7, 8, 9, 10], cube: [3, 4, 5, 6, 7, 8, 9, 10] };
  const DEFAULT_SIZE = { flat: 7, cube: 4 };
  function sizeOptions(shape, value) {
    const sizes = SIZES[shape];
    if (!sizes.includes(Number(value))) value = DEFAULT_SIZE[shape];
    sizeEl.replaceChildren(...sizes.map((size) => {
      const option = document.createElement('option');
      option.value = String(size);
      option.textContent = shape === 'cube' ? `${size} × ${size} × ${size}` : `${size} × ${size}`;
      return option;
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
  GameMode.preferences('a', { focus: levelEl, showOptions, inProgress, newGame });
  const showRules = GameMode.rulesPopup('a');

  document.getElementById('a-undo').addEventListener('click', undo);
  document.getElementById('a-restart').addEventListener('click', restart);
  document.getElementById('a-hint').addEventListener('click', hint);
  GameMode.undoShortcut('arrows', undo);

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
