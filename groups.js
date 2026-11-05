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
    // Frontier of (cell, group) pairs: an empty cell next to a cell of that group,
    // once per such neighbour. Pairs whose cell has since been taken are dropped
    // when drawn, so every draw is uniform over the live pairs.
    const cells = [], groups = [];
    const claim = (i, g) => {
      regions[i] = g;
      for (const j of neighbors4(i, n)) if (regions[j] === -1) { cells.push(j); groups.push(g); }
    };
    solution.forEach((c, r) => { regions[r * n + c] = r; });
    solution.forEach((c, r) => claim(r * n + c, r));
    const draw = () => {
      for (;;) {
        const k = randInt(cells.length);
        if (regions[cells[k]] === -1) return k;
        cells[k] = cells[cells.length - 1]; cells.pop();
        groups[k] = groups[groups.length - 1]; groups.pop();
      }
    };
    for (let left = n * n - n; left > 0; left--) {
      // Pick one of three random pairs, favouring small groups so sizes stay
      // varied but not wildly lopsided.
      let cell = -1, g = -1, bestScore = Infinity;
      for (let t = 0; t < 3; t++) {
        const k = draw();
        const score = sizes[groups[k]] + Math.random() * n;
        if (score < bestScore) { bestScore = score; cell = cells[k]; g = groups[k]; }
      }
      sizes[g]++;
      claim(cell, g);
    }
    return regions;
  }

  // Rows, columns and groups ("units": each needs exactly one O), and for each
  // square the units it belongs to. An O on square i rules out `near[i]` (its
  // row, column and touching squares, i included) and every square of its group.
  // `near` only depends on n, so it is worked out once per size.
  const geometry = {};
  function geometryOf(n) {
    if (geometry[n]) return geometry[n];
    const N = n * n, rows = [], cols = [], near = [];
    for (let r = 0; r < n; r++) rows.push([...Array(n).keys()].map((c) => r * n + c));
    for (let c = 0; c < n; c++) cols.push([...Array(n).keys()].map((r) => r * n + c));
    for (let i = 0; i < N; i++) {
      const r = Math.floor(i / n), c = i % n;
      const s = rows[r].concat(cols[c].filter((j) => j !== i));
      for (let rr = Math.max(0, r - 1); rr <= Math.min(n - 1, r + 1); rr++) {
        for (let cc = Math.max(0, c - 1); cc <= Math.min(n - 1, c + 1); cc++) {
          if (rr !== r && cc !== c) s.push(rr * n + cc);
        }
      }
      near.push(s);
    }
    return (geometry[n] = { rows, cols, near });
  }

  function board(n, regions) {
    const N = n * n, geo = geometryOf(n);
    const units = geo.rows.concat(geo.cols);
    for (let g = 0; g < n; g++) units.push([]);
    for (let i = 0; i < N; i++) units[2 * n + regions[i]].push(i);
    const unitsOf = new Array(N);
    for (let i = 0; i < N; i++) unitsOf[i] = [Math.floor(i / n), n + (i % n), 2 * n + regions[i]];
    return { n, N, units, unitsOf, near: geo.near };
  }

  // Counts solutions up to `limit`. Returns { count, solutions }.
  // Depth-first, always filling the unit with the fewest candidate squares.
  // One candidate array is shared by the whole search: each step records the
  // squares it rules out on a trail and puts them back when it backtracks, and
  // `left` keeps each unit's candidate count up to date.
  function solve(n, regions, limit) {
    limit = limit || 2;
    const { N, units, unitsOf, near } = board(n, regions);
    const U = 3 * n;
    const cand = new Uint8Array(N).fill(1);
    const left = Int32Array.from(units, (u) => u.length);
    const done = new Uint8Array(U);
    const trail = new Int32Array(N);
    let top = 0;
    const cols = new Array(n);
    const solutions = [];
    (function search(placed) {
      if (placed === n) {
        solutions.push(cols.slice());
        return solutions.length >= limit;
      }
      let best = -1, bestCount = Infinity;
      for (let k = 0; k < U; k++) {
        if (!done[k] && left[k] < bestCount) { bestCount = left[k]; best = k; if (bestCount < 2) break; }
      }
      if (bestCount === 0) return false;
      for (const i of units[best]) {
        if (!cand[i]) continue;
        const mark = top;
        const [r, c, g] = unitsOf[i];
        for (const list of [near[i], units[g]]) {
          for (const j of list) {
            if (!cand[j]) continue;
            cand[j] = 0;
            trail[top++] = j;
            for (const k of unitsOf[j]) left[k]--;
          }
        }
        done[r] = done[c] = done[g] = 1;
        cols[r] = i % n;
        if (search(placed + 1)) return true;
        done[r] = done[c] = done[g] = 0;
        while (top > mark) {
          const j = trail[--top];
          cand[j] = 1;
          for (const k of unitsOf[j]) left[k]++;
        }
      }
      return false;
    })(0);
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
    const { N, units, unitsOf, near } = board(n, regions);
    const U = 3 * n;
    let cand = new Uint8Array(N).fill(1);
    let done = new Uint8Array(U);
    let placed = 0;

    function place(i) {
      for (const j of near[i]) cand[j] = 0;
      for (const j of units[unitsOf[i][2]]) cand[j] = 0;
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

    const gone = new Int32Array(N).fill(-1);   // gone[j] === i: an O on i rules out j
    function wipesOut() {
      for (let i = 0; i < N; i++) {
        if (!cand[i]) continue;
        for (const j of near[i]) gone[j] = i;
        for (const j of units[unitsOf[i][2]]) gone[j] = i;
        for (let k = 0; k < U; k++) {
          if (done[k] || unitsOf[i].includes(k)) continue;
          if (units[k].every((j) => !cand[j] || gone[j] === i)) { cand[i] = 0; return true; }
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
      let p;
      try { p = generateOne(n); } catch (err) { if (pool.length) break; throw err; }
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
