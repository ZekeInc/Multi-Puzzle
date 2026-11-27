// Sort UI: the boxes ("tubes" in the code) and blocks, taps, tidying up at the
// end, and the Preferences and Rules pop-ups. The puzzle logic is in sort.js.
(function () {
  'use strict';

  const SAVE_KEY = 'sort-save-v1';
  // With 1 extra box and no empty spaces, bigger boxes leave less room to move,
  // so large deals are rarely solvable. Most colours allowed for each box size:
  const MAX_COLORS_TIGHT = { 3: 10, 4: 9, 5: 7, 6: 6 };

  const boardEl = document.getElementById('s-board');
  const colorsEl = document.getElementById('s-colors');
  const extraEl = document.getElementById('s-extra');
  const capEl = document.getElementById('s-cap');
  const emptyEl = document.getElementById('s-empty');
  const levelEl = document.getElementById('s-level');
  const mixEl = document.getElementById('s-mix');
  const movesEl = document.getElementById('s-moves');
  const timerEl = document.getElementById('s-timer');
  const bestEl = document.getElementById('s-best');
  const messageEl = document.getElementById('s-message');
  const prefsNoteEl = document.getElementById('s-prefs-note');

  const state = {
    colors: 0,
    extra: 0,
    cap: Sort.CAPACITY,   // blocks per box
    empty: 0,             // free spaces each colour box starts with
    mix: false,           // may blocks be dropped onto a different colour
    level: 'random',      // 'random' (not graded) or one of Sort.LEVELS
    initial: [],
    tubes: [],
    history: [],
    selected: -1,
    hintTo: -1,       // box the current hint says to drop on (stays marked until the next tap)
    moves: 0,
    finished: false,
    hintsUsed: false,
  };

  // ---------- Helpers ----------

  const setMessage = GameMode.message(messageEl);
  const { buzz, formatTime } = GameMode;
  // Best-time key: `colours-extra`, then `-cap-empty` unless the default box
  // (4 blocks, starts full), `-any` with the mix rule, and `-level` unless Random.
  // A game from before these options keeps the original short key.
  const scoreKey = () => `${state.colors}-${state.extra}` +
    (state.cap === Sort.CAPACITY && !state.empty ? '' : `-${state.cap}-${state.empty}`) +
    (state.mix ? '-any' : '') +
    (state.level === 'random' ? '' : `-${state.level}`);
  const rules = () => ({ cap: state.cap, mix: state.mix });
  // A box is complete (and closes) when it holds every block of one colour.
  const isComplete = (tube) => tube.length === state.cap - state.empty && tube.every((colour) => colour === tube[0]);

  // ---------- Timer ----------

  const timer = GameMode.timer('sort', timerEl, () => state.colors > 0 && !state.finished, save);
  window.addEventListener('modechange', () => layout());

  // ---------- Saving ----------

  function save() {
    if (!state.colors) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        colors: state.colors, extra: state.extra, cap: state.cap, empty: state.empty,
        mix: state.mix, level: state.level,
        initial: state.initial, tubes: state.tubes,
        moves: state.moves, elapsed: timer.ms(), finished: state.finished, hintsUsed: state.hintsUsed,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!saved || !Array.isArray(saved.tubes)) return false;
      const { elapsed, ...rest } = saved;
      Object.assign(state, rest, {
        cap: saved.cap || Sort.CAPACITY, empty: saved.empty || 0,
        mix: !!saved.mix, level: saved.level || 'random',
        history: [], selected: -1, hintTo: -1, hintsUsed: !!saved.hintsUsed,
      });
      timer.reset(elapsed);
      showOptions();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- Options ----------

  // Set the menus to the current game's options.
  function showOptions() {
    if (!state.colors) return;   // no game yet: keep the menus' defaults
    colorsEl.value = String(state.colors);
    extraEl.value = String(state.extra);
    capEl.value = String(state.cap);
    emptyEl.value = String(state.empty);
    mixEl.value = state.mix ? 'any' : 'same';
    levelEl.value = state.level;
    limitOptions();
  }

  // Keep the menus to combinations that can be dealt. Returns a message if a
  // choice had to be changed, or ''.
  function limitOptions() {
    let note = '';
    const cap = Number(capEl.value);
    const mix = mixEl.value === 'any';
    // No extra boxes only works when blocks can stack on any colour.
    extraEl.options[0].disabled = !mix;
    if (!mix && extraEl.value === '0') {
      extraEl.value = '1';
      note = '0 extra boxes needs “Stack on any colour”.';
    }
    // With no extra boxes, the empty spaces are the only room to move.
    const maxEmpty = Sort.maxEmpty(cap);
    const minEmpty = extraEl.value === '0' ? Sort.minEmptyNoExtra(cap) : 0;
    for (const option of emptyEl.options) {
      option.disabled = Number(option.value) > maxEmpty || Number(option.value) < minEmpty;
    }
    if (Number(emptyEl.value) > maxEmpty) {
      emptyEl.value = String(maxEmpty);
      note = `With ${cap} per box the most empty spaces is ${maxEmpty}.`;
    } else if (Number(emptyEl.value) < minEmpty) {
      emptyEl.value = String(minEmpty);
      note = `With 0 extra and ${cap} per box, at least ${minEmpty} empty.`;
    }
    // With only one extra box, no empty spaces and same-colour stacking,
    // very large puzzles are rarely solvable.
    const tight = !mix && extraEl.value === '1' && emptyEl.value === '0';
    const maxColors = tight ? MAX_COLORS_TIGHT[cap] : 10;
    for (const option of colorsEl.options) option.disabled = Number(option.value) > maxColors;
    if (Number(colorsEl.value) > maxColors) {
      colorsEl.value = String(maxColors);
      note = `With 1 extra box, ${cap} per box and no empty spaces, the most colours is ${maxColors}.`;
    }
    return note;
  }

  // The How to play text describes the current game's box size and stacking rule.
  function showRulesText() {
    document.getElementById('s-cap-text').textContent = state.cap;
    document.getElementById('s-stack-text').textContent = state.mix
      ? 'onto any box with room: an empty box, the same number or a different number'
      : 'onto an empty box or onto the same number';
  }

  // ---------- Rendering ----------

  // Size the boxes to fit the space available, choosing 1–3 rows to make
  // the blocks as large as possible.
  const BOX_PADDING = 12;     // padding + border around the blocks, px
  const BLOCK_GAP = 3;        // gap between blocks, px
  const COLUMN_GAP = 8, ROW_GAP = 16, LIFT = 12;
  const MAX_BLOCK = 56, MIN_BLOCK = 14;
  const wrapEl = boardEl.parentElement;

  function layout() {
    const boxCount = state.tubes.length;
    const width = wrapEl.clientWidth, height = wrapEl.clientHeight;
    if (!boxCount || !width || !height) return;
    let best = { blockSize: 0, perRow: boxCount };
    for (let rows = 1; rows <= 3; rows++) {
      const perRow = Math.ceil(boxCount / rows);
      const byWidth = (width - (perRow - 1) * COLUMN_GAP) / perRow - BOX_PADDING;
      // Box height = `cap` blocks + gaps + padding.
      const cap = state.cap;
      const fixed = (cap - 1) * BLOCK_GAP + BOX_PADDING;
      const byHeight = (height - LIFT - (rows - 1) * ROW_GAP - rows * fixed) / (rows * cap);
      const blockSize = Math.min(byWidth, byHeight, MAX_BLOCK);
      if (blockSize > best.blockSize + 0.5) best = { blockSize, perRow };
    }
    boardEl.style.setProperty('--per-row', best.perRow);
    boardEl.style.setProperty('--cap', state.cap);
    boardEl.style.setProperty('--sq', `${Math.max(Math.floor(best.blockSize), MIN_BLOCK)}px`);
  }
  if (window.ResizeObserver) new ResizeObserver(layout).observe(wrapEl);
  else window.addEventListener('resize', layout);
  let layoutFor = '';

  // `arrived` maps a box index to how many blocks just landed on top of it.
  function render(arrived = {}) {
    // Measuring forces the browser to lay out the page, so only do it when the
    // number or size of the boxes changed (resizes are handled by the observer).
    if (layoutFor !== `${state.tubes.length} ${state.cap}`) {
      layoutFor = `${state.tubes.length} ${state.cap}`;
      layout();
    }
    const selected = state.selected;
    boardEl.replaceChildren();
    state.tubes.forEach((tube, index) => {
      const tubeEl = document.createElement('button');
      tubeEl.className = 'tube';
      tubeEl.dataset.index = index;
      if (index === selected) tubeEl.classList.add('selected');
      if (index === state.hintTo) tubeEl.classList.add('hint-to');
      if (isComplete(tube)) tubeEl.classList.add('done');
      // The selected box's top run of one colour is what would move.
      const lifted = index === selected ? Sort.topRun(tube) : 0;
      const numbers = tube.map((colour) => colour + 1).join(', ');
      tubeEl.setAttribute('aria-label',
        `Box ${index + 1}: ${tube.length ? numbers : 'empty'}${index === selected ? ', selected' : ''}`);
      tube.forEach((colour, k) => {
        const blockEl = document.createElement('span');
        blockEl.className = 'square';
        blockEl.style.setProperty('--c', `var(--s${colour})`);
        blockEl.textContent = colour + 1;
        if (k >= tube.length - (arrived[index] || 0)) blockEl.classList.add('arrived');
        if (k >= tube.length - lifted) blockEl.classList.add('lifted');
        tubeEl.appendChild(blockEl);
      });
      boardEl.appendChild(tubeEl);
    });
    movesEl.textContent = `Moves: ${state.moves}`;
    timer.show();
    renderBest();
  }

  function renderBest() {
    bestEl.textContent = state.colors ? Scores.bestLabel('sort', scoreKey()) : 'Best: --:--';
  }
  window.addEventListener('scoreschange', renderBest);

  // Once no box mixes colours, gather any colour that is split across
  // several boxes into one box. Returns the moves needed and the result.
  function tidyMoves(tubes) {
    const steps = [];
    const gathered = tubes.map((tube) => tube.slice());
    for (let colour = 0; colour < state.colors; colour++) {
      const holders = gathered.map((tube, index) => index).filter((index) => gathered[index].length && gathered[index][0] === colour);
      if (holders.length < 2) continue;
      holders.sort((a, b) => gathered[b].length - gathered[a].length || a - b);
      const target = holders[0];
      for (const from of holders.slice(1)) {
        steps.push([from, target]);
        gathered[target].push(...gathered[from].splice(0));
      }
    }
    return { steps, tubes: gathered };
  }

  // ---------- Game flow ----------

  function newGame() {
    const colors = Number(colorsEl.value), extra = Number(extraEl.value);
    const cap = Number(capEl.value), empty = Number(emptyEl.value);
    const mix = mixEl.value === 'any', level = levelEl.value;
    gameId++;
    setMessage('Generating…');
    setTimeout(() => {
      let tubes, error;
      // A rare unlucky run can fail to find a solvable deal; try a few times.
      for (let tries = 0; tries < 3 && !tubes; tries++) {
        try { tubes = Sort.generate(colors, extra, { cap, empty, mix, level }); } catch (err) { error = err; }
      }
      if (!tubes) {
        setMessage(`Couldn't create a puzzle (${error.message}). Tap New to try again.`, 'bad');
        return;
      }
      Object.assign(state, {
        colors, extra, cap, empty, mix, level, initial: tubes.map((tube) => tube.slice()), tubes,
        history: [], selected: -1, hintTo: -1, moves: 0,
        finished: false, hintsUsed: false,
      });
      timer.reset(0);
      timer.start();
      setMessage('');
      showRulesText();
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
    state.tubes = state.initial.map((tube) => tube.slice());
    state.moves = 0;
    state.selected = -1;
    state.hintTo = -1;
    setMessage('');
    render();
    save();
  }

  function move(from, to) {
    const count = Sort.moveCount(state.tubes, from, to, rules());
    if (!count) return false;
    state.history.push({ tubes: state.tubes, moves: state.moves });
    if (state.history.length > 500) state.history.shift();
    state.tubes = Sort.applyMove(state.tubes, from, to, rules());
    state.moves++;
    state.selected = -1;
    setMessage('');
    render({ [to]: count });
    if (Sort.isSolved(state.tubes)) return finish() || true;
    if (!Sort.moves(state.tubes, rules()).length) setMessage('No moves left. Tap Undo or Restart.', 'bad');
    save();
    return true;
  }

  function tap(index) {
    if (state.finished) return;
    state.hintTo = -1;   // any tap ends the hint: either its move or the player's own
    const selected = state.selected;
    if (selected < 0) {
      if (state.tubes[index].length) { state.selected = index; render(); }
      return;
    }
    if (selected === index) { state.selected = -1; render(); return; }
    if (move(selected, index)) return;
    // Not a legal move: pick the tapped box instead, or shake to show it's blocked.
    state.selected = state.tubes[index].length ? index : -1;
    render();
    const tubeEl = boardEl.children[index];
    if (tubeEl) {
      tubeEl.classList.add('blocked');
      setTimeout(() => tubeEl.classList.remove('blocked'), 150);
    }
    buzz(40);
  }

  function undo() {
    if (state.finished) return;
    const previous = state.history.pop();
    if (!previous) return setMessage('Nothing to undo.');
    state.tubes = previous.tubes;
    state.moves = previous.moves;
    state.selected = -1;
    state.hintTo = -1;
    setMessage('');
    render();
    save();
  }

  function hint() {
    if (state.finished) return;
    const result = Sort.solve(state.tubes, 50000, rules());
    if (!result.moves) {
      setMessage(result.unsolvable
        ? "This position can't be solved. Undo some moves or restart."
        : "Couldn't find a hint from here. Try undoing a few moves.", 'bad');
      return;
    }
    state.hintsUsed = true;
    // Pick up the blocks to move (they glow) and mark the box to drop them on,
    // so one tap on the marked box makes exactly the hinted move.
    const [from, to] = result.moves[0];
    state.selected = from;
    state.hintTo = to;
    render();
    setMessage(`Tap the marked box (box ${to + 1}) to move the glowing blocks there.`);
    save();
  }

  function finish() {
    timer.pause();
    state.finished = true;
    state.selected = -1;
    state.hintTo = -1;
    // Save the tidied board straight away; the animation below is just for show.
    const { steps, tubes: tidied } = tidyMoves(state.tubes);
    const showing = state.tubes;
    state.tubes = tidied;
    save();
    state.tubes = showing;
    const result = Scores.record('sort', scoreKey(), timer.ms(), !state.hintsUsed);
    animateTidy(steps, tidied, result);
  }

  let gameId = 0;   // bumped by newGame so a running tidy animation stops
  const TIDY_DROP_MS = 220;   // let the drop animation (0.2s) finish before celebrating

  // All split colours gather at the same time: one render of the tidied board,
  // with every gathered block dropping in together.
  function animateTidy(steps, tidied, result) {
    const id = gameId;
    if (!steps.length) return celebrate(result);
    const arrived = {};
    for (const [from, to] of steps) arrived[to] = (arrived[to] || 0) + state.tubes[from].length;
    state.tubes = tidied;
    render(arrived);
    setTimeout(() => { if (id === gameId) celebrate(result); }, TIDY_DROP_MS);
  }

  function celebrate(result) {
    render();
    buzz([60, 60, 60]);
    setMessage(`Sorted in ${formatTime(timer.ms())} with ${state.moves} moves!` +
      Scores.verdict(result, state.hintsUsed, 'Hint used, so no best time.'), 'win');
    boardEl.classList.add('solved');
    save();
  }

  // ---------- Buttons and pop-ups ----------

  boardEl.addEventListener('click', (e) => {
    const tubeEl = e.target.closest('.tube');
    if (tubeEl) tap(Number(tubeEl.dataset.index));
  });

  for (const menu of [levelEl, colorsEl, extraEl, capEl, emptyEl, mixEl]) {
    menu.addEventListener('change', () => { prefsNoteEl.textContent = limitOptions(); });
  }
  GameMode.preferences('s', {
    focus: extraEl,
    showOptions,
    onOpen: () => { prefsNoteEl.textContent = ''; },
    inProgress,
    newGame: () => { boardEl.classList.remove('solved'); newGame(); },
  });
  const showRules = GameMode.rulesPopup('s');

  document.getElementById('s-undo').addEventListener('click', undo);
  document.getElementById('s-restart').addEventListener('click', restart);
  document.getElementById('s-hint').addEventListener('click', hint);
  GameMode.undoShortcut('sort', undo);

  // ---------- Start ----------

  if (load()) {
    showRulesText();
    render();
    if (state.finished) {
      state.tubes = tidyMoves(state.tubes).tubes;
      render();
      boardEl.classList.add('solved');
      setMessage('Tap New to play again.');
    } else {
      timer.start();
    }
  } else {
    // First time here: make a puzzle (only once the tab is opened, so the
    // other games start faster) and show the rules.
    GameMode.whenShown('sort', () => { newGame(); showRules(true); });
  }
})();
