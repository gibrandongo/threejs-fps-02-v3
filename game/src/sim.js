// The simulation: fixed 60 Hz steps, kept apart from rendering. Owns the
// match state machine (menu/freeze/live/roundEnd/matchEnd), round and
// overtime rules, player control, grenade projectiles, and round-end
// detection. Rendering (render.js) and DOM (hud.js) only read S.
import { BOT_NAMES, MATCH } from './config.js';
import { SPAWNS, SPAWN_YAW } from './mapdata.js';
import { aliveOn, makeAgent, playerOf, pushRadio, resetForRound, weaponOf } from './state.js';
import { stepMovement, wishFromInput } from './movement.js';
import { canFire, decaySpray, fireWeapon, startReload, stashAmmo, switchWeapon, throwGrenade, tickReload } from './weapons.js';
import { botTick, resetBotRound } from './bots.js';
import { tickBomb } from './bomb.js';
import { awardRound, botBuy } from './economy.js';
import { decideSite, onDeathsAdapt, pickDefSetup, pickPlan } from './plans.js';
import { emitSound, footstepRadius } from './hearing.js';
import { explodeFrag, popFlash, rayWalls } from './combat.js';
import { queueSound } from './audio.js';
import { recordRound } from './stats.js';
import { applySkill } from './settings.js';

export function startMatch(S) {
  S.agents.length = 0;
  S.agents.push(makeAgent(0, 'You', 'atk', true));
  BOT_NAMES.atk.forEach((n, i) => S.agents.push(makeAgent(1 + i, n, 'atk', false)));
  BOT_NAMES.def.forEach((n, i) => S.agents.push(makeAgent(5 + i, n, 'def', false)));
  S.wins = { atk: 0, def: 0 };
  S.round = 1; S.overtime = 0; S.roundHistory.length = 0;
  S.winner = null; S.matchOver = false;
  S.stats.shots = 0; S.stats.hits = 0; S.stats.headshots = 0;
  applySkill(S);
  startRound(S);
}

export function startRound(S) {
  resetForRound(S);
  // Spawns.
  const placed = { atk: 0, def: 0 };
  for (const a of S.agents) {
    const list = SPAWNS[a.team];
    const sp = list[placed[a.team] % list.length];
    placed[a.team]++;
    a.x = sp[0]; a.z = sp[1]; a.y = 0;
    a.yaw = SPAWN_YAW[a.team]; a.pitch = 0;
    resetBotRound(S, a);
  }
  // Economy + plans.
  for (const a of S.agents) if (a.bot) botBuy(S, a);
  pickPlan(S);
  pickDefSetup(S);
  // Charge carrier: seeded pick among the attackers.
  const atk = S.agents.filter((a) => a.team === 'atk');
  const carrier = atk[S.rng.int(0, atk.length - 1)];
  carrier.hasBomb = true;
  S.bomb.carrier = carrier.id;
  pushRadio(S, 'atk', carrier.name + ' carries the charge.');
  S.phase = 'freeze';
  S.phaseTime = MATCH.freezeTime;
  S.buyOpen = false;
  S.banner = { main: 'ROUND ' + S.round, sub: S.plan.def.name + ' — buy up, then go', cls: 'atk', until: S.time + 2.5 };
}

export function endRound(S, winner, reason, site) {
  if (S.phase !== 'live' && S.phase !== 'freeze') return;
  S.roundReason = reason;
  const objective = reason === 'CHARGE DETONATED' || reason === 'CHARGE DEFUSED';
  awardRound(S, winner, objective);
  recordRound(S, winner, reason, site);
  S.wins[winner]++;
  S.lastWinner = winner;
  S.banner = {
    main: winner === 'atk' ? 'JACKALS WIN' : 'WARDENS WIN',
    sub: reason + (S.mvpId >= 0 ? ' · ★ MVP ' + S.agents[S.mvpId].name : ''),
    cls: winner, until: S.time + MATCH.roundEndTime,
  };
  queueSound(S, winner === 'atk' ? 'round_win' : 'round_lose', undefined, undefined, 1);
  S.soak.rounds++;
  // Match end / overtime.
  const diff = Math.abs(S.wins.atk - S.wins.def);
  const lead = S.wins.atk > S.wins.def ? 'atk' : 'def';
  let over = false, matchWinner = null;
  if (S.round < MATCH.maxRounds) {
    over = S.wins.atk >= MATCH.roundsToWin || S.wins.def >= MATCH.roundsToWin;
    matchWinner = over ? lead : null;
  } else if (S.overtime === 0 && S.wins.atk === 7 && S.wins.def === 7) {
    S.overtime = 1;
    pushRadio(S, 'atk', 'Overtime! First team to lead by 2 takes the match.');
  } else if (S.overtime > 0) {
    if (diff >= 2) { over = true; matchWinner = lead; }
    else if (S.overtime >= MATCH.overtimeRounds) { over = true; matchWinner = diff > 0 ? lead : null; }
    else S.overtime++;
  } else {
    over = true;
    matchWinner = diff > 0 ? lead : null;
  }
  if (over) {
    S.winner = matchWinner;
    S.matchOver = true;
    S.phase = 'matchEnd';
    S.phaseTime = 0;
    return;
  }
  S.phase = 'roundEnd';
  S.phaseTime = MATCH.roundEndTime;
}

