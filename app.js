(function () {
  'use strict';

  const SAVE_KEY = 'sudoku-save-v1';
  const isActive = () => GameMode.isActive('sudoku');

  const boardEl = document.getElementById('board');
  const numpadEl = document.getElementById('numpad');
  const messageEl = document.getElementById('message');
  const timerEl = document.getElementById('timer');
  const mistakesEl = document.getElementById('mistakes');
  const bestEl = document.getElementById('best');
  const difficultyEl = document.getElementById('difficulty');
  const notesBtn = document.getElementById('notes-toggle');
  const notesStateEl = document.getElementById('notes-state');

  const state = {
    puzzle: [],
    solution: [],
    board: [],
    notes: [],
    history: [],
    selected: -1,
    notesMode: false,
    mistakes: 0,
    finished: false,
    hintsUsed: false,
    difficulty: 'medium',
  };

  // ---------- Build the board and number pad ----------

  const cells = [];
  const shown = [];   // shown[i]: what cells[i] currently displays, so unchanged squares are left alone
  for (let i = 0; i < 81; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.setAttribute('role', 'gridcell');
    const row = Math.floor(i / 9);
    const col = i % 9;
    if (col === 2 || col === 5) cell.classList.add('box-right');
    if (row === 2 || row === 5) cell.classList.add('box-bottom');
    cell.addEventListener('click', () => select(i));
    boardEl.appendChild(cell);
    cells.push(cell);
  }

  const keys = [];
  for (let n = 1; n <= 9; n++) {
    const btn = document.createElement('button');
    btn.textContent = n;
    btn.setAttribute('aria-label', `Enter ${n}`);
    btn.addEventListener('click', () => input(n));
    numpadEl.appendChild(btn);
    keys.push(btn);
  }

  // ---------- Helpers ----------

  const setMessage = GameMode.message(messageEl);
  const { buzz, formatTime } = GameMode;

  function isGiven(i) {
    return state.puzzle[i] !== 0;
  }

  function sameUnit(a, b) {
    const ra = Math.floor(a / 9), ca = a % 9;
    const rb = Math.floor(b / 9), cb = b % 9;
    return ra === rb || ca === cb ||
      (Math.floor(ra / 3) === Math.floor(rb / 3) && Math.floor(ca / 3) === Math.floor(cb / 3));
  }

  // ---------- Timer (runs only while this tab shows and the app is in front) ----------

  const timer = GameMode.timer('sudoku', timerEl, () => state.puzzle.length > 0 && !state.finished, save);

  // ---------- Saving progress ----------

  function save() {
    if (!state.puzzle.length) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        puzzle: state.puzzle,
        solution: state.solution,
        board: state.board,
        notes: state.notes.map((s) => [...s]),
        mistakes: state.mistakes,
        elapsed: timer.ms(),
        finished: state.finished,
        hintsUsed: state.hintsUsed,
        difficulty: state.difficulty,
      }));
    } catch (e) { /* storage unavailable: progress just isn't kept */ }
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!data || data.puzzle.length !== 81) return false;
      state.puzzle = data.puzzle;
      state.solution = data.solution;
      state.board = data.board;
      state.notes = data.notes.map((a) => new Set(a));
      state.mistakes = data.mistakes;
      timer.reset(data.elapsed);
      state.finished = data.finished;
      state.hintsUsed = !!data.hintsUsed;
      state.difficulty = data.difficulty;
      state.history = [];
      difficultyEl.value = data.difficulty;
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- Game flow ----------

  function newGame() {
    setMessage('Generating…');
    // Defer so the message paints before generation runs.
    setTimeout(() => {
      const { puzzle, solution } = Sudoku.generate(difficultyEl.value);
      state.puzzle = puzzle;
      state.solution = solution;
      state.board = puzzle.slice();
      state.notes = Array.from({ length: 81 }, () => new Set());
      state.history = [];
      state.selected = -1;
      state.mistakes = 0;
      state.finished = false;
      state.hintsUsed = false;
      state.difficulty = difficultyEl.value;
      timer.reset(0);
      timer.start();
      setMessage('');
      render();
      save();
    }, 20);
  }

  function inProgress() {
    return !state.finished && state.board.some((v, i) => v !== state.puzzle[i]);
  }

  function select(i) {
    state.selected = i;
    render();
  }

  function pushHistory(i) {
    state.history.push({ i, value: state.board[i], notes: [...state.notes[i]] });
    if (state.history.length > 200) state.history.shift();
  }

  function input(n) {
    const i = state.selected;
    if (i < 0) return setMessage('Tap a square first.');
    if (state.finished || isGiven(i)) return;

    if (state.notesMode) {
      if (state.board[i] !== 0) return;
      pushHistory(i);
      const notes = state.notes[i];
      notes.has(n) ? notes.delete(n) : notes.add(n);
    } else {
      if (state.board[i] === n) return;
      pushHistory(i);
      state.board[i] = n;
      state.notes[i].clear();
      if (n !== state.solution[i]) {
        state.mistakes++;
        buzz(80);
      } else {
        clearRelatedNotes(i, n);
      }
    }
    setMessage('');
    render();
    checkWin();
    save();
  }

  function clearRelatedNotes(i, n) {
    for (let j = 0; j < 81; j++) if (sameUnit(i, j)) state.notes[j].delete(n);
  }

  function erase() {
    const i = state.selected;
    if (i < 0 || state.finished || isGiven(i)) return;
    if (state.board[i] === 0 && state.notes[i].size === 0) return;
    pushHistory(i);
    state.board[i] = 0;
    state.notes[i].clear();
    render();
    save();
  }

  function undo() {
    if (state.finished) return;
    const last = state.history.pop();
    if (!last) return setMessage('Nothing to undo.');
    state.board[last.i] = last.value;
    state.notes[last.i] = new Set(last.notes);
    state.selected = last.i;
    setMessage('');
    render();
    save();
  }

  function hint() {
    if (state.finished) return;
    let i = state.selected;
    if (i < 0 || isGiven(i) || state.board[i] === state.solution[i]) {
      const candidates = [];
      for (let j = 0; j < 81; j++) if (state.board[j] !== state.solution[j]) candidates.push(j);
      if (!candidates.length) return;
      i = candidates[Math.floor(Math.random() * candidates.length)];
    }
    pushHistory(i);
    state.hintsUsed = true;
    state.board[i] = state.solution[i];
    state.notes[i].clear();
    clearRelatedNotes(i, state.solution[i]);
    state.selected = i;
    render();
    checkWin();
    save();
  }

  function check() {
    if (state.finished) return;
    const wrong = state.board.filter((v, i) => v !== 0 && v !== state.solution[i]).length;
    const empty = state.board.filter((v) => v === 0).length;
    if (wrong) setMessage(`${wrong} incorrect square${wrong > 1 ? 's' : ''}.`, 'bad');
    else setMessage(`Looking good! ${empty} square${empty === 1 ? '' : 's'} left.`);
  }

  function solveAll() {
    if (state.finished) return;
    if (!confirm('Reveal the solution? This ends the current game.')) return;
    state.board = state.solution.slice();
    state.notes.forEach((s) => s.clear());
    finish(false);
  }

  function checkWin() {
    if (state.board.every((v, i) => v === state.solution[i])) finish(true);
  }

  function finish(won) {
    timer.pause();
    state.finished = true;
    render();
    save();
    if (won) {
      buzz([60, 60, 60]);
      const ms = timer.ms();
      const result = Scores.record('sudoku', state.difficulty, ms, !state.hintsUsed);
      setMessage(`Solved in ${formatTime(ms)}!${Scores.verdict(result, state.hintsUsed)}`, 'win');
    } else {
      setMessage('Solution revealed. Tap New to play again.');
    }
  }

  function toggleNotes() {
    state.notesMode = !state.notesMode;
    notesBtn.setAttribute('aria-pressed', String(state.notesMode));
    notesStateEl.textContent = state.notesMode ? 'on' : 'off';
  }

  // ---------- Rendering ----------

  function render() {
    const sel = state.selected;
    const selVal = sel >= 0 ? state.board[sel] : 0;
    const conflicts = Sudoku.findConflicts(state.board);

    for (let i = 0; i < 81; i++) {
      const cell = cells[i];
      const v = state.board[i];
      const given = isGiven(i);

      cell.classList.toggle('given', given);
      cell.classList.toggle('selected', i === sel);
      cell.classList.toggle('related', sel >= 0 && i !== sel && sameUnit(i, sel));
      cell.classList.toggle('same', selVal !== 0 && v === selVal && i !== sel);
      const wrong = !given && v !== 0 && v !== state.solution[i];
      cell.classList.toggle('error', wrong || (conflicts.has(i) && !given));

      // A number, a 3 × 3 grid of notes, or nothing. Only rebuilt when it changes.
      const notes = state.notes[i];
      const content = v ? String(v) : notes.size ? 'n' + [...notes].sort().join('') : '';
      if (content === shown[i]) continue;
      shown[i] = content;
      if (v || !notes.size) {
        cell.textContent = content;
      } else {
        const grid = document.createElement('div');
        grid.className = 'notes';
        for (let n = 1; n <= 9; n++) {
          const span = document.createElement('span');
          span.textContent = notes.has(n) ? n : '';
          grid.appendChild(span);
        }
        cell.replaceChildren(grid);
      }
    }

    // Fade numbers that have all 9 placed correctly.
    const counts = new Array(10).fill(0);
    state.board.forEach((v, i) => { if (v && v === state.solution[i]) counts[v]++; });
    keys.forEach((btn, k) => btn.classList.toggle('done', counts[k + 1] === 9));

    mistakesEl.textContent = `Mistakes: ${state.mistakes}`;
    timer.show();
    renderBest();
  }

  function renderBest() {
    bestEl.textContent = Scores.bestLabel('sudoku', state.difficulty);
  }
  window.addEventListener('scoreschange', renderBest);

  // ---------- Input wiring ----------

  document.addEventListener('keydown', (e) => {
    if (!isActive() || e.target.tagName === 'SELECT') return;
    if (e.key >= '1' && e.key <= '9') return input(Number(e.key));
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') return erase();
    if (e.key === 'n' || e.key === 'N') return toggleNotes();
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') return undo();
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (e.key in moves) {
      e.preventDefault();
      const i = state.selected < 0 ? 0 : state.selected;
      const [dr, dc] = moves[e.key];
      const r = (Math.floor(i / 9) + dr + 9) % 9;
      const c = (i % 9 + dc + 9) % 9;
      select(r * 9 + c);
    }
  });

  document.getElementById('new-game').addEventListener('click', () => {
    if (inProgress() && !confirm('Start a new game? Your current progress will be lost.')) return;
    newGame();
  });
  difficultyEl.addEventListener('change', () => {
    if (inProgress() && !confirm(`Start a new ${difficultyEl.value} game? Your current progress will be lost.`)) {
      difficultyEl.value = state.difficulty;
      return;
    }
    newGame();
  });
  document.getElementById('undo').addEventListener('click', undo);
  document.getElementById('erase').addEventListener('click', erase);
  document.getElementById('hint').addEventListener('click', hint);
  document.getElementById('check').addEventListener('click', check);
  document.getElementById('solve').addEventListener('click', solveAll);
  notesBtn.addEventListener('click', toggleNotes);

  // ---------- Start ----------

  if (load()) {
    render();
    if (state.finished) setMessage('Tap New to play again.');
    else timer.start();
  } else {
    newGame();
  }
})();
