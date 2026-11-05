// Logic for "Sort" mode: tubes holding stacks of coloured squares.
// Each tube holds `cap` squares (3–6, default 4). There is one tube per colour
// plus 1–3 empty extra tubes. Each colour has `cap - empty` squares, so every
// colour tube starts with `empty` free spaces at the top (0 = starts full).
// A square (or a run of same-coloured squares on top) can move onto an empty
// tube or onto the same colour, if there is room. The puzzle is solved when no
// tube holds more than one colour.
//
// A state is an array of tubes; each tube is an array of colour ids, bottom first.
// Functions that need the tube size take `cap` as their last argument.

(function (root) {
  'use strict';

  const CAPACITY = 4;      // default squares per tube
  const MIN_CAP = 3, MAX_CAP = 6;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const top = (tube) => tube[tube.length - 1];

  // Number of same-coloured squares at the top of a tube.
  function topRun(tube) {
    let n = 0;
    for (let k = tube.length - 1; k >= 0 && tube[k] === top(tube); k--) n++;
    return n;
  }

  // How many squares would move from tube `from` to tube `to` (0 = not allowed).
  function moveCount(state, from, to, cap) {
    cap = cap || CAPACITY;
    const a = state[from], b = state[to];
    if (from === to || !a.length || b.length >= cap) return 0;
    if (b.length && top(b) !== top(a)) return 0;
    return Math.min(topRun(a), cap - b.length);
  }

  function applyMove(state, from, to, cap) {
    const n = moveCount(state, from, to, cap);
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
  function moves(state, cap) {
    const out = [];
    for (let i = 0; i < state.length; i++) {
      const a = state[i];
      if (!a.length) continue;
      const uniform = topRun(a) === a.length;
      let triedEmpty = false;
      for (let j = 0; j < state.length; j++) {
        if (!moveCount(state, i, j, cap)) continue;
        if (!state[j].length) {
          if (uniform || triedEmpty) continue;  // pointless, or same as another empty
          triedEmpty = true;
        }
        out.push([i, j]);
      }
    }
    // Prefer moves onto matching colours over moves into empty tubes.
    out.sort((m1, m2) => (state[m1[1]].length ? 0 : 1) - (state[m2[1]].length ? 0 : 1));
    return out;
  }

  // Depth-first search for a solution. Returns the list of moves, or null if
  // none was found within `limit` explored states.
  function solve(state, limit, cap) {
    limit = limit || 200000;
    const seen = new Set();
    const path = [];
    let explored = 0;
    let exhausted = true;

    function dfs(s) {
      if (isSolved(s)) return true;
      const k = key(s);
      if (seen.has(k)) return false;
      seen.add(k);
      if (++explored > limit) { exhausted = false; return false; }
      for (const [i, j] of moves(s, cap)) {
        path.push([i, j]);
        if (dfs(applyMove(s, i, j, cap))) return true;
        path.pop();
        if (explored > limit) return false;
      }
      return false;
    }

    const found = dfs(state);
    // `unsolvable` is true only when the whole search space was checked.
    return { moves: found ? path.slice() : null, unsolvable: !found && exhausted };
  }

  // Most free spaces a colour tube can start with: each colour keeps at least 2 squares.
  const maxEmpty = (cap) => Math.min(2, cap - 2);

  // New random puzzle that is known to be solvable.
  function generate(colors, extra, cap, empty) {
    cap = cap || CAPACITY;
    empty = empty || 0;
    const per = cap - empty;   // squares of each colour
    for (let attempt = 0; attempt < 500; attempt++) {
      const squares = shuffle([].concat(...[...Array(colors).keys()].map((c) => Array(per).fill(c))));
      const state = [];
      for (let t = 0; t < colors; t++) state.push(squares.slice(t * per, (t + 1) * per));
      for (let t = 0; t < extra; t++) state.push([]);
      // Avoid deals where a tube already starts sorted.
      if (state.some((t) => t.length && t.every((c) => c === t[0]))) continue;
      if (solve(state, 60000, cap).moves) return state;
    }
    throw new Error('Could not generate a puzzle');
  }

  const api = { CAPACITY, MIN_CAP, MAX_CAP, maxEmpty, generate, solve, topRun, moveCount, applyMove, isSolved, moves };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sort = api;
})(this);
