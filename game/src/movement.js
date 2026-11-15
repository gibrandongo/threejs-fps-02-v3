// Acceleration-based movement with axis-separated AABB collision.
// Agents are circles in XZ (radius) with a vertical span; a wall only
// blocks horizontal motion where the spans overlap, so crates can be
// jumped onto and stood on. No allocations: all scratch lives on the agent.
import { MAP, MOVE } from './config.js';
import { WALLS } from './mapdata.js';

export function eyeHeight(a) { return a.crouched ? MOVE.eyeCrouch : MOVE.eyeStand; }
export function bodyHeight(a) { return a.crouched ? MOVE.heightCrouch : MOVE.heightStand; }

function overlapsVertically(a, wall, feetY) {
  return feetY < wall.h && feetY + bodyHeight(a) > 0;
}

// Resolve one horizontal axis against every wall; returns corrected coord.
function resolveAxis(a, nx, nz, axis) {
  const r = MOVE.radius;
  const feet = a.y;
  for (const w of WALLS) {
    if (!overlapsVertically(a, w, feet)) continue;
    const cx = axis === 'x' ? nx : a.x;
    const cz = axis === 'x' ? a.z : nz;
    if (cx + r > w.x0 && cx - r < w.x1 && cz + r > w.z0 && cz - r < w.z1) {
      if (axis === 'x') {
        nx = a.vx > 0 ? w.x0 - r : w.x1 + r;
        if (a.vx === 0) nx = (a.x < (w.x0 + w.x1) / 2) ? w.x0 - r : w.x1 + r;
      } else {
        nz = a.vz > 0 ? w.z0 - r : w.z1 + r;
        if (a.vz === 0) nz = (a.z < (w.z0 + w.z1) / 2) ? w.z0 - r : w.z1 + r;
      }
    }
  }
  return axis === 'x' ? nx : nz;
}

// Ground height under the agent: 0, or the top of a crate/wall stood upon.
export function groundAt(x, z, feetY) {
  let g = 0;
  const r = MOVE.radius * 0.7;
  for (const w of WALLS) {
    if (w.h <= 1.2 && x + r > w.x0 && x - r < w.x1 && z + r > w.z0 && z - r < w.z1) {
      if (w.h <= feetY + 0.35 && w.h > g) g = w.h;
    }
  }
  return g;
}

// wishX/wishZ: desired move direction in world space (unit or zero).
// speedMul: crouch/walk/scope modifiers. Returns true if feet hit ground.
export function stepMovement(a, wishX, wishZ, speedMul, wantJump, dt) {
  const maxSpeed = (a.crouched ? MOVE.crouch : MOVE.run) * speedMul;
  const accel = a.onGround ? MOVE.accel : MOVE.airAccel;
  if (wishX !== 0 || wishZ !== 0) {
    const len = Math.sqrt(wishX * wishX + wishZ * wishZ);
    const ux = wishX / len, uz = wishZ / len;
    a.vx += ux * accel * dt; a.vz += uz * accel * dt;
    const sp = Math.sqrt(a.vx * a.vx + a.vz * a.vz);
    if (sp > maxSpeed) { a.vx *= maxSpeed / sp; a.vz *= maxSpeed / sp; }
  } else if (a.onGround) {
    const f = Math.max(0, 1 - MOVE.friction * dt);
    a.vx *= f; a.vz *= f;
    if (Math.abs(a.vx) < 0.02) a.vx = 0;
    if (Math.abs(a.vz) < 0.02) a.vz = 0;
  }
  a.moving = Math.sqrt(a.vx * a.vx + a.vz * a.vz);
  if (wantJump && a.onGround) { a.vy = MOVE.jumpVel; a.onGround = false; }

  // Vertical: gravity, then land on ground height.
  a.vy -= MOVE.gravity * dt;
  let ny = a.y + a.vy * dt;
  const g = groundAt(a.x, a.z, a.y);
  let landed = false;
  if (ny <= g) { if (!a.onGround && a.vy < -3) landed = true; ny = g; a.vy = 0; a.onGround = true; }
  else if (ny > g + 0.01) a.onGround = false;
  a.y = ny;

  // Horizontal, one axis at a time so agents slide along walls.
  let nx = a.x + a.vx * dt;
  nx = resolveAxis(a, nx, a.z, 'x');
  nx = Math.max(MAP.x0 + 0.6, Math.min(MAP.x1 - 0.6, nx));
  a.x = nx;
  let nz = a.z + a.vz * dt;
  nz = resolveAxis(a, a.x, nz, 'z');
  nz = Math.max(MAP.z0 + 0.6, Math.min(MAP.z1 - 0.6, nz));
  a.z = nz;
  return landed;
}

// Yaw-relative wish direction from forward/strafe inputs (-1..1).
export function wishFromInput(yaw, fwd, strafe, out) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = -fz, rz = fx;
  out.x = fx * fwd + rx * strafe;
  out.z = fz * fwd + rz * strafe;
  return out;
}
