// Team plans: each round the attacking bots pick ONE shared plan from a
// small library, take roles, and run it; defenders pick a setup. Plans
// adapt to events — a plant switches the attackers to post-plant holds,
// heavy losses trigger a rotate, and the defenders re-pick their setup
// when they hear the plant or lose a site anchor. The plan banner and
// radio log make the current plan visible to the player at all times.
import { pushRadio } from './state.js';
import { nearestNode } from './mapdata.js';

// A plan: waypoints per role (node ids), a site, a pace, and a fake site
// for misdirection plans. Node ids refer to mapdata NODES.
export const PLANS = [
  {
    id: 'a-split', name: 'A-SPLIT', site: 'A', pace: 'steady',
    desc: 'Two through Doors, two down A Long, one lurking Mid.',
    routes: { entry: [22, 28, 6], support: [22, 28, 6], entry2: [30, 3, 5, 6], lurker: [15, 17, 19], anchor: [30, 3, 5] },
  },
  {
    id: 'b-rush', name: 'B-RUSH', site: 'B', pace: 'fast',
    desc: 'Everyone through B Tunnel, fast — overwhelm before rotates.',
    routes: { entry: [31, 9, 11, 12], support: [31, 9, 11, 12], entry2: [27, 9, 11, 12], lurker: [23, 10, 11], anchor: [31, 9, 10] },
  },
  {
    id: 'mid-control', name: 'MID-CONTROL', site: null, pace: 'steady',
    desc: 'Take the silo, read the defence, split to the weaker site.',
    routes: { entry: [14, 15, 17, 19], support: [14, 16, 18, 19], entry2: [14, 15, 17, 19], lurker: [22, 26], anchor: [14, 16, 18] },
  },
  {
    id: 'fake-a', name: 'FAKE-A-HIT-B', site: 'B', pace: 'slow',
    desc: 'Noise at A, then the real hit at B while they rotate.',
    routes: { entry: [22, 28, 6], support: [30, 3, 5], entry2: [31, 9, 11, 12], lurker: [31, 9, 11, 12], anchor: [23, 10, 11] },
    fakeSite: 'A',
  },
  {
    id: 'slow-default', name: 'SLOW-DEFAULT', site: null, pace: 'slow',
    desc: 'Spread out, gather picks, hit late at the weak site.',
    routes: { entry: [30, 3], support: [31, 9], entry2: [14, 15, 17], lurker: [14, 16, 18], anchor: [1, 14] },
  },
];
export const DEF_SETUPS = [
  { id: '2-1-2', name: 'SETUP 2-1-2', holds: [7, 13, 19, 24, 25] },
  { id: 'stack-a', name: 'STACK A', holds: [7, 6, 24, 19, 28] },
  { id: 'stack-b', name: 'SETUP STACK B', holds: [13, 12, 25, 19, 29] },
  { id: 'retake', name: 'RETAKE SETUP', holds: [20, 21, 24, 25, 19] },
];
const ROLES = ['entry', 'support', 'entry2', 'lurker', 'anchor'];

export function pickPlan(S) {
  const rng = S.rng;
  // Weight: after two straight losses the team rushes to break the streak;
  // on match point it plays slow. Otherwise uniform over the library.
  const atkLosses = S.agents[0].lossStreak;
  let pool = PLANS;
  if (atkLosses >= 2) pool = [PLANS[1], PLANS[0], PLANS[1]];
  else if (S.wins.atk === 7) pool = [PLANS[4], PLANS[2], PLANS[0]];
  const plan = rng.pick(pool);
  S.plan = { def: plan, site: plan.site, adapted: false, rotated: false, fakeDone: false, pickedAt: S.time };
  // Assign roles: player gets a role too, shown in the banner.
  const mates = S.agents.filter((a) => a.team === 'atk');
  const order = rng.shuffle(mates.slice());
  order.forEach((a, i) => { a.brain.role = ROLES[i % ROLES.length]; });
  const me = S.agents[0];
  pushRadio(S, 'atk', 'Plan: ' + plan.name + ' — ' + plan.desc);
  pushRadio(S, 'atk', 'You are ' + me.brain.role.toUpperCase() + '. Site: ' + (plan.site || 'decide mid-round') + '.');
  return S.plan;
}

export function pickDefSetup(S) {
  const rng = S.rng;
  // Defenders lean toward the site the attackers hit last round.
  const last = S.roundHistory[S.roundHistory.length - 1];
  let pool = DEF_SETUPS;
  if (last && last.site === 'A') pool = [DEF_SETUPS[1], DEF_SETUPS[0], DEF_SETUPS[1]];
  if (last && last.site === 'B') pool = [DEF_SETUPS[2], DEF_SETUPS[0], DEF_SETUPS[2]];
  const setup = rng.pick(pool);
  S.defSetup = setup;
  const defs = S.agents.filter((a) => a.team === 'def');
  defs.forEach((a, i) => { a.brain.holdNode = setup.holds[i % setup.holds.length]; a.brain.role = 'anchor'; });
  return setup;
}

