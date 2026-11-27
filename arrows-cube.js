// The 3D view for Arrows: a size × size × size cube drawn with CSS 3D
// transforms. Drag to turn the cube, pinch to zoom; tap a piece to send it out.
//
// ArrowsCube.create(boardEl, { onTap }) returns a view with the same calls as
// the flat board's view in arrows-app.js: build(board), place(id, gone),
// refresh(removed), leave(id), el(id), shakeClass(id).
//
// World axes are CSS's: x right, y down, z towards the player. The square at
// (layer, row, column) sits at ((column, row, layer) − (size − 1) / 2) × --s.
// A piece is a `.a-piece3` holding one `.a-block` per square, each with six
// faces. A face is only shown when nothing sits against it (so faces between
// two blocks of the same piece are hidden too), and the edges a face shares
// with the same piece's next block have no border, so the piece reads as one
// shape. Each face shows the piece's path where it runs along that face; the
// head block shows the arrow head (or a dot on the face it leaves through).
(function () {
  'use strict';

  // Face k looks out in direction k (0 top, 1 right, 2 bottom, 3 left,
  // 4 front, 5 back). Its transform, and its own right and down axes in world
  // terms, used to draw on that face.
  const FACES = [
    { transform: 'rotateX(90deg)', right: [1, 0, 0], down: [0, 0, 1] },
    { transform: 'rotateY(90deg)', right: [0, 0, -1], down: [0, 1, 0] },
    { transform: 'rotateX(-90deg)', right: [1, 0, 0], down: [0, 0, -1] },
    { transform: 'rotateY(-90deg)', right: [0, 0, 1], down: [0, 1, 0] },
    { transform: '', right: [1, 0, 0], down: [0, 1, 0] },
    { transform: 'rotateY(180deg)', right: [-1, 0, 0], down: [0, 1, 0] },
  ];
  const DIRECTION_NAMES = ['up', 'right', 'down', 'left', 'towards you', 'away from you'];
  const START = { yaw: -35, pitch: -25 };
  const MAX_PITCH = 85;
  const TURN_PER_PX = 0.45;    // degrees the cube turns per pixel dragged
  const TAP_SLOP = 8;          // px a press may move and still count as a tap
  const SLIDE_MS = 520;
  const FIT = 1.8;             // square size = scene width / (size × FIT): see measure()

  // Direction `dir` as a world vector [x, y, z].
  const directionVector = (dir) => [Arrows.COLUMN_STEP[dir], Arrows.ROW_STEP[dir], Arrows.LAYER_STEP[dir]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const clampPitch = (degrees) => Math.max(-MAX_PITCH, Math.min(MAX_PITCH, degrees));

  function create(boardEl, { onTap }) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let size = 0, pieces = [], owner = null;
    let pieceEls = [], blockEls = [], faceEls = [];   // [id], [id][block], [id][block][face]
    let yaw = START.yaw, pitch = START.pitch;
    // Zoom (1 = the whole cube fits) and pan in px from the scene's centre.
    // `bakedZoom` is the zoom drawn into --s; the rest is a stretch, used only
    // while a pinch or wheel is under way (stretching blurs, so it is baked in after).
    let zoom = 1, bakedZoom = 1, panX = 0, panY = 0, fitButton = null, bakeTimer = 0;
    // fitSquare: square size with the whole cube in view; squareSize: the size
    // the cube is laid out at now (fitSquare × the baked zoom, see bake()).
    let scene = null, cube = null, fitSquare = 30, squareSize = 30;

    // World position [x, y, z] of a square, in squares.
    function worldOf(square) {
      const { layer, row, column } = Arrows.coordinatesOf(square, size);
      return [column, row, layer];
    }
    // Square next to `square` in world direction `vector`, or -1 off the cube.
    function neighbour(square, vector) {
      const [x, y, z] = worldOf(square);
      const column = x + vector[0], row = y + vector[1], layer = z + vector[2];
      const off = column < 0 || column >= size || row < 0 || row >= size || layer < 0 || layer >= size;
      return off ? -1 : (layer * size + row) * size + column;
    }

    // What face `face` of block `blockIndex` (0 = head) of a piece shows: the
    // path through the block, flattened onto the face. It comes in from the
    // block behind and goes out towards the block in front (or, for the head,
    // out of the cube).
    function faceArt(piece, blockIndex, face) {
      const length = piece.cells.length;
      const outDirection = blockIndex === 0 ? piece.dir
        : Arrows.stepDirection(piece.cells[blockIndex], piece.cells[blockIndex - 1], size);
      const inDirection = blockIndex === length - 1 ? -1
        : Arrows.stepDirection(piece.cells[blockIndex + 1], piece.cells[blockIndex], size);
      // A direction flattened onto this face: [right, down] (both 0 if it goes straight through the face).
      const onFace = (dir) => [dot(directionVector(dir), FACES[face].right), dot(directionVector(dir), FACES[face].down)];
      const point = (vector, distance) => `${0.5 + vector[0] * distance},${0.5 + vector[1] * distance}`;
      let art = '';
      const line = (from, to) => { art += `<polyline points="${from} ${to}"/>`; };
      const out = onFace(outDirection);
      const runsAlong = out[0] || out[1];
      if (inDirection >= 0) {
        const into = onFace(inDirection);
        if (into[0] || into[1]) line(point(into, -0.5), point(into, 0));
      } else if (runsAlong) {
        line(point(out, -0.3), point(out, 0));   // the tail: a short stub behind the centre
      }
      if (blockIndex > 0) {
        if (runsAlong) line(point(out, 0), point(out, 0.5));
      } else if (runsAlong) {
        const headPoint = (along, side) => `${0.5 + out[0] * along - out[1] * side},${0.5 + out[1] * along + out[0] * side}`;
        line(point(out, 0), point(out, 0.1));
        art += `<polygon points="${headPoint(0.36, 0)} ${headPoint(0.02, 0.24)} ${headPoint(0.02, -0.24)}"/>`;
      } else if (face === piece.dir) {
        art += '<circle cx="0.5" cy="0.5" r="0.17"/>';
      }
      return art;
    }

    // Face corners and borders: none on an edge the face shares with another
    // block of the same piece.
    function faceEdges(id, square, face) {
      const { right, down } = FACES[face];
      const joined = (vector) => { const next = neighbour(square, vector); return next >= 0 && owner[next] === id; };
      const opposite = (vector) => vector.map((x) => -x);
      const [left, rightJoined, top, bottom] = [joined(opposite(right)), joined(right), joined(opposite(down)), joined(down)];
      const edgeColour = 'color-mix(in srgb, var(--a-ink) 22%, transparent)';
      const shadows = [];
      if (!left) shadows.push(`inset 1px 0 0 ${edgeColour}`);
      if (!rightJoined) shadows.push(`inset -1px 0 0 ${edgeColour}`);
      if (!top) shadows.push(`inset 0 1px 0 ${edgeColour}`);
      if (!bottom) shadows.push(`inset 0 -1px 0 ${edgeColour}`);
      const corner = (side1, side2) => (side1 || side2 ? '0' : 'calc(var(--s) * 0.16)');
      return {
        borderRadius: `${corner(top, left)} ${corner(top, rightJoined)} ${corner(bottom, rightJoined)} ${corner(bottom, left)}`,
        edge: shadows.join(', ') || 'none',
      };
    }

    // ---------- Turning and zooming ----------

    // The cube's transform: pan, zoom (in all three axes, with the perspective
    // scaled to match, so zooming in looks like moving closer), then the turn.
    function turn() {
      const stretch = zoom / bakedZoom;
      cube.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale3d(${stretch}, ${stretch}, ${stretch}) ` +
        `rotateX(${pitch}deg) rotateY(${yaw}deg)`;
      if (scene) scene.style.perspective = `${Math.round(scene.clientWidth * 4 * zoom)}px`;
      if (fitButton) fitButton.hidden = zoom <= 1.01;
    }

    // Zoom in up to where a block is about 48 px across (at least 1.5×, at most 4×).
    const maxZoom = () => Math.max(1.5, Math.min(4, 48 / fitSquare));

    // Lay the cube out at the current zoom, so it is drawn sharp.
    function bake() {
      clearTimeout(bakeTimer);
      bakedZoom = zoom;
      squareSize = fitSquare * zoom;
      scene.style.setProperty('--s', `${squareSize.toFixed(2)}px`);
      turn();
    }
    const bakeSoon = () => { clearTimeout(bakeTimer); bakeTimer = setTimeout(bake, 150); };

    // Zoom to `target`, keeping the point (focusX, focusY) (px from the scene's
    // centre) where it is on screen, then keep some of the cube in view.
    function zoomTo(target, focusX = 0, focusY = 0) {
      target = Math.max(1, Math.min(maxZoom(), target));
      panX = focusX - (focusX - panX) * (target / zoom);
      panY = focusY - (focusY - panY) * (target / zoom);
      zoom = target;
      clampPan();
      turn();
      bakeSoon();
    }
    function clampPan() {
      if (zoom <= 1) { panX = panY = 0; return; }
      const reach = 0.87 * size * fitSquare * zoom;   // about the turned cube's half width
      panX = Math.max(-reach, Math.min(reach, panX));
      panY = Math.max(-reach, Math.min(reach, panY));
    }
    // Point (px from the scene's centre) for a screen position.
    function fromCentre(x, y) {
      const rect = scene.getBoundingClientRect();
      return [x - rect.left - rect.width / 2, y - rect.top - rect.height / 2];
    }

    // Square size: the turned cube (up to √3 × its side across, a little more
    // with perspective) has to fit at any angle. width / (size × 1.8) leaves
    // about 5 px to spare at the worst angle (1.75 just touches the edge).
    function measure() {
      const width = scene.clientWidth;
      if (!width || !size) return;
      fitSquare = width / (size * FIT);
      bake();
    }
    const resizeObserver = new ResizeObserver(measure);

    // ---------- Building ----------

    const middle = () => (size - 1) / 2;
    const homeTransform = (square) => {
      const [x, y, z] = worldOf(square).map((value) => value - middle());
      return `translate3d(calc(var(--s) * ${x}), calc(var(--s) * ${y}), calc(var(--s) * ${z}))`;
    };

    function build(board) {
      size = board.size;
      pieces = board.pieces;
      owner = Arrows.ownerGrid(board);
      yaw = START.yaw;
      pitch = START.pitch;
      zoom = bakedZoom = 1;
      panX = panY = 0;
      scene = document.createElement('div');
      scene.className = 'a-scene';
      scene.tabIndex = 0;
      scene.setAttribute('aria-label', 'Cube of arrow pieces. Drag to turn it, pinch to zoom, tap a piece to send it.');
      cube = document.createElement('div');
      cube.className = 'a-cube';
      fitButton = document.createElement('button');
      fitButton.className = 'a-fit';
      fitButton.textContent = 'Fit';
      fitButton.setAttribute('aria-label', 'Zoom out to the whole cube');
      fitButton.hidden = true;
      fitButton.addEventListener('pointerdown', (e) => e.stopPropagation());
      fitButton.addEventListener('click', () => { zoom = 1; panX = panY = 0; bake(); });
      scene.append(cube, fitButton);
      blockEls = [];
      faceEls = [];
      pieceEls = pieces.map((piece, id) => {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'a-piece3';
        pieceEl.dataset.id = id;
        const [vx, vy, vz] = directionVector(piece.dir);
        pieceEl.style.setProperty('--vx', vx);
        pieceEl.style.setProperty('--vy', vy);
        pieceEl.style.setProperty('--vz', vz);
        const { layer, row, column } = Arrows.coordinatesOf(piece.cells[0], size);
        const turns = Arrows.bends(piece, size), blocks = piece.cells.length;
        pieceEl.setAttribute('aria-label', `Arrow pointing ${DIRECTION_NAMES[piece.dir]}, head at layer ${layer + 1}, ` +
          `row ${row + 1}, column ${column + 1}, ${blocks} block${blocks > 1 ? 's' : ''}` +
          (turns ? `, ${turns} bend${turns > 1 ? 's' : ''}` : ''));
        blockEls[id] = [];
        faceEls[id] = [];
        piece.cells.forEach((square, blockIndex) => {
          const blockEl = document.createElement('div');
          blockEl.className = 'a-block';
          blockEl.style.transform = homeTransform(square);
          faceEls[id][blockIndex] = FACES.map((faceInfo, face) => {
            const faceEl = document.createElement('div');
            faceEl.className = `a-face a-face${face}`;
            faceEl.style.transform = `${faceInfo.transform} translateZ(calc(var(--s) / 2))`;
            const { borderRadius, edge } = faceEdges(id, square, face);
            faceEl.style.borderRadius = borderRadius;
            faceEl.style.setProperty('--edge', edge);
            faceEl.innerHTML = `<svg viewBox="0 0 1 1" aria-hidden="true">${faceArt(piece, blockIndex, face)}</svg>`;
            blockEl.appendChild(faceEl);
            return faceEl;
          });
          blockEls[id][blockIndex] = blockEl;
          pieceEl.appendChild(blockEl);
        });
        cube.appendChild(pieceEl);
        return pieceEl;
      });
      boardEl.replaceChildren(scene);
      boardEl.classList.add('cube');
      resizeObserver.disconnect();
      resizeObserver.observe(scene);
      measure();
      turn();
      listen();
    }

    // Show only the faces with nothing against them.
    function refresh(removed) {
      pieces.forEach((piece, id) => {
        if (removed[id]) return;
        piece.cells.forEach((square, blockIndex) => {
          faceEls[id][blockIndex].forEach((faceEl, face) => {
            const next = neighbour(square, directionVector(face));
            faceEl.hidden = next >= 0 && !removed[owner[next]];
          });
        });
      });
    }

    function place(id, gone) {
      const pieceEl = pieceEls[id];
      for (const animation of pieceEl.getAnimations({ subtree: true })) animation.cancel();
      pieceEl.classList.remove('leaving', 'hint');
      pieceEl.classList.toggle('gone', gone);
    }

    // Slide out like a snake: every block follows the path to the head and
    // then straight on out, all at the same speed, so the piece keeps its shape.
    function leave(id) {
      const pieceEl = pieceEls[id], piece = pieces[id];
      if (reducedMotion.matches) { pieceEl.classList.add('gone'); return; }
      const length = piece.cells.length, beyond = size + 2, total = length - 1 + beyond;
      const vector = directionVector(piece.dir), centre = middle();
      const positionOf = (square) => worldOf(square).map((value) => (value - centre) * squareSize);
      const translate = ([x, y, z]) => `translate3d(${x}px, ${y}px, ${z}px)`;
      pieceEl.classList.add('leaving');
      piece.cells.forEach((square, blockIndex) => {
        const frames = [];
        for (let k = blockIndex; k >= 0; k--) {
          frames.push({ transform: translate(positionOf(piece.cells[k])), offset: (blockIndex - k) / total });
        }
        const head = positionOf(piece.cells[0]), rest = total - blockIndex;
        frames.push({ transform: translate(head.map((value, axis) => value + vector[axis] * rest * squareSize)), offset: 1 });
        blockEls[id][blockIndex].animate(frames, { duration: SLIDE_MS, easing: 'ease-in', fill: 'forwards' });
      });
      setTimeout(() => { if (pieceEl.classList.contains('leaving')) pieceEl.classList.add('gone'); }, SLIDE_MS);
    }

    // ---------- Input ----------
    // One finger: a press that moves more than a few pixels turns the cube; one
    // that doesn't is a tap on the piece under it. Two fingers: pinch to zoom
    // (around the point between them) and move them together to pan. Mouse
    // wheel zooms too; keyboard: arrow keys turn, + / − zoom, 0 fits.

    let press = null, pinch = null;
    const fingers = new Map();   // pointerId → { x, y }

    const midpointOf = ([a, b]) => fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
    function startPinch() {
      const pair = [...fingers.values()];
      const [centreX, centreY] = midpointOf(pair);
      pinch = { distance: Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) || 1, centreX, centreY, zoom, panX, panY };
    }

    function listen() {
      scene.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        scene.setPointerCapture(e.pointerId);
        if (fingers.size === 1) {
          const pieceEl = e.target.closest('.a-piece3');
          press = { x: e.clientX, y: e.clientY, yaw, pitch, id: pieceEl ? Number(pieceEl.dataset.id) : -1, moved: false };
        } else if (fingers.size === 2) {
          if (press) press.moved = true;   // a second finger means no tap
          startPinch();
        }
      });
      scene.addEventListener('pointermove', (e) => {
        if (!fingers.has(e.pointerId)) return;
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (fingers.size >= 2 && pinch) {
          const pair = [...fingers.values()];
          const [centreX, centreY] = midpointOf(pair);
          const spread = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
          const target = Math.max(1, Math.min(maxZoom(), pinch.zoom * spread / pinch.distance));
          // The point that was under the fingers stays under them.
          panX = centreX - (pinch.centreX - pinch.panX) * (target / pinch.zoom);
          panY = centreY - (pinch.centreY - pinch.panY) * (target / pinch.zoom);
          zoom = target;
          clampPan();
          turn();
          return;
        }
        if (!press) return;
        const dx = e.clientX - press.x, dy = e.clientY - press.y;
        if (!press.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
        press.moved = true;
        yaw = press.yaw + dx * TURN_PER_PX;
        pitch = clampPitch(press.pitch - dy * TURN_PER_PX);
        turn();
      });
      const end = (e) => {
        if (!fingers.delete(e.pointerId)) return;
        if (fingers.size === 1) {
          // Back to one finger after a pinch: it turns from here, never taps.
          const [finger] = fingers.values();
          pinch = null;
          bake();
          press = { x: finger.x, y: finger.y, yaw, pitch, id: -1, moved: true };
          return;
        }
        if (fingers.size > 1) { startPinch(); return; }
        const ended = press;
        if (pinch) bake();
        press = pinch = null;
        if (ended && e.type === 'pointerup' && !ended.moved && ended.id >= 0) onTap(ended.id);
      };
      scene.addEventListener('pointerup', end);
      scene.addEventListener('pointercancel', end);
      scene.addEventListener('wheel', (e) => {
        e.preventDefault();
        const [focusX, focusY] = fromCentre(e.clientX, e.clientY);
        zoomTo(zoom * Math.exp(-e.deltaY * 0.002), focusX, focusY);
      }, { passive: false });
      scene.addEventListener('keydown', (e) => {
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(zoom * 1.25); return; }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomTo(zoom / 1.25); return; }
        if (e.key === '0') { e.preventDefault(); zoomTo(1); bake(); return; }
        const turnBy = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, 15], ArrowDown: [0, -15] }[e.key];
        if (!turnBy) return;
        e.preventDefault();
        yaw += turnBy[0];
        pitch = clampPitch(pitch + turnBy[1]);
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
