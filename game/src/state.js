// The ONE place state lives. Every module reads and writes this object;
// nothing keeps a parallel copy of match, agent or bomb state. Pooled
// arrays (tracers, impacts, projectiles, sounds) are fixed-size and reused
// so the hot loop never allocates.
import { ECONOMY, WEAPONS } from './config.js';
import { makeRng } from './rng.js';

export function makeAgent(id, name, team, isPlayer) {
  return {
    id, name, team, isPlayer, bot: !isPlayer,
    alive: true, hp: 100, armor: 0,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
    crouched: false, onGround: true, moving: 0,
    weapon: 'p9', sidearm: 'p9', main: null, mag: 12, reserve: 48,
    reloading: 0, spray: 0, lastShot: -9, lastDamageAt: -9,
    grenades: { frag: 0, dazzler: 0 }, grenadeSel: 'frag',
    money: ECONOMY.startMoney, lossStreak: 0,
    kills: 0, deaths: 0, damage: 0, mvps: 0, roundKills: 0, roundDamage: 0,
    hasBomb: false, skill: 1, flashUntil: 0, flashPeak: 0,
    scopeOn: false, inspectUntil: 0, plantHold: 0, defuseHold: 0,
    // Bot brain state (bots.js owns the meaning of these fields).
    brain: {
      mode: 'idle', path: [], pathIdx: 0, waitUntil: 0, holdNode: -1,
      role: 'support', targetId: -1, seenAt: -9, lastKnownX: 0, lastKnownZ: 0,
      hearX: 0, hearZ: 0, hearUntil: 0, hearWeight: 0, burstLeft: 0,
      nextBurstAt: 0, strafeDir: 1, strafeUntil: 0, angleYaw: 0,
      investigateUntil: 0, rotated: false, retake: false,
    },
    // Scratch for movement/combat so helpers never allocate.
    tx: 0, tz: 0,
  };
}

export function createState(seed) {
  const S = {
    seed, rng: makeRng(seed), time: 0, tick: 0,
    phase: 'menu', phaseTime: 0, round: 1, overtime: 0,
    wins: { atk: 0, def: 0 }, roundHistory: [], roundReason: '',
    agents: [], plan: null, defSetup: null,
    bomb: { state: 'carried', carrier: -1, site: null, x: 0, y: 0, z: 0, timer: 0, beepAt: 0, planter: -1 },
    projectiles: [], tracers: [], impacts: [], flashes: [],
    sounds: [], // {name, x, z, vol} drained by audio each frame
    killfeed: [], radio: [], damageFeed: [],
    settings: { sens: 1.0, volume: 0.8, skill: 1, autopilot: false },
    input: null, // filled by input.js: shared input snapshot
    winner: null, mvpId: -1, matchOver: false,
    demo: null, soak: { rounds: 0, errors: 0, started: false },
    stats: { shots: 0, hits: 0, headshots: 0 },
  };
  for (let i = 0; i < 24; i++) S.projectiles.push({ active: false, kind: '', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0, owner: -1, bounces: 0 });
  for (let i = 0; i < 48; i++) S.tracers.push({ active: false, life: 0, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, color: 0 });
  for (let i = 0; i < 64; i++) S.impacts.push({ active: false, life: 0, x: 0, y: 0, z: 0, kind: 0 });
  return S;
}

export function playerOf(S) { return S.agents[0]; }

export function aliveOn(S, team) {
  let n = 0;
  for (const a of S.agents) if (a.team === team && a.alive) n++;
  return n;
}

export function weaponOf(a) { return WEAPONS[a.weapon]; }

export function resetForRound(S) {
  for (const a of S.agents) {
    a.alive = true; a.hp = 100; a.vx = 0; a.vy = 0; a.vz = 0;
    a.reloading = 0; a.spray = 0; a.flashUntil = 0; a.flashPeak = 0;
    a.roundKills = 0; a.roundDamage = 0; a.plantHold = 0; a.defuseHold = 0;
    a.scopeOn = false; a.hasBomb = false;
    const w = WEAPONS[a.weapon];
    a.mag = w.mag; a.reserve = w.reserve;
    a.brain.mode = 'idle'; a.brain.path.length = 0; a.brain.pathIdx = 0;
    a.brain.targetId = -1; a.brain.hearUntil = 0; a.brain.rotated = false;
    a.brain.retake = false; a.brain.waitUntil = 0;
  }
  S.bomb.state = 'carried'; S.bomb.site = null; S.bomb.timer = 0; S.bomb.planter = -1;
  for (const p of S.projectiles) p.active = false;
  for (const t of S.tracers) t.active = false;
  for (const f of S.flashes) f.active = false;
  S.mvpId = -1; S.roundReason = '';
}

export function pushRadio(S, team, text) {
  S.radio.push({ team, text, at: S.time });
  if (S.radio.length > 6) S.radio.shift();
}

export function pushKill(S, killer, victim, headshot, weaponName) {
  S.killfeed.push({ killer, victim, headshot, weaponName, at: S.time });
  if (S.killfeed.length > 5) S.killfeed.shift();
}
