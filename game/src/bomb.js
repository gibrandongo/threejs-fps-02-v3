// The charge: carried, dropped, planted, detonated. Planting and defusing
// are hold-to-channel actions (E for the player, automatic for bots in
// position with no visible enemy). Beeps escalate as the 40-second fuse
// runs down, and every beep is a hearing event the defenders can track.
import { MATCH } from './config.js';
import { siteAt } from './mapdata.js';
import { pushRadio } from './state.js';
import { queueSound } from './audio.js';
import { emitSound } from './hearing.js';
import { onPlantAdapt } from './plans.js';
import { explodeFrag } from './combat.js';

export function carrierOf(S) {
  for (const a of S.agents) if (a.hasBomb) return a;
  return null;
}

// Called every tick while the round is live.
export function tickBomb(S, dt, endRound) {
  const bomb = S.bomb;
  if (bomb.state === 'carried' || bomb.state === 'dropped') {
    // Pickup: any living attacker walking over a dropped charge takes it.
    if (bomb.state === 'dropped') {
      for (const a of S.agents) {
        if (a.team !== 'atk' || !a.alive) continue;
        if (Math.hypot(a.x - bomb.x, a.z - bomb.z) < 1.1) {
          a.hasBomb = true; bomb.state = 'carried'; bomb.carrier = a.id;
          pushRadio(S, 'atk', a.name + ' picked up the charge.');
          if (a.isPlayer) queueSound(S, 'pickup', undefined, undefined, 1);
          break;
        }
      }
    }
    // Planting: carrier standing in a site, channeling.
    const c = carrierOf(S);
    if (c && c.alive) {
      const site = siteAt(c.x, c.z);
      const channeling = c.isPlayer ? S.input.keys['KeyE'] && S.phase === 'live' : botWantsPlant(S, c);
      if (site && channeling && c.moving < 0.5) {
        c.plantHold += dt;
        if (c.plantHold >= MATCH.plantTime) {
          bomb.state = 'planted'; bomb.site = site; bomb.timer = MATCH.bombTime;
          bomb.x = c.x; bomb.y = c.y; bomb.z = c.z; bomb.planter = c.id;
          c.hasBomb = false; c.plantHold = 0;
          c.money = Math.min(16000, c.money + 300);
          queueSound(S, 'plant', bomb.x, bomb.z, 1);
          emitSound(S, bomb.x, bomb.z, 40, 'plant', c.id);
          onPlantAdapt(S, site);
        }
      } else c.plantHold = 0;
    }
    return;
  }
  if (bomb.state !== 'planted') return;
  // Fuse running: beeps accelerate, then detonation wins the round.
  bomb.timer -= dt;
  const frac = bomb.timer / MATCH.bombTime;
  const interval = frac > 0.5 ? 1.0 : frac > 0.25 ? 0.5 : 0.22;
  if (S.time >= bomb.beepAt) {
    bomb.beepAt = S.time + interval;
    queueSound(S, frac > 0.25 ? 'beep' : 'beep_fast', bomb.x, bomb.z, 1);
    emitSound(S, bomb.x, bomb.z, 30, 'beep', -1);
  }
  if (bomb.timer <= 0) {
    bomb.state = 'exploded';
    explodeFrag(S, bomb.x, bomb.y + 0.4, bomb.z, S.agents[bomb.planter] || null);
    endRound('atk', 'CHARGE DETONATED', bomb.site);
    return;
  }
  // Defusing: a defender at the charge, channeling, with the fuse still live.
  for (const a of S.agents) {
    if (a.team !== 'def' || !a.alive) continue;
    const near = Math.hypot(a.x - bomb.x, a.z - bomb.z) < 1.4;
    const channeling = a.isPlayer ? S.input.keys['KeyE'] : botWantsDefuse(S, a);
    if (near && channeling && a.moving < 0.5) {
      a.defuseHold += dt;
      if (Math.floor(a.defuseHold * 2) !== Math.floor((a.defuseHold - dt) * 2)) {
        queueSound(S, 'defuse', a.x, a.z, 0.8);
      }
      if (a.defuseHold >= MATCH.defuseTime) {
        bomb.state = 'defused';
        a.money = Math.min(16000, a.money + 300);
        endRound('def', 'CHARGE DEFUSED', bomb.site);
        return;
      }
    } else a.defuseHold = 0;
  }
}

// Bots plant when in the planned site with no visible enemy and no
// recent damage; they stop channeling if an enemy appears.
function botWantsPlant(S, c) {
  if (S.time - c.lastDamageAt < 1.5) return false;
  if (c.brain.targetId >= 0) return false;
  const site = siteAt(c.x, c.z);
  if (!site) return false;
  if (S.plan && S.plan.site && S.plan.site !== site) return false;
  return true;
}

function botWantsDefuse(S, a) {
  if (S.time - a.lastDamageAt < 1.0) return false;
  if (a.brain.targetId >= 0) return false;
  return true;
}

export function bombProgress(S, a) {
  if (a.plantHold > 0) return { label: 'PLANTING', frac: a.plantHold / MATCH.plantTime };
  if (a.defuseHold > 0) return { label: 'DEFUSING', frac: a.defuseHold / MATCH.defuseTime };
  return null;
}
