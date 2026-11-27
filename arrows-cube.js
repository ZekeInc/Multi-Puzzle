// The 3D view for Arrows: an n × n × n cube of blocks drawn with CSS 3D
// transforms. Drag to turn the cube; tap a block to send it out.
//
// ArrowsCube.create(boardEl, { onTap }) returns a view with the same calls as
// the flat board's view in arrows-app.js: build(board), place(id, gone),
// refresh(removed), leave(id), el(id), shakeClass(id).
//
// World axes are CSS's: x right, y down, z towards the player. A block in
// square (layer z, row r, column c) sits at ((c, r, z) − (n − 1) / 2) × --s.
// Each block has six faces; a face is only shown when no block sits against
// it, so hidden faces cost nothing and can't flicker.
(function () {
  'use strict';

  // Face k looks out in direction k (0 top, 1 right, 2 bottom, 3 left,
  // 4 front, 5 back). Its transform, and its own right (R) and down (D) axes
  // in world terms, used to draw the block's arrow flat on that face.
  const FACES = [
    { t: 'rotateX(90deg)', R: [1, 0, 0], D: [0, 0, 1] },
    { t: 'rotateY(90deg)', R: [0, 0, -1], D: [0, 1, 0] },
    { t: 'rotateX(-90deg)', R: [1, 0, 0], D: [0, 0, -1] },
    { t: 'rotateY(-90deg)', R: [0, 0, 1], D: [0, 1, 0] },
    { t: '', R: [1, 0, 0], D: [0, 1, 0] },
    { t: 'rotateY(180deg)', R: [-1, 0, 0], D: [0, 1, 0] },
  ];
  const OPPOSITE = [2, 3, 0, 1, 5, 4];
  const NAMES = ['up', 'right', 'down', 'left', 'towards you', 'away from you'];
  const START = { yaw: -35, pitch: -25 };

  function create(boardEl, { onTap }) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let n = 0, blocks = [], faces = [], vec = [];
    let yaw = START.yaw, pitch = START.pitch;
    let scene = null, cube = null;

    const dir3 = (d) => [Arrows.DC[d], Arrows.DR[d], Arrows.DZ[d]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    // What a face shows: an arrow along the face when the block moves along
    // it, a dot on the face it leaves through, nothing on the face behind.
    function faceArt(dir, k) {
      if (k === dir) return '<circle cx="0.5" cy="0.5" r="0.17"/>';
      if (k === OPPOSITE[dir]) return '';
      const v = dir3(dir);
      const x = dot(v, FACES[k].R), y = dot(v, FACES[k].D);
      const p = (along, side) => `${0.5 + x * along - y * side},${0.5 + y * along + x * side}`;
      return `<line x1="${0.5 - x * 0.3}" y1="${0.5 - y * 0.3}" x2="${0.5 + x * 0.1}" y2="${0.5 + y * 0.1}"/>` +
        `<polygon points="${p(0.36, 0)} ${p(0.02, 0.24)} ${p(0.02, -0.24)}"/>`;
    }

    function turn() {
      cube.style.transform = `rotateX(${pitch}deg) rotateY(${yaw}deg)`;
    }

    // Square size: the turned cube (up to √3 × its side across) has to fit.
    function measure() {
      const w = scene.clientWidth;
      if (!w || !n) return;
      scene.style.setProperty('--s', `${(w / (n * 2)).toFixed(2)}px`);
      scene.style.perspective = `${Math.round(w * 4)}px`;
    }
    const resize = new ResizeObserver(measure);

    function build(board) {
      n = board.size;
      yaw = START.yaw;
      pitch = START.pitch;
      scene = document.createElement('div');
      scene.className = 'a-scene';
      scene.tabIndex = 0;
      scene.setAttribute('aria-label', 'Cube of arrow blocks. Drag to turn it, tap a block to send it.');
      cube = document.createElement('div');
      cube.className = 'a-cube';
      scene.appendChild(cube);
      const mid = (n - 1) / 2;
      vec = board.pieces.map((p) => dir3(p.dir));
      faces = [];
      blocks = board.pieces.map((p, id) => {
        const i = p.cells[0];
        const z = Math.floor(i / (n * n)), r = Math.floor(i / n) % n, c = i % n;
        const el = document.createElement('div');
        el.className = 'a-block';
        el.dataset.id = id;
        el.dataset.home = `translate3d(calc(var(--s) * ${c - mid}), calc(var(--s) * ${r - mid}), calc(var(--s) * ${z - mid}))`;
        el.style.transform = el.dataset.home;
        const [vx, vy, vz] = vec[id];
        el.style.setProperty('--vx', vx);
        el.style.setProperty('--vy', vy);
        el.style.setProperty('--vz', vz);
        el.setAttribute('aria-label', `Block pointing ${NAMES[p.dir]}, layer ${z + 1}, row ${r + 1}, column ${c + 1}`);
        faces[id] = FACES.map((f, k) => {
          const face = document.createElement('div');
          face.className = `a-face a-face${k}`;
          face.style.transform = `${f.t} translateZ(calc(var(--s) / 2))`;
          face.innerHTML = `<svg viewBox="0 0 1 1" aria-hidden="true">${faceArt(p.dir, k)}</svg>`;
          el.appendChild(face);
          return face;
        });
        cube.appendChild(el);
        return el;
      });
      boardEl.replaceChildren(scene);
      boardEl.classList.add('cube');
      resize.disconnect();
      resize.observe(scene);
      measure();
      turn();
      listen();
    }

    // Show only the faces with nothing against them.
    function refresh(removed) {
      blocks.forEach((el, id) => {
        if (removed[id]) return;
        faces[id].forEach((face, k) => {
          const nb = neighbour(id, k);
          face.hidden = nb >= 0 && !removed[nb];
        });
      });
    }
    // Blocks fill every square, so a block's id is its square.
    function neighbour(id, k) {
      const z = Math.floor(id / (n * n)) + Arrows.DZ[k];
      const r = Math.floor(id / n) % n + Arrows.DR[k];
      const c = id % n + Arrows.DC[k];
      return r < 0 || r >= n || c < 0 || c >= n || z < 0 || z >= n ? -1 : (z * n + r) * n + c;
    }

    function place(id, gone) {
      const el = blocks[id];
      el.classList.remove('leaving', 'hint');
      el.classList.toggle('gone', gone);
      el.style.transform = el.dataset.home;
    }

    // Fly out in the block's direction, far enough to leave the view.
    function leave(id) {
      const el = blocks[id];
      if (reducedMotion.matches) { el.classList.add('gone'); return; }
      const [vx, vy, vz] = vec[id], d = n + 2;
      el.classList.add('leaving');
      el.getBoundingClientRect();
      el.style.transform = `${el.dataset.home} translate3d(calc(var(--s) * ${vx * d}), calc(var(--s) * ${vy * d}), calc(var(--s) * ${vz * d}))`;
      setTimeout(() => { if (el.classList.contains('leaving')) el.classList.add('gone'); }, 450);
    }

    // ---------- Turning and tapping ----------
    // A press that moves more than a few pixels turns the cube; one that
    // doesn't is a tap on the block under it.

    let press = null;
    function listen() {
      scene.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const block = e.target.closest('.a-block');
        press = { x: e.clientX, y: e.clientY, yaw, pitch, id: block ? Number(block.dataset.id) : -1, moved: false };
        scene.setPointerCapture(e.pointerId);
      });
      scene.addEventListener('pointermove', (e) => {
        if (!press) return;
        const dx = e.clientX - press.x, dy = e.clientY - press.y;
        if (!press.moved && Math.hypot(dx, dy) < 8) return;
        press.moved = true;
        yaw = press.yaw + dx * 0.45;
        pitch = Math.max(-85, Math.min(85, press.pitch - dy * 0.45));
        turn();
      });
      const end = (e) => {
        if (!press) return;
        const p = press;
        press = null;
        if (e.type === 'pointerup' && !p.moved && p.id >= 0) onTap(p.id);
      };
      scene.addEventListener('pointerup', end);
      scene.addEventListener('pointercancel', end);
      // Keyboard: arrow keys turn the cube.
      scene.addEventListener('keydown', (e) => {
        const step = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, 15], ArrowDown: [0, -15] }[e.key];
        if (!step) return;
        e.preventDefault();
        yaw += step[0];
        pitch = Math.max(-85, Math.min(85, pitch + step[1]));
        turn();
      });
    }

    return {
      build,
      place,
      refresh,
      leave,
      el: (id) => blocks[id],
      shakeClass: () => 'shake-3d',
    };
  }

  window.ArrowsCube = { create };
})();
