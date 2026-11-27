// Logic for "Arrows" mode: an N×N grid filled with arrow pieces.
// Tapping a piece slides it off the board, head first, following its own path
// like a snake, but only if every square straight ahead of its head, up to the
// edge, is empty. Clear the whole board.
//
// A piece is { cells, dir }: cells is its path of squares, head first (each
// square next to the one before), and dir is the way the head points:
// 0 up / 1 right / 2 down / 3 left. For a piece of 2+ squares the head points
// straight on from the square behind it. On the flat board Easy pieces are
// straight, and Medium and Hard pieces bend up to 3 times (Hard is built for
// longer must-go-first chains); see FLAT_LEVELS.
//
// A board is { size, pieces }. Removing a piece only ever frees squares, so a
// board can be cleared exactly when no pieces block each other in a loop, and
// then taking off any free piece, again and again, always clears it.
//
// generate(n, level) takes level 'easy' | 'medium' | 'hard'. generateCube(n,
// level) makes the 3D version: an n × n × n cube (see below).

(function (root) {
  'use strict';

  // Directions: 0 up, 1 right, 2 down, 3 left, and on the 3D cube also
  // 4 front (towards the player at the start) and 5 back.
  const DR = [-1, 0, 1, 0, 0, 0];
  const DC = [0, 1, 0, -1, 0, 0];
  const DZ = [0, 0, 0, 0, 1, -1];
  const LEVELS = ['easy', 'medium', 'hard'];

  // Piece shapes: most bends in one piece, how likely each length is (weights
  // for lengths 1, 2, 3, ...), and how often a piece turns while it grows when
  // it may.
  const SHAPES = {
    straight: { bends: 0, weights: [1, 4, 4], turn: 0 },
    bend1: { bends: 1, weights: [1, 3, 4, 4], turn: 0.7 },
    bend3: { bends: 3, weights: [1, 2, 3, 3, 3, 3], turn: 0.8 },
    bend3short: { bends: 3, weights: [1, 4, 4, 3], turn: 0.85 },   // more pieces, so more in each other's way
    // Hard: short pieces plus one long winding one, N − 2 to N + 2 squares on
    // an N × N board with up to 5 bends.
    hard: { bends: 3, weights: [1, 4, 4, 3], turn: 0.85, long: (n) => ({ count: 1, min: n - 2, max: n + 2, bends: 5 }) },
  };

  // Flat board levels: the piece shape, how many boards to deal, the lowest
  // greed dealt, what greed goes for (false: the longest clear path; 'moves':
  // the most moves needed before the piece can go), what picks the hardest
  // deal ('grade': grade() score; 'moves': movesFirst()), and how many arrow
  // flips per square improve the pick afterwards (see improve()). The hardest
  // deal is kept, except with `match`: then the deal whose movesFirst() is
  // closest to that level's (measured on two of its boards) is kept, and
  // flipped up towards it if it falls short.
  const FLAT_LEVELS = {
    easy: { shape: 'straight', deals: 12, minGreed: 0, chains: false, pick: 'grade', flips: 0 },
    medium: { shape: 'bend3', deals: 40, minGreed: 0, chains: 'moves', pick: 'moves', match: 'easy', flips: 20 },
    hard: { shape: 'hard', deals: 40, minGreed: 0.6, chains: 'moves', pick: 'moves', flips: 20 },
  };

  function bitCount(bits) {
    let count = 0;
    for (let w of bits) for (; w; w &= w - 1) count++;
    return count;
  }

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
    return d === -n ? 0 : d === 1 ? 1 : d === n ? 2 : d === -1 ? 3 : d === n * n ? 4 : 5;
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
  // On the cube (depth n) paths can also run between layers.
  function tile(n, shape, depth = 1) {
    const taken = new Uint8Array(n * n * depth);
    const paths = [];
    const neighbours = (i) => {
      const z = Math.floor(i / (n * n)), r = Math.floor(i / n) % n, c = i % n, out = [];
      if (r > 0) out.push(i - n);
      if (c < n - 1) out.push(i + 1);
      if (r < n - 1) out.push(i + n);
      if (c > 0) out.push(i - 1);
      if (z < depth - 1) out.push(i + n * n);
      if (z > 0) out.push(i - n * n);
      return out;
    };
    // A few long pieces first (`shape.long`: { count, min, max, bends } per
    // board size n), then the rest as usual.
    const long = shape.long ? shape.long(n) : null;
    const order = shuffle([...Array(n * n * depth).keys()]);
    const starts = long ? [...order.slice(0, long.count), ...order] : order;
    for (let k = 0; k < starts.length; k++) {
      const start = starts[k];
      if (taken[start]) continue;
      const isLong = long && k < long.count;
      const want = isLong ? long.min + randInt(long.max - long.min + 1) : pickLength(shape.weights);
      const maxBends = isLong ? long.bends : shape.bends;
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
            if (turns + turn <= maxBends) options.push([atEnd, next, turn]);
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
  function orientations(path, n, depth = 1) {
    if (path.length === 1) return (depth > 1 ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3]).map((dir) => ({ cells: path.slice(), dir }));
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
  // `greed` (0–1) is how often the best move is taken instead of a random one:
  // the one with the longest clear path (long paths over pieces that went first
  // make more pieces wait on others), or with `chains`, the one that makes the
  // longest chain of pieces that must go first.
  function generateOne(n, shape, greed, depth = 1, chains = false) {
    const paths = tile(n, SHAPES[shape], depth);
    const owner = new Int16Array(n * n * depth).fill(-1);
    paths.forEach((sq, id) => { for (const i of sq) owner[i] = id; });
    const off = new Array(paths.length).fill(false);
    const pieces = new Array(paths.length);
    const options = paths.map((sq) => orientations(sq, n, depth));
    const chain = new Array(paths.length).fill(0);   // longest must-go-first chain ending at each piece
    const words = (paths.length + 31) >> 5;
    const before = paths.map(() => new Uint32Array(words));   // pieces that must go before each piece (bits)
    for (let left = paths.length; left; left--) {
      const moves = [];   // [id, piece, path length, chain depth, moves needed first]
      options.forEach((opts, id) => {
        if (off[id]) return;
        for (const p of opts) {
          const head = p.cells[0];
          let z = Math.floor(head / (n * n)) + DZ[p.dir];
          let r = Math.floor(head / n) % n + DR[p.dir], c = head % n + DC[p.dir], len = 0, clear = true, deep = 0;
          const crossed = new Set();
          while (r >= 0 && r < n && c >= 0 && c < n && z >= 0 && z < depth) {
            const o = owner[(z * n + r) * n + c];
            if (o >= 0 && !off[o]) { clear = false; break; }
            if (o >= 0) { deep = Math.max(deep, chain[o]); crossed.add(o); }
            r += DR[p.dir]; c += DC[p.dir]; z += DZ[p.dir]; len++;
          }
          if (clear) {
            // Every piece that must go before this one: those in its way, and theirs.
            const need = new Uint32Array(words);
            for (const o of crossed) {
              need[o >> 5] |= 1 << (o & 31);
              for (let w = 0; w < words; w++) need[w] |= before[o][w];
            }
            moves.push([id, p, len, deep + 1, bitCount(need), need]);
          }
          crossed.clear();
        }
      });
      if (!moves.length) return null;
      let m;
      const key = chains === 'moves' ? 4 : chains ? 3 : 2;
      if (Math.random() < greed) {
        const best = Math.max(...moves.map((x) => x[key]));
        const top = moves.filter((x) => x[key] === best);
        m = top[randInt(top.length)];
      } else {
        m = moves[randInt(moves.length)];
      }
      pieces[m[0]] = m[1];
      chain[m[0]] = m[3];
      before[m[0]] = m[5];
      off[m[0]] = true;
    }
    return { size: n, depth, pieces };
  }

  // How many moves each piece needs before it can go: every piece in its way,
  // and every piece in their way, and so on. Returns the average over all
  // pieces and the most for one piece. This is what Hard is built for.
  function movesFirst(board) {
    const n = board.size, depth = board.depth || 1, owner = ownerGrid(board);
    const count = board.pieces.length, words = (count + 31) >> 5;
    const direct = board.pieces.map((p) => {
      const out = new Set(), head = p.cells[0];
      let z = Math.floor(head / (n * n)) + DZ[p.dir];
      let r = Math.floor(head / n) % n + DR[p.dir], c = head % n + DC[p.dir];
      while (r >= 0 && r < n && c >= 0 && c < n && z >= 0 && z < depth) {
        const o = owner[(z * n + r) * n + c];
        if (o >= 0) out.add(o);
        r += DR[p.dir]; c += DC[p.dir]; z += DZ[p.dir];
      }
      return out;
    });
    const memo = new Array(count);
    const need = (id) => {
      if (memo[id]) return memo[id];
      const bits = new Uint32Array(words);
      memo[id] = bits;   // (no loops on a solvable board)
      for (const o of direct[id]) {
        bits[o >> 5] |= 1 << (o & 31);
        const theirs = need(o);
        for (let w = 0; w < words; w++) bits[w] |= theirs[w];
      }
      return bits;
    };
    let sum = 0, most = 0;
    for (let id = 0; id < count; id++) {
      const k = bitCount(need(id));
      sum += k;
      most = Math.max(most, k);
    }
    return { avg: sum / count, most };
  }

  // Make a board harder: again and again, point one piece the other way (its
  // other end becomes the head; a single square turns), and keep the change if
  // the board can still be cleared and pieces need at least as many moves first.
  function improve(board, tries, goal = Infinity) {
    const n = board.size;
    let best = movesFirst(board).avg;
    for (let t = 0; t < tries && best < goal; t++) {
      const id = randInt(board.pieces.length), old = board.pieces[id];
      let next;
      if (old.cells.length === 1) {
        const dirs = (board.depth > 1 ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3]).filter((d) => d !== old.dir);
        next = { cells: old.cells, dir: dirs[randInt(dirs.length)] };
      } else {
        const cells = old.cells.slice().reverse();
        next = { cells, dir: stepDir(cells[1], cells[0], n) };
      }
      board.pieces[id] = next;
      if (solve(board)) {
        const score = movesFirst(board).avg;
        if (score >= best) { best = score; continue; }
      }
      board.pieces[id] = old;
    }
    return board;
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

  // Deal boards for a level (FLAT_LEVELS; 1 s budget, at least 3) with greed
  // spread from its lowest to 1, and keep the hardest (Easy and Medium by
  // grade(), Hard by movesFirst()). Easy: straight pieces. Medium: up to 3
  // bends, as many moves needed first as Easy (see `match`). Hard: shorter pieces with up to 3 bends and one
  // long one (N ± 2 squares, up to 5 bends), built so
  // pieces need as many moves as possible before they can go, the hardest of
  // 40 deals by that count, then improve()d.
  const POOL = 12, BUDGET_MS = 1000;

  function generate(n, level) {
    if (!LEVELS.includes(level)) level = 'medium';
    const cfg = FLAT_LEVELS[level];
    const deadline = Date.now() + BUDGET_MS;
    let best = null, dealt = 0, goal = Infinity;
    if (cfg.match) {
      goal = (movesFirst(generate(n, cfg.match)).avg + movesFirst(generate(n, cfg.match)).avg) / 2;
    }
    for (let tries = 0; dealt < cfg.deals && (dealt < 3 || Date.now() < deadline) && tries < cfg.deals * 4; tries++) {
      const greed = cfg.minGreed + (1 - cfg.minGreed) * (dealt / (cfg.deals - 1));
      const b = generateOne(n, cfg.shape, greed, 1, cfg.chains);
      if (!b) continue;
      dealt++;
      b.score = cfg.pick === 'moves' ? movesFirst(b).avg : grade(b).score;
      if (cfg.match) b.score = -Math.abs(b.score - goal);   // closest to the goal wins
      if (!best || b.score > best.score) best = b;
    }
    if (!best) throw new Error('Could not generate a puzzle');
    if (cfg.flips) improve(best, cfg.flips * n * n, goal);
    best.grade = grade(best);
    return Object.assign(best, { level });
  }

  // ---------- 3D cube ----------
  // An n × n × n cube. Easy: single blocks, each pointing one of 6 ways.
  // Medium and Hard: pieces like the flat board's (up to 1 / 3 bends), which
  // can also run between layers. Built the same way as the flat board: play
  // forwards, again and again lifting off a piece that has a clear way out
  // (single blocks never get stuck: one on the outside can leave through its
  // own face; bent pieces rarely can, and then the deal is thrown away).
  // Deals 12 (1 s budget, at least 3) with a spread of greed, ranks them by
  // grade() and takes the easiest (Easy), the middle one (Medium) or the
  // hardest (Hard).

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
    for (let tries = 0; pool.length < POOL && (pool.length < 3 || Date.now() < deadline) && tries < 200; tries++) {
      const greed = pool.length / (POOL - 1);
      const b = level === 'easy' ? generateCubeOne(n, greed) : generateOne(n, level === 'medium' ? 'bend1' : 'bend3', greed, n);
      if (!b) continue;
      b.grade = grade(b);
      pool.push(b);
    }
    if (!pool.length) throw new Error('Could not generate a puzzle');
    pool.sort((a, b) => a.grade.score - b.grade.score);
    const pick = level === 'easy' ? 0 : level === 'hard' ? pool.length - 1 : (pool.length - 1) >> 1;
    return Object.assign(pool[pick], { level });
  }

  const api = {
    generateCube, generateCubeOne,
    generate, generateOne, grade, solve, free, blocker, ownerGrid, bends, stepDir, fromStraight,
    DR, DC, DZ, LEVELS, SHAPES, FLAT_LEVELS, movesFirst, improve,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Arrows = api;
})(this);
