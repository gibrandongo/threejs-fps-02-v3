// Money: round payouts with a loss-streak bonus, the buy menu catalogue,
// and bot purchasing (save after losses, force-buy on streaks, rifles
// when rich). The player buys only during freeze time; bots buy at the
// start of freeze time so their loadouts are set when the round goes live.
import { ARMOR_PRICE, ECONOMY, WEAPONS } from './config.js';
import { giveWeapon } from './weapons.js';
import { pushRadio } from './state.js';
import { queueSound } from './audio.js';

export const BUY_ITEMS = [
  { id: 'kestrel', key: '1', blurb: 'Fast SMG · close range' },
  { id: 'breacher', key: '2', blurb: '8 pellets · devastating up close' },
  { id: 'vk7', key: '3', blurb: 'Rifle · accurate, hard-hitting' },
  { id: 'longbow', key: '4', blurb: 'Scoped sniper · one-shot body' },
  { id: 'frag', key: '5', blurb: 'Bounces · 1.6s fuse' },
  { id: 'dazzler', key: '6', blurb: 'Blinds on line of sight' },
  { id: 'armor', key: '7', blurb: 'Halves body damage' },
  { id: 'ammo', key: '8', blurb: 'Refill reserve ammo' },
];

export function lossBonus(streak) {
  return Math.min(ECONOMY.lossMax, ECONOMY.lossBase + ECONOMY.lossStreakStep * Math.max(0, streak - 1));
}

export function awardRound(S, winner, objective) {
  for (const a of S.agents) {
    if (a.team === winner) {
      a.money = Math.min(ECONOMY.maxMoney, a.money + (objective ? ECONOMY.winObjective : ECONOMY.winElim));
      a.lossStreak = 0;
    } else {
      a.lossStreak++;
      a.money = Math.min(ECONOMY.maxMoney, a.money + lossBonus(a.lossStreak));
    }
  }
}

export function buyItem(S, a, id) {
  if (id === 'armor') {
    if (a.armor >= 100 || a.money < ARMOR_PRICE) return false;
    a.money -= ARMOR_PRICE; a.armor = 100;
  } else if (id === 'ammo') {
    const w = WEAPONS[a.weapon];
    const cost = 200;
    if (a.money < cost || a.reserve >= w.reserve) return false;
    a.money -= cost; a.reserve = w.reserve;
  } else if (id === 'frag' || id === 'dazzler') {
    const w = WEAPONS[id];
    if (a.money < w.price || a.grenades[id] >= 2) return false;
    a.money -= w.price; a.grenades[id]++;
  } else {
    const w = WEAPONS[id];
    if (!w || a.money < w.price) return false;
    if (a.main === id) return false;
    a.money -= w.price;
    giveWeapon(S, a, id);
  }
  if (a.isPlayer) queueSound(S, 'buy', undefined, undefined, 1);
  return true;
}

// Bot shopping: deterministic per round, driven by money and streak.
export function botBuy(S, a) {
  const rng = S.rng;
  const saving = a.lossStreak >= 2 && a.money < 2700;
  if (saving) {
    // Eco round: keep the pistol, maybe armor if it is nearly free.
    if (a.money >= ARMOR_PRICE + 300 && rng.chance(0.5)) buyItem(S, a, 'armor');
    return;
  }
  const want = a.money >= 4750 && rng.chance(0.22) ? 'longbow'
    : a.money >= 2700 ? 'vk7'
    : a.money >= 1700 && rng.chance(0.3) ? 'breacher'
    : a.money >= 1500 ? 'kestrel' : null;
  if (want) buyItem(S, a, want);
  if (a.money >= ARMOR_PRICE) buyItem(S, a, 'armor');
  if (a.money >= 300 && rng.chance(0.6)) buyItem(S, a, 'frag');
  if (a.money >= 200 && rng.chance(0.5)) buyItem(S, a, 'dazzler');
  if (a.money >= 200 && rng.chance(0.3)) buyItem(S, a, 'ammo');
}

export function buyStatus(S, a) {
  return BUY_ITEMS.map((item) => {
    let price = 0, owned = false, afford = false;
    if (item.id === 'armor') { price = ARMOR_PRICE; owned = a.armor >= 100; }
    else if (item.id === 'ammo') { price = 200; owned = a.reserve >= WEAPONS[a.weapon].reserve; }
    else if (item.id === 'frag' || item.id === 'dazzler') { price = WEAPONS[item.id].price; owned = a.grenades[item.id] >= 2; }
    else { price = WEAPONS[item.id].price; owned = a.main === item.id; }
    afford = a.money >= price && !owned;
    return { ...item, price, owned, afford, name: item.id === 'armor' ? 'KEVLAR ARMOR' : item.id === 'ammo' ? 'REFILL AMMO' : WEAPONS[item.id].name };
  });
}
