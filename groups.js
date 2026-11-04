// Logic for "Groups" mode: an N×N grid split into N colour groups.
// Place one O in every row, column and group, with no two Os touching
// (including diagonally). Every generated puzzle has exactly one solution.
//
// A puzzle is { size, regions, solution }:
//   regions  – flat array of size*size group ids (0..size-1)
//   solution – solution[row] = column of the O in that row

(function (root) {
  'use strict';

  function randInt(n) {
    return Math.floor(Math.random() * n);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function neighbors4(i, n) {
    const r = Math.floor(i / n), c = i % n, out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  }

  // Random placement of one O per row/column with no two touching.
  function randomPlacement(n) {
    const cols = new Array(n);
    const used = new Array(n).fill(false);
    (function place(r) {
      if (r === n) return true;
      for (const c of shuffle([...Array(n).keys()])) {
        if (used[c] || (r > 0 && Math.abs(cols[r - 1] - c) <= 1)) continue;
        used[c] = true;
        cols[r] = c;
        if (place(r + 1)) return true;
        used[c] = false;
      }
      return false;
    })(0);
    return cols;
  }

  // Grow N connected groups outward from the solution cells.
  function growRegions(n, solution) {
    const regions = new Array(n * n).fill(-1);
    const sizes = new Array(n).fill(1);
    solution.forEach((c, r) => { regions[r * n + c] = r; });
    let left = n * n - n;
    while (left > 0) {
      // Collect (cell, group) frontier pairs and pick one, favouring small groups
      // so sizes stay varied but not wildly lopsided.
      const options = [];
      for (let i = 0; i < n * n; i++) {
        if (regions[i] !== -1) continue;
        for (const j of neighbors4(i, n)) {
          if (regions[j] !== -1) options.push([i, regions[j]]);
        }
      }
      let best = null, bestScore = Infinity;
      for (let k = 0; k < 3; k++) {
        const o = options[randInt(options.length)];
        const score = sizes[o[1]] + Math.random() * n;
        if (score < bestScore) { bestScore = score; best = o; }
      }
      regions[best[0]] = best[1];
      sizes[best[1]]++;
      left--;
    }
    return regions;
  }

  // Counts solutions up to `limit`. Returns { count, solutions }.
  function solve(n, regions, limit) {
    limit = limit || 2;
    const cols = new Array(n);
    const colUsed = new Array(n).fill(false);
    const regUsed = new Array(n).fill(false);
    const solutions = [];
    (function place(r) {
      if (r === n) {
        solutions.push(cols.slice());
        return solutions.length >= limit;
      }
      for (let c = 0; c < n; c++) {
        const g = regions[r * n + c];
        if (colUsed[c] || regUsed[g]) continue;
        if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) continue;
        colUsed[c] = regUsed[g] = true;
        cols[r] = c;
        if (place(r + 1)) return true;
        colUsed[c] = regUsed[g] = false;
      }
      return false;
    })(0);
    return { count: solutions.length, solutions };
  }

  function isConnectedWithout(regions, n, group, removed) {
    const cells = [];
    for (let i = 0; i < n * n; i++) if (regions[i] === group && i !== removed) cells.push(i);
    if (!cells.length) return false;
    const seen = new Set([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
      const i = stack.pop();
      for (const j of neighbors4(i, n)) {
        if (j !== removed && regions[j] === group && !seen.has(j)) {
          seen.add(j);
          stack.push(j);
        }
      }
    }
    return seen.size === cells.length;
  }

  // Break an unwanted solution by moving one of its cells into a neighbouring
  // group, keeping every group connected and every solution cell where it is.
  function repair(regions, n, solution, other) {
    const solCells = new Set(solution.map((c, r) => r * n + c));
    const moves = [];
    other.forEach((c, r) => {
      const i = r * n + c;
      if (solCells.has(i)) return;
      for (const j of neighbors4(i, n)) {
        if (regions[j] !== regions[i]) moves.push([i, regions[j]]);
      }
    });
    for (const [i, g] of shuffle(moves)) {
      if (isConnectedWithout(regions, n, regions[i], i)) {
        regions[i] = g;
        return true;
      }
    }
    return false;
  }

  function generate(n) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const solution = randomPlacement(n);
      const regions = growRegions(n, solution);
      for (let step = 0; step < n * 4; step++) {
        const { count, solutions } = solve(n, regions, 2);
        if (count === 1) return { size: n, regions, solution };
        const other = solutions.find((s) => s.some((c, r) => c !== solution[r]));
        if (!repair(regions, n, solution, other)) break;
      }
    }
    throw new Error('Could not generate a puzzle');
  }

  const api = { generate, solve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Groups = api;
})(this);
