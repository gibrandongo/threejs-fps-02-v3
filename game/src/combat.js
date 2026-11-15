// Hitscan combat. Shots are rays tested against wall AABBs (slab test),
// head spheres and body cylinders; the nearest hit wins, so walls block
// shots and headshots pay double. Grenade blasts and flashes resolve here
// too, with line-of-sight checks so cover matters.
import { BODY, ECONOMY } from './config.js';
import { WALLS } from './mapdata.js';
import { pushKill, pushRadio, weaponOf } from './state.js';
import { queueSound } from './audio.js';

// Nearest wall hit along a ray; Infinity when the ray escapes the map.
export function rayWalls(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  for (const w of WALLS) {
    let t0 = 0, t1 = best;
    // X slab.
    if (Math.abs(dx) < 1e-9) { if (ox < w.x0 || ox > w.x1) continue; }
    else {
      let ta = (w.x0 - ox) / dx, tb = (w.x1 - ox) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) continue;
    }
    // Z slab.
    if (Math.abs(dz) < 1e-9) { if (oz < w.z0 || oz > w.z1) continue; }
    else {
      let ta = (w.z0 - oz) / dz, tb = (w.z1 - oz) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) continue;
    }
    // Y slab (box base at 0, top at h).
    if (Math.abs(dy) < 1e-9) { if (oy < 0 || oy > w.h) continue; }
    else {
      let ta = (0 - oy) / dy, tb = (w.h - oy) / dy;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) continue;
    }
    if (t0 > 0.01 && t0 < best) best = t0;
  }
  return best;
}

// True when no wall blocks the segment between two points.
export function losClear(x0, y0, z0, x1, y1, z1) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return true;
  const t = rayWalls(x0, y0, z0, dx / len, dy / len, dz / len, len);
  return t >= len - 0.05;
}

// Ray vs one agent: returns {t, head} for the nearest hit, or null.
// Head is a sphere; the body is a vertical cylinder solved in XZ.
function rayAgent(ox, oy, oz, dx, dy, dz, maxT, a) {
  let bestT = maxT, head = false;
  const hx = a.x, hy = a.y + BODY.headY, hz = a.z;
  const lx = hx - ox, ly = hy - oy, lz = hz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca > 0) {
    const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    if (d2 < BODY.headR * BODY.headR) {
      const t = tca - Math.sqrt(BODY.headR * BODY.headR - d2);
      if (t > 0.01 && t < bestT) { bestT = t; head = true; }
    }
  }
  // Body cylinder in XZ.
  const A = dx * dx + dz * dz;
  if (A > 1e-9) {
    const B = 2 * ((ox - a.x) * dx + (oz - a.z) * dz);
    const C = (ox - a.x) * (ox - a.x) + (oz - a.z) * (oz - a.z) - BODY.bodyR * BODY.bodyR;
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t > 0.01 && t < bestT) {
        const y = oy + dy * t;
        if (y > a.y + BODY.bodyBot && y < a.y + BODY.bodyTop) { bestT = t; head = false; }
      }
    }
  }
  return bestT < maxT ? { t: bestT, head } : null;
}

export function spawnTracer(S, x0, y0, z0, x1, y1, z1, color) {
  for (const t of S.tracers) {
    if (t.active) continue;
    t.active = true; t.life = 0.06;
    t.x0 = x0; t.y0 = y0; t.z0 = z0; t.x1 = x1; t.y1 = y1; t.z1 = z1; t.color = color;
    return;
  }
}
export function spawnImpact(S, x, y, z, kind) {
  for (const p of S.impacts) {
    if (p.active) continue;
    p.active = true; p.life = 0.35; p.x = x; p.y = y; p.z = z; p.kind = kind;
    return;
  }
}

