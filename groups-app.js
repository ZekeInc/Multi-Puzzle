// Groups UI: the board, the colour boxes above it, marks (✕ / O), and the
// Preferences and Rules pop-ups. The puzzle logic is in groups.js.
(function () {
  'use strict';

  const SAVE_KEY = 'groups-save-v1';
  const EMPTY = 0, CROSS = 1, CIRCLE = 2;
  const COLOUR_COUNT = 10;

  const boardEl = document.getElementById('g-board');
  const groupsEl = document.getElementById('g-groups');
  const sizeEl = document.getElementById('g-size');
  const levelEl = document.getElementById('g-level');
  const timerEl = document.getElementById('g-timer');
  const bestEl = document.getElementById('g-best');
  const messageEl = document.getElementById('g-message');

  const state = {
    size: 0,
    level: null,    // 'easy' | 'medium' | 'hard'; null for games from before levels
    regions: [],
    solution: [],   // solution[row] = column
    colors: [],     // colors[group] = palette index
    marks: [],      // EMPTY / CROSS / CIRCLE per square
    history: [],
    finished: false,
    hintsUsed: false,
  };

  let squareEls = [];
  let squareLook = [];   // squareLook[i]: what squareEls[i] shows now, so unchanged squares are left alone
  let chipEls = [];      // chipEls[group] = its colour box above the board
  let chipLook = [];

  // ---------- Helpers ----------

  const setMessage = GameMode.message(messageEl);
  const { buzz, formatTime } = GameMode;
  const { shuffle } = Shared;

  const rowOf = (square) => Math.floor(square / state.size);
  const columnOf = (square) => square % state.size;
  const isSolutionSquare = (square) => state.solution[rowOf(square)] === columnOf(square);

  // ---------- Timer ----------

  const timer = GameMode.timer('groups', timerEl, () => state.size > 0 && !state.finished, save);

  // ---------- Saving ----------

  function save() {
    if (!state.size) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        size: state.size,
        level: state.level,
        regions: state.regions,
        solution: state.solution,
        colors: state.colors,
        marks: state.marks,
        elapsed: timer.ms(),
        finished: state.finished,
        hintsUsed: state.hintsUsed,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!saved || saved.regions.length !== saved.size * saved.size) return false;
      Object.assign(state, {
        size: saved.size, level: saved.level || null, regions: saved.regions, solution: saved.solution,
        colors: saved.colors, marks: saved.marks, finished: saved.finished, hintsUsed: !!saved.hintsUsed,
        history: [],
      });
      timer.reset(saved.elapsed);
      sizeEl.value = String(saved.size);
      if (saved.level) levelEl.value = saved.level;
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- Board ----------

  function buildBoard() {
    const size = state.size;
    boardEl.style.setProperty('--n', size);
    boardEl.replaceChildren();
    squareEls = [];
    squareLook = [];
    chipLook = [];
    for (let i = 0; i < size * size; i++) {
      const row = rowOf(i), column = columnOf(i), group = state.regions[i];
      const squareEl = document.createElement('div');
      squareEl.className = 'g-cell';
      squareEl.dataset.index = i;
      squareEl.setAttribute('role', 'gridcell');
      squareEl.style.setProperty('--fill', `var(--g${state.colors[group]})`);
      // Thick lines where neighbouring squares belong to different groups.
      if (row > 0 && state.regions[i - size] !== group) squareEl.classList.add('edge-top');
      if (column > 0 && state.regions[i - 1] !== group) squareEl.classList.add('edge-left');
      boardEl.appendChild(squareEl);
      squareEls.push(squareEl);
    }
    // One box per group, in the colour of the group, ordered by where each group
    // first appears on the board (reading order). It shows an O once the group has one.
    const order = [];
    state.regions.forEach((group) => { if (!order.includes(group)) order.push(group); });
    chipEls = [];
    groupsEl.replaceChildren(...order.map((group, k) => {
      const chip = document.createElement('span');
      chip.className = 'g-chip';
      chip.dataset.n = k + 1;
      chip.setAttribute('role', 'listitem');
      chip.style.setProperty('--fill', `var(--g${state.colors[group]})`);
      chipEls[group] = chip;
      return chip;
    }));
  }

  // Squares whose O breaks a rule, and how many Os there are.
  function findConflicts() {
    const circles = [];
    state.marks.forEach((mark, i) => { if (mark === CIRCLE) circles.push(i); });
    const breaking = new Set();
    for (let a = 0; a < circles.length; a++) {
      for (let b = a + 1; b < circles.length; b++) {
        const first = circles[a], second = circles[b];
        const rowGap = Math.abs(rowOf(first) - rowOf(second)), columnGap = Math.abs(columnOf(first) - columnOf(second));
        if (rowGap === 0 || columnGap === 0 || state.regions[first] === state.regions[second] ||
            (rowGap <= 1 && columnGap <= 1)) {
          breaking.add(first);
          breaking.add(second);
        }
      }
    }
    return { breaking, circleCount: circles.length };
  }

  function render() {
    const { breaking } = findConflicts();
    squareEls.forEach((squareEl, i) => {
      const mark = state.marks[i];
      const look = mark * 2 + breaking.has(i);
      if (look === squareLook[i]) return;
      squareLook[i] = look;
      squareEl.classList.toggle('cross', mark === CROSS);
      squareEl.classList.toggle('circle', mark === CIRCLE);
      squareEl.classList.toggle('conflict', breaking.has(i));
      squareEl.setAttribute('aria-label', `Row ${rowOf(i) + 1}, column ${columnOf(i) + 1}` +
        (mark === CIRCLE ? ', O' : mark === CROSS ? ', crossed out' : ''));
    });
    boardEl.classList.toggle('solved', state.finished);
    // Colour boxes: O when the group has an O; red when any of its Os breaks a
    // rule (two in the group, or sharing a row or column with, or touching, another O).
    const circlesIn = new Array(state.size).fill(0);
    const groupBreaks = new Array(state.size).fill(false);
    state.marks.forEach((mark, i) => {
      if (mark !== CIRCLE) return;
      circlesIn[state.regions[i]]++;
      if (breaking.has(i)) groupBreaks[state.regions[i]] = true;
    });
    chipEls.forEach((chip, group) => {
      const look = circlesIn[group] * 2 + groupBreaks[group];
      if (look === chipLook[group]) return;
      chipLook[group] = look;
      chip.classList.toggle('done', circlesIn[group] > 0);
      chip.classList.toggle('conflict', groupBreaks[group]);
      chip.setAttribute('aria-label', `Group ${chip.dataset.n}: ` +
        (circlesIn[group] > 1 ? `${circlesIn[group]} Os` : circlesIn[group] ? 'has its O' : 'no O yet') +
        (groupBreaks[group] ? ', breaks a rule' : ''));
    });
    groupsEl.classList.toggle('solved', state.finished);
    timer.show();
    renderBest();
  }

  // Best-time key: size and level, e.g. "7-hard" (just the size for games from before levels).
  function scoreKey() {
    if (!state.size) return `${sizeEl.value}-${levelEl.value}`;
    return state.level ? `${state.size}-${state.level}` : String(state.size);
  }

  function renderBest() {
    bestEl.textContent = Scores.bestLabel('groups', scoreKey());
  }
  window.addEventListener('scoreschange', renderBest);

  // ---------- Game flow ----------

  function newGame() {
    const size = Number(sizeEl.value);
    const level = levelEl.value;
    setMessage('Generating…');
    setTimeout(() => {
      let puzzle;
      try {
        puzzle = Groups.generate(size, level);
      } catch (err) {
        setMessage(`Couldn't create a puzzle (${err.message}). Tap New to try again.`, 'bad');
        return;
      }
      const palette = shuffle([...Array(COLOUR_COUNT).keys()]);
      Object.assign(state, {
        size,
        level,
        regions: puzzle.regions,
        solution: puzzle.solution,
        colors: palette.slice(0, size),
        marks: new Array(size * size).fill(EMPTY),
        history: [],
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

  function inProgress() {
    return !state.finished && state.marks.some((mark) => mark !== EMPTY);
  }

  function snapshot() {
    state.history.push(state.marks.slice());
    if (state.history.length > 300) state.history.shift();
  }

  function afterChange() {
    render();
    const { breaking, circleCount } = findConflicts();
    if (circleCount === state.size && breaking.size === 0) finish();
    save();
  }

  function finish() {
    timer.pause();
    state.finished = true;
    // Fill every remaining square with ✕ for a tidy finished board.
    state.marks = state.marks.map((mark) => (mark === CIRCLE ? CIRCLE : CROSS));
    render();
    buzz([60, 60, 60]);
    const ms = timer.ms();
    const result = Scores.record('groups', scoreKey(), ms, !state.hintsUsed);
    setMessage(`Solved in ${formatTime(ms)}!${Scores.verdict(result, state.hintsUsed)}`, 'win');
    renderBest();
  }

  function undo() {
    if (state.finished) return;
    const previous = state.history.pop();
    if (!previous) return setMessage('Nothing to undo.');
    state.marks = previous;
    setMessage('');
    afterChange();
  }

  function clearBoard() {
    if (state.finished || !inProgress()) return;
    if (!confirm('Clear all your marks?')) return;
    snapshot();
    state.marks.fill(EMPTY);
    setMessage('');
    afterChange();
  }

  function check() {
    if (state.finished) return;
    let wrongCircles = 0, wrongCrosses = 0;
    state.marks.forEach((mark, i) => {
      if (mark === CIRCLE && !isSolutionSquare(i)) wrongCircles++;
      if (mark === CROSS && isSolutionSquare(i)) wrongCrosses++;
    });
    if (!wrongCircles && !wrongCrosses) {
      const left = state.size - state.marks.filter((mark) => mark === CIRCLE).length;
      setMessage(`No mistakes so far. ${left} O${left === 1 ? '' : 's'} to go.`);
    } else {
      const parts = [];
      if (wrongCircles) parts.push(`${wrongCircles} O${wrongCircles > 1 ? 's' : ''} in the wrong place`);
      if (wrongCrosses) parts.push(`${wrongCrosses} ✕ on a square that needs an O`);
      setMessage(parts.join(' and ') + '.', 'bad');
    }
  }

  function hint() {
    if (state.finished) return;
    snapshot();
    state.hintsUsed = true;
    // First fix a wrong O, then a ✕ that covers an O, otherwise reveal one O.
    const wrongCircle = state.marks.findIndex((mark, i) => mark === CIRCLE && !isSolutionSquare(i));
    if (wrongCircle >= 0) {
      state.marks[wrongCircle] = CROSS;
      setMessage(`Row ${rowOf(wrongCircle) + 1}: that O was in the wrong place.`);
      return afterChange();
    }
    const rowsLeft = shuffle([...Array(state.size).keys()])
      .filter((row) => state.marks[row * state.size + state.solution[row]] !== CIRCLE);
    if (!rowsLeft.length) { state.history.pop(); return; }
    const row = rowsLeft[0];
    state.marks[row * state.size + state.solution[row]] = CIRCLE;
    setMessage(`Placed an O in row ${row + 1}.`);
    afterChange();
  }

  // ---------- Touch / mouse input ----------
  // Tap cycles empty → ✕ → O → empty. Dragging paints ✕ on empty squares,
  // or erases ✕ if the drag started on a ✕.

  let drag = null;
  let boardBox = null;   // the board's position, measured when a touch starts

  // Square under a point, worked out from the board's position (cheaper than
  // asking the browser what is under the finger on every move).
  function squareFromPoint(x, y) {
    const size = state.size;
    const column = Math.floor((x - boardBox.left) / boardBox.step), row = Math.floor((y - boardBox.top) / boardBox.step);
    return row >= 0 && row < size && column >= 0 && column < size ? row * size + column : -1;
  }

  function paint(square) {
    if (square < 0 || drag.visited.has(square)) return;
    drag.visited.add(square);
    const mark = state.marks[square];
    if (drag.erase ? mark === CROSS : mark === EMPTY) {
      state.marks[square] = drag.erase ? EMPTY : CROSS;
      drag.changed = true;
      render();
    }
  }

  boardEl.addEventListener('pointerdown', (e) => {
    if (state.finished || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const rect = boardEl.getBoundingClientRect();
    const border = boardEl.clientLeft;
    boardBox = { left: rect.left + border, top: rect.top + border, step: boardEl.clientWidth / state.size };
    const square = squareFromPoint(e.clientX, e.clientY);
    if (square < 0) return;
    e.preventDefault();
    boardEl.setPointerCapture(e.pointerId);
    drag = {
      start: square, moved: false, changed: false,
      erase: state.marks[square] === CROSS, visited: new Set(), before: state.marks.slice(),
    };
  });

  boardEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const square = squareFromPoint(e.clientX, e.clientY);
    if (square < 0 || (square === drag.start && !drag.moved)) return;
    if (!drag.moved) {
      drag.moved = true;
      paint(drag.start);
    }
    paint(square);
  });

  function endDrag() {
    if (!drag) return;
    const ended = drag;
    drag = null;
    if (!ended.moved) {
      state.history.push(ended.before);
      state.marks[ended.start] = (state.marks[ended.start] + 1) % 3;
      setMessage('');
      afterChange();
    } else if (ended.changed) {
      state.history.push(ended.before);
      setMessage('');
      afterChange();
    }
  }
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);

  // ---------- Buttons and pop-ups ----------

  // Set the menus to the current game's size and level.
  function showOptions() {
    if (state.size) sizeEl.value = String(state.size);
    if (state.level) levelEl.value = state.level;
  }
  GameMode.preferences('g', { focus: levelEl, showOptions, inProgress, newGame });
  const showRules = GameMode.rulesPopup('g');

  document.getElementById('g-undo').addEventListener('click', undo);
  document.getElementById('g-clear').addEventListener('click', clearBoard);
  document.getElementById('g-check').addEventListener('click', check);
  document.getElementById('g-hint').addEventListener('click', hint);
  GameMode.undoShortcut('groups', undo);

  // ---------- Start ----------

  if (load()) {
    buildBoard();
    render();
    if (state.finished) setMessage('Tap New to play again.');
    else timer.start();
  } else {
    // First time here: make a puzzle (only once the tab is opened, so the
    // other games start faster) and show the rules.
    renderBest();
    GameMode.whenShown('groups', () => { newGame(); showRules(true); });
  }
})();
