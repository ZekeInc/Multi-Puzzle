// Best times for each game and difficulty/size, stored on this device.
// Only games solved without hints (or Solve) can set a best time.
(function () {
  'use strict';

  const KEY = 'best-times-v1';

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
      label(key) {
        const [n, level = 'random'] = key.split('-');
        return `${n} × ${n}, ${level[0].toUpperCase()}${level.slice(1)}`;
      },
      order(key) {
        const [n, level] = key.split('-');
        return Number(n) * 10 + (level ? ['easy', 'medium', 'hard'].indexOf(level) + 1 : 0);
      },
    },
    sort: {
      title: 'Sort',
      // Too many option combinations to list, so the played ones are read from
      // the saved keys: `colours-extra[-cap-empty][-any][-level]`.
      fromSaved: true,
      label(key) {
        const parts = key.split('-');
        const [c, e] = parts;
        let i = 2;
        let text = `${c} colours, ${e} extra`;
        if (/^\d+$/.test(parts[i] || '')) {
          text += `, ${parts[i]} per box, ${parts[i + 1]} empty`;
          i += 2;
        }
        if (parts[i] === 'any') { text += ', any colour'; i++; }
        // No level means Random (also every game from before levels existed).
        const level = parts[i] || 'random';
        text += `, ${level[0].toUpperCase()}${level.slice(1)}`;
        return text;
      },
    },
  };

  // Read from storage once and kept in memory: the games ask for their best
  // time on every redraw.
  let cache = null;
  function readAll() {
    if (!cache) {
      try { cache = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { cache = {}; }
    }
    return cache;
  }

  function writeAll(data) {
    cache = data;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }
  // Another tab of the app changed the best times.
  window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) cache = null; });

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
  const body = document.getElementById('scores-body');
  const openBtn = document.getElementById('scores-open');

  function renderTable() {
    body.replaceChildren();
    for (const [game, cat] of Object.entries(CATEGORIES)) {
      const h = document.createElement('h3');
      h.textContent = cat.title;
      const table = document.createElement('table');
      table.innerHTML = '<thead><tr><th scope="col"></th><th scope="col">Best time</th><th scope="col">Solved</th></tr></thead>';
      const tbody = document.createElement('tbody');
      const keys = cat.fromSaved
        ? Object.keys(readAll())
          .filter((id) => id.startsWith(`${game}:`))
          .map((id) => id.slice(game.length + 1))
          .sort(cat.order
            ? (x, y) => cat.order(x) - cat.order(y)
            : (x, y) => x.localeCompare(y, undefined, { numeric: true }))
          .map((key) => [key, cat.label(key)])
        : cat.keys;
      for (const [key, label] of keys) {
        const { best, solved } = get(game, key);
        if (cat.fromSaved && !solved) continue;
        const tr = document.createElement('tr');
        const cells = [label, best === null ? '—' : formatTime(best), String(solved)];
        cells.forEach((text, i) => {
          const td = document.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.scope = 'row';
          td.textContent = text;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      if (!tbody.children.length) {
        const p = document.createElement('p');
        p.className = 'note';
        p.textContent = 'No puzzles solved yet.';
        body.append(h, p);
      } else {
        body.append(h, table);
      }
    }
  }

  const closeBtn = document.getElementById('scores-close');
  const show = GameMode.popup(modal, openBtn, closeBtn);

  openBtn.addEventListener('click', () => { renderTable(); show(true); });
  closeBtn.addEventListener('click', () => show(false));
  document.getElementById('scores-reset').addEventListener('click', () => {
    if (!confirm('Reset all best times? This cannot be undone.')) return;
    writeAll({});
    renderTable();
    window.dispatchEvent(new CustomEvent('scoreschange'));
  });

  window.Scores = { get, record, bestLabel, verdict };
})();
