(function () {
  'use strict';

  const SAVE_KEY = 'groups-save-v1';
  const EMPTY = 0, CROSS = 1, CIRCLE = 2;
  const COLOR_COUNT = 10;
  const isActive = () => GameMode.isActive('groups');

  const boardEl = document.getElementById('g-board');
  const groupsEl = document.getElementById('g-groups');
  const sizeEl = document.getElementById('g-size');
  const levelEl = document.getElementById('g-level');
  const timerEl = document.getElementById('g-timer');
  const bestEl = document.getElementById('g-best');
  const messageEl = document.getElementById('g-message');
  const rulesBtn = document.getElementById('g-rules');
  const rulesEl = document.getElementById('g-rules-text');

  const state = {
    size: 0,
    level: null,    // 'easy' | 'medium' | 'hard'; null for games from before levels
    regions: [],
    solution: [],   // solution[row] = column
    colors: [],     // colors[group] = palette index
    marks: [],      // EMPTY / CROSS / CIRCLE per cell
    history: [],
    finished: false,
    hintsUsed: false,
  };

  let cells = [];
  let shown = [];   // shown[i]: what cells[i] currently displays, so unchanged squares are left alone
  let chips = [];   // chips[group] = its colour box above the board
  let chipShown = [];

  // ---------- Helpers ----------

  const setMessage = GameMode.message(messageEl);
  const { buzz, formatTime } = GameMode;

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
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d || d.regions.length !== d.size * d.size) return false;
      Object.assign(state, {
        size: d.size, level: d.level || null, regions: d.regions, solution: d.solution, colors: d.colors,
        marks: d.marks, finished: d.finished, hintsUsed: !!d.hintsUsed, history: [],
      });
      timer.reset(d.elapsed);
      sizeEl.value = String(d.size);
      if (d.level) levelEl.value = d.level;
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
    shown = [];
    chipShown = [];
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
    // One box per group, in the colour of the group, ordered by where each group
    // first appears on the board (reading order). It shows an O once the group has one.
    const order = [];
    state.regions.forEach((g) => { if (!order.includes(g)) order.push(g); });
    chips = [];
    groupsEl.replaceChildren(...order.map((g, k) => {
      const chip = document.createElement('span');
      chip.className = 'g-chip';
      chip.dataset.n = k + 1;
      chip.setAttribute('role', 'listitem');
      chip.style.setProperty('--fill', `var(--g${state.colors[g]})`);
      chips[g] = chip;
      return chip;
    }));
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
      const look = m * 2 + bad.has(i);
      if (look === shown[i]) return;
      shown[i] = look;
      cell.classList.toggle('cross', m === CROSS);
      cell.classList.toggle('circle', m === CIRCLE);
      cell.classList.toggle('conflict', bad.has(i));
      cell.setAttribute('aria-label',
        `Row ${rowOf(i) + 1}, column ${colOf(i) + 1}${m === CIRCLE ? ', O' : m === CROSS ? ', crossed out' : ''}`);
    });
    boardEl.classList.toggle('solved', state.finished);
    // Colour boxes: O when the group has an O; red when any of its Os breaks a
    // rule (two in the group, or sharing a row or column with, or touching, another O).
    const os = new Array(state.size).fill(0);
    const wrong = new Array(state.size).fill(false);
    state.marks.forEach((m, i) => {
      if (m !== CIRCLE) return;
      os[state.regions[i]]++;
      if (bad.has(i)) wrong[state.regions[i]] = true;
    });
    chips.forEach((chip, g) => {
      const look = os[g] * 2 + wrong[g];
      if (look === chipShown[g]) return;
      chipShown[g] = look;
      chip.classList.toggle('done', os[g] > 0);
      chip.classList.toggle('conflict', wrong[g]);
      chip.setAttribute('aria-label', `Group ${chip.dataset.n}: ` +
        (os[g] > 1 ? `${os[g]} Os` : os[g] ? 'has its O' : 'no O yet') +
        (wrong[g] ? ', breaks a rule' : ''));
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
    const n = Number(sizeEl.value);
    const level = levelEl.value;
    setMessage('Generating…');
    setTimeout(() => {
      let p;
      try {
        p = Groups.generate(n, level);
      } catch (err) {
        setMessage(`Couldn't create a puzzle (${err.message}). Tap New to try again.`, 'bad');
        return;
      }
      const palette = shuffle([...Array(COLOR_COUNT).keys()]);
      Object.assign(state, {
        size: n,
        level,
        regions: p.regions,
        solution: p.solution,
        colors: palette.slice(0, n),
        marks: new Array(n * n).fill(EMPTY),
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
    timer.pause();
    state.finished = true;
    // Fill every remaining square with ✕ for a tidy finished board.
    state.marks = state.marks.map((m) => (m === CIRCLE ? CIRCLE : CROSS));
    render();
    buzz([60, 60, 60]);
    const ms = timer.ms();
    const result = Scores.record('groups', scoreKey(), ms, !state.hintsUsed);
    setMessage(`Solved in ${formatTime(ms)}!${Scores.verdict(result, state.hintsUsed)}`, 'win');
    renderBest();
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
    state.hintsUsed = true;
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
  let box = null;   // the board's position, measured when a touch starts

  // Square under a point, worked out from the board's position (cheaper than
  // asking the browser what is under the finger on every move).
  function cellFromPoint(x, y) {
    const n = state.size;
    const c = Math.floor((x - box.left) / box.step), r = Math.floor((y - box.top) / box.step);
    return r >= 0 && r < n && c >= 0 && c < n ? r * n + c : -1;
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
    const rect = boardEl.getBoundingClientRect();
    const border = boardEl.clientLeft;
    box = { left: rect.left + border, top: rect.top + border, step: boardEl.clientWidth / state.size };
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

  document.getElementById('g-new').addEventListener('click', () => {
    if (!confirmNew()) return;
    showOptions();   // New keeps the current game's preferences
    newGame();
  });
  // ---------- Preferences pop-up ----------
  // Menu changes only take effect when "New puzzle" is tapped; Cancel puts them back.

  const prefsEl = document.getElementById('g-prefs-modal');
  const prefsBtn = document.getElementById('g-prefs');

  // Set the menus to the current game's size and level.
  function showOptions() {
    if (state.size) sizeEl.value = String(state.size);
    if (state.level) levelEl.value = state.level;
  }
  function cancelPrefs() {
    showOptions();
    showPrefs(false);
  }
  const showPrefs = GameMode.popup(prefsEl, prefsBtn, levelEl, cancelPrefs);
  prefsBtn.addEventListener('click', () => { showOptions(); showPrefs(true); });
  document.getElementById('g-prefs-cancel').addEventListener('click', cancelPrefs);
  document.getElementById('g-prefs-apply').addEventListener('click', () => {
    if (!confirmNew()) return;
    showPrefs(false);
    newGame();
  });
  document.getElementById('g-undo').addEventListener('click', undo);
  document.getElementById('g-clear').addEventListener('click', clearBoard);
  document.getElementById('g-check').addEventListener('click', check);
  document.getElementById('g-hint').addEventListener('click', hint);
  const showRules = GameMode.popup(rulesEl, rulesBtn, document.getElementById('g-rules-close'));
  rulesBtn.addEventListener('click', () => showRules(true));
  document.getElementById('g-rules-close').addEventListener('click', () => showRules(false));

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
    // First time here: make a puzzle (only once the tab is opened, so the
    // other games start faster) and show the rules.
    renderBest();
    GameMode.whenShown('groups', () => { newGame(); showRules(true); });
  }
})();
