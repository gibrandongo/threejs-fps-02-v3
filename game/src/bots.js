// Bot brains: route-following on the waypoint graph (BFS), vision with
// range/field-of-view/line-of-sight, burst fire with skill-based aim
// error and reaction time, angle holds, hearing investigation, retreats,
// and objective play (plant, defuse, retake, bomb pickup). The same brain
// drives the player in Autopilot mode.
import { ADJ, NODES, nearestNode, siteAt } from './mapdata.js';
import { SKILL } from './config.js';
import { losClear } from './combat.js';
import { eyeHeight, stepMovement } from './movement.js';
import { canFire, fireWeapon, startReload, throwGrenade } from './weapons.js';
import { routeFor } from './plans.js';
import { emitSound } from './hearing.js';

// Reused BFS scratch: no allocation per search.
const _prev = new Int32Array(64);
const _queue = new Int32Array(64);
const _seen = new Uint8Array(64);

export function bfsPath(from, to, out) {
  out.length = 0;
  if (from === to) { out.push(to); return out; }
  _seen.fill(0);
  let qh = 0, qt = 0;
  _queue[qt++] = from; _seen[from] = 1; _prev[from] = -1;
  while (qh < qt) {
    const n = _queue[qh++];
    if (n === to) break;
    for (const m of ADJ[n]) {
      if (_seen[m]) continue;
      _seen[m] = 1; _prev[m] = n; _queue[qt++] = m;
    }
  }
  if (!_seen[to]) return out;
  const rev = [];
  let cur = to;
  while (cur !== -1) { rev.push(cur); cur = _prev[cur]; }
  for (let i = rev.length - 1; i >= 0; i--) out.push(rev[i]);
  return out;
}

const _seg = [];
export function buildPath(S, a, goals) {
  const b = a.brain;
  b.path.length = 0;
  let from = nearestNode(a.x, a.z);
  for (const g of goals) {
    bfsPath(from, g, _seg);
    for (let i = 0; i < _seg.length; i++) {
      if (b.path.length === 0 || b.path[b.path.length - 1] !== _seg[i]) b.path.push(_seg[i]);
    }
    from = g;
  }
  b.pathIdx = 0;
  return b.path.length > 0;
}

function faceToward(a, x, z, rate, dt) {
  const want = Math.atan2(-(x - a.x), -(z - a.z));
  let d = want - a.yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const step = rate * dt;
  a.yaw += Math.max(-step, Math.min(step, d));
  return Math.abs(d) < 0.1;
}

function visibleEnemy(S, a) {
  const skill = SKILL[a.skill];
  let best = null, bestD = 42;
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  for (const e of S.agents) {
    if (e.team === a.team || !e.alive) continue;
    const dx = e.x - a.x, dz = e.z - a.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 42) continue;
    const facing = (dx * fx + dz * fz) / Math.max(0.001, d);
    const close = d < 6;
    const muzzle = S.time - e.lastShot < 0.6 && d < 26;
    if (facing < 0.35 && !close && !muzzle) continue;
    if (!losClear(a.x, a.y + eyeHeight(a), a.z, e.x, e.y + 1.3, e.z)) continue;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best ? { enemy: best, dist: bestD } : null;
}

const _wish = { x: 0, z: 0 };

