// Logic for "Arrows" mode: a size × size grid filled with arrow pieces.
// Tapping a piece slides it off the board, head first, following its own path
// like a snake, but only if every square straight ahead of its head, up to the
// edge, is empty. Clear the whole board.
//
// A piece is { cells, dir }: cells is its path of squares, head first (each
// square next to the one before), and dir is the way the head points:
// 0 up / 1 right / 2 down / 3 left. For a piece of 2+ squares the head points
// straight on from the square behind it. On the flat board Easy pieces are
// straight, and Medium and Hard pieces bend up to 3 times (Hard is built for
// longer must-go-first chains); see FLAT_LEVELS. (`cells` and `dir` are kept
// short because saved games store them.)
//
// A board is { size, pieces }. Removing a piece only ever frees squares, so a
// board can be cleared exactly when no pieces block each other in a loop, and
// then taking off any free piece, again and again, always clears it.
//
// generate(size, level) takes level 'easy' | 'medium' | 'hard'.
// generateCube(size, level) makes the 3D version: a size × size × size cube
// (see below).

(function (root) {
  'use strict';

  const { randomInt, shuffle } = typeof module !== 'undefined' && module.exports ? require('./shared.js') : root.Shared;

  // Directions: 0 up, 1 right, 2 down, 3 left, and on the 3D cube also
  // 4 front (towards the player at the start) and 5 back. One step in each
  // direction changes the row, column and layer by:
  const ROW_STEP = [-1, 0, 1, 0, 0, 0];
  const COLUMN_STEP = [0, 1, 0, -1, 0, 0];
  const LAYER_STEP = [0, 0, 0, 0, 1, -1];
  const FLAT_DIRECTIONS = [0, 1, 2, 3];
  const CUBE_DIRECTIONS = [0, 1, 2, 3, 4, 5];
  const LEVELS = ['easy', 'medium', 'hard'];

  // Piece shapes: most bends in one piece, how likely each length is (weights
  // for lengths 1, 2, 3, ...), and how often a piece turns while it grows when
  // it may.
  const SHAPES = {
    straight: { bends: 0, weights: [1, 4, 4], turn: 0 },
    bend1: { bends: 1, weights: [1, 3, 4, 4], turn: 0.7 },
    bend3: { bends: 3, weights: [1, 2, 3, 3, 3, 3], turn: 0.8 },
    bend3short: { bends: 3, weights: [1, 4, 4, 3], turn: 0.85 },   // more pieces, so more in each other's way
    // Hard: short pieces plus one long winding one, size − 2 to size + 2
    // squares with up to 5 bends.
    hard: {
      bends: 3, weights: [1, 4, 4, 3], turn: 0.85,
      long: (size) => ({ count: 1, min: size - 2, max: size + 2, bends: 5 }),
    },
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

  // ---------- Squares ----------
  // A square's index is (layer × size + row) × size + column; a flat board is
  // layer 0 only (depth 1), a cube has `depth` = size layers.

  function coordinatesOf(square, size) {
    return {
      layer: Math.floor(square / (size * size)),
      row: Math.floor(square / size) % size,
      column: square % size,
    };
  }

  // Is the square off the outer ring of the board (in any layer)?
  function insideRing(square, size) {
    const { row, column } = coordinatesOf(square, size);
    return row > 0 && row < size - 1 && column > 0 && column < size - 1;
  }

  // Rays: rays[square × 6 + dir] lists the squares straight ahead of `square`
  // in direction `dir`, nearest first, up to the edge. Worked out once per
  // board shape and kept: the generators use them in their innermost loops.
  const raysCache = new Map();
  let lastKey = -1, lastRays = null;   // the shape asked for last: nearly always the same one
  function raysFor(size, depth) {
    const key = size * 1000 + depth;
    if (key === lastKey) return lastRays;
    lastKey = key;
    if (raysCache.has(key)) return (lastRays = raysCache.get(key));
    const rays = [];
    for (let square = 0; square < size * size * depth; square++) {
      for (let dir = 0; dir < 6; dir++) {
        const ray = [];
        let { layer, row, column } = coordinatesOf(square, size);
        for (;;) {
          layer += LAYER_STEP[dir]; row += ROW_STEP[dir]; column += COLUMN_STEP[dir];
          if (row < 0 || row >= size || column < 0 || column >= size || layer < 0 || layer >= depth) break;
          ray.push((layer * size + row) * size + column);
        }
        rays.push(ray);
      }
    }
    raysCache.set(key, rays);
    return (lastRays = rays);
  }
  const squaresAhead = (square, dir, size, depth) => raysFor(size, depth)[square * 6 + dir];

  // Direction of the step from a square to its neighbour.
  function stepDirection(from, to, size) {
    const difference = to - from;
    return difference === -size ? 0 : difference === 1 ? 1 : difference === size ? 2
      : difference === -1 ? 3 : difference === size * size ? 4 : 5;
  }

  // Number of bends along a piece's path.
  function bends(piece, size) {
    const path = piece.cells;
    let count = 0;
    for (let k = 2; k < path.length; k++) {
      if (stepDirection(path[k], path[k - 1], size) !== stepDirection(path[k - 1], path[k - 2], size)) count++;
    }
    return count;
  }

  // A piece from before pieces could bend: { r, c, len, dir } (head at r, c).
  function fromStraight(oldPiece, size) {
    const cells = [];
    for (let k = 0; k < oldPiece.len; k++) {
      cells.push((oldPiece.r - ROW_STEP[oldPiece.dir] * k) * size + (oldPiece.c - COLUMN_STEP[oldPiece.dir] * k));
    }
    return { cells, dir: oldPiece.dir };
  }

  // owner[square] = id of the piece on it, or -1 for an empty square.
  function ownerGrid(board) {
    const owner = new Int16Array(board.size * board.size * (board.depth || 1)).fill(-1);
    board.pieces.forEach((piece, id) => { for (const square of piece.cells) owner[square] = id; });
    return owner;
  }

  function bitCount(bits) {
    let count = 0;
    for (let word of bits) for (; word; word &= word - 1) count++;
    return count;
  }

  // ---------- Playing ----------

  // First piece in the way of piece `id` (nearest its head), or -1 if its path
  // to the edge is clear. `removed[id]` marks pieces already off the board.
  function blocker(board, owner, removed, id) {
    const piece = board.pieces[id];
    for (const square of squaresAhead(piece.cells[0], piece.dir, board.size, board.depth || 1)) {
      const other = owner[square];
      if (other >= 0 && !removed[other]) return other;
    }
    return -1;
  }

  // Pieces still on the board that can slide off now.
  function free(board, removed, owner) {
    owner = owner || ownerGrid(board);
    removed = removed || [];
    const out = [];
    board.pieces.forEach((piece, id) => {
      if (!removed[id] && blocker(board, owner, removed, id) < 0) out.push(id);
    });
    return out;
  }

  // A removal order that clears the board, or null if some pieces block each
  // other in a loop. Works from any position (`removed` marks pieces already off).
  function solve(board, removed) {
    const owner = ownerGrid(board);
    const off = board.pieces.map((piece, id) => !!(removed && removed[id]));
    let left = off.filter((isOff) => !isOff).length;
    const order = [];
    while (left) {
      const freeNow = free(board, off, owner);
      if (!freeNow.length) return null;
      for (const id of freeNow) { off[id] = true; order.push(id); left--; }
    }
    return order;
  }

  // ---------- Generator ----------

  function pickLength(weights) {
    let total = 0;
    for (const weight of weights) total += weight;
    let roll = Math.random() * total;
    for (let k = 0; k < weights.length; k++) {
      roll -= weights[k];
      if (roll < 0) return k + 1;
    }
    return weights.length;
  }

  // With chance `greed` one of the moves scoring highest by `score` (a random
  // one among equals), otherwise any random move.
  function pickMove(moves, greed, score) {
    if (Math.random() < greed) {
      let best = -Infinity;
      for (const move of moves) best = Math.max(best, score(move));
      const top = moves.filter((move) => score(move) === best);
      return top[randomInt(top.length)];
    }
    return moves[randomInt(moves.length)];
  }

  // Split the grid into pieces: paths of squares that grow from a random
  // starting square, at either end, up to a random length and at most
  // `maxBends` bends. Returns a list of paths (end to end).
  // On the cube (depth = size) paths can also run between layers.
  function tile(size, shape, depth = 1) {
    const taken = new Uint8Array(size * size * depth);
    const paths = [];
    const neighbours = (square) => {
      const { layer, row, column } = coordinatesOf(square, size), out = [];
      if (row > 0) out.push(square - size);
      if (column < size - 1) out.push(square + 1);
      if (row < size - 1) out.push(square + size);
      if (column > 0) out.push(square - 1);
      if (layer < depth - 1) out.push(square + size * size);
      if (layer > 0) out.push(square - size * size);
      return out;
    };
    // Grow a path from `start` up to `want` squares with at most `maxBends`
    // bends, at either end. Marks its squares as taken.
    function grow(start, want, maxBends) {
      const path = [start];
      taken[start] = 1;
      let turns = 0;
      while (path.length < want) {
        const options = [];   // { atEnd, square, turn }
        for (const atEnd of [false, true]) {
          const end = atEnd ? path[path.length - 1] : path[0];
          const behind = path.length > 1 ? (atEnd ? path[path.length - 2] : path[1]) : -1;
          for (const next of neighbours(end)) {
            if (taken[next]) continue;
            const turn = behind >= 0 && stepDirection(behind, end, size) !== stepDirection(end, next, size) ? 1 : 0;
            if (turns + turn <= maxBends) options.push({ atEnd, square: next, turn });
          }
        }
        if (!options.length) break;
        // Where a bend is allowed, take one `shape.turn` of the time.
        const turning = options.filter((option) => option.turn);
        const straightOn = options.filter((option) => !option.turn);
        const choices = turning.length && (!straightOn.length || Math.random() < shape.turn) ? turning : straightOn;
        const chosen = choices[randomInt(choices.length)];
        if (chosen.atEnd) path.push(chosen.square); else path.unshift(chosen.square);
        taken[chosen.square] = 1;
        turns += chosen.turn;
      }
      return path;
    }

    // A few long pieces first (`shape.long`: { count, min, max, bends } for the
    // board size). A long piece's head may not be on the outer ring of the
    // board, so it can't simply leave from the edge: grow it again (from
    // another inside square) until at least one end is inside and it is long
    // enough. generateOne() then only points it with an inside end as the head.
    const inside = (square) => insideRing(square, size);
    const long = shape.long ? shape.long(size) : null;
    for (let k = 0; long && k < long.count; k++) {
      const innerSquares = [...Array(size * size * depth).keys()].filter((square) => inside(square) && !taken[square]);
      for (let attempt = 0; attempt < 200 && innerSquares.length; attempt++) {
        const want = long.min + randomInt(long.max - long.min + 1);
        const path = grow(innerSquares[randomInt(innerSquares.length)], want, long.bends);
        if (path.length >= long.min && (inside(path[0]) || inside(path[path.length - 1]))) {
          paths.push(path);
          break;
        }
        for (const square of path) taken[square] = 0;   // try again
      }
    }
    for (const start of shuffle([...Array(size * size * depth).keys()])) {
      if (taken[start]) continue;
      paths.push(grow(start, pickLength(shape.weights), shape.bends));
    }
    return paths;
  }

  // The ways a path can become a piece: either end can be the head, pointing
  // straight on (a single square can point any way).
  function orientations(path, size, depth = 1) {
    if (path.length === 1) {
      return (depth > 1 ? CUBE_DIRECTIONS : FLAT_DIRECTIONS).map((dir) => ({ cells: path.slice(), dir }));
    }
    const reversed = path.slice().reverse();   // head = last square of path
    return [
      { cells: reversed, dir: stepDirection(reversed[1], reversed[0], size) },
      { cells: path.slice(), dir: stepDirection(path[1], path[0], size) },
    ];
  }

  // One full board, or null if it got stuck. Plays the game forwards on the
  // bare tiling: again and again, take a shape that has some clear way out,
  // point it that way and lift it off. Every piece's path then crosses only
  // pieces that went before it, so the board is solvable. (Straight pieces
  // never get stuck; bent ones rarely can, and then the deal is thrown away.)
  // `greed` (0–1) is how often the best move is taken instead of a random one:
  // the one with the longest clear path (long paths over pieces that went first
  // make more pieces wait on others), with `chains` the one that makes the
  // longest chain of pieces that must go first, or with `chains: 'moves'` the
  // one that needs the most moves before it can go.
  function generateOne(size, shapeName, greed, depth = 1, chains = false) {
    const shape = SHAPES[shapeName];
    const paths = tile(size, shape, depth);
    const owner = new Int16Array(size * size * depth).fill(-1);
    paths.forEach((path, id) => { for (const square of path) owner[square] = id; });
    const lifted = new Array(paths.length).fill(false);
    const pieces = new Array(paths.length);
    const options = paths.map((path) => orientations(path, size, depth));
    // Long pieces (grown first, so ids 0 .. count − 1) keep their head off the outer ring.
    const longCount = shape.long ? shape.long(size).count : 0;
    for (let id = 0; id < longCount && id < options.length; id++) {
      options[id] = options[id].filter((piece) => insideRing(piece.cells[0], size));
    }
    const chainLength = new Array(paths.length).fill(0);   // longest must-go-first chain ending at each piece
    const words = (paths.length + 31) >> 5;
    const mustGoFirst = paths.map(() => new Uint32Array(words));   // pieces that must go before each piece (bits)
    const rays = raysFor(size, depth);
    const score = chains === 'moves' ? (move) => move.movesNeeded
      : chains ? (move) => move.chainLength : (move) => move.clearLength;
    for (let left = paths.length; left; left--) {
      const moves = [];
      options.forEach((pieceOptions, id) => {
        if (lifted[id]) return;
        for (const piece of pieceOptions) {
          let clear = true, clearLength = 0, longestBefore = 0;
          const crossed = new Set();
          for (const square of rays[piece.cells[0] * 6 + piece.dir]) {
            const other = owner[square];
            if (other >= 0 && !lifted[other]) { clear = false; break; }
            if (other >= 0) { longestBefore = Math.max(longestBefore, chainLength[other]); crossed.add(other); }
            clearLength++;
          }
          if (!clear) continue;
          // Every piece that must go before this one: those in its way, and theirs.
          const before = new Uint32Array(words);
          for (const other of crossed) {
            before[other >> 5] |= 1 << (other & 31);
            for (let w = 0; w < words; w++) before[w] |= mustGoFirst[other][w];
          }
          moves.push({ id, piece, clearLength, chainLength: longestBefore + 1, movesNeeded: bitCount(before), before });
        }
      });
      if (!moves.length) return null;
      const move = pickMove(moves, greed, score);
      pieces[move.id] = move.piece;
      chainLength[move.id] = move.chainLength;
      mustGoFirst[move.id] = move.before;
      lifted[move.id] = true;
    }
    return longCount ? { size, depth, pieces, longCount } : { size, depth, pieces };
  }

  // How many moves each piece needs before it can go: every piece in its way,
  // and every piece in their way, and so on. Returns the average over all
  // pieces and the most for one piece. This is what Hard is built for.
  function movesFirst(board) {
    const depth = board.depth || 1, owner = ownerGrid(board);
    const count = board.pieces.length, words = (count + 31) >> 5;
    const inTheWay = board.pieces.map((piece) => {
      const found = new Set();
      for (const square of squaresAhead(piece.cells[0], piece.dir, board.size, depth)) {
        if (owner[square] >= 0) found.add(owner[square]);
      }
      return found;
    });
    const memo = new Array(count);
    const allBefore = (id) => {
      if (memo[id]) return memo[id];
      const bits = new Uint32Array(words);
      memo[id] = bits;   // (no loops on a solvable board)
      for (const other of inTheWay[id]) {
        bits[other >> 5] |= 1 << (other & 31);
        const theirs = allBefore(other);
        for (let w = 0; w < words; w++) bits[w] |= theirs[w];
      }
      return bits;
    };
    let sum = 0, most = 0;
    for (let id = 0; id < count; id++) {
      const needed = bitCount(allBefore(id));
      sum += needed;
      most = Math.max(most, needed);
    }
    return { avg: sum / count, most };
  }

  // Make a board harder: again and again, point one piece the other way (its
  // other end becomes the head; a single square turns), and keep the change if
  // the board can still be cleared and pieces need at least as many moves first.
  function improve(board, tries, goal = Infinity) {
    const size = board.size;
    let best = movesFirst(board).avg;
    for (let t = 0; t < tries && best < goal; t++) {
      const id = randomInt(board.pieces.length), old = board.pieces[id];
      let flipped;
      if (old.cells.length === 1) {
        const dirs = (board.depth > 1 ? CUBE_DIRECTIONS : FLAT_DIRECTIONS).filter((dir) => dir !== old.dir);
        flipped = { cells: old.cells, dir: dirs[randomInt(dirs.length)] };
      } else {
        const cells = old.cells.slice().reverse();
        flipped = { cells, dir: stepDirection(cells[1], cells[0], size) };
      }
      if (id < (board.longCount || 0) && !insideRing(flipped.cells[0], size)) continue;   // long heads stay inside
      board.pieces[id] = flipped;
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
        const freeNow = free(board, off, owner);
        if (!freeNow.length) return null;
        for (const id of freeNow) off[id] = true;
        left -= freeNow.length;
        layers++;
      }
    }
    let sum = 0;
    const off = new Array(total).fill(false);
    for (let left = total; left; left--) {
      const freeNow = free(board, off, owner);
      sum += freeNow.length / left;
      off[freeNow[0]] = true;
    }
    const tight = 1 - sum / total;
    return { layers, tight, score: layers + 10 * tight };
  }

  // Deal boards for a level (FLAT_LEVELS; 1 s budget, at least 3) with greed
  // spread from its lowest to 1, and keep the hardest (Easy by grade(), Hard by
  // movesFirst()). Easy: straight pieces. Medium: up to 3 bends, as many moves
  // needed first as Easy (see `match`). Hard: shorter pieces with up to 3 bends
  // and one long one (size ± 2 squares, up to 5 bends), built so pieces need as
  // many moves as possible before they can go, the hardest of 40 deals by that
  // count, then improve()d.
  const POOL = 12, BUDGET_MS = 1000;

  function generate(size, level) {
    if (!LEVELS.includes(level)) level = 'medium';
    const settings = FLAT_LEVELS[level];
    const deadline = Date.now() + BUDGET_MS;
    let best = null, dealt = 0, goal = Infinity;
    if (settings.match) {
      goal = (movesFirst(generate(size, settings.match)).avg + movesFirst(generate(size, settings.match)).avg) / 2;
    }
    for (let tries = 0; dealt < settings.deals && (dealt < 3 || Date.now() < deadline) && tries < settings.deals * 4; tries++) {
      const greed = settings.minGreed + (1 - settings.minGreed) * (dealt / (settings.deals - 1));
      const board = generateOne(size, settings.shape, greed, 1, settings.chains);
      if (!board) continue;
      dealt++;
      board.score = settings.pick === 'moves' ? movesFirst(board).avg : grade(board).score;
      if (settings.match) board.score = -Math.abs(board.score - goal);   // closest to the goal wins
      if (!best || board.score > best.score) best = board;
    }
    if (!best) throw new Error('Could not generate a puzzle');
    if (settings.flips) improve(best, settings.flips * size * size, goal);
    best.grade = grade(best);
    return Object.assign(best, { level });
  }

  // ---------- 3D cube ----------
  // A size × size × size cube. Easy: single blocks, each pointing one of 6
  // ways. Medium and Hard: pieces like the flat board's (up to 1 / 3 bends),
  // which can also run between layers. Built the same way as the flat board:
  // play forwards, again and again lifting off a piece that has a clear way out
  // (single blocks never get stuck: one on the outside can leave through its
  // own face; bent pieces rarely can, and then the deal is thrown away).
  // Deals 12 (1 s budget, at least 3) with a spread of greed, ranks them by
  // grade() and takes the easiest (Easy), the middle one (Medium) or the
  // hardest (Hard).

  function generateCubeOne(size, greed) {
    const total = size * size * size;
    const lifted = new Uint8Array(total);   // every square holds a block until lifted off
    const pieces = new Array(total);
    const rays = raysFor(size, size);
    for (let left = total; left; left--) {
      const moves = [];
      for (let square = 0; square < total; square++) {
        if (lifted[square]) continue;
        for (let dir = 0; dir < 6; dir++) {
          const ray = rays[square * 6 + dir];
          let clearLength = 0;
          while (clearLength < ray.length && lifted[ray[clearLength]]) clearLength++;
          if (clearLength === ray.length) moves.push({ square, dir, clearLength });
        }
      }
      const move = pickMove(moves, greed, (m) => m.clearLength);
      pieces[move.square] = { cells: [move.square], dir: move.dir };
      lifted[move.square] = 1;
    }
    return { size, depth: size, pieces };
  }

  function generateCube(size, level) {
    if (!LEVELS.includes(level)) level = 'medium';
    const deadline = Date.now() + BUDGET_MS;
    const pool = [];
    for (let tries = 0; pool.length < POOL && (pool.length < 3 || Date.now() < deadline) && tries < 200; tries++) {
      const greed = pool.length / (POOL - 1);
      const board = level === 'easy' ? generateCubeOne(size, greed)
        : generateOne(size, level === 'medium' ? 'bend1' : 'bend3', greed, size);
      if (!board) continue;
      board.grade = grade(board);
      pool.push(board);
    }
    if (!pool.length) throw new Error('Could not generate a puzzle');
    pool.sort((a, b) => a.grade.score - b.grade.score);
    const pick = level === 'easy' ? 0 : level === 'hard' ? pool.length - 1 : (pool.length - 1) >> 1;
    return Object.assign(pool[pick], { level });
  }

  const api = {
    generate, generateOne, generateCube, generateCubeOne, grade, movesFirst, improve,
    solve, free, blocker, ownerGrid, bends, stepDirection, fromStraight, coordinatesOf,
    ROW_STEP, COLUMN_STEP, LAYER_STEP, LEVELS, SHAPES, FLAT_LEVELS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Arrows = api;
})(this);
