// Logic for "Groups" mode: an N×N grid split into N colour groups.
// Place one O in every row, column and group, with no two Os touching
// (including diagonally). Every generated puzzle has exactly one solution.
//
// generate(n, level) takes level 'easy' | 'medium' | 'hard' (see grade()).
//
// A puzzle is { size, regions, solution, level, grade }:
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

  // Rows, columns and groups ("units": each needs exactly one O), and for each
  // square the units it belongs to and the squares an O there rules out.
  function board(n, regions) {
    const N = n * n, units = [];
    for (let r = 0; r < n; r++) units.push([...Array(n).keys()].map((c) => r * n + c));
    for (let c = 0; c < n; c++) units.push([...Array(n).keys()].map((r) => r * n + c));
    for (let g = 0; g < n; g++) units.push([]);
    regions.forEach((g, i) => units[2 * n + g].push(i));
    const unitsOf = [...Array(N)].map((_, i) => [Math.floor(i / n), n + (i % n), 2 * n + regions[i]]);
    const kills = [...Array(N)].map((_, i) => {
      const s = new Set();
      for (const k of unitsOf[i]) for (const j of units[k]) s.add(j);
      const r = Math.floor(i / n), c = i % n;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < n && cc >= 0 && cc < n) s.add(rr * n + cc);
        }
      }
      return [...s]; // includes i itself
    });
    return { n, N, units, unitsOf, kills };
  }

  // Counts solutions up to `limit`. Returns { count, solutions }.
  // Depth-first, always filling the unit with the fewest candidate squares.
  function solve(n, regions, limit) {
    limit = limit || 2;
    const b = board(n, regions);
    const cols = new Array(n);
    const solutions = [];
    (function search(cand, done, placed) {
      if (placed === n) {
        solutions.push(cols.slice());
        return solutions.length >= limit;
      }
      let best = -1, bestCount = Infinity;
      for (let k = 0; k < 3 * n; k++) {
        if (done[k]) continue;
        let count = 0;
        for (const i of b.units[k]) count += cand[i];
        if (count < bestCount) { bestCount = count; best = k; if (count < 2) break; }
      }
      if (bestCount === 0) return false;
      for (const i of b.units[best]) {
        if (!cand[i]) continue;
        const nc = cand.slice(), nd = done.slice();
        for (const j of b.kills[i]) nc[j] = 0;
        for (const k of b.unitsOf[i]) nd[k] = 1;
        cols[Math.floor(i / n)] = i % n;
        if (search(nc, nd, placed + 1)) return true;
      }
      return false;
    })(new Uint8Array(b.N).fill(1), new Uint8Array(3 * n), 0);
    return { count: solutions.length, solutions };
  }

  // Solves the way a person would, using ever stronger steps only when the
  // simpler ones are stuck:
  //   1. a row, column or group with one square left must hold an O;
  //   2. a square whose O would wipe out a whole row, column or group gets ✕;
  //   3. k groups that fit inside k rows (or any such mix of rows, columns and
  //      groups) rule out every other square of those rows;
  //   4. an O whose forced follow-ups (step 1 repeated) wipe out a unit gets ✕.
  // Returns { technique: hardest step used (1–4, or 5 if stuck), score }.
  const STEP_SCORE = [0, 0, 1, 4, 10];

  function grade(n, regions) {
    const b = board(n, regions);
    const { N, units, unitsOf, kills } = b;
    const U = 3 * n;
    let cand = new Uint8Array(N).fill(1);
    let done = new Uint8Array(U);
    let placed = 0;

    function place(i) {
      for (const j of kills[i]) cand[j] = 0;
      for (const k of unitsOf[i]) done[k] = 1;
      placed++;
    }
    const left = (k) => { let c = 0; for (const i of units[k]) c += cand[i]; return c; };
    const stuck = () => { for (let k = 0; k < U; k++) if (!done[k] && !left(k)) return true; return false; };

    function singles() {
      for (let again = true; again;) {
        again = false;
        for (let k = 0; k < U; k++) {
          if (done[k] || left(k) !== 1) continue;
          place(units[k].find((i) => cand[i]));
          again = true;
        }
      }
    }

    function wipesOut() {
      for (let i = 0; i < N; i++) {
        if (!cand[i]) continue;
        const gone = new Set(kills[i]);
        for (let k = 0; k < U; k++) {
          if (done[k] || unitsOf[i].includes(k)) continue;
          if (units[k].every((j) => !cand[j] || gone.has(j))) { cand[i] = 0; return true; }
        }
      }
      return false;
    }

    function confine() {
      const kinds = [[0, n], [n, 2 * n], [2 * n, 3 * n]];
      for (const [a0, a1] of kinds) {
        const open = [];
        for (let k = a0; k < a1; k++) if (!done[k]) open.push(k);
        const m = open.length;
        if (m > 16) continue;
        for (const [b0, b1] of kinds) {
          if (a0 === b0) continue;
          const reach = open.map((k) => {
            const s = new Set();
            for (const i of units[k]) if (cand[i]) s.add(unitsOf[i].find((u) => u >= b0 && u < b1));
            return s;
          });
          for (let mask = 1; mask < (1 << m) - 1; mask++) {
            const as = [], bs = new Set();
            for (let t = 0; t < m; t++) {
              if (mask >> t & 1) { as.push(open[t]); reach[t].forEach((u) => bs.add(u)); }
            }
            if (as.length < 2 || bs.size !== as.length) continue;
            let any = false;
            for (const u of bs) {
              for (const i of units[u]) {
                if (cand[i] && !unitsOf[i].some((k) => as.includes(k))) { cand[i] = 0; any = true; }
              }
            }
            if (any) return true;
          }
        }
      }
      return false;
    }

    function chain() {
      for (let i = 0; i < N; i++) {
        if (!cand[i]) continue;
        const saved = [cand, done, placed];
        cand = cand.slice();
        done = done.slice();
        place(i);
        singles();
        const bad = stuck();
        [cand, done, placed] = saved;
        if (bad) { cand[i] = 0; return true; }
      }
      return false;
    }

    let technique = 1, score = 0;
    const steps = [null, null, wipesOut, confine, chain];
    for (;;) {
      singles();
      if (placed === n) return { technique, score };
      let t = 2;
      while (t < steps.length && !steps[t]()) t++;
      if (t === steps.length) return { technique: 5, score: score + 100 };
      technique = Math.max(technique, t);
      score += STEP_SCORE[t];
    }
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

  function generateOne(n) {
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

  // Difficulty: deal up to 12 puzzles (1 s budget, at least 3), rank them by
  // grade score and take the easiest, the middle one or the hardest.
  const LEVELS = ['easy', 'medium', 'hard'];
  const POOL = 12, BUDGET_MS = 1000;

  function generate(n, level) {
    if (!LEVELS.includes(level)) level = 'medium';
    const deadline = Date.now() + BUDGET_MS;
    const pool = [];
    while (pool.length < POOL && (pool.length < 3 || Date.now() < deadline)) {
      const p = generateOne(n);
      p.grade = grade(n, p.regions);
      pool.push(p);
      if (level === 'easy' && p.grade.score === 0) break; // can't get easier
    }
    // Never hand out a puzzle that needs guessing if another will do.
    const fair = pool.filter((p) => p.grade.technique < 5);
    const ranked = (fair.length ? fair : pool).sort((a, b) => a.grade.score - b.grade.score);
    const pick = level === 'easy' ? 0 : level === 'hard' ? ranked.length - 1 : (ranked.length - 1) >> 1;
    return Object.assign(ranked[pick], { level });
  }

  const api = { generate, solve, grade, LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Groups = api;
})(this);