export function botTick(S, a, dt) {
  const b = a.brain;
  const skill = SKILL[a.skill];
  const flashed = S.time < a.flashUntil;
  // --- Perception ---
  let seen = null;
  if (!flashed) {
    seen = visibleEnemy(S, a);
    if (seen) {
      if (b.targetId !== seen.enemy.id) { b.targetId = seen.enemy.id; b.seenAt = S.time; }
      b.lastKnownX = seen.enemy.x; b.lastKnownZ = seen.enemy.z;
    } else if (b.targetId >= 0 && S.time - b.seenAt > 2.2) {
      b.targetId = -1;
    }
  }
  const target = seen ? seen.enemy : null;
  const reacted = target && S.time - b.seenAt >= skill.react;

  // --- Combat: aim, burst, strafe ---
  if (target && reacted) {
    const aimHead = S.rng.chance(0.22 + a.skill * 0.12);
    const ty = target.y + (aimHead ? 1.56 : 1.25);
    const dx = target.x - a.x, dy = ty - (a.y + eyeHeight(a)), dz = target.z - a.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const err = skill.aimErr * (1 + dist * 0.012);
    a.yaw = Math.atan2(-dx, -dz) + (S.rng.next() - 0.5) * err * 2;
    a.pitch = Math.atan2(dy, Math.max(0.5, dist)) + (S.rng.next() - 0.5) * err;
    if (a.weapon === 'longbow') a.scopeOn = dist > 12;
    if (b.burstLeft <= 0 && S.time >= b.nextBurstAt) b.burstLeft = skill.burst;
    if (b.burstLeft > 0 && canFire(S, a)) {
      if (fireWeapon(S, a) > 0) {
        b.burstLeft--;
        emitSound(S, a.x, a.z, 34, 'shot', a.id);
        if (b.burstLeft <= 0) b.nextBurstAt = S.time + 0.3 + S.rng.next() * 0.35;
      }
    }
    if (a.mag === 0) startReload(S, a);
    // Strafe perpendicular to the target, flipping on a timer.
    if (S.time > b.strafeUntil) { b.strafeDir *= -1; b.strafeUntil = S.time + 0.7 + S.rng.next() * 0.6; }
    const px = -dz / Math.max(0.001, dist), pz = dx / Math.max(0.001, dist);
    stepMovement(a, px * b.strafeDir, pz * b.strafeDir, 0.55, false, dt);
    a.crouched = dist > 14 && S.rng.chance(0.002);
    return;
  }
  if (a.mag <= 3 && a.reserve > 0) startReload(S, a);
  if (flashed) { stepMovement(a, 0, 0, 0, false, dt); return; }

  // --- Hearing investigation: a loud recent noise pulls bots off route ---
  if (S.time < b.investigateUntil && b.hearWeight > 0.45 && b.mode !== 'hold-post') {
    const hx = b.hearX, hz = b.hearZ;
    const hd = Math.hypot(hx - a.x, hz - a.z);
    if (hd > 2.5) {
      if (b.mode !== 'investigate') { b.mode = 'investigate'; buildPath(S, a, [nearestNode(hx, hz)]); }
      followPath(S, a, dt, 0.8);
      return;
    }
    // Arrived: sweep the area, then give up and resume the plan.
    a.yaw += dt * 0.9;
    if (S.time > b.investigateUntil - 1) { b.mode = 'idle'; b.path.length = 0; b.investigateUntil = 0; }
    stepMovement(a, 0, 0, 0, false, dt);
    return;
  }

  // --- Objective overrides ---
  if (S.bomb.state === 'planted' && a.team === 'def') {
    // Retake: converge on the planted site together, then close in on
    // the charge itself — the site node alone may be metres from it.
    const bd = Math.hypot(S.bomb.x - a.x, S.bomb.z - a.z);
    if (bd < 3) {
      faceToward(a, S.bomb.x, S.bomb.z, 6, dt);
      if (bd > 0.9) stepMovement(a, (S.bomb.x - a.x) / bd, (S.bomb.z - a.z) / bd, 0.7, false, dt);
      else stepMovement(a, 0, 0, 0, false, dt);
      return;
    }
    if (b.mode !== 'retake') {
      b.mode = 'retake';
      const site = S.bomb.site === 'A' ? 6 : 12;
      buildPath(S, a, [nearestNode(S.bomb.x, S.bomb.z), site]);
    }
    followPath(S, a, dt, 1);
    return;
  }
  if (S.bomb.state === 'dropped' && a.team === 'atk') {
    // Nearest living attacker fetches the dropped charge.
    let nearest = null, nd = Infinity;
    for (const m of S.agents) {
      if (m.team !== 'atk' || !m.alive) continue;
      const d = Math.hypot(m.x - S.bomb.x, m.z - S.bomb.z);
      if (d < nd) { nd = d; nearest = m; }
    }
    if (nearest === a) {
      const bd = Math.hypot(S.bomb.x - a.x, S.bomb.z - a.z);
      if (bd < 2.5) {
        faceToward(a, S.bomb.x, S.bomb.z, 6, dt);
        stepMovement(a, (S.bomb.x - a.x) / Math.max(0.01, bd), (S.bomb.z - a.z) / Math.max(0.01, bd), 0.8, false, dt);
        return;
      }
      if (b.mode !== 'fetch') { b.mode = 'fetch'; buildPath(S, a, [nearestNode(S.bomb.x, S.bomb.z)]); }
      followPath(S, a, dt, 1);
      return;
    }
  }

  // --- Plan movement ---
  if (a.team === 'atk') {
    if (b.mode === 'hold' || b.mode === 'hold-post') { holdAngle(S, a, dt); return; }
    if (b.path.length === 0 || b.pathIdx >= b.path.length) {
      if (S.plan) {
        const route = routeFor(S, a);
        if (route.length > 0) buildPath(S, a, route);
        else { b.mode = 'hold'; b.angleYaw = a.yaw; }
      }
    }
    if (b.path.length > 0) {
      // Entry bots toss a grenade as they enter the site.
      if (!b.thrownGrenade && (b.role === 'entry' || b.role === 'entry2') && siteAt(a.x, a.z)) {
        b.thrownGrenade = true;
        if (a.grenades.frag > 0 && S.rng.chance(0.5)) throwGrenade(S, a, 'frag');
        else if (a.grenades.dazzler > 0) throwGrenade(S, a, 'dazzler');
      }
      followPath(S, a, dt, S.plan && S.plan.def.pace === 'fast' ? 1 : 0.85);
    } else holdAngle(S, a, dt);
  } else {
    // Defenders: reach the hold node, then hold the angle.
    if (b.mode !== 'hold' && b.holdNode >= 0) {
      if (b.path.length === 0) buildPath(S, a, [b.holdNode]);
      const arrived = followPath(S, a, dt, 0.9);
      if (arrived) {
        b.mode = 'hold';
        // Face the most likely approach: toward the attackers' side.
        b.angleYaw = Math.atan2(-(-26 - a.x), -(0 - a.z)) + S.rng.range(-0.4, 0.4);
      }
    } else holdAngle(S, a, dt);
  }
}

