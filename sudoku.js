// Core Sudoku logic: solving, puzzle generation, and validation.
// Boards are flat arrays of 81 numbers, where 0 means an empty cell.

(function (root) {
  'use strict';

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function canPlace(board, idx, num) {
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    for (let i = 0; i < 9; i++) {
      if (board[row * 9 + i] === num && row * 9 + i !== idx) return false;
      if (board[i * 9 + col] === num && i * 9 + col !== idx) return false;
    }
    const br = row - (row % 3);
    const bc = col - (col % 3);
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        const j = r * 9 + c;
        if (j !== idx && board[j] === num) return false;
      }
    }
    return true;
  }

  // Counts solutions (stopping at `limit`) and returns the first one found.
  function countSolutions(board, limit, randomize) {
    const b = board.slice();
    let count = 0;
    let first = null;

    function search() {
      // Pick the empty cell with the fewest candidates.
      let bestIdx = -1;
      let bestCands = null;
      for (let i = 0; i < 81; i++) {
        if (b[i] !== 0) continue;
        const cands = [];
        for (let n = 1; n <= 9; n++) if (canPlace(b, i, n)) cands.push(n);
        if (cands.length === 0) return false;
        if (!bestCands || cands.length < bestCands.length) {
          bestIdx = i;
          bestCands = cands;
          if (cands.length === 1) break;
        }
      }
      if (bestIdx === -1) {
        count++;
        if (!first) first = b.slice();
        return count >= limit;
      }
      if (randomize) shuffle(bestCands);
      for (const n of bestCands) {
        b[bestIdx] = n;
        if (search()) return true;
      }
      b[bestIdx] = 0;
      return false;
    }

    search();
    return { count, solution: first };
  }

  function solve(board) {
    return countSolutions(board, 1, false).solution;
  }

  function generateSolved() {
    return countSolutions(new Array(81).fill(0), 1, true).solution;
  }

  const CLUES = { easy: 40, medium: 32, hard: 26 };

  // Creates a puzzle with a unique solution.
  function generate(difficulty) {
    const target = CLUES[difficulty] || CLUES.medium;
    const solution = generateSolved();
    const puzzle = solution.slice();
    let filled = 81;
    for (const idx of shuffle([...Array(81).keys()])) {
      if (filled <= target) break;
      const saved = puzzle[idx];
      puzzle[idx] = 0;
      if (countSolutions(puzzle, 2, false).count !== 1) {
        puzzle[idx] = saved;
      } else {
        filled--;
      }
    }
    return { puzzle, solution };
  }

  // Returns the set of indices whose values conflict with another cell.
  function findConflicts(board) {
    const conflicts = new Set();
    for (let i = 0; i < 81; i++) {
      if (board[i] !== 0 && !canPlace(board, i, board[i])) conflicts.add(i);
    }
    return conflicts;
  }

  const api = { solve, generate, findConflicts, canPlace, countSolutions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sudoku = api;
})(this);
