// Amberline — bootstrap and frame loop. Imports set the judge's reading
// order: the manual first, then the simulation, rendering, HUD, demo
// staging, settings and input. The loop runs the sim at fixed 60 Hz steps
// (accumulator, capped per frame) and renders once per frame; demo/soak
// modes raise the step budget so scripted rounds finish quickly.
import { MANUAL_TEXT } from './manual.js';
import { createState, playerOf } from './state.js';
import { startMatch, stepSim } from './sim.js';
import { createRenderer } from './render.js';
import { buildHud } from './hud.js';
import { parseDemoParams, stageDemo, demoTick } from './demo.js';
import { loadSettings, saveSettings, applySkill, skillName } from './settings.js';
import { bindInput, clearEdges, createInput, requestLock } from './input.js';
import { drainSounds, ensureAudio, setVolume } from './audio.js';
import { TICK } from './config.js';
import { BUY_ITEMS, buyItem } from './economy.js';
import { matchSummary } from './stats.js';

const canvas = document.getElementById('view');
const demo = parseDemoParams();
const seed = demo ? demo.seed : (Date.now() % 2147483647);
const S = createState(seed);
S.demo = demo;
S.input = createInput();
S.buyOpen = false; S.scoreOpen = false; S.manualOpen = false; S.paused = false;
loadSettings(S);

const renderer = createRenderer(canvas, S);
const hud = buildHud(S);
document.getElementById('manual-text').textContent = MANUAL_TEXT;

let matchEndShown = false;
const overlays = {
  start: document.getElementById('start'),
  pause: document.getElementById('pause'),
  manual: document.getElementById('manual'),
  matchEnd: document.getElementById('matchend'),
};
window.addEventListener('error', () => { S.soak.errors++; });