// One pellet/round from shooter along a unit direction.
export function fireHitscan(S, shooter, dx, dy, dz) {
  const w = weaponOf(shooter);
  const ox = shooter.x, oy = shooter.y + (shooter.crouched ? 1.12 : 1.55), oz = shooter.z;
  const wallT = rayWalls(ox, oy, oz, dx, dy, dz, w.range * 1.6);
  let victim = null, hitT = wallT, hitHead = false;
  for (const a of S.agents) {
    if (a === shooter || !a.alive || a.team === shooter.team) continue;
    const hit = rayAgent(ox, oy, oz, dx, dy, dz, wallT, a);
    if (hit && hit.t < hitT) { hitT = hit.t; victim = a; hitHead = hit.head; }
  }
  const ex = ox + dx * hitT, ey = oy + dy * hitT, ez = oz + dz * hitT;
  spawnTracer(S, ox, oy, oz, ex, ey, ez, w.tracer);
  if (victim) {
    const fall = Math.min(1, hitT / w.range);
    let dmg = w.damage * (1 - (1 - w.falloff) * fall);
    if (hitHead) dmg *= BODY.headMult * w.headBonus;
    damageAgent(S, victim, dmg, shooter, hitHead, w.name);
    spawnImpact(S, ex, ey, ez, hitHead ? 2 : 1);
    return victim;
  }
  if (hitT < w.range * 1.6) spawnImpact(S, ex, ey, ez, 0);
  return null;
}

export function damageAgent(S, victim, amount, attacker, headshot, weaponName) {
  if (!victim.alive) return;
  let dmg = amount;
  if (!headshot && victim.armor > 0) {
    const absorbed = Math.min(victim.armor, dmg * 0.5);
    victim.armor -= absorbed; dmg -= absorbed;
  }
  victim.hp -= dmg;
  victim.lastDamageAt = S.time;
  if (attacker) { victim.lastDmgX = attacker.x; victim.lastDmgZ = attacker.z; }
  if (attacker && attacker !== victim) {
    attacker.damage += dmg; attacker.roundDamage += dmg;
    if (attacker.isPlayer) {
      S.stats.hits++;
      if (headshot) S.stats.headshots++;
      S.damageFeed.push({ text: Math.round(dmg) + (headshot ? ' HEAD' : ''), at: S.time });
      if (S.damageFeed.length > 4) S.damageFeed.shift();
    }
  }
  if (victim.isPlayer) queueSound(S, 'hurt', victim.x, victim.z, 1);
  if (victim.hp > 0) return;
  // Death.
  victim.hp = 0; victim.alive = false; victim.deaths++;
  if (attacker && attacker !== victim) {
    attacker.kills++; attacker.roundKills++;
    attacker.money = Math.min(16000, attacker.money + ECONOMY.killReward);
  }
  pushKill(S, attacker ? attacker.name : '—', victim.name, headshot, weaponName || '');
  if (victim.isPlayer) queueSound(S, 'round_lose', undefined, undefined, 0.4);
  else if (attacker && attacker.isPlayer) queueSound(S, 'kill', undefined, undefined, 1);
  if (victim.hasBomb) {
    victim.hasBomb = false;
    S.bomb.state = 'dropped'; S.bomb.carrier = -1;
    S.bomb.x = victim.x; S.bomb.y = victim.y; S.bomb.z = victim.z;
    pushRadio(S, 'atk', 'Charge dropped at ' + victim.name + '!');
  }
}

// Frag blast: distance falloff, walls shield.
export function explodeFrag(S, x, y, z, owner) {
  queueSound(S, 'explode', x, z, 1);
  spawnImpact(S, x, y, z, 3);
  const R = 7.5;
  for (const a of S.agents) {
    if (!a.alive) continue;
    const dx = a.x - x, dz = a.z - z, dy = (a.y + 1.0) - y;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > R) continue;
    if (!losClear(x, y, z, a.x, a.y + 1.0, a.z)) continue;
    const dmg = 92 * (1 - (d / R) * 0.85);
    if (dmg > 1) damageAgent(S, a, dmg, owner, false, 'FRAG GRENADE');
  }
}

// Flash pop: blindness scales with distance and facing; walls block it.
export function popFlash(S, x, y, z) {
  queueSound(S, 'flashpop', x, z, 1);
  spawnImpact(S, x, y, z, 4);
  const R = 16;
  for (const a of S.agents) {
    if (!a.alive) continue;
    const dx = x - a.x, dz = z - a.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > R) continue;
    if (!losClear(x, y, z, a.x, a.y + 1.55, a.z)) continue;
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    const facing = (dx * fx + dz * fz) / Math.max(0.001, d); // 1 = staring at it
    const facingMul = facing > 0 ? 1 : 0.3;
    const strength = (1 - d / R) * facingMul;
    if (strength <= 0.08) continue;
    const dur = 0.4 + strength * 2.6;
    a.flashUntil = S.time + dur;
    a.flashPeak = Math.max(a.flashPeak, Math.min(1, strength + 0.25));
  }
}
