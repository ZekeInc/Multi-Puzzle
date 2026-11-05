# Multi Puzzle
Logic puzzles with no ads.

**▶ [Play now](https://zekeinc.github.io/Multi-Puzzle/)** — https://zekeinc.github.io/Multi-Puzzle/

Simple, dependency-free logic puzzles in plain HTML, CSS and JavaScript, with three modes: **Sudoku**, **Groups** and **Sort**. Switch between them with the tabs at the top.

Built for phones: it can be installed to your home screen, runs full-screen,
works offline, and remembers your game when you switch apps.

## Play
Play online at **https://zekeinc.github.io/Multi-Puzzle/** (updates a minute or two after each merge to `main`),
or open `index.html` in any browser — no build step needed.

## Install on your phone
The app must be served over HTTPS to be installable (e.g. GitHub Pages:
repo **Settings → Pages → Deploy from a branch → `main` / root**). Then open the URL on your phone:
- **iPhone (Safari):** Share button → **Add to Home Screen**
- **Android (Chrome):** ⋮ menu → **Install app** / **Add to Home screen**

## Groups mode
The grid is split into coloured groups, with as many groups as there are rows and columns.
Place one **O** in every row, every column and every group. Os can't touch, not even diagonally.
Every puzzle is randomly generated and has exactly one solution.

- Grid sizes from 5 × 5 to 10 × 10
- Tap a square once for ✕ (not an O), twice for O, three times to clear
- Drag across squares to mark several ✕ at once (drag from a ✕ to erase them)
- Os that break a rule are highlighted in red
- Undo, clear, check and hint; timer and progress saved per mode

## Sort mode
Tubes hold stacks of coloured squares: one tube per colour, plus 1–3 empty extra tubes.
Tap a tube to pick up its top square (and any matching squares under it), then tap another
tube to drop them. You can only drop onto an empty tube or the same colour, and each tube
holds 4 squares. The puzzle is solved when no tube holds more than one colour.

- 4–10 colours and 1–3 extra tubes (up to 9 colours with 1 extra tube)
- Every puzzle is checked by a solver to make sure it can be won
- Undo, restart, hints, and a warning when no moves are left
- Each colour also has its own symbol, so colours are easy to tell apart

## Best times
Tap the 🏆 button to see your fastest time and number of puzzles solved for every
Sudoku difficulty, Groups size and Sort setup (colours + extra tubes). Your best for the current one also shows above the board.
Games where you used Hint or Solve don't count toward best times. Best times are saved on
your device and can be reset from the same screen.

## Sudoku features
- New puzzles generated on the fly (Easy / Medium / Hard), each with a unique solution
- Big touch targets, undo, notes (pencil marks), erase, hints, check and reveal solution
- Highlighting of the selected row, column, box and matching numbers
- Mistake counter and timer (pauses while the app is in the background)
- Progress saved automatically on the device
- Portrait and landscape layouts, with support for notched screens
- Keyboard support: arrows to move, `1`–`9` to enter, `Backspace`/`Delete`/`0` to erase, `N` to toggle notes
- Light and dark themes (follows your system setting)

## Files
- `sudoku.js` — Sudoku solver, puzzle generator and conflict checking
- `app.js` — Sudoku UI and controls
- `groups.js` — Groups solver and unique-solution puzzle generator
- `groups-app.js` — Groups UI and controls
- `modes.js` — switching between the two modes
- `scores.js` — best times and the Best times screen
- `sort.js` — Sort rules, solver and solvable puzzle generator
- `sort-app.js` — Sort UI and controls
- `index.html`, `style.css` — page and styles
- `manifest.webmanifest`, `sw.js`, `icons/` — home-screen install and offline support
