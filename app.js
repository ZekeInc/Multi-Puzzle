// Sudoku UI: the board, number pad, notes, and the buttons. The puzzle logic
// is in sudoku.js.
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
  const notesButton = document.getElementById('notes-toggle');
  const notesStateEl = document.getElementById('notes-state');

  const state = {
    puzzle: [],
    solution: [],
    board: [],
    notes: [],      // notes[square] = Set of pencilled-in digits
    history: [],
    selected: -1,
    notesMode: false,
    mistakes: 0,
    finished: false,
    hintsUsed: false,
    difficulty: 'medium',
  };

  // ---------- Build the board and number pad ----------

  const squareEls = [];
  const squareLook = [];   // squareLook[i]: what squareEls[i] shows now, so unchanged squares are left alone
  for (let square = 0; square < 81; square++) {
    const squareEl = document.createElement('div');
    squareEl.className = 'cell';
    squareEl.setAttribute('role', 'gridcell');
    const row = Math.floor(square / 9);
    const column = square % 9;
    if (column === 2 || column === 5) squareEl.classList.add('box-right');
    if (row === 2 || row === 5) squareEl.classList.add('box-bottom');
    squareEl.addEventListener('click', () => select(square));
    boardEl.appendChild(squareEl);
    squareEls.push(squareEl);
  }

  const digitButtons = [];
  for (let digit = 1; digit <= 9; digit++) {
    const button = document.createElement('button');
    button.textContent = digit;
    button.setAttribute('aria-label', `Enter ${digit}`);
    button.addEventListener('click', () => input(digit));
    numpadEl.appendChild(button);
    digitButtons.push(button);
  }

  // ---------- Helpers ----------

  const setMessage = GameMode.message(messageEl);
  const { buzz, formatTime } = GameMode;

  const isGiven = (square) => state.puzzle[square] !== 0;

  // Do two squares share a row, column or box?
  function sameUnit(a, b) {
    const rowA = Math.floor(a / 9), columnA = a % 9;
    const rowB = Math.floor(b / 9), columnB = b % 9;
    return rowA === rowB || columnA === columnB ||
      (Math.floor(rowA / 3) === Math.floor(rowB / 3) && Math.floor(columnA / 3) === Math.floor(columnB / 3));
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
        notes: state.notes.map((noteSet) => [...noteSet]),
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
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!saved || saved.puzzle.length !== 81) return false;
      state.puzzle = saved.puzzle;
      state.solution = saved.solution;
      state.board = saved.board;
      state.notes = saved.notes.map((digits) => new Set(digits));
      state.mistakes = saved.mistakes;
      timer.reset(saved.elapsed);
      state.finished = saved.finished;
      state.hintsUsed = !!saved.hintsUsed;
      state.difficulty = saved.difficulty;
      state.history = [];
      difficultyEl.value = saved.difficulty;
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
    return !state.finished && state.board.some((digit, square) => digit !== state.puzzle[square]);
  }

  function select(square) {
    state.selected = square;
    render();
  }

  function pushHistory(square) {
    state.history.push({ square, digit: state.board[square], notes: [...state.notes[square]] });
    if (state.history.length > 200) state.history.shift();
  }

  function input(digit) {
    const square = state.selected;
    if (square < 0) return setMessage('Tap a square first.');
    if (state.finished || isGiven(square)) return;

    if (state.notesMode) {
      if (state.board[square] !== 0) return;
      pushHistory(square);
      const notes = state.notes[square];
      if (notes.has(digit)) notes.delete(digit); else notes.add(digit);
    } else {
      if (state.board[square] === digit) return;
      pushHistory(square);
      state.board[square] = digit;
      state.notes[square].clear();
      if (digit !== state.solution[square]) {
        state.mistakes++;
        buzz(80);
      } else {
        clearRelatedNotes(square, digit);
      }
    }
    setMessage('');
    render();
    checkWin();
    save();
  }

  // A correct digit rules itself out of the notes in its row, column and box.
  function clearRelatedNotes(square, digit) {
    for (let other = 0; other < 81; other++) if (sameUnit(square, other)) state.notes[other].delete(digit);
  }

  function erase() {
    const square = state.selected;
    if (square < 0 || state.finished || isGiven(square)) return;
    if (state.board[square] === 0 && state.notes[square].size === 0) return;
    pushHistory(square);
    state.board[square] = 0;
    state.notes[square].clear();
    render();
    save();
  }

  function undo() {
    if (state.finished) return;
    const last = state.history.pop();
    if (!last) return setMessage('Nothing to undo.');
    state.board[last.square] = last.digit;
    state.notes[last.square] = new Set(last.notes);
    state.selected = last.square;
    setMessage('');
    render();
    save();
  }

  // Fills in the selected square, or a random unsolved one.
  function hint() {
    if (state.finished) return;
    let square = state.selected;
    if (square < 0 || isGiven(square) || state.board[square] === state.solution[square]) {
      const unsolved = [];
      for (let other = 0; other < 81; other++) if (state.board[other] !== state.solution[other]) unsolved.push(other);
      if (!unsolved.length) return;
      square = unsolved[Shared.randomInt(unsolved.length)];
    }
    pushHistory(square);
    state.hintsUsed = true;
    state.board[square] = state.solution[square];
    state.notes[square].clear();
    clearRelatedNotes(square, state.solution[square]);
    state.selected = square;
    render();
    checkWin();
    save();
  }

  function check() {
    if (state.finished) return;
    const wrong = state.board.filter((digit, square) => digit !== 0 && digit !== state.solution[square]).length;
    const empty = state.board.filter((digit) => digit === 0).length;
    if (wrong) setMessage(`${wrong} incorrect square${wrong > 1 ? 's' : ''}.`, 'bad');
    else setMessage(`Looking good! ${empty} square${empty === 1 ? '' : 's'} left.`);
  }

  function solveAll() {
    if (state.finished) return;
    if (!confirm('Reveal the solution? This ends the current game.')) return;
    state.board = state.solution.slice();
    state.notes.forEach((noteSet) => noteSet.clear());
    finish(false);
  }

  function checkWin() {
    if (state.board.every((digit, square) => digit === state.solution[square])) finish(true);
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
    notesButton.setAttribute('aria-pressed', String(state.notesMode));
    notesStateEl.textContent = state.notesMode ? 'on' : 'off';
  }

  // ---------- Rendering ----------

  function render() {
    const selected = state.selected;
    const selectedDigit = selected >= 0 ? state.board[selected] : 0;
    const conflicts = Sudoku.findConflicts(state.board);

    for (let square = 0; square < 81; square++) {
      const squareEl = squareEls[square];
      const digit = state.board[square];
      const given = isGiven(square);

      squareEl.classList.toggle('given', given);
      squareEl.classList.toggle('selected', square === selected);
      squareEl.classList.toggle('related', selected >= 0 && square !== selected && sameUnit(square, selected));
      squareEl.classList.toggle('same', selectedDigit !== 0 && digit === selectedDigit && square !== selected);
      const wrong = !given && digit !== 0 && digit !== state.solution[square];
      squareEl.classList.toggle('error', wrong || (conflicts.has(square) && !given));

      // A digit, a 3 × 3 grid of notes, or nothing. Only rebuilt when it changes.
      const notes = state.notes[square];
      const look = digit ? String(digit) : notes.size ? 'n' + [...notes].sort().join('') : '';
      if (look === squareLook[square]) continue;
      squareLook[square] = look;
      if (digit || !notes.size) {
        squareEl.textContent = look;
      } else {
        const grid = document.createElement('div');
        grid.className = 'notes';
        for (let noteDigit = 1; noteDigit <= 9; noteDigit++) {
          const span = document.createElement('span');
          span.textContent = notes.has(noteDigit) ? noteDigit : '';
          grid.appendChild(span);
        }
        squareEl.replaceChildren(grid);
      }
    }

    // Fade digits that have all 9 placed correctly.
    const placed = new Array(10).fill(0);
    state.board.forEach((digit, square) => { if (digit && digit === state.solution[square]) placed[digit]++; });
    digitButtons.forEach((button, k) => button.classList.toggle('done', placed[k + 1] === 9));

    mistakesEl.textContent = `Mistakes: ${state.mistakes}`;
    timer.show();
    renderBest();
  }

  function renderBest() {
    bestEl.textContent = Scores.bestLabel('sudoku', state.difficulty);
  }
  window.addEventListener('scoreschange', renderBest);

  // ---------- Input wiring ----------

  const ARROW_STEPS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  document.addEventListener('keydown', (e) => {
    if (!isActive() || e.target.tagName === 'SELECT') return;
    if (e.key >= '1' && e.key <= '9') return input(Number(e.key));
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') return erase();
    if (e.key === 'n' || e.key === 'N') return toggleNotes();
    if (e.key in ARROW_STEPS) {
      e.preventDefault();
      const square = state.selected < 0 ? 0 : state.selected;
      const [rowStep, columnStep] = ARROW_STEPS[e.key];
      const row = (Math.floor(square / 9) + rowStep + 9) % 9;
      const column = (square % 9 + columnStep + 9) % 9;
      select(row * 9 + column);
    }
  });
  GameMode.undoShortcut('sudoku', undo);

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
  notesButton.addEventListener('click', toggleNotes);

  // ---------- Start ----------

  if (load()) {
    render();
    if (state.finished) setMessage('Tap New to play again.');
    else timer.start();
  } else {
    newGame();
  }
})();
