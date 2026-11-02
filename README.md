# Sudoku-app
Sudoku app with no ads.

A simple, dependency-free Sudoku game in plain HTML, CSS and JavaScript.

Built for phones: it can be installed to your home screen, runs full-screen,
works offline, and remembers your game when you switch apps.

## Play
Open `index.html` in any browser — no build step needed.

## Install on your phone
The app must be served over HTTPS to be installable (e.g. GitHub Pages:
repo **Settings → Pages → Deploy from a branch → `main` / root**). Then open the URL on your phone:
- **iPhone (Safari):** Share button → **Add to Home Screen**
- **Android (Chrome):** ⋮ menu → **Install app** / **Add to Home screen**

## Features
- New puzzles generated on the fly (Easy / Medium / Hard), each with a unique solution
- Big touch targets, undo, notes (pencil marks), erase, hints, check and reveal solution
- Highlighting of the selected row, column, box and matching numbers
- Mistake counter and timer (pauses while the app is in the background)
- Progress saved automatically on the device
- Portrait and landscape layouts, with support for notched screens
- Keyboard support: arrows to move, `1`–`9` to enter, `Backspace`/`Delete`/`0` to erase, `N` to toggle notes
- Light and dark themes (follows your system setting)

## Files
- `sudoku.js` — solver, puzzle generator and conflict checking
- `app.js` — game UI and controls
- `index.html`, `style.css` — page and styles
- `manifest.webmanifest`, `sw.js`, `icons/` — home-screen install and offline support