const _wish = { x: 0, z: 0 };

function playerTick(S, p, dt) {
  const inp = S.input;
  const sens = S.settings.sens * 0.0022 * (p.scopeOn ? 0.45 : 1);
  p.yaw -= inp.dx * sens;
  p.pitch -= inp.dy * sens;
  p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
  if (S.phase === 'freeze') return; // look only during freeze
  const walking = !!inp.keys['ShiftLeft'] || !!inp.keys['ShiftRight'];
  p.crouched = !!(inp.keys['ControlLeft'] || inp.keys['KeyC']);
  const fwd = (inp.keys['KeyW'] ? 1 : 0) - (inp.keys['KeyS'] ? 1 : 0);
  const strafe = (inp.keys['KeyD'] ? 1 : 0) - (inp.keys['KeyA'] ? 1 : 0);
  wishFromInput(p.yaw, fwd, strafe, _wish);
  const speedMul = (walking ? 0.55 : 1) * (p.scopeOn ? 0.6 : 1);
  const landed = stepMovement(p, _wish.x, _wish.z, speedMul, !!inp.keys['Space'], dt);
  if (landed) queueSound(S, 'land', p.x, p.z, 0.6);
  // Scope (Longbow only).
  const wantScope = inp.rightDown && p.weapon === 'longbow';
  if (wantScope !== p.scopeOn) { p.scopeOn = wantScope; queueSound(S, 'scope', undefined, undefined, 0.5); }
  // Fire.
  const w = weaponOf(p);
  const trigger = w.auto ? inp.mouseDown : inp.mouseDownEdge;
  if (trigger && p.mag > 0 && canFire(S, p)) {
    if (fireWeapon(S, p) > 0) emitSound(S, p.x, p.z, 34, 'shot', p.id);
  } else if (trigger && p.mag === 0 && inp.mouseDownEdge) {
    queueSound(S, 'dry', p.x, p.z, 0.7);
  }
  // Actions on key edges.
  if (inp.pressed['KeyR']) startReload(S, p);
  if (inp.pressed['KeyQ'] && p.main) { stashAmmo(p); switchWeapon(S, p, p.weapon === p.main ? p.sidearm : p.main); }
  if (inp.pressed['Digit1'] && p.main) { stashAmmo(p); switchWeapon(S, p, p.main); }
  if (inp.pressed['Digit2']) { stashAmmo(p); switchWeapon(S, p, p.sidearm); }
  if (inp.pressed['Digit3']) p.grenadeSel = 'frag';
  if (inp.pressed['Digit4']) p.grenadeSel = 'dazzler';
  if (inp.pressed['KeyG'] || inp.pressed['Enter']) throwGrenade(S, p, p.grenadeSel);
  if (inp.pressed['KeyF']) { p.inspectUntil = S.time + 1.2; queueSound(S, 'inspect', undefined, undefined, 0.6); }
  if (inp.wheel !== 0 && p.main) { stashAmmo(p); switchWeapon(S, p, p.weapon === p.main ? p.sidearm : p.main); }
}

