// Weapons: the firing model. Spread punishes movement (standing still and
// crouching tighten it, the sniper demands a scope and still feet), recoil
// follows a fixed per-weapon pattern indexed by shots-in-spray, and
// reloads run on the sim clock. Grenade throws spawn pooled projectiles.
import { RECOIL, WEAPONS } from './config.js';
import { weaponOf } from './state.js';
import { fireHitscan } from './combat.js';
import { queueSound } from './audio.js';

// Live spread in radians for an agent right now.
export function spreadFor(S, a) {
  const w = weaponOf(a);
  let s = w.spread;
  if (a.weapon === 'longbow' && a.scopeOn) s = w.scopedSpread;
  const moveMul = Math.min(1, a.moving / 6.1);
  s += w.moveSpread * moveMul;
  if (a.crouched) s *= 0.7;
  if (!a.onGround) s += 0.03;
  s += Math.min(0.03, a.spray * 0.004);
  return s;
}

// Aim direction with spread applied; writes into out {x,y,z}.
export function aimDir(S, a, spread, out) {
  const rng = S.rng;
  const yaw = a.yaw + (rng.next() - 0.5) * 2 * spread;
  const pitch = a.pitch + (rng.next() - 0.5) * 2 * spread;
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

const _dir = { x: 0, y: 0, z: 0 };

export function canFire(S, a) {
  const w = weaponOf(a);
  if (a.reloading > 0 || a.mag <= 0 || !a.alive) return false;
  return S.time - a.lastShot >= 60 / w.rpm;
}

// Fire one trigger pull (all pellets for the shotgun). Returns shots fired.
export function fireWeapon(S, a) {
  const w = weaponOf(a);
  if (!canFire(S, a)) return 0;
  if (a.mag <= 0) { queueSound(S, 'dry', a.x, a.z, 0.7); return 0; }
  a.mag--; a.lastShot = S.time;
  a.spray++;
  const spread = spreadFor(S, a);
  for (let p = 0; p < w.pellets; p++) {
    aimDir(S, a, spread, _dir);
    fireHitscan(S, a, _dir.x, _dir.y, _dir.z);
  }
  if (a.isPlayer) S.stats.shots += w.pellets;
  // Recoil: fixed pattern table, scaled by the weapon kick. Spray decays
  // fractionally, so the table index is floored — a fractional index
  // would read undefined out of the pattern array.
  const pat = RECOIL[a.weapon] || RECOIL.p9;
  const step = pat[Math.max(0, Math.min(Math.floor(a.spray) - 1, pat.length - 1))];
  a.pitch += step[0] * w.kick;
  a.yaw += step[1] * w.kick * 0.6;
  const sound = { p9: 'shot_pistol', kestrel: 'shot_smg', breacher: 'shot_shotgun', vk7: 'shot_rifle', longbow: 'shot_sniper' }[a.weapon];
  queueSound(S, sound, a.x, a.z, 1);
  return w.pellets;
}

// Decay spray and pitch recovery; called once per tick per agent.
export function decaySpray(S, a, dt) {
  if (S.time - a.lastShot > 0.35 && a.spray > 0) a.spray = Math.max(0, a.spray - dt * 14);
}

export function startReload(S, a) {
  const w = weaponOf(a);
  if (a.reloading > 0 || a.mag >= w.mag || a.reserve <= 0) return false;
  a.reloading = w.reload;
  queueSound(S, 'reload', a.x, a.z, 0.8);
  return true;
}

export function tickReload(S, a, dt) {
  if (a.reloading <= 0) return;
  a.reloading -= dt;
  if (a.reloading > 0) return;
  const w = weaponOf(a);
  const need = w.mag - a.mag;
  const take = Math.min(need, a.reserve);
  a.mag += take; a.reserve -= take;
  a.reloading = 0;
}

export function switchWeapon(S, a, id) {
  if (a.weapon === id || a.reloading > 0) return false;
  if (id === a.sidearm || id === a.main) {
    a.weapon = id;
    const w = WEAPONS[id];
    a.mag = a['mag_' + id] !== undefined ? a['mag_' + id] : w.mag;
    a.reserve = a['res_' + id] !== undefined ? a['res_' + id] : w.reserve;
    a.scopeOn = false;
    return true;
  }
  return false;
}

// Remember per-weapon ammo when swapping so a half-empty mag stays half-empty.
export function stashAmmo(a) {
  a['mag_' + a.weapon] = a.mag;
  a['res_' + a.weapon] = a.reserve;
}

export function giveWeapon(S, a, id) {
  const w = WEAPONS[id];
  if (w.slot === 'main') {
    if (a.main && a.main !== id) { /* replaced loadout: old main is lost */ }
    a.main = id;
  } else if (w.slot === 'side') a.sidearm = id;
  a.weapon = id;
  a.mag = w.mag; a.reserve = w.reserve;
  a['mag_' + id] = w.mag; a['res_' + id] = w.reserve;
}

export function throwGrenade(S, a, kind) {
  if (!a.alive || a.grenades[kind] <= 0) return false;
  for (const p of S.projectiles) {
    if (p.active) continue;
    a.grenades[kind]--;
    const cp = Math.cos(a.pitch);
    const fx = -Math.sin(a.yaw) * cp, fy = Math.sin(a.pitch), fz = -Math.cos(a.yaw) * cp;
    p.active = true; p.kind = kind; p.owner = a.id;
    p.x = a.x + fx * 0.5; p.y = a.y + 1.4; p.z = a.z + fz * 0.5;
    const power = 13;
    p.vx = fx * power + a.vx * 0.5; p.vy = fy * power + 3.5; p.vz = fz * power + a.vz * 0.5;
    p.fuse = WEAPONS[kind].fuse; p.bounces = 0;
    queueSound(S, 'jump', a.x, a.z, 0.3);
    return true;
  }
  return false;
}
