(function () {
  'use strict';

  const SAVE_KEY = 'groups-save-v1';
  const EMPTY = 0, CROSS = 1, CIRCLE = 2;
  const COLOR_COUNT = 10;
  const isActive = () => GameMode.isActive('groups');

  const boardEl = document.getElementById('g-board');
  const sizeEl = document.getElementById('g-size');
  const timerEl = document.getElementById('g-timer');
  const messageEl = document.getElementById('g-message');
  const rulesBtn = document.getElementById('g-rules');
  const rulesEl = document.getElementById('g-rules-text');

  const state = {
    size: 0,
    regions: [],
    solution: [],   // solution[row] = column
    colors: [],     // colors[group] = palette index
    marks: [],      // EMPTY / CROSS / CIRCLE per cell
    history: [],
    elapsed: 0,
    runStart: 0,
    finished: false,
  };

  let cells = [];

  // ---------- Helpers ----------

  function setMessage(text, cls) {
    messageEl.textContent = text;
    messageEl.className = 'message' + (cls ? ' ' + cls : '');
  }

  function buzz(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const rowOf = (i) => Math.floor(i / state.size);
  const colOf = (i) => i % state.size;
  const isSolutionCell = (i) => state.solution[rowOf(i)] === colOf(i);

  // ---------- Timer ----------

  function elapsedMs() {
    return state.elapsed + (state.runStart ? Date.now() - state.runStart : 0);
  }
  function startTimer() {
    if (!state.runStart && !state.finished && state.size) state.runStart = Date.now();
  }
  function pauseTimer() {
    if (state.runStart) {
      state.elapsed += Date.now() - state.runStart;
      state.runStart = 0;
    }
  }
  function formatTime(ms) {
    const secs = Math.floor(ms / 1000);
    return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  }

  setInterval(() => { timerEl.textContent = formatTime(elapsedMs()); }, 500);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pauseTimer(); save(); }
    else if (isActive()) startTimer();
  });
  window.addEventListener('pagehide', save);
  window.addEventListener('modechange', () => {
    if (isActive()) startTimer();
    else { pauseTimer(); save(); }
  });

  // ---------- Saving ----------

  function save() {
    if (!state.size) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        size: state.size,
        regions: state.regions,
        solution: state.solution,
        colors: state.colors,
        marks: state.marks,
        elapsed: elapsedMs(),
        finished: state.finished,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d || d.regions.length !== d.size * d.size) return false;
      Object.assign(state, {
        size: d.size, regions: d.regions, solution: d.solution, colors: d.colors,
        marks: d.marks, elapsed: d.elapsed, finished: d.finished,
        history: [], runStart: 0,
      });
      sizeEl.value = String(d.size);
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- Board ----------

  function buildBoard() {
    const n = state.size;
    boardEl.style.setProperty('--n', n);
    boardEl.replaceChildren();
    cells = [];
    for (let i = 0; i < n * n; i++) {
      const r = rowOf(i), c = colOf(i), g = state.regions[i];
      const cell = document.createElement('div');
      cell.className = 'g-cell';
      cell.dataset.index = i;
      cell.setAttribute('role', 'gridcell');
      cell.style.setProperty('--fill', `var(--g${state.colors[g]})`);
      // Thick lines where neighbouring squares belong to different groups.
      if (r > 0 && state.regions[i - n] !== g) cell.classList.add('edge-top');
      if (c > 0 && state.regions[i - 1] !== g) cell.classList.add('edge-left');
      boardEl.appendChild(cell);
      cells.push(cell);
    }
  }

  // Indices of Os that break a rule.
  function findConflicts() {
    const n = state.size;
    const circles = [];
    state.marks.forEach((m, i) => { if (m === CIRCLE) circles.push(i); });
    const bad = new Set();
    for (let a = 0; a < circles.length; a++) {
      for (let b = a + 1; b < circles.length; b++) {
        const i = circles[a], j = circles[b];
        const ri = rowOf(i), ci = colOf(i), rj = rowOf(j), cj = colOf(j);
        if (ri === rj || ci === cj || state.regions[i] === state.regions[j] ||
            (Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1)) {
          bad.add(i);
          bad.add(j);
        }
      }
    }
    return { bad, count: circles.length, n };
  }

  function render() {
    const { bad } = findConflicts();
    cells.forEach((cell, i) => {
      const m = state.marks[i];
      cell.classList.toggle('cross', m === CROSS);
      cell.classList.toggle('circle', m === CIRCLE);
      cell.classList.toggle('conflict', bad.has(i));
      cell.setAttribute('aria-label',
        `Row ${rowOf(i) + 1}, column ${colOf(i) + 1}${m === CIRCLE ? ', O' : m === CROSS ? ', crossed out' : ''}`);
    });
    boardEl.classList.toggle('solved', state.finished);
    timerEl.textContent = formatTime(elapsedMs());
  }

  // ---------- Game flow ----------

  function newGame() {
    const n = Number(sizeEl.value);
    setMessage('Generating…');
    setTimeout(() => {
      const p = Groups.generate(n);
      const palette = shuffle([...Array(COLOR_COUNT).keys()]);
      Object.assign(state, {
        size: n,
        regions: p.regions,
        solution: p.solution,
        colors: palette.slice(0, n),
        marks: new Array(n * n).fill(EMPTY),
        history: [],
        elapsed: 0,
        runStart: 0,
        finished: false,
      });
      if (isActive()) startTimer();
      buildBoard();
      render();
      setMessage('');
      save();
    }, 20);
  }

  function inProgress() {
    return !state.finished && state.marks.some((m) => m !== EMPTY);
  }

  function snapshot() {
    state.history.push(state.marks.slice());
    if (state.history.length > 300) state.history.shift();
  }

  function afterChange() {
    render();
    const { bad, count, n } = findConflicts();
    if (count === n && bad.size === 0) finish();
    save();
  }

  function finish() {
    pauseTimer();
    state.finished = true;
    // Fill every remaining square with ✕ for a tidy finished board.
    state.marks = state.marks.map((m) => (m === CIRCLE ? CIRCLE : CROSS));
    render();
    buzz([60, 60, 60]);
    setMessage(`Solved in ${formatTime(state.elapsed)}! 🎉`, 'win');
  }

  function undo() {
    if (state.finished) return;
    const prev = state.history.pop();
    if (!prev) return setMessage('Nothing to undo.');
    state.marks = prev;
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
    let wrongO = 0, wrongX = 0;
    state.marks.forEach((m, i) => {
      if (m === CIRCLE && !isSolutionCell(i)) wrongO++;
      if (m === CROSS && isSolutionCell(i)) wrongX++;
    });
    if (!wrongO && !wrongX) {
      const left = state.size - state.marks.filter((m) => m === CIRCLE).length;
      setMessage(`No mistakes so far. ${left} O${left === 1 ? '' : 's'} to go.`);
    } else {
      const parts = [];
      if (wrongO) parts.push(`${wrongO} O${wrongO > 1 ? 's' : ''} in the wrong place`);
      if (wrongX) parts.push(`${wrongX} ✕ on a square that needs an O`);
      setMessage(parts.join(' and ') + '.', 'bad');
    }
  }

  function hint() {
    if (state.finished) return;
    snapshot();
    // First fix a wrong O, then a ✕ that covers an O, otherwise reveal one O.
    const wrongO = state.marks.findIndex((m, i) => m === CIRCLE && !isSolutionCell(i));
    if (wrongO >= 0) {
      state.marks[wrongO] = CROSS;
      setMessage(`Row ${rowOf(wrongO) + 1}: that O was in the wrong place.`);
      return afterChange();
    }
    const rows = shuffle([...Array(state.size).keys()])
      .filter((r) => state.marks[r * state.size + state.solution[r]] !== CIRCLE);
    if (!rows.length) { state.history.pop(); return; }
    const i = rows[0] * state.size + state.solution[rows[0]];
    state.marks[i] = CIRCLE;
    setMessage(`Placed an O in row ${rows[0] + 1}.`);
    afterChange();
  }

  // ---------- Touch / mouse input ----------
  // Tap cycles empty → ✕ → O → empty. Dragging paints ✕ on empty squares,
  // or erases ✕ if the drag started on a ✕.

  let drag = null;

  function cellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest('.g-cell');
    return cell && boardEl.contains(cell) ? Number(cell.dataset.index) : -1;
  }

  function paint(i) {
    if (i < 0 || drag.visited.has(i)) return;
    drag.visited.add(i);
    const m = state.marks[i];
    if (drag.erase ? m === CROSS : m === EMPTY) {
      state.marks[i] = drag.erase ? EMPTY : CROSS;
      drag.changed = true;
      render();
    }
  }

  boardEl.addEventListener('pointerdown', (e) => {
    if (state.finished || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const i = cellFromPoint(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    boardEl.setPointerCapture(e.pointerId);
    drag = {
      start: i, moved: false, changed: false,
      erase: state.marks[i] === CROSS, visited: new Set(), before: state.marks.slice(),
    };
  });

  boardEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const i = cellFromPoint(e.clientX, e.clientY);
    if (i < 0 || (i === drag.start && !drag.moved)) return;
    if (!drag.moved) {
      drag.moved = true;
      paint(drag.start);
    }
    paint(i);
  });

  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) {
      state.history.push(d.before);
      state.marks[d.start] = (state.marks[d.start] + 1) % 3;
      setMessage('');
      afterChange();
    } else if (d.changed) {
      state.history.push(d.before);
      setMessage('');
      afterChange();
    }
  }
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);

  // ---------- Buttons ----------

  function confirmNew() {
    return !inProgress() || confirm('Start a new puzzle? Your current progress will be lost.');
  }

  document.getElementById('g-new').addEventListener('click', () => { if (confirmNew()) newGame(); });
  sizeEl.addEventListener('change', () => {
    if (confirmNew()) newGame();
    else sizeEl.value = String(state.size);
  });
  document.getElementById('g-undo').addEventListener('click', undo);
  document.getElementById('g-clear').addEventListener('click', clearBoard);
  document.getElementById('g-check').addEventListener('click', check);
  document.getElementById('g-hint').addEventListener('click', hint);
  function showRules(show) {
    rulesEl.hidden = !show;
    rulesBtn.setAttribute('aria-expanded', String(show));
    if (show) document.getElementById('g-rules-close').focus();
  }
  rulesBtn.addEventListener('click', () => showRules(true));
  document.getElementById('g-rules-close').addEventListener('click', () => showRules(false));
  rulesEl.addEventListener('click', (e) => { if (e.target === rulesEl) showRules(false); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !rulesEl.hidden) return showRules(false);
    if (isActive() && (e.ctrlKey || e.metaKey) && e.key === 'z') undo();
  });

  // ---------- Start ----------

  if (load()) {
    buildBoard();
    render();
    if (state.finished) setMessage('Tap New to play again.');
    else if (isActive()) startTimer();
  } else {
    newGame();
    // Show the rules the first time someone opens this mode.
    if (isActive()) showRules(true);
    else window.addEventListener('modechange', function first() {
      if (!isActive()) return;
      window.removeEventListener('modechange', first);
      if (!state.marks.some((m) => m !== EMPTY)) showRules(true);
    });
  }
})();
