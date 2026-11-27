// Best times for each game and difficulty/size, stored on this device.
// Only games solved without hints (or Solve) can set a best time.
(function () {
  'use strict';

  const STORAGE_KEY = 'best-times-v1';

  const capitalise = (word) => word[0].toUpperCase() + word.slice(1);

  // Labels and order for `size-level` keys (Groups and Arrows).
  function sizeLevelLabel(key) {
    const [size, level = 'random'] = key.split('-');
    return `${size} × ${size}, ${capitalise(level)}`;
  }
  function sizeLevelOrder(key) {
    const [size, level] = key.split('-');
    return Number(size) * 10 + (level ? ['easy', 'medium', 'hard'].indexOf(level) + 1 : 0);
  }

  const CATEGORIES = {
    sudoku: {
      title: 'Sudoku',
      keys: [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']],
    },
    groups: {
      title: 'Groups',
      // Played keys from storage: `size-level`, or just `size` for games from
      // before levels existed (shown as Random, like Sort).
      fromSaved: true,
      label: sizeLevelLabel,
      order: sizeLevelOrder,
    },
    sort: {
      title: 'Sort',
      // Too many option combinations to list, so the played ones are read from
      // the saved keys: `colours-extra[-cap-empty][-any][-level]`.
      fromSaved: true,
      label(key) {
        const parts = key.split('-');
        const [colours, extra] = parts;
        let next = 2;
        let text = `${colours} colours, ${extra} extra`;
        if (/^\d+$/.test(parts[next] || '')) {
          text += `, ${parts[next]} per box, ${parts[next + 1]} empty`;
          next += 2;
        }
        if (parts[next] === 'any') { text += ', any colour'; next++; }
        // No level means Random (also every game from before levels existed).
        return `${text}, ${capitalise(parts[next] || 'random')}`;
      },
    },
    arrows: {
      title: 'Arrows',
      // Keys `size-level` like Groups; the 3D cube's are `cube-size-level`,
      // listed after the flat ones.
      fromSaved: true,
      label(key) {
        if (!key.startsWith('cube-')) return sizeLevelLabel(key);
        const [size, level] = key.slice(5).split('-');
        return `${size} × ${size} × ${size}, ${capitalise(level)}`;
      },
      order(key) {
        return key.startsWith('cube-') ? 1000 + sizeLevelOrder(key.slice(5)) : sizeLevelOrder(key);
      },
    },
  };

  // ---------- Storage ----------

  function store(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  // Read from storage once and kept in memory: the games ask for their best
  // time on every redraw.
  let cache = null;
  function readAll() {
    if (!cache) {
      try { cache = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { cache = {}; }
      // When Arrows pieces learned to bend, the old (straight) Hard became Easy
      // and the old Easy and Medium went away.
      if (!cache._arrowsBend) moveArrowsLevel(cache, ['easy', 'medium', 'hard'], 'hard', 'easy', '_arrowsBend');
      // When the flat board got a harder Hard, the old Hard became Medium and the
      // old Medium (1 bend) went away. Cube keys (`cube-…`) are untouched.
      if (!cache._arrowsHard2) moveArrowsLevel(cache, ['medium', 'hard'], 'hard', 'medium', '_arrowsHard2');
    }
    return cache;
  }

  // One-time move of flat Arrows best times after the levels changed: records of
  // level `from` become `to`, other records of the `levels` listed are dropped.
  // `marker` (not a game key) records that it ran.
  function moveArrowsLevel(data, levels, from, to, marker) {
    const pattern = new RegExp(`^arrows:(\\d+)-(${levels.join('|')})$`);
    const moved = {};
    for (const id of Object.keys(data)) {
      const match = pattern.exec(id);
      if (!match) continue;
      if (match[2] === from) moved[`arrows:${match[1]}-${to}`] = data[id];
      delete data[id];
    }
    Object.assign(data, moved);
    data[marker] = 1;
    store(data);
  }

  function writeAll(data) {
    cache = data;
    store(data);
  }
  // Another tab of the app changed the best times.
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY || e.key === null) cache = null; });

  const formatTime = GameMode.formatTime;

  function get(game, key) {
    return readAll()[`${game}:${key}`] || { best: null, solved: 0 };
  }

  // Records a finished game. Returns { best, previous, isNew }.
  function record(game, key, ms, eligible) {
    const data = readAll();
    const id = `${game}:${key}`;
    const entry = data[id] || { best: null, solved: 0 };
    const previous = entry.best;
    entry.solved++;
    const isNew = eligible && (previous === null || ms < previous);
    if (isNew) entry.best = ms;
    data[id] = entry;
    writeAll(data);
    window.dispatchEvent(new CustomEvent('scoreschange'));
    return { best: entry.best, previous, isNew };
  }

  function bestLabel(game, key) {
    const { best } = get(game, key);
    return best === null ? 'Best: --:--' : `Best: ${formatTime(best)}`;
  }

  // End of the win message for a record() result.
  function verdict(result, hintsUsed, hintNote) {
    if (result.isNew && result.previous !== null) return ` 🏆 New best (was ${formatTime(result.previous)})`;
    if (result.isNew) return ' 🏆 First best time';
    if (hintsUsed) return ` 🎉 ${hintNote || 'Hint used, so not counted as a best time.'}`;
    return ' 🎉';
  }

  // ---------- "Best times" pop-up ----------

  const modal = document.getElementById('scores-modal');
  const bodyEl = document.getElementById('scores-body');
  const openButton = document.getElementById('scores-open');

  // One game at a time; the buttons at the top pick which.
  const gameTabs = [...document.querySelectorAll('.scores-tabs [data-game]')];
  let shownGame = 'sudoku';

  function renderTable() {
    const game = shownGame, category = CATEGORIES[game];
    gameTabs.forEach((tab) => {
      const selected = tab.dataset.game === game;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    bodyEl.setAttribute('aria-label', `${category.title} best times`);
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th scope="col"></th><th scope="col">Best time</th><th scope="col">Solved</th></tr></thead>';
    const tbody = document.createElement('tbody');
    const rows = category.fromSaved
      ? Object.keys(readAll())
        .filter((id) => id.startsWith(`${game}:`))
        .map((id) => id.slice(game.length + 1))
        .sort(category.order
          ? (x, y) => category.order(x) - category.order(y)
          : (x, y) => x.localeCompare(y, undefined, { numeric: true }))
        .map((key) => [key, category.label(key)])
      : category.keys;
    for (const [key, label] of rows) {
      const { best, solved } = get(game, key);
      if (category.fromSaved && !solved) continue;
      const rowEl = document.createElement('tr');
      [label, best === null ? '—' : formatTime(best), String(solved)].forEach((text, column) => {
        const cellEl = document.createElement(column === 0 ? 'th' : 'td');
        if (column === 0) cellEl.scope = 'row';
        cellEl.textContent = text;
        rowEl.appendChild(cellEl);
      });
      tbody.appendChild(rowEl);
    }
    table.appendChild(tbody);
    if (!tbody.children.length) {
      const noteEl = document.createElement('p');
      noteEl.className = 'note';
      noteEl.textContent = `No ${category.title} puzzles solved yet.`;
      bodyEl.replaceChildren(noteEl);
    } else {
      bodyEl.replaceChildren(table);
    }
  }

  gameTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => { shownGame = tab.dataset.game; renderTable(); });
    // Arrow keys move between the game buttons, like the main tab bar.
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      const next = gameTabs[(index + step + gameTabs.length) % gameTabs.length];
      shownGame = next.dataset.game;
      renderTable();
      next.focus();
    });
  });

  // Focus goes to the game being shown, which keeps the pop-up scrolled to the top.
  const selectedTab = { focus: () => gameTabs.find((tab) => tab.dataset.game === shownGame).focus() };
  const show = GameMode.popup(modal, openButton, selectedTab);

  openButton.addEventListener('click', () => {
    // Open on the game being played.
    if (CATEGORIES[document.body.dataset.mode]) shownGame = document.body.dataset.mode;
    renderTable();
    show(true);
  });
  document.getElementById('scores-close').addEventListener('click', () => show(false));
  // Reset clears the best times of the game being shown.
  document.getElementById('scores-reset').addEventListener('click', () => {
    const title = CATEGORIES[shownGame].title;
    if (!confirm(`Reset all ${title} best times? This cannot be undone.`)) return;
    const data = readAll();
    for (const id of Object.keys(data)) if (id.startsWith(`${shownGame}:`)) delete data[id];
    writeAll(data);
    renderTable();
    window.dispatchEvent(new CustomEvent('scoreschange'));
  });

  window.Scores = { get, record, bestLabel, verdict };
})();