// Walk the current path; returns true when the path is exhausted.
function followPath(S, a, dt, speedMul) {
  const b = a.brain;
  if (b.pathIdx >= b.path.length) return true;
  const node = NODES[b.path[b.pathIdx]];
  const dx = node[0] - a.x, dz = node[1] - a.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1.3) { b.pathIdx++; return b.pathIdx >= b.path.length; }
  faceToward(a, node[0], node[1], 6, dt);
  const stuck = Math.hypot(a.x - (b.lx || a.x), a.z - (b.lz || a.z)) < 0.02 && b.pathIdx === b.lastIdx;
  const wantJump = stuck && S.time - (b.lastJump || 0) > 1;
  if (wantJump) b.lastJump = S.time;
  b.lx = a.x; b.lz = a.z; b.lastIdx = b.pathIdx;
  stepMovement(a, dx / d, dz / d, speedMul, wantJump, dt);
  a.crouched = false;
  return false;
}

// Hold position, sweeping the aim slowly around the hold angle.
function holdAngle(S, a, dt) {
  const b = a.brain;
  const sweep = Math.sin(S.time * 0.4 + a.id) * 0.45;
  const want = (b.angleYaw || 0) + sweep;
  let d = want - a.yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  a.yaw += Math.max(-1.6 * dt, Math.min(1.6 * dt, d));
  a.pitch *= 0.95;
  stepMovement(a, 0, 0, 0, false, dt);
  if (S.rng.chance(0.001)) a.crouched = !a.crouched;
}

export function resetBotRound(S, a) {
  const b = a.brain;
  b.mode = 'idle'; b.path.length = 0; b.pathIdx = 0;
  b.targetId = -1; b.thrownGrenade = false; b.investigateUntil = 0;
  b.hearUntil = 0; b.hearWeight = 0; b.burstLeft = 0; b.nextBurstAt = 0;
  b.waitUntil = 0; b.angleYaw = 0;
}
