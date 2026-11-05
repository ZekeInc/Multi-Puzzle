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

  const BOX = [...Array(81).keys()].map((i) => 3 * Math.floor(i / 27) + Math.floor((i % 9) / 3));

  // Counts solutions (stopping at `limit`) and returns the first one found.
  // Each row, column and box keeps a bitmask of the numbers it already holds
  // (bit n set = n is used), so a square's candidates are one OR away.
  function countSolutions(board, limit, randomize) {
    const b = board.slice();
    const rows = new Int32Array(9), cols = new Int32Array(9), boxes = new Int32Array(9);
    for (let i = 0; i < 81; i++) {
      if (!b[i]) continue;
      const bit = 1 << b[i];
      rows[Math.floor(i / 9)] |= bit; cols[i % 9] |= bit; boxes[BOX[i]] |= bit;
    }
    let count = 0;
    let first = null;

    function search() {
      // Pick the empty cell with the fewest candidates.
      let bestIdx = -1, bestUsed = 0, bestCount = 10;
      for (let i = 0; i < 81; i++) {
        if (b[i] !== 0) continue;
        const used = rows[Math.floor(i / 9)] | cols[i % 9] | boxes[BOX[i]];
        let n = 9;
        for (let m = used >> 1; m; m >>= 1) n -= m & 1;
        if (n === 0) return false;
        if (n < bestCount) {
          bestIdx = i; bestUsed = used; bestCount = n;
          if (n === 1) break;
        }
      }
      if (bestIdx === -1) {
        count++;
        if (!first) first = b.slice();
        return count >= limit;
      }
      const cands = [];
      for (let n = 1; n <= 9; n++) if (!(bestUsed & (1 << n))) cands.push(n);
      if (randomize) shuffle(cands);
      const r = Math.floor(bestIdx / 9), c = bestIdx % 9, x = BOX[bestIdx];
      for (const n of cands) {
        const bit = 1 << n;
        b[bestIdx] = n;
        rows[r] |= bit; cols[c] |= bit; boxes[x] |= bit;
        const stop = search();
        rows[r] &= ~bit; cols[c] &= ~bit; boxes[x] &= ~bit;
        if (stop) return true;
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