// Route (node list) for one attacker under the current plan, given the
// agent's present position. Mid-control and default resolve their site
// late: the weakest site is the one with fewer living defenders near it.
export function routeFor(S, a) {
  const plan = S.plan.def;
  const role = a.brain.role;
  let route = plan.routes[role] || plan.routes.support;
  if (S.plan.rotated && plan.site) {
    const other = plan.site === 'A' ? 'B' : 'A';
    route = rotateRoute(other, role);
  } else if (!plan.site && S.plan.site) {
    route = siteRoute(S.plan.site, role);
  }
  // Drop nodes already reached: start from the nearest remaining node.
  const here = nearestNode(a.x, a.z);
  let start = 0;
  for (let i = 0; i < route.length; i++) if (route[i] === here) start = i + 1;
  return route.slice(start);
}

function siteRoute(site, role) {
  if (site === 'A') {
    return role === 'lurker' ? [15, 17, 19, 24, 7] : [22, 28, 6];
  }
  return role === 'lurker' ? [16, 18, 19, 25, 13] : [23, 10, 11, 12];
}
function rotateRoute(site, role) {
  if (site === 'A') return role === 'anchor' ? [19, 24, 7] : [22, 28, 6];
  return role === 'anchor' ? [19, 25, 13] : [23, 10, 11, 12];
}

// Adaptation hooks, called by the sim on events.
export function onPlantAdapt(S, site) {
  if (!S.plan) return;
  S.plan.site = site; S.plan.adapted = true;
  pushRadio(S, 'atk', 'Charge planted at ' + site + '! Hold post-plant angles.');
  pushRadio(S, 'def', 'Charge down at ' + site + ' — retake together!');
  for (const a of S.agents) {
    if (!a.alive || !a.bot) continue;
    if (a.team === 'def') { a.brain.retake = true; a.brain.rotated = true; }
    if (a.team === 'atk') { a.brain.mode = 'hold'; }
  }
}

export function onDeathsAdapt(S) {
  if (!S.plan || S.plan.rotated || S.bomb.state === 'planted') return;
  const alive = S.agents.filter((a) => a.team === 'atk' && a.alive).length;
  if (alive <= 2 && S.plan.def.site) {
    S.plan.rotated = true;
    const other = S.plan.def.site === 'A' ? 'B' : 'A';
    S.plan.site = other;
    pushRadio(S, 'atk', 'Two down — rotating to ' + other + '!');
    for (const a of S.agents) {
      if (a.team === 'atk' && a.alive && a.bot) { a.brain.path.length = 0; a.brain.mode = 'idle'; }
    }
  }
  // Fake plan: once the fake pair makes noise at A, the rest commit to B.
  if (S.plan.def.fakeSite && !S.plan.fakeDone && S.time - S.plan.pickedAt > 25) {
    S.plan.fakeDone = true;
    pushRadio(S, 'atk', 'Fake done — hit B now!');
    for (const a of S.agents) {
      if (a.team === 'atk' && a.alive && a.bot && (a.brain.role === 'entry2' || a.brain.role === 'lurker')) {
        a.brain.path.length = 0; a.brain.mode = 'idle';
      }
    }
  }
}

// Mid-control/default: pick the weaker site once the team holds mid —
// either an attacker has pushed past the silo or 18 seconds have passed,
// so the call is a read of the defence, not a first-tick guess.
export function decideSite(S) {
  if (!S.plan || S.plan.def.site || S.plan.site) return;
  const midHeld = S.agents.some((a) => a.team === 'atk' && a.alive && a.x > 0);
  if (!midHeld && S.time - S.plan.pickedAt < 18) return;
  const nearA = S.agents.filter((a) => a.team === 'def' && a.alive && a.x > 8 && a.z < -7).length;
  const nearB = S.agents.filter((a) => a.team === 'def' && a.alive && a.x > 8 && a.z > 7).length;
  const site = nearA <= nearB ? 'A' : 'B';
  S.plan.site = site;
  pushRadio(S, 'atk', 'Mid is ours — hitting ' + site + ' (' + (site === 'A' ? nearA : nearB) + ' defenders).');
  for (const a of S.agents) {
    if (a.team === 'atk' && a.alive && a.bot) { a.brain.path.length = 0; a.brain.mode = 'idle'; }
  }
}
