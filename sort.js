// Logic for "Sort" mode: tubes holding stacks of coloured blocks.
// Each tube holds `cap` blocks (3–6, default 4). There is one tube per colour
// plus 0–3 empty extra tubes. Each colour has `cap - empty` blocks, so every
// colour tube starts with `empty` free spaces at the top (0 = starts full).
// A block (or a run of same-coloured blocks on top) can move onto an empty
// tube or onto the same colour, if there is room. With the `mix` rule it can
// also move onto a different colour. The puzzle is solved when no tube holds
// more than one colour.
//
// A state is an array of tubes; each tube is an array of colour ids, bottom first.
// Functions that need the rules take a `rules` object as their last argument:
// { cap: blocks per tube (default 4), mix: may blocks go on a different colour }.

(function (root) {
  'use strict';

  const CAPACITY = 4;      // default blocks per tube
  const MIN_CAP = 3, MAX_CAP = 6;
  const LEVELS = ['easy', 'medium', 'hard', 'expert'];   // plus 'random' (not graded)

  const capOf = (rules) => (rules && rules.cap) || CAPACITY;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const top = (tube) => tube[tube.length - 1];

  // Number of same-coloured blocks at the top of a tube.
  function topRun(tube) {
    let n = 0;
    for (let k = tube.length - 1; k >= 0 && tube[k] === top(tube); k--) n++;
    return n;
  }

  // How many blocks would move from tube `from` to tube `to` (0 = not allowed).
  function moveCount(state, from, to, rules) {
    const cap = capOf(rules);
    const a = state[from], b = state[to];
    if (from === to || !a.length || b.length >= cap) return 0;
    if (b.length && top(b) !== top(a) && !(rules && rules.mix)) return 0;
    return Math.min(topRun(a), cap - b.length);
  }

  function applyMove(state, from, to, rules) {
    const n = moveCount(state, from, to, rules);
    if (!n) return null;
    const next = state.map((t) => t.slice());
    next[to].push(...next[from].splice(next[from].length - n, n));
    return next;
  }

  function isSolved(state) {
    return state.every((t) => t.every((c) => c === t[0]));
  }

  function key(state) {
    // Tubes are interchangeable, so sort them for a canonical key.
    return state.map((t) => t.join(',')).sort().join('|');
  }

  // Useful moves only: skip moving a whole single-colour tube into an empty one.
  // Ordered best first: onto the same colour, then into an empty tube, then
  // (with the mix rule) onto a different colour.
  function moves(state, rules) {
    const out = [];
    const rank = (m) => (!state[m[1]].length ? 1 : top(state[m[1]]) === top(state[m[0]]) ? 0 : 2);
    for (let i = 0; i < state.length; i++) {
      const a = state[i];
      if (!a.length) continue;
      const uniform = topRun(a) === a.length;
      let triedEmpty = false;
      for (let j = 0; j < state.length; j++) {
        if (!moveCount(state, i, j, rules)) continue;
        if (!state[j].length) {
          if (uniform || triedEmpty) continue;  // pointless, or same as another empty
          triedEmpty = true;
        }
        out.push([i, j]);
      }
    }
    out.sort((m1, m2) => rank(m1) - rank(m2));
    return out;
  }

  // Minimal binary heap of [priority, order, item] (lowest first; ties go to the earliest).
  function Heap() {
    const a = [];
    const less = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
    return {
      get size() { return a.length; },
      push(v) {
        a.push(v);
        for (let i = a.length - 1; i > 0;) {
          const p = (i - 1) >> 1;
          if (!less(a[i], a[p])) break;
          [a[i], a[p]] = [a[p], a[i]]; i = p;
        }
      },
      pop() {
        const top = a[0], last = a.pop();
        if (a.length) {
          a[0] = last;
          for (let i = 0; ;) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < a.length && less(a[l], a[m])) m = l;
            if (r < a.length && less(a[r], a[m])) m = r;
            if (m === i) break;
            [a[i], a[m]] = [a[m], a[i]]; i = m;
          }
        }
        return top;
      },
    };
  }

  // Guided search for a short solution: always expands the position that looks
  // closest to solved, by moves so far + W × the places where a tube changes
  // colour (each move can remove at most one of those). Returns the moves (or
  // null if none was found within `limit` explored positions) and how many
  // positions it explored: a measure of how much trial and error the puzzle
  // needs, used to grade difficulty.
  // Internally each tube is a short string (one letter per block), which is
  // much faster to copy and compare than arrays.
  function solve(state, limit, rules) {
    limit = limit || 200000;
    const cap = capOf(rules), mix = !!(rules && rules.mix);
    const W = 6;
    const keyOf = (s) => s.slice().sort().join('|');
    const sorted = (s) => s.every((t) => !t || t === t[0].repeat(t.length));
    const breaks = (s) => {
      let n = 0;
      for (const t of s) for (let k = 1; k < t.length; k++) if (t[k] !== t[k - 1]) n++;
      return n;
    };
    // Each child position with the move that leads to it.
    function children(s) {
      const out = [];
      const sources = new Set();
      for (let i = 0; i < s.length; i++) {
        const a = s[i];
        if (!a || sources.has(a)) continue;   // a tube identical to one already tried
        sources.add(a);
        const c = a[a.length - 1];
        let run = 1;
        while (run < a.length && a[a.length - 1 - run] === c) run++;
        const uniform = run === a.length;
        const targets = new Set();
        for (let j = 0; j < s.length; j++) {
          const b = s[j];
          if (j === i || b.length >= cap || targets.has(b)) continue;
          if (b && b[b.length - 1] !== c && !mix) continue;
          if (!b && uniform) continue;          // pointless: just moves a sorted tube
          targets.add(b);
          const n = Math.min(run, cap - b.length);
          const next = s.slice();
          next[i] = a.slice(0, a.length - n);
          next[j] = b + a.slice(a.length - n);
          out.push([next, [i, j]]);
        }
      }
      return out;
    }

    const start = state.map((t) => t.map((c) => String.fromCharCode(97 + c)).join(''));
    if (sorted(start)) return { moves: [], unsolvable: false, explored: 0 };
    const seen = new Set([keyOf(start)]);
    const heap = Heap();
    let order = 0, explored = 0;
    heap.push([W * breaks(start), order++, { s: start, g: 0, path: null }]);
    while (heap.size) {
      const node = heap.pop()[2];
      if (++explored > limit) return { moves: null, unsolvable: false, explored };
      for (const [s, move] of children(node.s)) {
        const k = keyOf(s);
        if (seen.has(k)) continue;
        seen.add(k);
        const path = { move, prev: node.path };
        if (sorted(s)) {
          const out = [];
          for (let p = path; p; p = p.prev) out.push(p.move);
          return { moves: out.reverse(), unsolvable: false, explored };
        }
        heap.push([node.g + 1 + W * breaks(s), order++, { s, g: node.g + 1, path }]);
      }
    }
    // Every reachable position was checked.
    return { moves: null, unsolvable: true, explored };
  }

  // Most free spaces a colour tube can start with: each colour keeps at least 2 blocks.
  const maxEmpty = (cap) => Math.min(2, cap - 2);
  // With no extra tubes (only allowed with the mix rule), the free spaces are all
  // the room there is to work with. Bigger tubes need 2 each, or solutions turn
  // into very long sliding-puzzle shuffles.
  const minEmptyNoExtra = (cap) => (cap <= 4 ? 1 : 2);

  function deal(colors, extra, per) {
    const blocks = shuffle([].concat(...[...Array(colors).keys()].map((c) => Array(per).fill(c))));
    const state = [];
    for (let t = 0; t < colors; t++) state.push(blocks.slice(t * per, (t + 1) * per));
    for (let t = 0; t < extra; t++) state.push([]);
    return state;
  }

  // New random puzzle that is known to be solvable.
  // opts: { cap, empty, mix, level } where level is 'random' (first solvable
  // deal) or one of LEVELS. For a level, several solvable deals are compared
  // by how much searching the solver needed, and one is taken from the
  // matching quarter: easiest quarter for 'easy' up to hardest for 'expert'.
  function generate(colors, extra, opts) {
    opts = opts || {};
    const rules = { cap: capOf(opts), mix: !!opts.mix };
    const per = rules.cap - (opts.empty || 0);   // blocks of each colour
    const level = LEVELS.indexOf(opts.level);
    const want = level < 0 ? 1 : 24;           // solvable deals to compare
    const budget = Date.now() + 1000;          // stop comparing after this
    const found = [];
    for (let attempt = 0; attempt < 500 && found.length < want; attempt++) {
      if (found.length && Date.now() > budget) break;
      const state = deal(colors, extra, per);
      // Avoid deals where a tube already starts sorted.
      if (state.some((t) => t.length && t.every((c) => c === t[0]))) continue;
      const result = solve(state, 20000, rules);
      if (result.moves) found.push({ state, score: result.explored + result.moves.length });
    }
    if (!found.length) throw new Error('Could not generate a puzzle');
    if (level < 0) return found[0].state;
    found.sort((x, y) => x.score - y.score);
    const lo = Math.floor(found.length * level / LEVELS.length);
    const hi = Math.max(lo + 1, Math.floor(found.length * (level + 1) / LEVELS.length));
    return found[lo + Math.floor(Math.random() * (hi - lo))].state;
  }

  const api = {
    CAPACITY, MIN_CAP, MAX_CAP, LEVELS, maxEmpty, minEmptyNoExtra,
    generate, solve, topRun, moveCount, applyMove, isSolved, moves,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sort = api;
})(this);
