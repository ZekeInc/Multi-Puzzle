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

  const { randomInt, shuffle } = typeof module !== 'undefined' && module.exports ? require('./shared.js') : root.Shared;

  const CAPACITY = 4;      // default blocks per tube
  const LEVELS = ['easy', 'medium', 'hard', 'expert'];   // plus 'random' (not graded)

  const capOf = (rules) => (rules && rules.cap) || CAPACITY;

  const top = (tube) => tube[tube.length - 1];

  // Number of same-coloured blocks at the top of a tube.
  function topRun(tube) {
    let run = 0;
    for (let k = tube.length - 1; k >= 0 && tube[k] === top(tube); k--) run++;
    return run;
  }

  // How many blocks would move from tube `from` to tube `to` (0 = not allowed).
  function moveCount(state, from, to, rules) {
    const cap = capOf(rules);
    const source = state[from], target = state[to];
    if (from === to || !source.length || target.length >= cap) return 0;
    if (target.length && top(target) !== top(source) && !(rules && rules.mix)) return 0;
    return Math.min(topRun(source), cap - target.length);
  }

  function applyMove(state, from, to, rules) {
    const count = moveCount(state, from, to, rules);
    if (!count) return null;
    const next = state.map((tube) => tube.slice());
    next[to].push(...next[from].splice(next[from].length - count, count));
    return next;
  }

  function isSolved(state) {
    return state.every((tube) => tube.every((colour) => colour === tube[0]));
  }

  // Useful moves only: skip moving a whole single-colour tube into an empty one.
  // Ordered best first: onto the same colour, then into an empty tube, then
  // (with the mix rule) onto a different colour.
  function moves(state, rules) {
    const out = [];
    const rank = ([from, to]) => (!state[to].length ? 1 : top(state[to]) === top(state[from]) ? 0 : 2);
    for (let from = 0; from < state.length; from++) {
      const source = state[from];
      if (!source.length) continue;
      const uniform = topRun(source) === source.length;
      let triedEmpty = false;
      for (let to = 0; to < state.length; to++) {
        if (!moveCount(state, from, to, rules)) continue;
        if (!state[to].length) {
          if (uniform || triedEmpty) continue;  // pointless, or same as another empty
          triedEmpty = true;
        }
        out.push([from, to]);
      }
    }
    out.sort((first, second) => rank(first) - rank(second));
    return out;
  }

  // Minimal binary heap of [priority, order, item] (lowest first; ties go to the earliest).
  function Heap() {
    const items = [];
    const less = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
    return {
      get size() { return items.length; },
      push(item) {
        items.push(item);
        for (let i = items.length - 1; i > 0;) {
          const parent = (i - 1) >> 1;
          if (!less(items[i], items[parent])) break;
          [items[i], items[parent]] = [items[parent], items[i]]; i = parent;
        }
      },
      pop() {
        const first = items[0], last = items.pop();
        if (items.length) {
          items[0] = last;
          for (let i = 0; ;) {
            const left = 2 * i + 1, right = left + 1;
            let smallest = i;
            if (left < items.length && less(items[left], items[smallest])) smallest = left;
            if (right < items.length && less(items[right], items[smallest])) smallest = right;
            if (smallest === i) break;
            [items[i], items[smallest]] = [items[smallest], items[i]]; i = smallest;
          }
        }
        return first;
      },
    };
  }

  // Guided search for a short solution: always expands the position that looks
  // closest to solved, by moves so far + BREAK_WEIGHT × the places where a tube
  // changes colour (each move can remove at most one of those). Returns the
  // moves (or null if none was found within `limit` explored positions) and how
  // many positions it explored: a measure of how much trial and error the
  // puzzle needs, used to grade difficulty.
  // Internally each tube is a short string (one letter per block), which is
  // much faster to copy and compare than arrays.
  function solve(state, limit, rules) {
    limit = limit || 200000;
    const cap = capOf(rules), mix = !!(rules && rules.mix);
    const BREAK_WEIGHT = 6;
    // Tubes are interchangeable, so the key lists them in sorted order
    // (insertion sort: faster than Array#sort for a dozen short strings).
    const keyOf = (tubes) => {
      const sorted = tubes.slice();
      for (let i = 1; i < sorted.length; i++) {
        const tube = sorted[i];
        let j = i;
        for (; j > 0 && sorted[j - 1] > tube; j--) sorted[j] = sorted[j - 1];
        sorted[j] = tube;
      }
      return sorted.join('|');
    };
    // Places where a tube changes colour; 0 means solved.
    const breaks = (tubes) => {
      let count = 0;
      for (const tube of tubes) for (let k = 1; k < tube.length; k++) if (tube[k] !== tube[k - 1]) count++;
      return count;
    };
    // Each position reachable in one move, with the move that leads to it.
    function children(tubes) {
      const out = [];
      const sources = [];   // short lists: faster than Sets at this size
      for (let from = 0; from < tubes.length; from++) {
        const source = tubes[from];
        if (!source || sources.includes(source)) continue;   // a tube identical to one already tried
        sources.push(source);
        const colour = source[source.length - 1];
        let run = 1;
        while (run < source.length && source[source.length - 1 - run] === colour) run++;
        const uniform = run === source.length;
        const targets = [];
        for (let to = 0; to < tubes.length; to++) {
          const target = tubes[to];
          if (to === from || target.length >= cap || targets.includes(target)) continue;
          if (target && target[target.length - 1] !== colour && !mix) continue;
          if (!target && uniform) continue;          // pointless: just moves a sorted tube
          targets.push(target);
          const count = Math.min(run, cap - target.length);
          const next = tubes.slice();
          next[from] = source.slice(0, source.length - count);
          next[to] = target + source.slice(source.length - count);
          out.push([next, [from, to]]);
        }
      }
      return out;
    }

    const start = state.map((tube) => tube.map((colour) => String.fromCharCode(97 + colour)).join(''));
    if (!breaks(start)) return { moves: [], unsolvable: false, explored: 0 };
    const seen = new Set([keyOf(start)]);
    const heap = Heap();
    let order = 0, explored = 0;
    heap.push([BREAK_WEIGHT * breaks(start), order++, { tubes: start, movesSoFar: 0, path: null }]);
    while (heap.size) {
      const node = heap.pop()[2];
      if (++explored > limit) return { moves: null, unsolvable: false, explored };
      for (const [tubes, move] of children(node.tubes)) {
        const seenBefore = seen.size;
        seen.add(keyOf(tubes));       // one lookup: the size only grows for a new position
        if (seen.size === seenBefore) continue;
        const path = { move, prev: node.path };
        const left = breaks(tubes);
        if (!left) {
          const out = [];
          for (let step = path; step; step = step.prev) out.push(step.move);
          return { moves: out.reverse(), unsolvable: false, explored };
        }
        heap.push([node.movesSoFar + 1 + BREAK_WEIGHT * left, order++, { tubes, movesSoFar: node.movesSoFar + 1, path }]);
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

  function deal(colours, extra, perColour) {
    const blocks = shuffle([].concat(...[...Array(colours).keys()].map((colour) => Array(perColour).fill(colour))));
    const state = [];
    for (let t = 0; t < colours; t++) state.push(blocks.slice(t * perColour, (t + 1) * perColour));
    for (let t = 0; t < extra; t++) state.push([]);
    return state;
  }

  // New random puzzle that is known to be solvable.
  // opts: { cap, empty, mix, level } where level is 'random' (first solvable
  // deal) or one of LEVELS. For a level, several solvable deals are compared
  // by how much searching the solver needed, and one is taken from the
  // matching quarter: easiest quarter for 'easy' up to hardest for 'expert'.
  function generate(colours, extra, opts) {
    opts = opts || {};
    const rules = { cap: capOf(opts), mix: !!opts.mix };
    const perColour = rules.cap - (opts.empty || 0);
    const level = LEVELS.indexOf(opts.level);
    const want = level < 0 ? 1 : 24;           // solvable deals to compare
    const deadline = Date.now() + 1000;        // stop comparing after this
    const found = [];
    for (let attempt = 0; attempt < 500 && found.length < want; attempt++) {
      if (found.length && Date.now() > deadline) break;
      const state = deal(colours, extra, perColour);
      // Avoid deals where a tube already starts sorted.
      if (state.some((tube) => tube.length && tube.every((colour) => colour === tube[0]))) continue;
      const result = solve(state, 20000, rules);
      if (result.moves) found.push({ state, score: result.explored + result.moves.length });
    }
    if (!found.length) throw new Error('Could not generate a puzzle');
    if (level < 0) return found[0].state;
    found.sort((x, y) => x.score - y.score);
    const low = Math.floor(found.length * level / LEVELS.length);
    const high = Math.max(low + 1, Math.floor(found.length * (level + 1) / LEVELS.length));
    return found[low + randomInt(high - low)].state;
  }

  const api = {
    CAPACITY, LEVELS, maxEmpty, minEmptyNoExtra,
    generate, solve, topRun, moveCount, applyMove, isSolved, moves,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sort = api;
})(this);
