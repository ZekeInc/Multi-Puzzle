# Multi Puzzle

Mobile-first puzzle web app with four games: **Sudoku**, **Groups**, **Sort** and **Arrows**.
Plain HTML/CSS/JavaScript, no dependencies and no build step. Hosted on GitHub Pages at
https://zekeinc.github.io/Multi-Puzzle/ (updates 1–2 minutes after a merge to `main`).
Installable as a home-screen app and works offline.

## Files

| File | Purpose |
|---|---|
| `index.html` | All markup: tab bar, one `<section class="view">` per game, pop-ups (rules, best times, Groups, Sort and Arrows preferences) |
| `style.css` | All styles. Theme colours are CSS variables on `:root` (light) and `:root[data-theme="dark"]` |
| `theme.js` | Light/dark toggle. Dark is the default; an inline script in `<head>` applies the saved theme before the page draws |
| `modes.js` | Tab switching (fires `modechange`; `GameMode.isActive('sudoku' \| 'groups' \| 'sort' \| 'arrows')`) and the pieces the games share: `GameMode.timer`, `popup`, `message`, `buzz`, `formatTime`, `whenShown` |
| `scores.js` | Best times per game and difficulty/size, plus the 🏆 Best times pop-up: a button per game at the top, one game shown at a time, opening on the game being played; Reset clears only the shown game (`Scores.record`, `Scores.bestLabel`, `Scores.verdict` = end of the win message). Kept in memory after the first read |
| `sudoku.js` / `app.js` | Sudoku logic (generator, solver) / Sudoku UI |
| `groups.js` / `groups-app.js` | Groups logic (unique-solution generator, difficulty grader) / Groups UI |
| `sort.js` / `sort-app.js` | Sort logic (rules, solver, solvable generator) / Sort UI |
| `arrows.js` / `arrows-app.js` / `arrows-cube.js` | Arrows logic (blocking check, solver, solvable generators for the flat board and the 3D cube, grader) / Arrows UI and flat board / 3D cube view |
| `sw.js` | Service worker: offline cache, network-first (falls back to the cached copy if the network takes over 3 s) |
| `TODO.md` | Planned work and ideas for later |
| `manifest.webmanifest`, `icons/` | Home-screen install. `icon.svg` is the source (2 × 2: Sudoku, Groups / Sort, Arrows); PNGs are rendered from it with Playwright (`icon-maskable-512.png` has the art scaled to 88% for Android masks) |

Logic files (`sudoku.js`, `groups.js`, `sort.js`, `arrows.js`) have no DOM code and can be loaded in Node
with `require()` for testing.

## Conventions

- **Cache busting:** when changing any CSS/JS file, bump its `?v=` number in `index.html` and
  bump `CACHE` in `sw.js`, so installed copies pick up the change. `CACHE`'s number is the app's version,
  shown as `v38` etc. in the top right of the rules pop-ups (`.app-version`): bump `VERSION` in `modes.js`
  to the same number. If you add a file, add it to
  the `FILES` list in `sw.js` too.
- **Each game** keeps its own state and saved progress in `localStorage`
  (`sudoku-save-v1`, `groups-save-v1`, `sort-save-v1`, `arrows-save-v1`). Its timer comes from
  `GameMode.timer(mode, el, canRun, save)` (`start`, `pause`, `reset(ms)`, `ms()`, `show()`), which
  pauses and saves when the game's tab is hidden or the app goes to the background; one shared
  tick redraws only the showing timer.
- **Pop-ups** use `GameMode.popup(modal, openButton, focusEl, dismiss)`; they always open scrolled to the top
  (rules pop-ups focus the dialog itself, so they don't jump to "Got it"). Escape, tapping outside and the
  phone's back button (Android) call `dismiss` (default: close), and closing refocuses the opening button.
  Opening pushes a history entry that back pops (`popstate`); closing any other way calls `history.back()`
  to take it off again, so back with nothing open still leaves the app.
- **Speed:** on first launch Groups, Sort and Arrows only make a puzzle when their tab is first opened
  (`GameMode.whenShown`). Redraws skip squares whose look hasn't changed (`shown[]` in Sudoku and
  Groups); Sort only re-measures its layout when the box count or size changes (resizes go through
  a `ResizeObserver`). The solvers keep one working array and undo on backtrack instead of copying.
