# Multi Puzzle

Mobile-first puzzle web app with three games: **Sudoku**, **Groups** and **Sort**.
Plain HTML/CSS/JavaScript, no dependencies and no build step. Hosted on GitHub Pages at
https://zekeinc.github.io/Multi-Puzzle/ (updates 1–2 minutes after a merge to `main`).
Installable as a home-screen app and works offline.

## Files

| File | Purpose |
|---|---|
| `index.html` | All markup: tab bar, one `<section class="view">` per game, pop-ups (rules, best times, Sort preferences) |
| `style.css` | All styles. Theme colours are CSS variables on `:root` (light) and `:root[data-theme="dark"]` |
| `theme.js` | Light/dark toggle. Dark is the default; an inline script in `<head>` applies the saved theme before the page draws |
| `modes.js` | Tab switching. Fires a `modechange` event; `GameMode.isActive('sudoku' \| 'groups' \| 'sort')` |
| `scores.js` | Best times per game and difficulty/size, plus the 🏆 Best times pop-up (`Scores.record`, `Scores.bestLabel`) |
| `sudoku.js` / `app.js` | Sudoku logic (generator, solver) / Sudoku UI |
| `groups.js` / `groups-app.js` | Groups logic (unique-solution generator) / Groups UI |
| `sort.js` / `sort-app.js` | Sort logic (rules, solver, solvable generator) / Sort UI |
| `sw.js` | Service worker: offline cache, network-first |
| `manifest.webmanifest`, `icons/` | Home-screen install |

Logic files (`sudoku.js`, `groups.js`, `sort.js`) have no DOM code and can be loaded in Node
with `require()` for testing.

## Conventions

- **Cache busting:** when changing any CSS/JS file, bump its `?v=` number in `index.html` and
  bump `CACHE` in `sw.js`, so installed copies pick up the change. If you add a file, add it to
  the `FILES` list in `sw.js` too.
- **Each game** keeps its own state, timer and saved progress in `localStorage`
  (`sudoku-save-v1`, `groups-save-v1`, `sort-save-v1`). Timers pause when the game's tab is
  hidden or the app goes to the background.
- **Hints / Solve** mark a game as assisted, so it can't set a best time.
- **Themes:** check UI changes in both dark and light. Don't use `prefers-color-scheme`; the
  theme comes from `data-theme` on `<html>`.
- **Layout:** must fit phones down to 320px wide with no scrolling, and landscape phones
  (two-column layout under `@media (orientation: landscape) and (max-height: 600px)`).
  Respect `prefers-reduced-motion` for animations.
  `main` is exactly the visible height: `--app-h`, set from `visualViewport` in `modes.js`
  (`100dvh` can disagree with what mobile browsers really show, e.g. Android Chrome / Samsung Internet with a sliding address bar). Size boards from `--app-h`, not `100dvh`.
- **Confirm before losing progress:** New, Restart, Clear and Solve ask first when a game is in progress.

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

## Testing

There is no test framework. Check changes by:
- Running logic in Node, e.g. `node -e "const S=require('./sort.js'); console.log(S.generate(6,2))"`.
- Serving the folder (`python3 -m http.server`) and driving it with Playwright using phone
  emulation (`devices['iPhone 13']`, `devices['iPhone SE']`, `devices['iPhone 13 landscape']`, and the
  owner's phone, a Samsung Galaxy S24: viewport `{ width: 360, height: 780 }` plus shorter heights for
  the browser bars, and `780x360` landscape):
  check for page errors and no horizontal/vertical overflow, in both themes.
