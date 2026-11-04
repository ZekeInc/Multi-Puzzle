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
      keys: [5, 6, 7, 8, 9, 10].map((n) => [String(n), `${n} × ${n}`]),
    },
  };

  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function writeAll(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function formatTime(ms) {
    const secs = Math.floor(ms / 1000);
    return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  }

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
      for (const [key, label] of cat.keys) {
        const { best, solved } = get(game, key);
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
      body.append(h, table);
    }
  }

  function show(open) {
    if (open) renderTable();
    modal.hidden = !open;
    openBtn.setAttribute('aria-expanded', String(open));
    if (open) document.getElementById('scores-close').focus();
  }

  openBtn.addEventListener('click', () => show(true));
  document.getElementById('scores-close').addEventListener('click', () => show(false));
  modal.addEventListener('click', (e) => { if (e.target === modal) show(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) show(false); });
  document.getElementById('scores-reset').addEventListener('click', () => {
    if (!confirm('Reset all best times? This cannot be undone.')) return;
    writeAll({});
    renderTable();
    window.dispatchEvent(new CustomEvent('scoreschange'));
  });

  window.Scores = { get, record, bestLabel, formatTime };
})();
