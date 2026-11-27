// Logic for "Arrows" mode: an N×N grid filled with arrow pieces.
// Tapping a piece slides it off the board, head first, following its own path
// like a snake, but only if every square straight ahead of its head, up to the
// edge, is empty. Clear the whole board.
//
// A piece is { cells, dir }: cells is its path of squares, head first (each
// square next to the one before), and dir is the way the head points:
// 0 up / 1 right / 2 down / 3 left. For a piece of 2+ squares the head points
// straight on from the square behind it. Pieces can bend (Medium: up to 1 bend,
// Hard: up to 3); Easy pieces are straight.
//
// A board is { size, pieces }. Removing a piece only ever frees squares, so a
// board can be cleared exactly when no pieces block each other in a loop, and
// then taking off any free piece, again and again, always clears it.
//
// generate(n, level) takes level 'easy' | 'medium' | 'hard'. generateCube(n,
// level) makes the 3D version: an n × n × n cube of single blocks (see below).

(function (root) {
  'use strict';

  // Directions: 0 up, 1 right, 2 down, 3 left, and on the 3D cube also
  // 4 front (towards the player at the start) and 5 back.
  const DR = [-1, 0, 1, 0, 0, 0];
  const DC = [0, 1, 0, -1, 0, 0];
  const DZ = [0, 0, 0, 0, 1, -1];
  const LEVELS = ['easy', 'medium', 'hard'];

  // Per level: most bends in one piece, how likely each length is (weights for
  // lengths 1, 2, 3, ...), and how often a piece turns while it grows when it may.
  const SHAPES = {
    easy: { bends: 0, weights: [1, 4, 4], turn: 0 },
    medium: { bends: 1, weights: [1, 3, 4, 4], turn: 0.7 },
    hard: { bends: 3, weights: [1, 2, 3, 3, 3, 3], turn: 0.8 },
  };

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

  // Direction of the step from square a to its neighbour b.
  function stepDir(a, b, n) {
    const d = b - a;
    return d === -n ? 0 : d === 1 ? 1 : d === n ? 2 : 3;
  }

  // Number of bends along a piece's path.
  function bends(p, n) {
    let count = 0;
    for (let k = 2; k < p.cells.length; k++) {
      if (stepDir(p.cells[k], p.cells[k - 1], n) !== stepDir(p.cells[k - 1], p.cells[k - 2], n)) count++;
    }
    return count;
  }

  // A piece from before pieces could bend: { r, c, len, dir } (head at r, c).
  function fromStraight(p, n) {
    const cells = [];
    for (let k = 0; k < p.len; k++) cells.push((p.r - DR[p.dir] * k) * n + (p.c - DC[p.dir] * k));
    return { cells, dir: p.dir };
  }

  // owner[square] = piece index, or -1 for an empty square. A 3D cube has
  // `depth` = size layers; square index = (layer × size + row) × size + column,
  // so a flat board (depth 1) is layer 0.
  function ownerGrid(board) {
    const owner = new Int16Array(board.size * board.size * (board.depth || 1)).fill(-1);
    board.pieces.forEach((p, id) => { for (const i of p.cells) owner[i] = id; });
    return owner;
  }

  // First piece in the way of piece `id` (nearest its head), or -1 if its path
  // to the edge is clear. `removed[id]` marks pieces already off the board.
  function blocker(board, owner, removed, id) {
    const n = board.size, depth = board.depth || 1, p = board.pieces[id], head = p.cells[0];
    let z = Math.floor(head / (n * n)) + DZ[p.dir];
    let r = Math.floor(head / n) % n + DR[p.dir], c = head % n + DC[p.dir];
    while (r >= 0 && r < n && c >= 0 && c < n && z >= 0 && z < depth) {
      const o = owner[(z * n + r) * n + c];
      if (o >= 0 && !removed[o]) return o;
      r += DR[p.dir];
      c += DC[p.dir];
      z += DZ[p.dir];
    }
    return -1;
  }

  // Pieces still on the board that can slide off now.
  function free(board, removed, owner) {
    owner = owner || ownerGrid(board);
    removed = removed || [];
    const out = [];
    board.pieces.forEach((p, id) => {
      if (!removed[id] && blocker(board, owner, removed, id) < 0) out.push(id);
    });
    return out;
  }

  // A removal order that clears the board, or null if some pieces block each
  // other in a loop. Works from any position (`removed` marks pieces already off).
  function solve(board, removed) {
    const owner = ownerGrid(board);
    const off = board.pieces.map((p, id) => !!(removed && removed[id]));
    let left = off.filter((x) => !x).length;
    const order = [];
    while (left) {
      const f = free(board, off, owner);
      if (!f.length) return null;
      for (const id of f) { off[id] = true; order.push(id); left--; }
    }
    return order;
  }

  // ---------- Generator ----------

  function pickLength(weights) {
    let total = 0;
    for (const w of weights) total += w;
    let x = Math.random() * total;
    for (let k = 0; k < weights.length; k++) {
      x -= weights[k];
      if (x < 0) return k + 1;
    }
    return weights.length;
  }

  // Split the grid into pieces: paths of squares that grow from a random
  // starting square, at either end, up to a random length and at most
  // `maxBends` bends. Returns a list of paths (end to end).
  function tile(n, shape) {
    const taken = new Uint8Array(n * n);
    const paths = [];
    const neighbours = (i) => {
      const r = Math.floor(i / n), c = i % n, out = [];
      if (r > 0) out.push(i - n);
      if (c < n - 1) out.push(i + 1);
      if (r < n - 1) out.push(i + n);
      if (c > 0) out.push(i - 1);
      return out;
    };
    for (const start of shuffle([...Array(n * n).keys()])) {
      if (taken[start]) continue;
      const want = pickLength(shape.weights);
      const path = [start];
      taken[start] = 1;
      let turns = 0;
      while (path.length < want) {
        const options = [];   // [atEnd, square, bends]
        for (const atEnd of [false, true]) {
          const end = atEnd ? path[path.length - 1] : path[0];
          const prev = path.length > 1 ? (atEnd ? path[path.length - 2] : path[1]) : -1;
          for (const next of neighbours(end)) {
            if (taken[next]) continue;
            const turn = prev >= 0 && stepDir(prev, end, n) !== stepDir(end, next, n) ? 1 : 0;
            if (turns + turn <= shape.bends) options.push([atEnd, next, turn]);
          }
        }
        if (!options.length) break;
        // Where a bend is allowed, take one `shape.turn` of the time.
        const turning = options.filter((o) => o[2]), straight = options.filter((o) => !o[2]);
        const pool = turning.length && (!straight.length || Math.random() < shape.turn) ? turning : straight;
        const [atEnd, next, turn] = pool[randInt(pool.length)];
        if (atEnd) path.push(next); else path.unshift(next);
        taken[next] = 1;
        turns += turn;
      }
      paths.push(path);
    }
    return paths;
  }

  // The ways a path can become a piece: either end can be the head, pointing
  // straight on (a single square can point any way).
  function orientations(path, n) {
    if (path.length === 1) return [0, 1, 2, 3].map((dir) => ({ cells: path.slice(), dir }));
    const fwd = path.slice().reverse();   // head = last square of path
    return [
      { cells: fwd, dir: stepDir(fwd[1], fwd[0], n) },
      { cells: path.slice(), dir: stepDir(path[1], path[0], n) },
    ];
  }

  // One full board, or null if it got stuck. Plays the game forwards on the
  // bare tiling: again and again, take a shape that has some clear way out,
  // point it that way and lift it off. Every piece's path then crosses only
  // pieces that went before it, so the board is solvable. (Straight pieces
  // never get stuck; bent ones rarely can, and then the deal is thrown away.)
  // `greed` (0–1) is how often the shape with the longest clear path is taken
  // instead of a random one; long paths over pieces that went first make more
  // pieces wait on others.
  function generateOne(n, level, greed) {
    const paths = tile(n, SHAPES[level] || SHAPES.easy);
    const owner = new Int16Array(n * n).fill(-1);
    paths.forEach((sq, id) => { for (const i of sq) owner[i] = id; });
    const off = new Array(paths.length).fill(false);
    const pieces = new Array(paths.length);
    const options = paths.map((sq) => orientations(sq, n));
    for (let left = paths.length; left; left--) {
      const moves = [];   // [id, piece, path length]
      options.forEach((opts, id) => {
        if (off[id]) return;
        for (const p of opts) {
          const head = p.cells[0];
          let r = Math.floor(head / n) + DR[p.dir], c = head % n + DC[p.dir], len = 0, clear = true;
          while (r >= 0 && r < n && c >= 0 && c < n) {
            const o = owner[r * n + c];
            if (o >= 0 && !off[o]) { clear = false; break; }
            r += DR[p.dir]; c += DC[p.dir]; len++;
          }
          if (clear) moves.push([id, p, len]);
        }
      });
      if (!moves.length) return null;
      let m;
      if (Math.random() < greed) {
        const best = Math.max(...moves.map((x) => x[2]));
        const top = moves.filter((x) => x[2] === best);
        m = top[randInt(top.length)];
      } else {
        m = moves[randInt(moves.length)];
      }
      pieces[m[0]] = m[1];
      off[m[0]] = true;
    }
    return { size: n, pieces };
  }

  // Difficulty, by playing like a person who always takes the first free piece:
  // `layers` is the longest chain of "this must go first" (rounds of taking
  // every free piece at once), `tight` is how few pieces are free at each step
  // on average (0 = all free, 1 = one at a time). score = layers + 10 × tight.
  function grade(board) {
    const owner = ownerGrid(board);
    const total = board.pieces.length;
    let layers = 0;
    {
      const off = new Array(total).fill(false);
      for (let left = total; left;) {
        const f = free(board, off, owner);
        if (!f.length) return null;
        for (const id of f) off[id] = true;
        left -= f.length;
        layers++;
      }
    }
    let sum = 0;
    const off = new Array(total).fill(false);
    for (let left = total; left; left--) {
      const f = free(board, off, owner);
      sum += f.length / left;
      off[f[0]] = true;
    }
    const tight = 1 - sum / total;
    return { layers, tight, score: layers + 10 * tight };
  }

  // Deal up to 12 boards (1 s budget, at least 3) with a spread of greed and
  // keep the hardest. The levels differ in the shapes of the pieces: straight
  // (Easy), up to 1 bend (Medium), up to 3 bends (Hard).
  const POOL = 12, BUDGET_MS = 1000;

  function generate(n, level) {
    if (!LEVELS.includes(level)) level = 'medium';
    const deadline = Date.now() + BUDGET_MS;
    const pool = [];
    for (let tries = 0; pool.length < POOL && (pool.length < 3 || Date.now() < deadline) && tries < 200; tries++) {
      const b = generateOne(n, level, pool.length / (POOL - 1));
      if (!b) continue;
      b.grade = grade(b);
      pool.push(b);
    }
    if (!pool.length) throw new Error('Could not generate a puzzle');
    pool.sort((a, b) => a.grade.score - b.grade.score);
    return Object.assign(pool[pool.length - 1], { level });
  }

  // ---------- 3D cube ----------
  // An n × n × n cube of single blocks, each pointing one of 6 ways. Built the
  // same way as the flat board: play forwards, again and again lifting off a
  // block that has a clear way out (one always exists: a block on the outside
  // can leave through its own face). Deals 12 (1 s budget, at least 3) with a
  // spread of greed, ranks them by grade() and takes the easiest (Easy), the
  // middle one (Medium) or the hardest (Hard).

  function generateCubeOne(n, greed) {
    const total = n * n * n;
    const off = new Uint8Array(total);   // every square holds a block until lifted off
    const pieces = new Array(total);
    for (let left = total; left; left--) {
      const moves = [];   // [square, dir, clear distance]
      for (let i = 0; i < total; i++) {
        if (off[i]) continue;
        const z0 = Math.floor(i / (n * n)), r0 = Math.floor(i / n) % n, c0 = i % n;
        for (let dir = 0; dir < 6; dir++) {
          let z = z0 + DZ[dir], r = r0 + DR[dir], c = c0 + DC[dir], len = 0, clear = true;
          while (r >= 0 && r < n && c >= 0 && c < n && z >= 0 && z < n) {
            if (!off[(z * n + r) * n + c]) { clear = false; break; }
            z += DZ[dir]; r += DR[dir]; c += DC[dir]; len++;
          }
          if (clear) moves.push([i, dir, len]);
        }
      }
      let m;
      if (Math.random() < greed) {
        const best = Math.max(...moves.map((x) => x[2]));
        const top = moves.filter((x) => x[2] === best);
        m = top[randInt(top.length)];
      } else {
        m = moves[randInt(moves.length)];
      }
      pieces[m[0]] = { cells: [m[0]], dir: m[1] };
      off[m[0]] = 1;
    }
    return { size: n, depth: n, pieces };
  }

  function generateCube(n, level) {
    if (!LEVELS.includes(level)) level = 'medium';
    const deadline = Date.now() + BUDGET_MS;
    const pool = [];
    while (pool.length < POOL && (pool.length < 3 || Date.now() < deadline)) {
      const b = generateCubeOne(n, pool.length / (POOL - 1));
      b.grade = grade(b);
      pool.push(b);
    }
    pool.sort((a, b) => a.grade.score - b.grade.score);
    const pick = level === 'easy' ? 0 : level === 'hard' ? pool.length - 1 : (pool.length - 1) >> 1;
    return Object.assign(pool[pick], { level });
  }

  const api = {
    generateCube, generateCubeOne,
    generate, generateOne, grade, solve, free, blocker, ownerGrid, bends, stepDir, fromStraight,
    DR, DC, DZ, LEVELS, SHAPES,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Arrows = api;
})(this);
