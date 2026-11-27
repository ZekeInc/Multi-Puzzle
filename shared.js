// Helpers shared by the logic files (sudoku.js, groups.js, sort.js, arrows.js).
// Like them, it has no DOM code: in Node it is require()d, in the page it is
// loaded first and found as `Shared`.

(function (root) {
  'use strict';

  // A whole number from 0 up to (not including) `limit`.
  function randomInt(limit) {
    return Math.floor(Math.random() * limit);
  }

  // Shuffles `items` in place (Fisher–Yates) and returns it.
  function shuffle(items) {
    for (let last = items.length - 1; last > 0; last--) {
      const pick = randomInt(last + 1);
      [items[last], items[pick]] = [items[pick], items[last]];
    }
    return items;
  }

  const api = { randomInt, shuffle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shared = api;
})(this);
