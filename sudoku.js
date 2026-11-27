// Core Sudoku logic: solving, puzzle generation, and validation.
// Boards are flat arrays of 81 numbers, where 0 means an empty square.

(function (root) {
  'use strict';

  const { shuffle } = typeof module !== 'undefined' && module.exports ? require('./shared.js') : root.Shared;

  // Can `digit` go in square `index` without repeating in its row, column or box?
  function canPlace(board, index, digit) {
    const row = Math.floor(index / 9);
    const column = index % 9;
    for (let k = 0; k < 9; k++) {
      if (board[row * 9 + k] === digit && row * 9 + k !== index) return false;
      if (board[k * 9 + column] === digit && k * 9 + column !== index) return false;
    }
    const boxRow = row - (row % 3);
    const boxColumn = column - (column % 3);
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxColumn; c < boxColumn + 3; c++) {
        const other = r * 9 + c;
        if (other !== index && board[other] === digit) return false;
      }
    }
    return true;
  }

  // BOX_OF[square] = which 3 × 3 box (0–8) the square is in.
  const BOX_OF = [...Array(81).keys()].map((i) => 3 * Math.floor(i / 27) + Math.floor((i % 9) / 3));

  // Counts solutions (stopping at `limit`) and returns the first one found.
  // Each row, column and box keeps a bitmask of the digits it already holds
  // (bit d set = d is used), so a square's candidates are one OR away.
  function countSolutions(board, limit, randomize) {
    const grid = board.slice();
    const rowUsed = new Int32Array(9), columnUsed = new Int32Array(9), boxUsed = new Int32Array(9);
    for (let i = 0; i < 81; i++) {
      if (!grid[i]) continue;
      const bit = 1 << grid[i];
      rowUsed[Math.floor(i / 9)] |= bit; columnUsed[i % 9] |= bit; boxUsed[BOX_OF[i]] |= bit;
    }
    let count = 0;
    let first = null;

    function search() {
      // Pick the empty square with the fewest candidates.
      let bestSquare = -1, bestUsed = 0, bestCount = 10;
      for (let i = 0; i < 81; i++) {
        if (grid[i] !== 0) continue;
        const used = rowUsed[Math.floor(i / 9)] | columnUsed[i % 9] | boxUsed[BOX_OF[i]];
        let candidates = 9;
        for (let bits = used >> 1; bits; bits >>= 1) candidates -= bits & 1;
        if (candidates === 0) return false;
        if (candidates < bestCount) {
          bestSquare = i; bestUsed = used; bestCount = candidates;
          if (candidates === 1) break;
        }
      }
      if (bestSquare === -1) {
        count++;
        if (!first) first = grid.slice();
        return count >= limit;
      }
      const digits = [];
      for (let digit = 1; digit <= 9; digit++) if (!(bestUsed & (1 << digit))) digits.push(digit);
      if (randomize) shuffle(digits);
      const row = Math.floor(bestSquare / 9), column = bestSquare % 9, box = BOX_OF[bestSquare];
      for (const digit of digits) {
        const bit = 1 << digit;
        grid[bestSquare] = digit;
        rowUsed[row] |= bit; columnUsed[column] |= bit; boxUsed[box] |= bit;
        const stop = search();
        rowUsed[row] &= ~bit; columnUsed[column] &= ~bit; boxUsed[box] &= ~bit;
        if (stop) return true;
      }
      grid[bestSquare] = 0;
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
    for (const square of shuffle([...Array(81).keys()])) {
      if (filled <= target) break;
      const saved = puzzle[square];
      puzzle[square] = 0;
      if (countSolutions(puzzle, 2, false).count !== 1) {
        puzzle[square] = saved;
      } else {
        filled--;
      }
    }
    return { puzzle, solution };
  }

  // Returns the set of squares whose digits clash with another square.
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
