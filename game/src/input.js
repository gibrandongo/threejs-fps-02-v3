// Keyboard + mouse + pointer lock. Produces one shared input snapshot
// (S.input) that the fixed-step sim consumes; the render loop never reads
// keys directly. Edge-triggered actions (presses) are latched here and
// cleared by the sim after each step batch, so a 60 Hz sim never misses
// a click that happened between frames.
export function createInput() {
  return {
    keys: {}, mouseDown: false, mouseDownEdge: false, rightDown: false,
    rightEdge: false, dx: 0, dy: 0, locked: false,
    pressed: {}, // edge latches: 'KeyR', 'KeyB', 'KeyE', ...
    wheel: 0,
  };
}

export function bindInput(S, canvas, callbacks) {
  const inp = S.input;
  const onKey = (down) => (e) => {
    if (e.code === 'Tab') e.preventDefault();
    if (e.code === 'F1') e.preventDefault();
    if (down && !inp.keys[e.code]) inp.pressed[e.code] = true;
    inp.keys[e.code] = down;
    if (down && callbacks.onKey) callbacks.onKey(e.code);
  };
  window.addEventListener('keydown', onKey(true));
  window.addEventListener('keyup', onKey(false));
  window.addEventListener('blur', () => { for (const k in inp.keys) inp.keys[k] = false; inp.mouseDown = false; });
  document.addEventListener('mousemove', (e) => {
    if (!inp.locked) return;
    inp.dx += e.movementX || 0; inp.dy += e.movementY || 0;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!inp.locked) return;
    if (e.button === 0) { inp.mouseDown = true; inp.mouseDownEdge = true; }
    if (e.button === 2) { inp.rightDown = true; inp.rightEdge = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) inp.mouseDown = false;
    if (e.button === 2) inp.rightDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => { if (inp.locked) inp.wheel += Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    inp.locked = document.pointerLockElement === canvas;
    if (callbacks.onLock) callbacks.onLock(inp.locked);
  });
  document.addEventListener('pointerlockerror', () => { if (callbacks.onLock) callbacks.onLock(false); });
}

export function requestLock(canvas) {
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock(); } catch (e) { /* headless */ } });
  } catch (e) { try { canvas.requestPointerLock(); } catch (e2) { /* headless */ } }
}

// Called by the sim after consuming a step batch.
export function clearEdges(inp) {
  inp.mouseDownEdge = false; inp.rightEdge = false;
  inp.dx = 0; inp.dy = 0; inp.wheel = 0;
  for (const k in inp.pressed) inp.pressed[k] = false;
}
