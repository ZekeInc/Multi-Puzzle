# To do

## New game: Arrows

A fourth tab. The board is a grid filled with arrow pieces. Tapping a piece slides it
out of the board in the direction its arrow points, but only if its straight path to
the edge is completely clear. Removing a piece frees its squares for the others. Clear
the whole board without tapping blocked pieces.

### Rules (first version: 2D grid only)
- Each piece is a straight line of 1–3 squares lying along its arrow's direction
  (up / down / left / right); the arrow head is on the leading square.
- Tap a piece: if every square from its head to the edge is empty, it slides off the
  board. Otherwise it doesn't move: it shakes, the piece blocking it flashes, and it
  counts as a mistake.
- Win when the board is empty. Show the mistake count; maybe offer a "3 lives" mode later.
- 3D block structures are out of scope for now (hard to read and tap on a phone).

### Solver (`arrows.js`, no DOM, loadable in Node)
- Removing a piece only ever frees squares, so it can never make another piece stuck.
  The tap order only matters through "A blocks B" dependencies: a board is solvable
  exactly when those dependencies have no cycle, and repeatedly removing any free piece
  always clears a solvable board. This is a topological sort, O(pieces × path length);
  no search needed.
- `Arrows.solve(board)` returns a removal order (or null if there is a cycle);
  `Arrows.free(board)` lists the pieces that can go now (for Hint).

### Generator
- Build in reverse so every puzzle is solvable: start from an empty grid and keep adding
  random pieces whose path to the edge doesn't cross a piece already placed (the pieces
  added earlier are the ones removed later). Stop when the grid is full or no piece fits;
  fill any leftover gaps with 1-square pieces that point at a clear edge.
- Grade by how few pieces are free at each step on average, and by the longest chain of
  "must remove first" pieces. Deal several and pick by level, like Groups
  (Easy / Medium / Hard, 1 s budget).

### Fitting into the app
- Files `arrows.js` + `arrows-app.js`; add to `index.html`, `FILES` in `sw.js`, and the
  `CATEGORIES` in `scores.js` (best-time key `size-level`).
- Use the shared pieces in `modes.js`: `GameMode.timer`, `popup` (rules and ⚙ preferences:
  grid size 5–10, level), `message`, `whenShown` (only generate when the tab is first opened).
- Save in `arrows-save-v1`. Undo, Hint (marks a free piece; makes the game assisted),
  Restart and Rules in the actions row.
- Four tabs must still fit at 320 px wide and on the landscape top line; check the tab
  labels and icons. The slide-out uses a CSS transform and respects `prefers-reduced-motion`.
- Arrows need to be clear in both themes, and on squares as small as about 28 px
  (10 × 10 at 320 px wide).