- **Hints / Solve** mark a game as assisted, so it can't set a best time.
- **Themes:** check UI changes in both dark and light. Don't use `prefers-color-scheme`; the
  theme comes from `data-theme` on `<html>`.
- **Layout:** must fit phones down to 320px wide with no scrolling (four tabs: smaller labels and icon
  buttons under 400px / 340px wide, and on landscape phones under 640px wide), and landscape phones
  (under `@media (orientation: landscape) and (max-height: 600px)`: `.view` is `display: contents` and `main`
  is a 5-column grid; top line = tab bar left + the game's `.top-controls` right; board centred; actions
  split 2 | 2 either side, status top-left, message above the right pair; Sudoku's numpad is 3 × 3 on the right).
  Respect `prefers-reduced-motion` for animations.
  `main` is exactly the visible height: `--app-h`, set from `visualViewport` in `modes.js`
  (`100dvh` can disagree with what mobile browsers really show, e.g. Android Chrome / Samsung Internet with a sliding address bar). Size boards from `--app-h`, not `100dvh`.
- **No zooming:** the viewport has `maximum-scale=1, user-scalable=no`, `html` has
  `touch-action: pan-x pan-y` and `modes.js` cancels Safari's `gesturestart`. Keep `select`
  text at 16px or more, or iOS zooms in when a menu is tapped.
- **Confirm before losing progress:** New, Restart, Clear and Solve ask first when a game is in progress.

## Groups game notes

- Preferences (⚙ pop-up `#g-prefs-modal`, same behaviour as Sort's: changes apply only on **New puzzle**,
  Cancel / Escape / tapping outside revert): **Difficulty** (Easy / Medium / Hard, `state.level`) then **Grid size** (5–10).
- `Groups.grade(n, regions)` solves like a person, using stronger steps only when stuck: (1) a row/column/group
  with one square left, (2) ✕ on a square whose O would wipe out a unit, (3) k groups confined to k rows/columns
  (any mix of unit kinds), (4) ✕ on a square whose O, after forced follow-ups, wipes out a unit. Returns
  `{ technique, score }` (score weights steps 2/3/4 as 1/4/10; technique 5 = needs guessing).
- `Groups.solve` keeps per-unit candidate counts and a trail it undoes on backtrack; the
  row/column/neighbour squares an O rules out (`near`) are cached per size.
- `Groups.generate(n, level)` deals up to 12 puzzles (1 s budget, at least 3), ranks them by score and takes the
  easiest (Easy), middle (Medium) or hardest (Hard).
- Colour boxes (`#g-groups`, `.g-chip`) above the board, one per group in board reading order: an O once the
  group has one, red when any of its Os breaks a rule
  (same conflicts the board marks). In landscape they sit in the left column under the status.
- Best-time keys: `size-level` (e.g. `7-hard`); plain `size` keys are games from before levels and show as Random.

## Sort game notes

- Player-facing text calls the containers **boxes** and the squares **blocks**; the code calls them
  **tubes** (`.tube`, `state.tubes`) and squares (`.square`).
- One box per colour plus 0–3 empty extra boxes. Preferences (⚙ pop-up `#s-prefs-modal`, three
  labelled groups; changes apply only on **New puzzle**, Cancel / Escape / tapping outside revert):
  - **Level**: Easy / Medium / Hard / Expert / Random (`state.level`). `Sort.generate` compares up to
    24 solvable deals (1 s budget) by how many positions the solver explored, and picks from the
    matching quarter; Random takes the first solvable deal without grading.
  - **Boxes**: extra (0–3) and empty spaces each colour box starts with (0–2, at most `cap - 2`).
  - **Blocks**: colours (4–10), per box (3–6, default 4 = `Sort.CAPACITY`; `state.cap`), and
    **Stack on same / any colour** (`state.mix`: may blocks be dropped onto a different colour).
  Each colour has `cap - empty` blocks. 0 extra needs "any colour", and then at least
  `Sort.minEmptyNoExtra(cap)` empty. With same colour, 1 extra and 0 empty the most colours is
  `MAX_COLORS_TIGHT[cap]` in `sort-app.js` (larger deals are rarely solvable).
  Logic functions take a `rules` object `{ cap, mix }` as their last argument.
- Best-time keys: `colours-extra`, then `-cap-empty` unless 4/0, `-any` with mixing, `-level`
  unless Random. The 🏆 pop-up lists played Sort keys from storage (`label()` in `scores.js`).
- `Sort.solve` is a guided best-first search (moves so far + 6 × colour changes inside tubes) on
  string-encoded tubes; it finds short solutions and its `explored` count grades difficulty.
- Win when no box holds more than one colour; any colour split across boxes is then gathered
  into one box automatically (`tidyMoves` in `sort-app.js`, not counted as moves).
- Blocks use the muted palette `--s0`–`--s9` and show numbers 1–10, all in the same dark ink.
  Keep every colour light enough for dark numbers (contrast with `#1d2330` of at least 4:1).
- Selecting a box changes nothing on the box itself: the blocks that would move (its top run of one colour, `Sort.topRun`) get a halo (`.square.lifted`, `--halo`). Nothing moves. A completed box (all blocks of one colour) closes
  its top. Boxes are sized to the available space in 1–3 rows by `layout()`.

## Arrows game notes

- The board is an N×N grid (5–10) completely filled with arrow pieces. A piece is `{ cells, dir }`:
  `cells` is its path of squares, head first, and `dir` (0 up / 1 right / 2 down / 3 left) is the way the
  head points, straight on from the square behind it. Flat levels (`FLAT_LEVELS` in `arrows.js`; piece shapes
  in `SHAPES`): **Easy** straight, 1–3 squares, the hardest of 12 deals by `grade()`. **Medium** up to 3 bends,
  1–6 squares, made to need as many moves first as Easy (`match: 'easy'`: two Easy boards are measured, the
  closest of 40 deals is kept and flipped up towards that count if short). **Hard** is built for *moves needed first* (`movesFirst()`: for each piece, every piece
  in its way and in theirs, transitively; averaged): shape `hard` = shorter bent pieces (1–4 squares, up to
  3 bends, so more pieces get in each other's way) plus one long piece of N − 2 to N + 2 squares with up to
  5 bends, grown first (`long` in `tile()`, regrown until at least one end is off the board's outer ring;
  `generateOne()` and `improve()` only give it a head off the ring, the tail may be on it; longer pieces
  lower the count, so only one; it is always piece 0, and the board records `longCount`), greed 0.6–1 picking the move needing the most moves
  first (`chains: 'moves'`), the hardest of 40 deals by that count, then `improve()` flips pieces (other
  end as head) 20 × n² times, keeping flips that leave the board solvable and no easier. Roughly 2× Medium's
  moves-first count. History: Easy was the first Hard (straight); Medium was the Hard with up to 3 bends;
  the old 1-bend Medium was dropped.
- Tapping a piece slides it off head first along its own path, like a snake, if every square straight ahead
  of its head up to the edge is empty; otherwise it shakes, the first piece in the way flashes (`.blocking`)
  and it counts as a mistake (shown, but doesn't stop a best time).
- Removing a piece only frees squares, so the order never matters: a board is solvable exactly when no
  pieces block each other in a loop. `Arrows.solve` / `Arrows.free` / `Arrows.blocker` need no search.
- `Arrows.generate(n, level)` tiles the grid (`tile()` grows random paths within the shape's bend limit),
  then plays forwards: again and again it lifts off a shape that has a clear way out, with either end as
  the head, so every board is solvable. With bends this can rarely get stuck, and that deal is thrown away.
  `greed` = how often it takes the best move: the longest clear path, the longest chain (`chains: true`)
  or the most moves needed first (`chains: 'moves'`).
  Deals the level's count (1 s budget, at least 3) with greed spread from its lowest to 1, grades each
  (`grade()`: `layers` = longest must-go-first chain, `tight` = how few pieces are free each step;
  score = layers + 10 × tight) and keeps the hardest. The score can't compare straight with bent boards
  (straight boards have more, smaller pieces, so longer chains), only boards of one shape.
- **3D cube** (Preferences → Board: Flat / 3D cube, `state.shape` `'flat'` | `'cube'`): an n × n × n cube
  (3–5). Directions add 4 = front (towards the player at the start) and 5 = back. **Easy**: single blocks
  (`generateCubeOne`). **Medium / Hard**: piece shapes `bend1` / `bend3` (up to 1 / 3 bends), whose
  paths can also run between layers (`tile()` / `generateOne()` take a `depth`). The logic is shared: a board
  has `depth` (1 flat, n cube), square index = (layer × n + row) × n + column, and `DR` / `DC` / `DZ` give each
  direction's step. `Arrows.generateCube(n, level)` deals 12 and takes the easiest (Easy), middle (Medium) or
  hardest (Hard) by `grade()` score.
- `arrows-cube.js` draws the cube with CSS 3D transforms (`.a-scene` > `.a-cube` > `.a-piece3` > one
  `.a-block` per square > six `.a-face`, `backface-visibility: hidden`); `--s` (square size = scene width / 2n)
  is set by a `ResizeObserver`. A face is shown only when nothing sits against it (`refresh()`), and has no
  border or rounded corner on edges shared with the same piece (`--edge`), so a piece reads as one shape. Each
  face draws the piece's path where it runs along that face (`faceArt()`): in from the block behind, out to
  the block in front; the head has the arrow head, or a dot on the face it leaves through. Sliding out is a
  Web Animations keyframe path per block (to the head, then straight on), all at the same speed, like a
  snake. Drag turns the cube (yaw / pitch, pitch clamped ±85°), a press that moves under 8 px is a tap;
  arrow keys turn it too.
  `arrows-app.js` talks to either view through the same calls (`build`, `place`, `refresh`, `leave`, `el`,
  `shakeClass`).
- Preferences (⚙ `#a-prefs-modal`, same behaviour as Groups): **Board**, **Difficulty**, then **Size**
  (5–10 flat, 3–5 cube; the size menu is rebuilt when Board changes).
  Saved game holds the pieces and `order` (pieces removed so far; Undo pops it). Saves from before bends
  (`{ r, c, len, dir }` pieces) load via `Arrows.fromStraight` if they were Hard (now Easy); old Easy and
  Medium games are dropped. Flat saves without `levels: 2` are from before the harder Hard: Hard loads as
  Medium, Medium is dropped.
- The board is one SVG in square units. Each piece is a `<g class="a-piece" role="button">` with a thick
  rounded tube, a thin shaft and a head, all drawn along one line from behind the tail, through the piece
  and off the board; dashes show the piece's part of it. Sliding out moves the dash offset and the head by
  the same distance (`.leaving` transitions). With `prefers-reduced-motion` the piece just disappears and
  nothing shakes. Hint lights a free piece's `.a-halo` with `--halo` and makes the game assisted.
- Best-time keys: `size-level` (e.g. `7-hard`), labelled like Groups (`sizeLevelLabel` in `scores.js`); the
  cube's are `cube-size-level` (e.g. `cube-4-hard`, shown as 4 × 4 × 4, Hard, after the flat ones).
  `migrateArrows` in `scores.js` moved old Hard records to Easy once and dropped old Easy / Medium
  (marker `_arrowsBend` in the stored data); `migrateArrowsHard` then moved flat Hard to Medium and dropped
  flat Medium (marker `_arrowsHard2`). Cube keys are never touched by either.

## Testing

There is no test framework. Check changes by:
- Running logic in Node, e.g. `node -e "const S=require('./sort.js'); console.log(S.generate(6,2))"`.
- Serving the folder (`python3 -m http.server`) and driving it with Playwright using phone
  emulation (`devices['iPhone 13']`, `devices['iPhone SE']`, `devices['iPhone 13 landscape']`, and the
  owner's phone, a Samsung Galaxy S24: viewport `{ width: 360, height: 780 }` plus shorter heights for
  the browser bars, and `780x360` landscape):
  check for page errors and no horizontal/vertical overflow, in both themes.
