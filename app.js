(function () {
  'use strict';

  const boardEl = document.getElementById('board');
  const numpadEl = document.getElementById('numpad');
  const messageEl = document.getElementById('message');
  const timerEl = document.getElementById('timer');
  const mistakesEl = document.getElementById('mistakes');
  const difficultyEl = document.getElementById('difficulty');
  const notesBtn = document.getElementById('notes-toggle');

  const state = {
    puzzle: [],
    solution: [],
    board: [],
    notes: [],
    selected: -1,
    notesMode: false,
    mistakes: 0,
    startTime: 0,
    timerId: null,
    finished: false,
  };

  const cells = [];
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

  for (let n = 1; n <= 9; n++) {
    const btn = document.createElement('button');
    btn.textContent = n;
    btn.addEventListener('click', () => input(n));
    numpadEl.appendChild(btn);
  }

  function setMessage(text, cls) {
    messageEl.textContent = text;
    messageEl.className = cls || '';
  }

  function newGame() {
    setMessage('Generating…');
    // Defer so the message paints before generation runs.
    setTimeout(() => {
      const { puzzle, solution } = Sudoku.generate(difficultyEl.value);
      state.puzzle = puzzle;
      state.solution = solution;
      state.board = puzzle.slice();
      state.notes = Array.from({ length: 81 }, () => new Set());
      state.selected = -1;
      state.mistakes = 0;
      state.finished = false;
      state.startTime = Date.now();
      clearInterval(state.timerId);
      state.timerId = setInterval(updateTimer, 1000);
      updateTimer();
      setMessage('');
      render();
    }, 10);
  }

  function updateTimer() {
    const secs = Math.floor((Date.now() - state.startTime) / 1000);
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;
  }

  function select(i) {
    state.selected = i;
    render();
  }

  function isGiven(i) {
    return state.puzzle[i] !== 0;
  }

  function input(n) {
    const i = state.selected;
    if (i < 0 || state.finished || isGiven(i)) return;

    if (state.notesMode) {
      if (state.board[i] !== 0) return;
      const notes = state.notes[i];
      notes.has(n) ? notes.delete(n) : notes.add(n);
    } else {
      if (state.board[i] === n) return;
      state.board[i] = n;
      state.notes[i].clear();
      if (n !== state.solution[i]) {
        state.mistakes++;
      } else {
        clearRelatedNotes(i, n);
      }
    }
    render();
    checkWin();
  }

  function clearRelatedNotes(i, n) {
    const row = Math.floor(i / 9);
    const col = i % 9;
    for (let j = 0; j < 81; j++) {
      const r = Math.floor(j / 9);
      const c = j % 9;
      const sameBox = Math.floor(r / 3) === Math.floor(row / 3) && Math.floor(c / 3) === Math.floor(col / 3);
      if (r === row || c === col || sameBox) state.notes[j].delete(n);
    }
  }

  function erase() {
    const i = state.selected;
    if (i < 0 || state.finished || isGiven(i)) return;
    state.board[i] = 0;
    state.notes[i].clear();
    render();
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
    state.board[i] = state.solution[i];
    state.notes[i].clear();
    clearRelatedNotes(i, state.solution[i]);
    state.selected = i;
    render();
    checkWin();
  }

  function check() {
    const wrong = state.board.filter((v, i) => v !== 0 && v !== state.solution[i]).length;
    const empty = state.board.filter((v) => v === 0).length;
    if (wrong) setMessage(`${wrong} incorrect cell${wrong > 1 ? 's' : ''}.`, 'bad');
    else setMessage(`Looking good! ${empty} cell${empty === 1 ? '' : 's'} left.`);
  }

  function solveAll() {
    state.board = state.solution.slice();
    state.notes.forEach((s) => s.clear());
    finish(false);
  }

  function checkWin() {
    if (state.board.every((v, i) => v === state.solution[i])) finish(true);
  }

  function finish(won) {
    state.finished = true;
    clearInterval(state.timerId);
    render();
    if (won) setMessage(`Solved in ${timerEl.textContent}! 🎉`, 'win');
    else setMessage('Solution revealed.');
  }

  function render() {
    const sel = state.selected;
    const selRow = Math.floor(sel / 9);
    const selCol = sel % 9;
    const selVal = sel >= 0 ? state.board[sel] : 0;
    const conflicts = Sudoku.findConflicts(state.board);

    for (let i = 0; i < 81; i++) {
      const cell = cells[i];
      const v = state.board[i];
      const r = Math.floor(i / 9);
      const c = i % 9;

      cell.classList.toggle('given', isGiven(i));
      cell.classList.toggle('selected', i === sel);
      const related = sel >= 0 && (r === selRow || c === selCol ||
        (Math.floor(r / 3) === Math.floor(selRow / 3) && Math.floor(c / 3) === Math.floor(selCol / 3)));
      cell.classList.toggle('related', related && i !== sel);
      cell.classList.toggle('same', selVal !== 0 && v === selVal && i !== sel);
      const wrong = !isGiven(i) && v !== 0 && v !== state.solution[i];
      cell.classList.toggle('error', wrong || (conflicts.has(i) && !isGiven(i)));

      if (v !== 0) {
        cell.textContent = v;
      } else if (state.notes[i].size) {
        const grid = document.createElement('div');
        grid.className = 'notes';
        for (let n = 1; n <= 9; n++) {
          const span = document.createElement('span');
          span.textContent = state.notes[i].has(n) ? n : '';
          grid.appendChild(span);
        }
        cell.replaceChildren(grid);
      } else {
        cell.textContent = '';
      }
    }

    // Dim numbers that have all 9 placed correctly.
    const counts = new Array(10).fill(0);
    state.board.forEach((v, i) => { if (v && v === state.solution[i]) counts[v]++; });
    [...numpadEl.children].forEach((btn, k) => btn.classList.toggle('done', counts[k + 1] === 9));

    mistakesEl.textContent = `Mistakes: ${state.mistakes}`;
  }

  function toggleNotes() {
    state.notesMode = !state.notesMode;
    notesBtn.setAttribute('aria-pressed', String(state.notesMode));
    notesBtn.textContent = `Notes: ${state.notesMode ? 'on' : 'off'}`;
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT') return;
    if (e.key >= '1' && e.key <= '9') return input(Number(e.key));
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') return erase();
    if (e.key === 'n' || e.key === 'N') return toggleNotes();
    const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
    if (e.key in moves) {
      e.preventDefault();
      let i = state.selected < 0 ? 0 : state.selected;
      const r = Math.floor(i / 9);
      const c = i % 9;
      if (e.key === 'ArrowUp') i = ((r + 8) % 9) * 9 + c;
      if (e.key === 'ArrowDown') i = ((r + 1) % 9) * 9 + c;
      if (e.key === 'ArrowLeft') i = r * 9 + ((c + 8) % 9);
      if (e.key === 'ArrowRight') i = r * 9 + ((c + 1) % 9);
      select(i);
    }
  });

  document.getElementById('new-game').addEventListener('click', newGame);
  document.getElementById('erase').addEventListener('click', erase);
  document.getElementById('hint').addEventListener('click', hint);
  document.getElementById('check').addEventListener('click', check);
  document.getElementById('solve').addEventListener('click', solveAll);
  notesBtn.addEventListener('click', toggleNotes);

  newGame();
})();
