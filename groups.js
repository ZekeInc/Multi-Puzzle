// Logic for "Groups" mode: a size × size grid split into `size` colour groups.
// Place one O in every row, column and group, with no two Os touching
// (including diagonally). Every generated puzzle has exactly one solution.
//
// generate(size, level) takes level 'easy' | 'medium' | 'hard' (see grade()).
//
// A puzzle is { size, regions, solution, level, grade }:
//   regions  – flat array of size*size group ids (0..size-1)
//   solution – solution[row] = column of the O in that row

(function (root) {
  'use strict';

  const { randomInt, shuffle } = typeof module !== 'undefined' && module.exports ? require('./shared.js') : root.Shared;

  // Squares sharing a side with `square`.
  function sideNeighbours(square, size) {
    const row = Math.floor(square / size), column = square % size, out = [];
    if (row > 0) out.push(square - size);
    if (row < size - 1) out.push(square + size);
    if (column > 0) out.push(square - 1);
    if (column < size - 1) out.push(square + 1);
    return out;
  }

  // Random placement of one O per row/column with no two touching.
  function randomPlacement(size) {
    const columnOf = new Array(size);
    const used = new Array(size).fill(false);
    (function place(row) {
      if (row === size) return true;
      for (const column of shuffle([...Array(size).keys()])) {
        if (used[column] || (row > 0 && Math.abs(columnOf[row - 1] - column) <= 1)) continue;
        used[column] = true;
        columnOf[row] = column;
        if (place(row + 1)) return true;
        used[column] = false;
      }
      return false;
    })(0);
    return columnOf;
  }

  // Grow `size` connected groups outward from the solution squares.
  function growRegions(size, solution) {
    const regions = new Array(size * size).fill(-1);
    const groupSizes = new Array(size).fill(1);
    // Frontier of (square, group) pairs: an empty square next to a square of that
    // group, once per such neighbour. Pairs whose square has since been taken are
    // dropped when drawn, so every draw is uniform over the live pairs.
    const frontierSquares = [], frontierGroups = [];
    const claim = (square, group) => {
      regions[square] = group;
      for (const next of sideNeighbours(square, size)) {
        if (regions[next] === -1) { frontierSquares.push(next); frontierGroups.push(group); }
      }
    };
    solution.forEach((column, row) => { regions[row * size + column] = row; });
    solution.forEach((column, row) => claim(row * size + column, row));
    const draw = () => {
      for (;;) {
        const k = randomInt(frontierSquares.length);
        if (regions[frontierSquares[k]] === -1) return k;
        frontierSquares[k] = frontierSquares[frontierSquares.length - 1]; frontierSquares.pop();
        frontierGroups[k] = frontierGroups[frontierGroups.length - 1]; frontierGroups.pop();
      }
    };
    for (let left = size * size - size; left > 0; left--) {
      // Pick one of three random pairs, favouring small groups so sizes stay
      // varied but not wildly lopsided.
      let square = -1, group = -1, bestScore = Infinity;
      for (let t = 0; t < 3; t++) {
        const k = draw();
        const score = groupSizes[frontierGroups[k]] + Math.random() * size;
        if (score < bestScore) { bestScore = score; square = frontierSquares[k]; group = frontierGroups[k]; }
      }
      groupSizes[group]++;
      claim(square, group);
    }
    return regions;
  }

  // Rows, columns and groups ("units": each needs exactly one O), and for each
  // square the units it belongs to. An O on square i rules out `near[i]` (its
  // row, column and touching squares, i included) and every square of its group.
  // `near` only depends on the size, so it is worked out once per size.
  const geometryCache = {};
  function geometryOf(size) {
    if (geometryCache[size]) return geometryCache[size];
    const squareCount = size * size, rows = [], columns = [], near = [];
    for (let row = 0; row < size; row++) rows.push([...Array(size).keys()].map((column) => row * size + column));
    for (let column = 0; column < size; column++) columns.push([...Array(size).keys()].map((row) => row * size + column));
    for (let i = 0; i < squareCount; i++) {
      const row = Math.floor(i / size), column = i % size;
      const ruledOut = rows[row].concat(columns[column].filter((j) => j !== i));
      for (let r = Math.max(0, row - 1); r <= Math.min(size - 1, row + 1); r++) {
        for (let c = Math.max(0, column - 1); c <= Math.min(size - 1, column + 1); c++) {
          if (r !== row && c !== column) ruledOut.push(r * size + c);
        }
      }
      near.push(ruledOut);
    }
    return (geometryCache[size] = { rows, columns, near });
  }

  // Units 0 .. size−1 are rows, size .. 2·size−1 columns, then the groups.
  function unitsOfBoard(size, regions) {
    const squareCount = size * size, geometry = geometryOf(size);
    const units = geometry.rows.concat(geometry.columns);
    for (let group = 0; group < size; group++) units.push([]);
    for (let i = 0; i < squareCount; i++) units[2 * size + regions[i]].push(i);
    const unitsOf = new Array(squareCount);
    for (let i = 0; i < squareCount; i++) unitsOf[i] = [Math.floor(i / size), size + (i % size), 2 * size + regions[i]];
    return { squareCount, units, unitsOf, near: geometry.near };
  }

  // Counts solutions up to `limit`. Returns { count, solutions }.
  // Depth-first, always filling the unit with the fewest candidate squares.
  // One candidate array is shared by the whole search: each step records the
  // squares it rules out on a trail and puts them back when it backtracks, and
  // `candidatesLeft` keeps each unit's candidate count up to date.
  function solve(size, regions, limit) {
    limit = limit || 2;
    const { squareCount, units, unitsOf, near } = unitsOfBoard(size, regions);
    const unitCount = 3 * size;
    const candidate = new Uint8Array(squareCount).fill(1);
    const candidatesLeft = Int32Array.from(units, (unit) => unit.length);
    const filled = new Uint8Array(unitCount);
    const trail = new Int32Array(squareCount);
    let trailLength = 0;
    const columnOf = new Array(size);
    const solutions = [];
    (function search(placed) {
      if (placed === size) {
        solutions.push(columnOf.slice());
        return solutions.length >= limit;
      }
      let best = -1, bestCount = Infinity;
      for (let unit = 0; unit < unitCount; unit++) {
        if (!filled[unit] && candidatesLeft[unit] < bestCount) {
          bestCount = candidatesLeft[unit]; best = unit;
          if (bestCount < 2) break;
        }
      }
      if (bestCount === 0) return false;
      for (const square of units[best]) {
        if (!candidate[square]) continue;
        const mark = trailLength;
        const [row, column, group] = unitsOf[square];
        for (const list of [near[square], units[group]]) {
          for (const other of list) {
            if (!candidate[other]) continue;
            candidate[other] = 0;
            trail[trailLength++] = other;
            for (const unit of unitsOf[other]) candidatesLeft[unit]--;
          }
        }
        filled[row] = filled[column] = filled[group] = 1;
        columnOf[row] = square % size;
        if (search(placed + 1)) return true;
        filled[row] = filled[column] = filled[group] = 0;
        while (trailLength > mark) {
          const other = trail[--trailLength];
          candidate[other] = 1;
          for (const unit of unitsOf[other]) candidatesLeft[unit]++;
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

  function grade(size, regions) {
    const { squareCount, units, unitsOf, near } = unitsOfBoard(size, regions);
    const unitCount = 3 * size;
    let candidate = new Uint8Array(squareCount).fill(1);
    let filled = new Uint8Array(unitCount);
    let placed = 0;

    function place(square) {
      for (const other of near[square]) candidate[other] = 0;
      for (const other of units[unitsOf[square][2]]) candidate[other] = 0;
      for (const unit of unitsOf[square]) filled[unit] = 1;
      placed++;
    }
    const candidatesIn = (unit) => { let count = 0; for (const square of units[unit]) count += candidate[square]; return count; };
    const stuck = () => {
      for (let unit = 0; unit < unitCount; unit++) if (!filled[unit] && !candidatesIn(unit)) return true;
      return false;
    };

    // Step 1.
    function singles() {
      for (let again = true; again;) {
        again = false;
        for (let unit = 0; unit < unitCount; unit++) {
          if (filled[unit] || candidatesIn(unit) !== 1) continue;
          place(units[unit].find((square) => candidate[square]));
          again = true;
        }
      }
    }

    // Step 2.
    const ruledOutBy = new Int32Array(squareCount).fill(-1);   // ruledOutBy[j] === i: an O on i rules out j
    function wipesOut() {
      for (let square = 0; square < squareCount; square++) {
        if (!candidate[square]) continue;
        for (const other of near[square]) ruledOutBy[other] = square;
        for (const other of units[unitsOf[square][2]]) ruledOutBy[other] = square;
        for (let unit = 0; unit < unitCount; unit++) {
          if (filled[unit] || unitsOf[square].includes(unit)) continue;
          if (units[unit].every((other) => !candidate[other] || ruledOutBy[other] === square)) {
            candidate[square] = 0;
            return true;
          }
        }
      }
      return false;
    }

    // Step 3.
    function confine() {
      const kinds = [[0, size], [size, 2 * size], [2 * size, 3 * size]];   // rows, columns, groups
      for (const [fromStart, fromEnd] of kinds) {
        const open = [];
        for (let unit = fromStart; unit < fromEnd; unit++) if (!filled[unit]) open.push(unit);
        const openCount = open.length;
        if (openCount > 16) continue;
        for (const [intoStart, intoEnd] of kinds) {
          if (fromStart === intoStart) continue;
          // reach[t]: the units of the other kind that open unit t's candidates lie in.
          const reach = open.map((unit) => {
            const into = new Set();
            for (const square of units[unit]) {
              if (candidate[square]) into.add(unitsOf[square].find((u) => u >= intoStart && u < intoEnd));
            }
            return into;
          });
          for (let mask = 1; mask < (1 << openCount) - 1; mask++) {
            const chosen = [], reached = new Set();
            for (let t = 0; t < openCount; t++) {
              if (mask >> t & 1) { chosen.push(open[t]); reach[t].forEach((u) => reached.add(u)); }
            }
            if (chosen.length < 2 || reached.size !== chosen.length) continue;
            let changed = false;
            for (const unit of reached) {
              for (const square of units[unit]) {
                if (candidate[square] && !unitsOf[square].some((u) => chosen.includes(u))) {
                  candidate[square] = 0;
                  changed = true;
                }
              }
            }
            if (changed) return true;
          }
        }
      }
      return false;
    }

    // Step 4.
    function chain() {
      for (let square = 0; square < squareCount; square++) {
        if (!candidate[square]) continue;
        const saved = [candidate, filled, placed];
        candidate = candidate.slice();
        filled = filled.slice();
        place(square);
        singles();
        const bad = stuck();
        [candidate, filled, placed] = saved;
        if (bad) { candidate[square] = 0; return true; }
      }
      return false;
    }

    let technique = 1, score = 0;
    const steps = [null, null, wipesOut, confine, chain];
    for (;;) {
      singles();
      if (placed === size) return { technique, score };
      let step = 2;
      while (step < steps.length && !steps[step]()) step++;
      if (step === steps.length) return { technique: 5, score: score + 100 };
      technique = Math.max(technique, step);
      score += STEP_SCORE[step];
    }
  }

  // Is `group` still one connected piece without square `removed`?
  function isConnectedWithout(regions, size, group, removed) {
    const squares = [];
    for (let i = 0; i < size * size; i++) if (regions[i] === group && i !== removed) squares.push(i);
    if (!squares.length) return false;
    const seen = new Set([squares[0]]);
    const stack = [squares[0]];
    while (stack.length) {
      const square = stack.pop();
      for (const next of sideNeighbours(square, size)) {
        if (next !== removed && regions[next] === group && !seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return seen.size === squares.length;
  }

  // Break an unwanted solution by moving one of its squares into a neighbouring
  // group, keeping every group connected and every solution square where it is.
  function repair(regions, size, solution, otherSolution) {
    const solutionSquares = new Set(solution.map((column, row) => row * size + column));
    const changes = [];   // [square, new group]
    otherSolution.forEach((column, row) => {
      const square = row * size + column;
      if (solutionSquares.has(square)) return;
      for (const next of sideNeighbours(square, size)) {
        if (regions[next] !== regions[square]) changes.push([square, regions[next]]);
      }
    });
    for (const [square, group] of shuffle(changes)) {
      if (isConnectedWithout(regions, size, regions[square], square)) {
        regions[square] = group;
        return true;
      }
    }
    return false;
  }

  function generateOne(size) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const solution = randomPlacement(size);
      const regions = growRegions(size, solution);
      for (let step = 0; step < size * 4; step++) {
        const { count, solutions } = solve(size, regions, 2);
        if (count === 1) return { size, regions, solution };
        const otherSolution = solutions.find((found) => found.some((column, row) => column !== solution[row]));
        if (!repair(regions, size, solution, otherSolution)) break;
      }
    }
    throw new Error('Could not generate a puzzle');
  }

  // Difficulty: deal up to 12 puzzles (1 s budget, at least 3), rank them by
  // grade score and take the easiest, the middle one or the hardest.
  const LEVELS = ['easy', 'medium', 'hard'];
  const POOL = 12, BUDGET_MS = 1000;

  function generate(size, level) {
    if (!LEVELS.includes(level)) level = 'medium';
    const deadline = Date.now() + BUDGET_MS;
    const pool = [];
    while (pool.length < POOL && (pool.length < 3 || Date.now() < deadline)) {
      let puzzle;
      try { puzzle = generateOne(size); } catch (err) { if (pool.length) break; throw err; }
      puzzle.grade = grade(size, puzzle.regions);
      pool.push(puzzle);
      if (level === 'easy' && puzzle.grade.score === 0) break; // can't get easier
    }
    // Never hand out a puzzle that needs guessing if another will do.
    const fair = pool.filter((puzzle) => puzzle.grade.technique < 5);
    const ranked = (fair.length ? fair : pool).sort((a, b) => a.grade.score - b.grade.score);
    const pick = level === 'easy' ? 0 : level === 'hard' ? ranked.length - 1 : (ranked.length - 1) >> 1;
    return Object.assign(ranked[pick], { level });
  }

  const api = { generate, solve, grade, LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Groups = api;
})(this);
