// All tuning in one place: match rules, movement, weapons, economy, bots.
// Nothing else in the codebase hard-codes a damage, price or timer.
export const TICK = 1 / 60;
export const MAP = { x0: -30, x1: 30, z0: -24, z1: 24 };
export const MATCH = {
  roundsToWin: 8, maxRounds: 15, roundTime: 100, freezeTime: 5,
  roundEndTime: 4, bombTime: 40, plantTime: 3.2, defuseTime: 5.0,
  overtimeRounds: 3, // after 7-7: first team 2 clear wins, else draw
};
export const MOVE = {
  walk: 4.4, run: 6.1, crouch: 2.2, accel: 42, friction: 9.5,
  airAccel: 8, gravity: 13.5, jumpVel: 5.5, eyeStand: 1.62, eyeCrouch: 1.12,
  radius: 0.38, heightStand: 1.8, heightCrouch: 1.3,
};
export const BODY = { headR: 0.23, headY: 1.56, bodyR: 0.42, bodyTop: 1.5, bodyBot: 0.1, headMult: 2.0 };

// Weapons: distinct damage / fire-rate / spread / price / recoil identity.
// spread is base radians; moveSpread adds while moving; recoilPattern is a
// per-shot pitch/yaw kick table indexed by shots-in-spray (deterministic).
export const WEAPONS = {
  p9: { id: 'p9', name: 'P9 SIDEARM', slot: 'side', price: 0, damage: 26, headBonus: 1.0, rpm: 352, mag: 12, reserve: 48, reload: 1.5, spread: 0.011, moveSpread: 0.030, range: 42, falloff: 0.55, auto: false, pellets: 1, kick: 0.011, zoom: 1, tracer: 0xffd27a },
  kestrel: { id: 'kestrel', name: 'KESTREL SMG', slot: 'main', price: 1500, damage: 22, headBonus: 1.0, rpm: 750, mag: 30, reserve: 120, reload: 2.1, spread: 0.020, moveSpread: 0.026, range: 30, falloff: 0.5, auto: true, pellets: 1, kick: 0.008, zoom: 1, tracer: 0xffe08a },
  breacher: { id: 'breacher', name: 'BREACHER SHOTGUN', slot: 'main', price: 1700, damage: 11, headBonus: 0.6, rpm: 68, mag: 6, reserve: 24, reload: 2.8, spread: 0.052, moveSpread: 0.045, range: 14, falloff: 0.25, auto: false, pellets: 8, kick: 0.045, zoom: 1, tracer: 0xff9a5a },
  vk7: { id: 'vk7', name: 'VK-7 RIFLE', slot: 'main', price: 2700, damage: 31, headBonus: 1.0, rpm: 600, mag: 30, reserve: 90, reload: 2.4, spread: 0.008, moveSpread: 0.034, range: 55, falloff: 0.8, auto: true, pellets: 1, kick: 0.010, zoom: 1, tracer: 0xffd27a },
  longbow: { id: 'longbow', name: 'LONGBOW SNIPER', slot: 'main', price: 4750, damage: 105, headBonus: 1.0, rpm: 48, mag: 5, reserve: 20, reload: 3.4, spread: 0.001, moveSpread: 0.09, range: 80, falloff: 1.0, auto: false, pellets: 1, kick: 0.06, zoom: 2.6, tracer: 0xa8e6ff, scopedSpread: 0.0004 },
  // Grenades are thrown, not fired: damage/radius/fuse live here too.
  frag: { id: 'frag', name: 'FRAG GRENADE', slot: 'grenade', price: 300, damage: 92, radius: 7.5, fuse: 1.6, spread: 0, moveSpread: 0, range: 0, falloff: 1, auto: false, pellets: 1, kick: 0, zoom: 1, rpm: 0, mag: 1, reserve: 0, reload: 0, headBonus: 0, tracer: 0 },
  dazzler: { id: 'dazzler', name: 'DAZZLER FLASH', slot: 'grenade', price: 200, damage: 0, radius: 16, fuse: 1.1, spread: 0, moveSpread: 0, range: 0, falloff: 1, auto: false, pellets: 1, kick: 0, zoom: 1, rpm: 0, mag: 1, reserve: 0, reload: 0, headBonus: 0, tracer: 0 },
};
export const WEAPON_ORDER = ['p9', 'kestrel', 'breacher', 'vk7', 'longbow'];
export const ARMOR_PRICE = 650;
export const ECONOMY = {
  startMoney: 800, maxMoney: 16000, winElim: 3250, winObjective: 3500,
  lossBase: 1900, lossStreakStep: 500, lossMax: 3400, killReward: 300,
  plantBonus: 300, defuseBonus: 300,
};
// Recoil patterns: [pitch, yaw] per spray index, scaled by weapon kick.
// Rifles climb then drift; the SMG wobbles; the pistol barely moves.
export const RECOIL = {
  p9: [[1, 0], [0.9, 0.2], [0.8, -0.3], [0.7, 0.1]],
  kestrel: [[1, 0], [1, 0.4], [0.9, -0.5], [1, 0.6], [0.8, -0.7], [0.7, 0.5]],
  breacher: [[1, 0]],
  vk7: [[1, 0], [1, 0.1], [1, -0.2], [0.9, 0.4], [0.9, -0.5], [0.8, 0.7], [0.8, -0.8], [0.7, 0.6], [0.6, -0.5], [0.6, 0.4]],
  longbow: [[1, 0]],
};
export const BOT_NAMES = {
  atk: ['Mira', 'Koda', 'Sable', 'Rook'],
  def: ['Hale', 'Iris', 'Voss', 'Pike', 'Nyra'],
};
export const SKILL = [
  { name: 'Rookie', aimErr: 0.055, react: 0.55, burst: 2, hear: 0.8 },
  { name: 'Regular', aimErr: 0.032, react: 0.38, burst: 3, hear: 1.0 },
  { name: 'Veteran', aimErr: 0.018, react: 0.26, burst: 4, hear: 1.2 },
];
export const PALETTE = {
  sky: 0x2a3648, fog: 0x232f3d, ground: 0x4a4640, wall: 0x6b6259,
  wallDark: 0x4d463f, crate: 0x8a6b3a, crateBlue: 0x3d5a74, metal: 0x7d8590,
  siteA: 0xffb340, siteB: 0x57b6e6, atk: 0xd98a1f, def: 0x3d7ea6,
  accent: 0xc94f32, lamp: 0xffd9a0,
};
