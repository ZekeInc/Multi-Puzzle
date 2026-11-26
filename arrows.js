// Logic for "Arrows" mode: an N×N grid filled with straight arrow pieces.
// Tapping a piece slides it off the board in the direction it points, but only
// if every square from its head to the edge is empty. Clear the whole board.
//
// A piece is { r, c, len, dir }: (r, c) is its head (the square with the arrow
// head), dir is 0 up / 1 right / 2 down / 3 left, and the other len - 1 squares
// trail behind the head (opposite to dir).
//
// A board is { size, pieces }. Removing a piece only ever frees squares, so a
// board can be cleared exactly when no pieces block each other in a loop, and
// then taking off any free piece, again and again, always clears it.
//
// generate(n, level) takes level 'easy' | 'medium' | 'hard' (see grade()).

(function (root) {
  'use strict';

  const DR = [-1, 0, 1, 0];
  const DC = [0, 1, 0, -1];
  const LEVELS = ['easy', 'medium', 'hard'];

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

  // Squares of a piece, head first.
  function cells(p, n) {
    const out = [];
    for (let k = 0; k < p.len; k++) out.push((p.r - DR[p.dir] * k) * n + (p.c - DC[p.dir] * k));
    return out;
  }

  // owner[square] = piece index, or -1 for an empty square.
  function ownerGrid(board) {
    const n = board.size;
    const owner = new Int16Array(n * n).fill(-1);
    board.pieces.forEach((p, id) => { for (const i of cells(p, n)) owner[i] = id; });
    return owner;
  }

  // First piece in the way of piece `id` (nearest its head), or -1 if its path
  // to the edge is clear. `removed[id]` marks pieces already off the board.
  function blocker(board, owner, removed, id) {
    const n = board.size, p = board.pieces[id];
    let r = p.r + DR[p.dir], c = p.c + DC[p.dir];
    while (r >= 0 && r < n && c >= 0 && c < n) {
      const o = owner[r * n + c];
      if (o >= 0 && !removed[o]) return o;
      r += DR[p.dir];
      c += DC[p.dir];
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

  // Split the grid into straight pieces of 1–3 squares (mostly 2 and 3).
  // Returns a list of square lists, each running left→right or top→bottom.
  function tile(n) {
    const taken = new Uint8Array(n * n);
    const shapes = [];
    const weight = [0, 1, 4, 4];   // by length: few single squares
    for (const i of shuffle([...Array(n * n).keys()])) {
      if (taken[i]) continue;
      const r = Math.floor(i / n), c = i % n;
      // Every placement of length 1–3 that covers square i and only free squares.
      const options = [];
      for (let len = 1; len <= 3; len++) {
        for (const [dr, dc] of len === 1 ? [[0, 1]] : [[0, 1], [1, 0]]) {
          for (let back = 0; back < len; back++) {
            const r0 = r - dr * back, c0 = c - dc * back;
            const sq = [];
            for (let k = 0; k < len; k++) {
              const rr = r0 + dr * k, cc = c0 + dc * k;
              if (rr < 0 || rr >= n || cc < 0 || cc >= n || taken[rr * n + cc]) break;
              sq.push(rr * n + cc);
            }
            if (sq.length === len) options.push(sq);
          }
        }
      }
      let total = 0;
      for (const sq of options) total += weight[sq.length];
      let pick = Math.random() * total, chosen = options[0];
      for (const sq of options) {
        pick -= weight[sq.length];
        if (pick < 0) { chosen = sq; break; }
      }
      for (const j of chosen) taken[j] = 1;
      shapes.push(chosen);
    }
    return shapes;
  }

  // The piece a shape becomes when it points in `dir`.
  function orient(shape, dir, n) {
    const head = dir === 0 || dir === 3 ? shape[0] : shape[shape.length - 1];
    return { r: Math.floor(head / n), c: head % n, len: shape.length, dir };
  }

  // Directions a shape can point: along its length (any of 4 for one square).
  function dirsFor(shape, n) {
    if (shape.length === 1) return [0, 1, 2, 3];
    return shape[1] - shape[0] === 1 ? [1, 3] : [0, 2];
  }

  // One full board. Plays the game forwards on the bare tiling: again and again,
  // take a shape that has some clear way out, point it that way and lift it off.
  // That always finishes (the top-left-most remaining square always has a way out)
  // and every piece's path then crosses only pieces that went before it, so the
  // board is solvable. `greed` (0–1) is how often the shape with the longest
  // clear path is taken instead of a random one; long paths over pieces that
  // went first make more pieces wait on others.
  function generateOne(n, greed) {
    const shapes = tile(n);
    const owner = new Int16Array(n * n).fill(-1);
    shapes.forEach((sq, id) => { for (const i of sq) owner[i] = id; });
    const off = new Array(shapes.length).fill(false);
    const pieces = new Array(shapes.length);
    for (let left = shapes.length; left; left--) {
      const moves = [];   // [id, dir, path length]
      shapes.forEach((sq, id) => {
        if (off[id]) return;
        for (const dir of dirsFor(sq, n)) {
          const p = orient(sq, dir, n);
          let r = p.r + DR[dir], c = p.c + DC[dir], len = 0, clear = true;
          while (r >= 0 && r < n && c >= 0 && c < n) {
            const o = owner[r * n + c];
            if (o >= 0 && !off[o]) { clear = false; break; }
            r += DR[dir]; c += DC[dir]; len++;
          }
          if (clear) moves.push([id, dir, len]);
        }
      });
      let m;
      if (Math.random() < greed) {
        const best = Math.max(...moves.map((x) => x[2]));
        const top = moves.filter((x) => x[2] === best);
        m = top[randInt(top.length)];
      } else {
        m = moves[randInt(moves.length)];
      }
      pieces[m[0]] = orient(shapes[m[0]], m[1], n);
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
    // Rounds of removing everything free at once.
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
    // One at a time: share of the remaining pieces that are free.
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

  // Deal up to 12 boards (1 s budget, at least 3) with a spread of greed,
  // rank them by grade score and take the easiest, the middle one or the hardest.
  const POOL = 12, BUDGET_MS = 1000;

  function generate(n, level) {
    if (!LEVELS.includes(level)) level = 'medium';
    const deadline = Date.now() + BUDGET_MS;
    const pool = [];
    while (pool.length < POOL && (pool.length < 3 || Date.now() < deadline)) {
      const greed = pool.length / (POOL - 1);
      const b = generateOne(n, greed);
      b.grade = grade(b);
      pool.push(b);
    }
    const ranked = pool.sort((a, b) => a.grade.score - b.grade.score);
    const pick = level === 'easy' ? 0 : level === 'hard' ? ranked.length - 1 : (ranked.length - 1) >> 1;
    return Object.assign(ranked[pick], { level });
  }

  const api = { generate, generateOne, grade, solve, free, blocker, ownerGrid, cells, DR, DC, LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Arrows = api;
})(this);
