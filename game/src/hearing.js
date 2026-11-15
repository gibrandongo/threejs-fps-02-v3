// Hearing: gunshots, footsteps, reloads, grenade bounces and plant beeps
// are audible events with a radius. Walls occlude: each wall between the
// source and a listener shrinks the effective radius, so a shot in the
// open shouts across the map while a shot behind two walls is a whisper.
// Bots that hear a loud-enough event investigate it or hold the angle it
// came from; the event log also feeds the radio chatter.
import { WALLS } from './mapdata.js';

// Count walls crossed by the 2D segment (a cheap occlusion proxy: crates
// under 1.2 m do not muffle, full walls do).
export function wallsBetween(x0, z0, x1, z1) {
  let n = 0;
  for (const w of WALLS) {
    if (w.h < 2) continue;
    if (segmentHitsBox(x0, z0, x1, z1, w)) n++;
  }
  return n;
}

function segmentHitsBox(x0, z0, x1, z1, w) {
  // Slab test in 2D.
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dz = z1 - z0;
  if (Math.abs(dx) < 1e-9) { if (x0 < w.x0 || x0 > w.x1) return false; }
  else {
    let ta = (w.x0 - x0) / dx, tb = (w.x1 - x0) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (z0 < w.z0 || z0 > w.z1) return false; }
  else {
    let ta = (w.z0 - z0) / dz, tb = (w.z1 - z0) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

// Emit an audible event: every living bot of EITHER team within the
// occluded radius gets a hearing memory. Enemies investigate; teammates
// get radio context only when the event is a plant beep or explosion.
export function emitSound(S, x, z, radius, kind, sourceId) {
  for (const a of S.agents) {
    if (!a.alive || !a.bot || a.id === sourceId) continue;
    const dx = a.x - x, dz = a.z - z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const occluded = radius * Math.pow(0.55, wallsBetween(x, z, a.x, a.z));
    if (dist > occluded) continue;
    const weight = 1 - dist / Math.max(1, occluded);
    const b = a.brain;
    // Only the loudest recent event wins; fresh events refresh the timer.
    if (weight >= b.hearWeight || S.time > b.hearUntil) {
      b.hearX = x; b.hearZ = z;
      b.hearWeight = weight;
      b.hearUntil = S.time + 2.5 + weight * 2;
      b.hearKind = kind;
      if (kind === 'shot' || kind === 'step' || kind === 'bounce') {
        b.investigateUntil = S.time + 3 + weight * 3;
      }
    }
  }
}

// Footstep noise: sprinting is loud, walking is nearly silent, crouching
// is silent. Called from the sim when an agent's step timer fires.
export function footstepRadius(a, walking) {
  if (a.crouched) return 0;
  if (walking) return 3.5;
  if (a.moving > 5) return 15;
  if (a.moving > 2.5) return 9;
  return 0;
}