function tickProjectiles(S, dt) {
  for (const pr of S.projectiles) {
    if (!pr.active) continue;
    pr.fuse -= dt;
    pr.vy -= 13.5 * dt;
    let nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt, nz = pr.z + pr.vz * dt;
    // Floor bounce.
    if (ny < 0.09) { ny = 0.09; pr.vy = Math.abs(pr.vy) * 0.45; pr.vx *= 0.7; pr.vz *= 0.7; bounceFx(S, pr); }
    // Wall bounce: step back along the dominant axis when blocked.
    const blocked = rayWalls(pr.x, pr.y, pr.z, nx - pr.x, ny - pr.y, nz - pr.z, 1) < 1;
    if (blocked) {
      const dx = nx - pr.x, dz = nz - pr.z;
      if (Math.abs(dx) > Math.abs(dz)) { pr.vx *= -0.45; nx = pr.x; }
      else { pr.vz *= -0.45; nz = pr.z; }
      pr.vx *= 0.8; pr.vz *= 0.8;
      bounceFx(S, pr);
    }
    pr.x = nx; pr.y = ny; pr.z = nz;
    if (pr.fuse <= 0) {
      pr.active = false;
      const owner = S.agents[pr.owner] || null;
      if (pr.kind === 'frag') explodeFrag(S, pr.x, pr.y, pr.z, owner);
      else popFlash(S, pr.x, pr.y, pr.z);
    }
  }
}

function bounceFx(S, pr) {
  pr.bounces++;
  if (pr.bounces > 6) return;
  queueSound(S, 'bounce', pr.x, pr.z, 0.5);
  emitSound(S, pr.x, pr.z, 12, 'bounce', pr.owner);
}

function tickFootsteps(S, a, dt) {
  if (!a.alive || !a.onGround || a.moving < 2.5) return;
  const walking = a.isPlayer && (S.input.keys['ShiftLeft'] || S.input.keys['ShiftRight']);
  const interval = 2.6 / a.moving;
  if (S.time < (a.stepAt || 0)) return;
  a.stepAt = S.time + interval;
  const radius = footstepRadius(a, walking);
  if (radius > 0) {
    if (a.isPlayer) queueSound(S, 'step', a.x, a.z, walking ? 0.25 : 0.5);
    emitSound(S, a.x, a.z, radius, 'step', a.id);
  }
}

// One fixed step. Returns false when the sim is paused/menu.
export function stepSim(S, dt) {
  if (S.phase === 'menu' || S.paused) return false;
  S.time += dt; S.tick++;
  // Phase timers.
  if (S.phase === 'freeze') {
    S.phaseTime -= dt;
    const p = playerOf(S);
    if (p.alive && !S.settings.autopilot) playerTick(S, p, dt);
    if (S.phaseTime <= 0) {
      S.phase = 'live'; S.phaseTime = MATCH.roundTime;
      S.buyOpen = false;
      pushRadio(S, 'atk', 'Go go go!');
      S.banner = { main: '', sub: '', cls: '', until: 0 };
    }
    return true;
  }
  if (S.phase === 'roundEnd') {
    S.phaseTime -= dt;
    if (S.phaseTime <= 0) { S.round++; startRound(S); }
    return true;
  }
  if (S.phase !== 'live') return true;

  S.phaseTime -= dt;
  // Plan adaptation checks.
  decideSite(S);
  onDeathsAdapt(S);
  // Agents.
  const p = playerOf(S);
  for (const a of S.agents) {
    if (!a.alive) continue;
    tickReload(S, a, dt);
    decaySpray(S, a, dt);
    if (a.isPlayer && !S.settings.autopilot) playerTick(S, a, dt);
    else botTick(S, a, dt);
    tickFootsteps(S, a, dt);
  }
  tickProjectiles(S, dt);
  tickBomb(S, dt, (w, r, s) => endRound(S, w, r, s));
  if (S.phase !== 'live') return true;
  // Round-end detection.
  const atkAlive = aliveOn(S, 'atk'), defAlive = aliveOn(S, 'def');
  if (S.bomb.state === 'planted') {
    if (defAlive === 0) endRound(S, 'atk', 'DEFENDERS ELIMINATED', S.bomb.site);
  } else {
    if (atkAlive === 0) endRound(S, 'def', 'ATTACKERS ELIMINATED', null);
    else if (defAlive === 0) endRound(S, 'atk', 'DEFENDERS ELIMINATED', null);
    else if (S.phaseTime <= 0) endRound(S, 'def', 'TIME EXPIRED', null);
  }
  return true;
}

export function spectateTarget(S) {
  const p = playerOf(S);
  if (p.alive) return p;
  for (const a of S.agents) if (a.team === 'atk' && a.alive) return a;
  for (const a of S.agents) if (a.alive) return a;
  return p;
}