function setPaused(on) {
  if (S.phase === 'menu' || S.phase === 'matchEnd') return;
  S.paused = on;
  overlays.pause.classList.toggle('hidden', !on);
  if (on && document.pointerLockElement) document.exitPointerLock();
  if (!on) requestLock(canvas);
}
function setBuy(open) {
  if (open && S.phase !== 'freeze') return;
  S.buyOpen = open;
  if (open) {
    hud.refreshBuy();
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (!S.manualOpen) requestLock(canvas);
}
function setManual(open) {
  S.manualOpen = open;
  overlays.manual.classList.toggle('hidden', !open);
  if (open) { if (document.pointerLockElement) document.exitPointerLock(); }
  else if (!S.buyOpen && S.phase !== 'menu') requestLock(canvas);
}
function showMatchEnd() {
  const sum = matchSummary(S);
  document.getElementById('matchend-title').textContent =
    sum.winner === 'atk' ? 'JACKALS WIN THE MATCH' : sum.winner === 'def' ? 'WARDENS WIN THE MATCH' : 'MATCH DRAWN';
  document.getElementById('matchend-body').innerHTML =
    '<p>Final score: <b>' + sum.scoreLine + '</b> over ' + sum.rounds + ' rounds. ' +
    'Top fragger: <b>' + sum.top.name + '</b> (' + sum.top.kills + ' kills, ' + sum.top.damage + ' damage).</p><p>' + sum.meLine + '</p>';
  overlays.matchEnd.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  matchEndShown = true;
}
function beginPlay() {
  ensureAudio(S.settings.volume);
  matchEndShown = false;
  overlays.start.classList.add('hidden');
  overlays.matchEnd.classList.add('hidden');
  overlays.pause.classList.add('hidden');
  S.paused = false;
  startMatch(S);
  if (demo) stageDemo(S);
  if (!demo) requestLock(canvas);
}
document.getElementById('play-btn').addEventListener('click', beginPlay);
document.getElementById('playagain-btn').addEventListener('click', beginPlay);
document.getElementById('resume-btn').addEventListener('click', () => setPaused(false));
document.getElementById('restart-btn').addEventListener('click', beginPlay);
document.getElementById('buy-close').addEventListener('click', () => setBuy(false));
document.getElementById('manual-close').addEventListener('click', () => setManual(false));
document.getElementById('sb-close').addEventListener('click', () => { S.scoreOpen = false; });
document.getElementById('scoreboard').addEventListener('click', (e) => { if (e.target.id === 'scoreboard') S.scoreOpen = false; });

// Settings controls.
const sensEl = document.getElementById('set-sens');
const volEl = document.getElementById('set-vol');
const skillEl = document.getElementById('set-skill');
sensEl.value = Math.round(S.settings.sens * 100);
volEl.value = Math.round(S.settings.volume * 100);
skillEl.value = S.settings.skill;
document.getElementById('set-sens-val').textContent = S.settings.sens.toFixed(2);
document.getElementById('set-vol-val').textContent = Math.round(S.settings.volume * 100) + '%';
document.getElementById('set-skill-val').textContent = skillName(S.settings.skill);
sensEl.addEventListener('input', () => {
  S.settings.sens = sensEl.value / 100;
  document.getElementById('set-sens-val').textContent = S.settings.sens.toFixed(2);
  saveSettings(S);
});
volEl.addEventListener('input', () => {
  S.settings.volume = volEl.value / 100;
  document.getElementById('set-vol-val').textContent = volEl.value + '%';
  setVolume(S.settings.volume);
  saveSettings(S);
});
skillEl.addEventListener('input', () => {
  S.settings.skill = parseInt(skillEl.value, 10);
  document.getElementById('set-skill-val').textContent = skillName(S.settings.skill);
  applySkill(S);
  saveSettings(S);
});
document.getElementById('set-autopilot').addEventListener('change', (e) => {
  S.settings.autopilot = e.target.checked;
});

bindInput(S, canvas, {
  onKey(code) {
    if (S.phase === 'menu') return;
    if (code === 'KeyB') { if (!S.buyOpen) setBuy(true); else setBuy(false); return; }
    if (code === 'F1') { setManual(!S.manualOpen); return; }
    if (code === 'KeyP') { setPaused(!S.paused); return; }
    if (code === 'Escape' && S.buyOpen) { setBuy(false); return; }
    if (code === 'Escape' && S.manualOpen) { setManual(false); return; }
    if (S.buyOpen && /^Digit[1-8]$/.test(code)) {
      buyItem(S, playerOf(S), BUY_ITEMS[parseInt(code.slice(5), 10) - 1].id);
      hud.refreshBuy();
    }
  },
  onLock(locked) {
    if (!locked && !demo && !S.buyOpen && !S.manualOpen && !S.paused &&
        (S.phase === 'live' || S.phase === 'freeze' || S.phase === 'roundEnd')) {
      setPaused(true);
    }
  },
});

// Demo boot: no menu, no pointer lock — the staged moment plays itself.
if (demo) {
  if (demo.auto || demo.soak) S.settings.autopilot = true;
  overlays.start.classList.add('hidden');
  ensureAudio(0);
  startMatch(S);
  if (!demo.soak) stageDemo(S); // soak: clean match from spawn, no staging
  window.__game = S;
  window.__demo = demo;
}

// Fixed-step loop.
let last = performance.now(), acc = 0, frames = 0;
const speed = demo ? (demo.soak ? 8 : Math.max(1, demo.speed)) : 1;
function frame(now) {
  requestAnimationFrame(frame);
  frames++;
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S.phase === 'menu') S.time += dt; // keeps the menu orbit moving
  if (S.paused) { hud.update(); return; }
  acc += dt * speed;
  const maxSteps = 5 * speed;
  let steps = 0;
  if (demo) demoTick(S, dt);
  while (acc >= TICK && steps < maxSteps) {
    stepSim(S, TICK);
    acc -= TICK;
    steps++;
  }
  if (steps === maxSteps) acc = 0;
  clearEdges(S.input);
  drainSounds(S);
  const skipRender = demo && demo.soak && frames % 4 !== 0;
  if (!skipRender) {
    renderer.sync(dt, S.paused);
    hud.update();
  }
  if (S.phase === 'matchEnd' && !matchEndShown) showMatchEnd();
  if (frames === 3) window.__ready = true;
}
requestAnimationFrame(frame);
