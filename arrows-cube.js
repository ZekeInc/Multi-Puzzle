// The 3D view for Arrows: an n × n × n cube drawn with CSS 3D transforms.
// Drag to turn the cube; tap a piece to send it out.
//
// ArrowsCube.create(boardEl, { onTap }) returns a view with the same calls as
// the flat board's view in arrows-app.js: build(board), place(id, gone),
// refresh(removed), leave(id), el(id), shakeClass(id).
//
// World axes are CSS's: x right, y down, z towards the player. Square
// (layer z, row r, column c) sits at ((c, r, z) − (n − 1) / 2) × --s.
// A piece is a `.a-piece3` holding one `.a-block` per square, each with six
// faces. A face is only shown when nothing sits against it (so faces between
// two blocks of the same piece are hidden too), and the edges a face shares
// with the same piece's next block have no border, so the piece reads as one
// shape. Each face shows the piece's path where it runs along that face; the
// head block shows the arrow head (or a dot on the face it leaves through).
(function () {
  'use strict';

  // Face k looks out in direction k (0 top, 1 right, 2 bottom, 3 left,
  // 4 front, 5 back). Its transform, and its own right (R) and down (D) axes
  // in world terms, used to draw on that face.
  const FACES = [
    { t: 'rotateX(90deg)', R: [1, 0, 0], D: [0, 0, 1] },
    { t: 'rotateY(90deg)', R: [0, 0, -1], D: [0, 1, 0] },
    { t: 'rotateX(-90deg)', R: [1, 0, 0], D: [0, 0, -1] },
    { t: 'rotateY(-90deg)', R: [0, 0, 1], D: [0, 1, 0] },
    { t: '', R: [1, 0, 0], D: [0, 1, 0] },
    { t: 'rotateY(180deg)', R: [-1, 0, 0], D: [0, 1, 0] },
  ];
  const NAMES = ['up', 'right', 'down', 'left', 'towards you', 'away from you'];
  const START = { yaw: -35, pitch: -25 };
  const SLIDE_MS = 520;

  function create(boardEl, { onTap }) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let n = 0, pieces = [], owner = null;
    let pieceEls = [], blockEls = [], faceEls = [];   // [id], [id][k], [id][k][face]
    let yaw = START.yaw, pitch = START.pitch;
    // Zoom (1 = the whole cube fits) and pan in px from the scene's centre.
    // `baked` is the zoom drawn into --s; the rest is a stretch, used only while a
    // pinch or wheel is under way (stretching blurs, so it is baked in after).
    let zoom = 1, baked = 1, panX = 0, panY = 0, fitBtn = null, bakeTimer = 0;
    // base: square size with the whole cube in view; sq: the size the cube is
    // laid out at now (base × the zoom baked in, see bake()).
    let scene = null, cube = null, base = 30, sq = 30;

    const vec = (d) => [Arrows.COLUMN_STEP[d], Arrows.ROW_STEP[d], Arrows.LAYER_STEP[d]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const coords = (i) => [i % n, Math.floor(i / n) % n, Math.floor(i / (n * n))];   // x, y, z
    // Square next to square i in world direction v, or -1 off the cube.
    function step(i, v) {
      const [x, y, z] = coords(i);
      const a = x + v[0], b = y + v[1], c = z + v[2];
      return a < 0 || a >= n || b < 0 || b >= n || c < 0 || c >= n ? -1 : (c * n + b) * n + a;
    }

    // What face f of block k (0 = head) of piece p shows: the path through the
    // block, flattened onto the face. It comes in from the block behind and
    // goes out towards the block in front (or, for the head, out of the cube).
    function faceArt(p, k, f) {
      const len = p.cells.length;
      const out = k === 0 ? p.dir : Arrows.stepDirection(p.cells[k], p.cells[k - 1], n);
      const inn = k === len - 1 ? -1 : Arrows.stepDirection(p.cells[k + 1], p.cells[k], n);
      const flat = (d) => [dot(vec(d), FACES[f].R), dot(vec(d), FACES[f].D)];
      const pt = (v, t) => `${0.5 + v[0] * t},${0.5 + v[1] * t}`;
      let art = '';
      const line = (a, b) => { art += `<polyline points="${a} ${b}"/>`; };
      const o = flat(out);
      const along = o[0] || o[1];
      if (inn >= 0) {
        const v = flat(inn);
        if (v[0] || v[1]) line(pt(v, -0.5), pt(v, 0));
      } else if (along) {
        line(pt(o, -0.3), pt(o, 0));   // the tail: a short stub behind the centre
      }
      if (k > 0) {
        if (along) line(pt(o, 0), pt(o, 0.5));
      } else if (along) {
        const side = (a, s) => `${0.5 + o[0] * a - o[1] * s},${0.5 + o[1] * a + o[0] * s}`;
        line(pt(o, 0), pt(o, 0.1));
        art += `<polygon points="${side(0.36, 0)} ${side(0.02, 0.24)} ${side(0.02, -0.24)}"/>`;
      } else if (f === p.dir) {
        art += '<circle cx="0.5" cy="0.5" r="0.17"/>';
      }
      return art;
    }

    // Face corners and borders: none on an edge the face shares with another
    // block of the same piece.
    function faceEdges(id, i, f) {
      const { R, D } = FACES[f];
      const joined = (v) => { const j = step(i, v); return j >= 0 && owner[j] === id; };
      const neg = (v) => v.map((x) => -x);
      const [l, r, t, b] = [joined(neg(R)), joined(R), joined(neg(D)), joined(D)];
      const line = 'color-mix(in srgb, var(--a-ink) 22%, transparent)';
      const shadows = [];
      if (!l) shadows.push(`inset 1px 0 0 ${line}`);
      if (!r) shadows.push(`inset -1px 0 0 ${line}`);
      if (!t) shadows.push(`inset 0 1px 0 ${line}`);
      if (!b) shadows.push(`inset 0 -1px 0 ${line}`);
      const rad = (a, c) => (a || c ? '0' : 'calc(var(--s) * 0.16)');
      return {
        borderRadius: `${rad(t, l)} ${rad(t, r)} ${rad(b, r)} ${rad(b, l)}`,
        edge: shadows.join(', ') || 'none',
      };
    }

    // The cube's transform: pan, zoom (in all three axes, with the perspective
    // scaled to match, so zooming in looks like moving closer), then the turn.
    function turn() {
      const k = zoom / baked;
      cube.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale3d(${k}, ${k}, ${k}) ` +
        `rotateX(${pitch}deg) rotateY(${yaw}deg)`;
      if (scene) scene.style.perspective = `${Math.round(scene.clientWidth * 4 * zoom)}px`;
      if (fitBtn) fitBtn.hidden = zoom <= 1.01;
    }

    // Zoom in up to where a block is about 48 px across (at least 1.5×, at most 4×).
    const maxZoom = () => Math.max(1.5, Math.min(4, 48 / base));

    // Lay the cube out at the current zoom, so it is drawn sharp.
    function bake() {
      clearTimeout(bakeTimer);
      baked = zoom;
      sq = base * zoom;
      scene.style.setProperty('--s', `${sq.toFixed(2)}px`);
      turn();
    }
    const bakeSoon = () => { clearTimeout(bakeTimer); bakeTimer = setTimeout(bake, 150); };

    // Zoom to `z`, keeping the point (fx, fy) (px from the scene's centre) where it
    // is on screen, then keep some of the cube in view.
    function zoomTo(z, fx = 0, fy = 0) {
      z = Math.max(1, Math.min(maxZoom(), z));
      panX = fx - (fx - panX) * (z / zoom);
      panY = fy - (fy - panY) * (z / zoom);
      zoom = z;
      clampPan();
      turn();
      bakeSoon();
    }
    function clampPan() {
      if (zoom <= 1) { panX = panY = 0; return; }
      const reach = 0.87 * n * base * zoom;   // about the turned cube's half width
      panX = Math.max(-reach, Math.min(reach, panX));
      panY = Math.max(-reach, Math.min(reach, panY));
    }
    // Point (px from the scene's centre) for a screen position.
    function fromCentre(x, y) {
      const r = scene.getBoundingClientRect();
      return [x - r.left - r.width / 2, y - r.top - r.height / 2];
    }

    // Square size: the turned cube (up to √3 × its side across, a little more
    // with perspective) has to fit at any angle. width / (n × 1.8) leaves about
    // 5 px to spare at the worst angle (1.75 just touches the edge).
    function measure() {
      const w = scene.clientWidth;
      if (!w || !n) return;
      base = w / (n * 1.8);
      bake();
    }
    const resize = new ResizeObserver(measure);

    const mid = () => (n - 1) / 2;
    const home = (i) => {
      const [x, y, z] = coords(i).map((c) => c - mid());
      return `translate3d(calc(var(--s) * ${x}), calc(var(--s) * ${y}), calc(var(--s) * ${z}))`;
    };

    function build(board) {
      n = board.size;
      pieces = board.pieces;
      owner = Arrows.ownerGrid(board);
      yaw = START.yaw;
      pitch = START.pitch;
      zoom = baked = 1;
      panX = panY = 0;
      scene = document.createElement('div');
      scene.className = 'a-scene';
      scene.tabIndex = 0;
      scene.setAttribute('aria-label', 'Cube of arrow pieces. Drag to turn it, pinch to zoom, tap a piece to send it.');
      cube = document.createElement('div');
      cube.className = 'a-cube';
      fitBtn = document.createElement('button');
      fitBtn.className = 'a-fit';
      fitBtn.textContent = 'Fit';
      fitBtn.setAttribute('aria-label', 'Zoom out to the whole cube');
      fitBtn.hidden = true;
      fitBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      fitBtn.addEventListener('click', () => { zoom = 1; panX = panY = 0; bake(); });
      scene.append(cube, fitBtn);
      blockEls = [];
      faceEls = [];
      pieceEls = pieces.map((p, id) => {
        const el = document.createElement('div');
        el.className = 'a-piece3';
        el.dataset.id = id;
        const [vx, vy, vz] = vec(p.dir);
        el.style.setProperty('--vx', vx);
        el.style.setProperty('--vy', vy);
        el.style.setProperty('--vz', vz);
        const [x, y, z] = coords(p.cells[0]);
        const turns = Arrows.bends(p, n);
        el.setAttribute('aria-label', `Arrow pointing ${NAMES[p.dir]}, head at layer ${z + 1}, row ${y + 1}, ` +
          `column ${x + 1}, ${p.cells.length} block${p.cells.length > 1 ? 's' : ''}` +
          (turns ? `, ${turns} bend${turns > 1 ? 's' : ''}` : ''));
        blockEls[id] = [];
        faceEls[id] = [];
        p.cells.forEach((i, k) => {
          const block = document.createElement('div');
          block.className = 'a-block';
          block.style.transform = home(i);
          faceEls[id][k] = FACES.map((face, f) => {
            const fe = document.createElement('div');
            fe.className = `a-face a-face${f}`;
            fe.style.transform = `${face.t} translateZ(calc(var(--s) / 2))`;
            const { borderRadius, edge } = faceEdges(id, i, f);
            fe.style.borderRadius = borderRadius;
            fe.style.setProperty('--edge', edge);
            fe.innerHTML = `<svg viewBox="0 0 1 1" aria-hidden="true">${faceArt(p, k, f)}</svg>`;
            block.appendChild(fe);
            return fe;
          });
          blockEls[id][k] = block;
          el.appendChild(block);
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
      pieces.forEach((p, id) => {
        if (removed[id]) return;
        p.cells.forEach((i, k) => {
          faceEls[id][k].forEach((fe, f) => {
            const j = step(i, vec(f));
            fe.hidden = j >= 0 && !removed[owner[j]];
          });
        });
      });
    }

    function place(id, gone) {
      const el = pieceEls[id];
      for (const a of el.getAnimations({ subtree: true })) a.cancel();
      el.classList.remove('leaving', 'hint');
      el.classList.toggle('gone', gone);
    }

    // Slide out like a snake: every block follows the path to the head and
    // then straight on out, all at the same speed, so the piece keeps its shape.
    function leave(id) {
      const el = pieceEls[id], p = pieces[id];
      if (reducedMotion.matches) { el.classList.add('gone'); return; }
      const len = p.cells.length, out = n + 2, total = len - 1 + out;
      const v = vec(p.dir), m = mid();
      const at = (i) => coords(i).map((c) => (c - m) * sq);
      const tf = (xyz) => `translate3d(${xyz[0]}px, ${xyz[1]}px, ${xyz[2]}px)`;
      el.classList.add('leaving');
      p.cells.forEach((i, k) => {
        const frames = [];
        for (let j = k; j >= 0; j--) frames.push({ transform: tf(at(p.cells[j])), offset: (k - j) / total });
        const head = at(p.cells[0]), rest = total - k;
        frames.push({ transform: tf(head.map((c, a) => c + v[a] * rest * sq)), offset: 1 });
        blockEls[id][k].animate(frames, { duration: SLIDE_MS, easing: 'ease-in', fill: 'forwards' });
      });
      setTimeout(() => { if (el.classList.contains('leaving')) el.classList.add('gone'); }, SLIDE_MS);
    }

    // ---------- Turning, zooming and tapping ----------
    // One finger: a press that moves more than a few pixels turns the cube; one
    // that doesn't is a tap on the piece under it. Two fingers: pinch to zoom
    // (around the point between them) and move them together to pan. Mouse
    // wheel zooms too; keyboard: arrow keys turn, + / − zoom, 0 fits.

    let press = null, pinch = null;
    const fingers = new Map();   // pointerId → { x, y }

    function startPinch() {
      const [a, b] = [...fingers.values()];
      const [mx, my] = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx, my, zoom, panX, panY };
    }

    function listen() {
      scene.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        scene.setPointerCapture(e.pointerId);
        if (fingers.size === 1) {
          const piece = e.target.closest('.a-piece3');
          press = { x: e.clientX, y: e.clientY, yaw, pitch, id: piece ? Number(piece.dataset.id) : -1, moved: false };
        } else if (fingers.size === 2) {
          if (press) press.moved = true;   // a second finger means no tap
          startPinch();
        }
      });
      scene.addEventListener('pointermove', (e) => {
        if (!fingers.has(e.pointerId)) return;
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (fingers.size >= 2 && pinch) {
          const [a, b] = [...fingers.values()];
          const [mx, my] = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
          const z = Math.max(1, Math.min(maxZoom(), pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist));
          // The point that was under the fingers stays under them.
          panX = mx - (pinch.mx - pinch.panX) * (z / pinch.zoom);
          panY = my - (pinch.my - pinch.panY) * (z / pinch.zoom);
          zoom = z;
          clampPan();
          turn();
          return;
        }
        if (!press) return;
        const dx = e.clientX - press.x, dy = e.clientY - press.y;
        if (!press.moved && Math.hypot(dx, dy) < 8) return;
        press.moved = true;
        yaw = press.yaw + dx * 0.45;
        pitch = Math.max(-85, Math.min(85, press.pitch - dy * 0.45));
        turn();
      });
      const end = (e) => {
        if (!fingers.delete(e.pointerId)) return;
        if (fingers.size === 1) {
          // Back to one finger after a pinch: it turns from here, never taps.
          const [f] = fingers.values();
          pinch = null;
          bake();
          press = { x: f.x, y: f.y, yaw, pitch, id: -1, moved: true };
          return;
        }
        if (fingers.size > 1) { startPinch(); return; }
        const p = press;
        if (pinch) bake();
        press = pinch = null;
        if (p && e.type === 'pointerup' && !p.moved && p.id >= 0) onTap(p.id);
      };
      scene.addEventListener('pointerup', end);
      scene.addEventListener('pointercancel', end);
      scene.addEventListener('wheel', (e) => {
        e.preventDefault();
        const [fx, fy] = fromCentre(e.clientX, e.clientY);
        zoomTo(zoom * Math.exp(-e.deltaY * 0.002), fx, fy);
      }, { passive: false });
      scene.addEventListener('keydown', (e) => {
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(zoom * 1.25); return; }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomTo(zoom / 1.25); return; }
        if (e.key === '0') { e.preventDefault(); zoomTo(1); bake(); return; }
        const turnBy = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, 15], ArrowDown: [0, -15] }[e.key];
        if (!turnBy) return;
        e.preventDefault();
        yaw += turnBy[0];
        pitch = Math.max(-85, Math.min(85, pitch + turnBy[1]));
        turn();
      });
    }

    return {
      build,
      place,
      refresh,
      leave,
      el: (id) => pieceEls[id],
      shakeClass: () => 'shake-3d',
    };
  }

  window.ArrowsCube = { create };
})();
