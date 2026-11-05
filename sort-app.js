(function () {
  'use strict';

  const SAVE_KEY = 'sort-save-v1';
  const CAP = Sort.CAPACITY;
  const SYMBOLS = ['●', '▲', '■', '◆', '★', '✚', '♥', '♣', '♠', '✦'];
  const MAX_COLORS_WITH_ONE_EXTRA = 9;
  const isActive = () => GameMode.isActive('sort');

  const boardEl = document.getElementById('s-board');
  const colorsEl = document.getElementById('s-colors');
  const extraEl = document.getElementById('s-extra');
  const movesEl = document.getElementById('s-moves');
  const timerEl = document.getElementById('s-timer');
  const bestEl = document.getElementById('s-best');
  const messageEl = document.getElementById('s-message');
  const rulesEl = document.getElementById('s-rules-text');
  const rulesBtn = document.getElementById('s-rules');

  const state = {
    colors: 0,
    extra: 0,
    initial: [],
    tubes: [],
    history: [],
    selected: -1,
    moves: 0,
    elapsed: 0,
    runStart: 0,
    finished: false,
    hintsUsed: false,
  };

  // ---------- Helpers ----------

  function setMessage(text, cls) {
    messageEl.textContent = text;
    messageEl.className = 'message' + (cls ? ' ' + cls : '');
  }
  function buzz(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }
  const scoreKey = () => `${state.colors}-${state.extra}`;
  const tubeDone = (t) => t.length === CAP && t.every((c) => c === t[0]);

  // ---------- Timer ----------

  function elapsedMs() {
    return state.elapsed + (state.runStart ? Date.now() - state.runStart : 0);
  }
  function startTimer() {
    if (!state.runStart && !state.finished && state.colors) state.runStart = Date.now();
  }
  function pauseTimer() {
    if (state.runStart) {
      state.elapsed += Date.now() - state.runStart;
      state.runStart = 0;
    }
  }
  setInterval(() => { timerEl.textContent = Scores.formatTime(elapsedMs()); }, 500);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pauseTimer(); save(); }
    else if (isActive()) startTimer();
  });
  window.addEventListener('pagehide', save);
  window.addEventListener('modechange', () => {
    if (isActive()) startTimer();
    else { pauseTimer(); save(); }
    layout();
  });

  // ---------- Saving ----------

  function save() {
    if (!state.colors) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        colors: state.colors, extra: state.extra, initial: state.initial, tubes: state.tubes,
        moves: state.moves, elapsed: elapsedMs(), finished: state.finished, hintsUsed: state.hintsUsed,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d || !Array.isArray(d.tubes)) return false;
      Object.assign(state, d, { history: [], selected: -1, runStart: 0, hintsUsed: !!d.hintsUsed });
      colorsEl.value = String(d.colors);
      extraEl.value = String(d.extra);
      limitColorOptions();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- Options ----------

  // With only one extra tube, very large puzzles are rarely solvable.
  function limitColorOptions() {
    const oneExtra = extraEl.value === '1';
    for (const opt of colorsEl.options) {
      opt.disabled = oneExtra && Number(opt.value) > MAX_COLORS_WITH_ONE_EXTRA;
    }
    if (oneExtra && Number(colorsEl.value) > MAX_COLORS_WITH_ONE_EXTRA) {
      colorsEl.value = String(MAX_COLORS_WITH_ONE_EXTRA);
      return true;
    }
    return false;
  }

  // ---------- Rendering ----------

  // Size the tubes to fit the space available, choosing 1–3 rows to make
  // the squares as large as possible.
  const TUBE_PAD = 12;      // padding + border around the squares, px
  const SQ_GAP = 3;         // gap between squares, px
  const COL_GAP = 8, ROW_GAP = 16, LIFT = 12;
  const wrapEl = boardEl.parentElement;

  function layout() {
    const total = state.tubes.length;
    const W = wrapEl.clientWidth, H = wrapEl.clientHeight;
    if (!total || !W || !H) return;
    let best = { size: 0, perRow: total };
    for (let rows = 1; rows <= 3; rows++) {
      const perRow = Math.ceil(total / rows);
      const byWidth = (W - (perRow - 1) * COL_GAP) / perRow - TUBE_PAD;
      // Tube height = 4 squares + gaps + padding + half a square of headroom.
      const fixed = (CAP - 1) * SQ_GAP + TUBE_PAD;
      const byHeight = (H - LIFT - (rows - 1) * ROW_GAP - rows * fixed) / (rows * (CAP + 0.5));
      const size = Math.min(byWidth, byHeight, 56);
      if (size > best.size + 0.5) best = { size, perRow };
    }
    boardEl.style.setProperty('--per-row', best.perRow);
    boardEl.style.setProperty('--sq', `${Math.max(Math.floor(best.size), 14)}px`);
  }
  if (window.ResizeObserver) new ResizeObserver(layout).observe(wrapEl);
  window.addEventListener('resize', layout);

  function render(arrivedTube, arrivedCount) {
    layout();
    const sel = state.selected;
    const selRun = sel >= 0 ? runLength(state.tubes[sel]) : 0;
    boardEl.replaceChildren();
    state.tubes.forEach((tube, t) => {
      const btn = document.createElement('button');
      btn.className = 'tube';
      btn.dataset.index = t;
      if (t === sel) btn.classList.add('selected');
      if (tubeDone(tube)) btn.classList.add('done');
      const names = tube.map((c) => SYMBOLS[c]).join(' ');
      btn.setAttribute('aria-label', `Tube ${t + 1}: ${tube.length ? names : 'empty'}${t === sel ? ', selected' : ''}`);
      tube.forEach((c, k) => {
        const sq = document.createElement('span');
        sq.className = 'square';
        sq.style.setProperty('--c', `var(--s${c})`);
        sq.textContent = SYMBOLS[c];
        if (c === 2) sq.classList.add('light');
        if (t === sel && k >= tube.length - selRun) sq.classList.add('lifted');
        if (t === arrivedTube && k >= tube.length - arrivedCount) sq.classList.add('arrived');
        btn.appendChild(sq);
      });
      boardEl.appendChild(btn);
    });
    movesEl.textContent = `Moves: ${state.moves}`;
    timerEl.textContent = Scores.formatTime(elapsedMs());
    renderBest();
  }

  function runLength(tube) {
    let n = 0;
    for (let k = tube.length - 1; k >= 0 && tube[k] === tube[tube.length - 1]; k--) n++;
    return n;
  }

  function renderBest() {
    bestEl.textContent = state.colors ? Scores.bestLabel('sort', scoreKey()) : 'Best: --:--';
  }
  window.addEventListener('scoreschange', renderBest);

  // Once no tube mixes colours, gather any colour that is split across
  // several tubes into one full tube. Returns the moves needed.
  function tidyMoves(tubes) {
    const steps = [];
    const sim = tubes.map((t) => t.slice());
    for (let c = 0; c < state.colors; c++) {
      const holders = sim.map((t, i) => i).filter((i) => sim[i].length && sim[i][0] === c);
      if (holders.length < 2) continue;
      holders.sort((a, b) => sim[b].length - sim[a].length || a - b);
      const target = holders[0];
      for (const from of holders.slice(1)) {
        steps.push([from, target]);
        sim[target].push(...sim[from].splice(0));
      }
    }
    return { steps, tubes: sim };
  }

  // ---------- Game flow ----------

  function newGame() {
    const colors = Number(colorsEl.value), extra = Number(extraEl.value);
    gameId++;
    setMessage('Generating…');
    setTimeout(() => {
      let tubes;
      try {
        tubes = Sort.generate(colors, extra);
      } catch (err) {
        setMessage(`Couldn't create a puzzle (${err.message}). Tap New to try again.`, 'bad');
        return;
      }
      Object.assign(state, {
        colors, extra, initial: tubes.map((t) => t.slice()), tubes,
        history: [], selected: -1, moves: 0, elapsed: 0, runStart: 0,
        finished: false, hintsUsed: false,
      });
      if (isActive()) startTimer();
      setMessage('');
      render();
      save();
    }, 20);
  }

  function inProgress() {
    return !state.finished && state.moves > 0;
  }

  function restart() {
    if (state.finished || !state.moves) return;
    if (!confirm('Restart this puzzle from the beginning?')) return;
    state.history.push({ tubes: state.tubes, moves: state.moves });
    state.tubes = state.initial.map((t) => t.slice());
    state.moves = 0;
    state.selected = -1;
    setMessage('');
    render();
    save();
  }

  function move(from, to) {
    const n = Sort.moveCount(state.tubes, from, to);
    if (!n) return false;
    state.history.push({ tubes: state.tubes, moves: state.moves });
    if (state.history.length > 500) state.history.shift();
    state.tubes = Sort.applyMove(state.tubes, from, to);
    state.moves++;
    state.selected = -1;
    setMessage('');
    render(to, n);
    if (Sort.isSolved(state.tubes)) return finish() || true;
    if (!Sort.moves(state.tubes).length) setMessage('No moves left. Tap Undo or Restart.', 'bad');
    save();
    return true;
  }

  function tap(t) {
    if (state.finished) return;
    const sel = state.selected;
    if (sel < 0) {
      if (state.tubes[t].length) { state.selected = t; render(); }
      return;
    }
    if (sel === t) { state.selected = -1; render(); return; }
    if (move(sel, t)) return;
    // Not a legal move: pick the tapped tube instead, or shake to show it's blocked.
    if (state.tubes[t].length) {
      state.selected = t;
      render();
    } else {
      state.selected = -1;
      render();
    }
    const el = boardEl.children[t];
    if (el) {
      el.classList.add('blocked');
      setTimeout(() => el.classList.remove('blocked'), 300);
    }
    buzz(40);
  }

  function undo() {
    if (state.finished) return;
    const prev = state.history.pop();
    if (!prev) return setMessage('Nothing to undo.');
    state.tubes = prev.tubes;
    state.moves = prev.moves;
    state.selected = -1;
    setMessage('');
    render();
    save();
  }

  function hint() {
    if (state.finished) return;
    const result = Sort.solve(state.tubes, 150000);
    if (!result.moves) {
      setMessage(result.unsolvable
        ? "This position can't be solved. Undo some moves or restart."
        : "Couldn't find a hint from here. Try undoing a few moves.", 'bad');
      return;
    }
    state.hintsUsed = true;
    const [from, to] = result.moves[0];
    state.selected = -1;
    render();
    const a = boardEl.children[from], b = boardEl.children[to];
    a.classList.add('hint-from');
    b.classList.add('hint-to');
    setMessage(`Move from tube ${from + 1} to tube ${to + 1}.`);
    save();
  }

  function finish() {
    pauseTimer();
    state.finished = true;
    state.selected = -1;
    // Save the tidied board straight away; the animation below is just for show.
    const { steps, tubes: tidied } = tidyMoves(state.tubes);
    const shown = state.tubes;
    state.tubes = tidied;
    save();
    state.tubes = shown;
    const result = Scores.record('sort', scoreKey(), state.elapsed, !state.hintsUsed);
    animateTidy(steps, tidied, result);
  }

  let gameId = 0;   // bumped by newGame so a running tidy animation stops

  function animateTidy(steps, tidied, result) {
    const id = gameId;
    if (!steps.length) return celebrate(result);
    let k = 0;
    (function next() {
      if (id !== gameId) return;
      if (k >= steps.length) {
        state.tubes = tidied;
        return celebrate(result);
      }
      const [from, to] = steps[k++];
      const n = state.tubes[from].length;
      state.tubes = state.tubes.map((t) => t.slice());
      state.tubes[to].push(...state.tubes[from].splice(0));
      render(to, n);
      setTimeout(next, 350);
    })();
  }

  function celebrate(result) {
    render();
    buzz([60, 60, 60]);
    const time = Scores.formatTime(state.elapsed);
    const base = `Sorted in ${time} with ${state.moves} moves!`;
    if (result.isNew && result.previous !== null) {
      setMessage(`${base} 🏆 New best (was ${Scores.formatTime(result.previous)})`, 'win');
    } else if (result.isNew) {
      setMessage(`${base} 🏆 First best time`, 'win');
    } else if (state.hintsUsed) {
      setMessage(`${base} 🎉 Hint used, so not counted as a best time.`, 'win');
    } else {
      setMessage(`${base} 🎉`, 'win');
    }
    boardEl.classList.add('solved');
    save();
  }

  // ---------- Wiring ----------

  boardEl.addEventListener('click', (e) => {
    const tube = e.target.closest('.tube');
    if (tube) tap(Number(tube.dataset.index));
  });

  function confirmNew() {
    return !inProgress() || confirm('Start a new puzzle? Your current progress will be lost.');
  }
  function optionChanged() {
    const adjusted = limitColorOptions();
    if (confirmNew()) {
      boardEl.classList.remove('solved');
      newGame();
      if (adjusted) setTimeout(() => setMessage('With 1 extra tube the most colours is 9.'), 40);
    } else {
      colorsEl.value = String(state.colors);
      extraEl.value = String(state.extra);
      limitColorOptions();
    }
  }
  colorsEl.addEventListener('change', optionChanged);
  extraEl.addEventListener('change', optionChanged);
  document.getElementById('s-new').addEventListener('click', () => {
    if (confirmNew()) { boardEl.classList.remove('solved'); newGame(); }
  });
  document.getElementById('s-undo').addEventListener('click', undo);
  document.getElementById('s-restart').addEventListener('click', restart);
  document.getElementById('s-hint').addEventListener('click', hint);

  function showRules(show) {
    rulesEl.hidden = !show;
    rulesBtn.setAttribute('aria-expanded', String(show));
    if (show) document.getElementById('s-rules-close').focus();
  }
  rulesBtn.addEventListener('click', () => showRules(true));
  document.getElementById('s-rules-close').addEventListener('click', () => showRules(false));
  rulesEl.addEventListener('click', (e) => { if (e.target === rulesEl) showRules(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !rulesEl.hidden) return showRules(false);
    if (isActive() && (e.ctrlKey || e.metaKey) && e.key === 'z') undo();
  });

  // ---------- Start ----------

  if (load()) {
    render();
    if (state.finished) {
      state.tubes = tidyMoves(state.tubes).tubes;
      render();
      boardEl.classList.add('solved');
      setMessage('Tap New to play again.');
    } else if (isActive()) {
      startTimer();
    }
  } else {
    newGame();
    if (isActive()) showRules(true);
    else window.addEventListener('modechange', function first() {
      if (!isActive()) return;
      window.removeEventListener('modechange', first);
      if (!state.moves) showRules(true);
    });
  }
})();
