// Demo staging: deterministic scripted states for screenshots and soak
// runs, driven by URL parameters (?demo=1&shot=fight). Every staged
// moment uses the game's own sim state and rendering — positions, the
// plan, the buy menu and the bomb channel are real state, and demoTick
// keeps the scene alive (aiming, holding E, pinning freeze time) so a
// capture at any second shows the same moment. Never active in normal play.
import { playerOf, pushRadio } from './state.js';
import { giveWeapon } from './weapons.js';
import { losClear, spawnImpact, spawnTracer } from './combat.js';
import { nearestNode } from './mapdata.js';
import { resetBotRound } from './bots.js';

export function parseDemoParams() {
  const q = new URLSearchParams(window.location.search);
  if (!q.get('demo')) return null;
  return {
    shot: q.get('shot') || 'fight',
    auto: q.get('auto') === '1',
    soak: q.get('soak') === '1',
    seed: parseInt(q.get('seed') || '1337', 10) || 1337,
    speed: parseInt(q.get('speed') || '1', 10) || 1,
  };
}

function place(S, agent, x, z, yaw) {
  agent.x = x; agent.z = z; agent.y = 0; agent.yaw = yaw; agent.pitch = 0;
  agent.vx = 0; agent.vy = 0; agent.vz = 0;
  resetBotRound(S, agent);
  agent.brain.holdNode = nearestNode(x, z);
}

export function stageDemo(S) {
  const d = S.demo;
  const p = playerOf(S);
  const defs = S.agents.filter((a) => a.team === 'def');
  const mates = S.agents.filter((a) => a.team === 'atk' && !a.isPlayer);
  if (d.shot === 'buy') {
    p.money = 4500;
    S.phase = 'freeze'; S.phaseTime = 4.5;
    S.buyOpen = true;
    place(S, p, -24, 0, -Math.PI / 2);
    mates.forEach((m, i) => place(S, m, -26 + i * 1.5, -3 + i * 2, -Math.PI / 2));
    pushRadio(S, 'atk', 'Buy up — rifle and armor if you can afford it.');
  } else if (d.shot === 'plant') {
    S.phase = 'live'; S.phaseTime = 70;
    for (const a of S.agents) a.hasBomb = false;
    p.hasBomb = true; S.bomb.carrier = p.id; S.bomb.state = 'carried';
    S.radio = S.radio.filter((r) => !r.text.includes('carries the charge'));
    pushRadio(S, 'atk', 'You carry the charge.');
    giveWeapon(S, p, 'vk7');
    p.money = 3200;
    place(S, p, 19.5, -14.5, -1.25);
    p.plantHold = 2.0;
    mates[0] && place(S, mates[0], 16.5, -12.5, -0.6);
    mates[1] && place(S, mates[1], 23, -18, 2.6);
    defs[0] && place(S, defs[0], 26, -10, 2.4);
    defs[1] && place(S, defs[1], 14.5, -18.5, -1.2);
    spawnTracer(S, 26, 1.5, -10, 20, 1.2, -14, 0xffd27a);
    spawnImpact(S, 20, 1.1, -14, 0);
    pushRadio(S, 'atk', 'Site A is clear — plant the charge!');
    pushRadio(S, 'def', 'They are on A — retake now!');
  } else if (d.shot === 'scope') {
    S.phase = 'live'; S.phaseTime = 80;
    giveWeapon(S, p, 'longbow');
    p.money = 5200;
    place(S, p, -20, -17, -Math.PI / 2);
    p.scopeOn = true;
    S.input.rightDown = true; // held: playerTick keeps the scope up
    defs[0] && place(S, defs[0], 17, -16.5, Math.PI / 2);
    defs[1] && place(S, defs[1], 23, -13, Math.PI / 2);
    defs[2] && place(S, defs[2], 12, -18, Math.PI / 2);
    mates[0] && place(S, mates[0], -16, -10.5, -Math.PI / 2); // off the lane: never blocks the scope
    pushRadio(S, 'atk', 'Longbow up — hold the A Long angle.');
  } else {
    // fight: mid-round firefight south of the silo, clear sightline.
    S.phase = 'live'; S.phaseTime = 75;
    giveWeapon(S, p, 'vk7');
    p.money = 2900;
    place(S, p, -10, 5, -Math.PI / 2);
    mates[0] && place(S, mates[0], -7, 3.5, -Math.PI / 2);
    mates[1] && place(S, mates[1], -12, 6.5, -Math.PI / 2);
    defs[0] && place(S, defs[0], 7, 5, Math.PI / 2);
    defs[1] && place(S, defs[1], 11, 4, Math.PI / 2);
    defs[2] && place(S, defs[2], 14, 6, Math.PI / 2);
    spawnTracer(S, 7, 1.5, 5, -9, 1.3, 5, 0xffd27a);
    spawnTracer(S, -10, 1.5, 5, 7, 1.4, 5, 0xffd27a);
    spawnImpact(S, 3.2, 1.4, 4.5, 0);
    pushRadio(S, 'atk', 'Contact mid! Entry, flash the silo!');
  }
  S.banner = { main: '', sub: '', cls: '', until: 0 }; // staged shots skip the round banner
  // Make staged bots hold their angles instead of wandering off.
  for (const a of S.agents) {
    if (a.bot && d.shot !== 'fight') { a.brain.mode = 'hold'; a.brain.angleYaw = a.yaw; }
  }
  S.demo.staged = true;
}

// Per-frame demo behaviour: keeps the staged moment stable and busy.
// Soak runs are exempt: the match must play itself, unpinned.
export function demoTick(S, dt) {
  const d = S.demo;
  if (!d || !d.staged || d.soak) return;
  const p = playerOf(S);
  if (d.shot === 'buy') {
    S.phase = 'freeze';
    if (S.phaseTime < 1.5) S.phaseTime = 4.5;
    S.buyOpen = true;
  } else if (d.shot === 'plant') {
    S.input.keys['KeyE'] = true;
    // Hold the channel mid-way so the capture shows PLANTING, not done.
    if (S.bomb.state === 'carried' && p.plantHold > 2.05) p.plantHold = 2.0;
    if (p.hp < 60) p.hp = 60;
  } else if (d.shot === 'scope') {
    p.scopeOn = true;
    S.input.rightDown = true;
    p.yaw = -Math.PI / 2 + Math.sin(S.time * 0.3) * 0.02;
    p.pitch = 0.01;
  } else if (d.shot === 'fight') {
    // Aim at the nearest VISIBLE enemy and keep firing: a real firefight
    // the camera can actually see. With no sightline, hold the open lane.
    let best = null, bd = Infinity;
    for (const a of S.agents) {
      if (a.team === 'def' && a.alive) {
        const dist = Math.hypot(a.x - p.x, a.z - p.z);
        if (dist < bd && losClear(p.x, p.y + 1.55, p.z, a.x, a.y + 1.3, a.z)) { bd = dist; best = a; }
      }
    }
    if (best) {
      p.yaw = Math.atan2(-(best.x - p.x), -(best.z - p.z));
      p.pitch = 0.02;
      S.input.mouseDown = true;
      if (p.mag <= 2) { S.input.mouseDown = false; S.input.pressed['KeyR'] = true; }
    } else {
      p.yaw = -Math.PI / 2; p.pitch = 0.01;
      S.input.mouseDown = false;
    }
    if (p.hp < 40) p.hp = 40;
    if (S.phaseTime < 20) S.phaseTime = 75;
    p.x = -10 + Math.sin(S.time * 0.5) * 0.6;
  }
}
