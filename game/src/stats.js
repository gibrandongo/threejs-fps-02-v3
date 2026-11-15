// Match records: round history, per-agent scoreboard rows, MVP stars,
// and the end-of-match summary. MVP is the living-round best by damage,
// then kills; stars accumulate across rounds and show in the HUD.
import { pushRadio } from './state.js';

export function recordRound(S, winner, reason, site) {
  S.roundHistory.push({ round: S.round, winner, reason, site: site || null });
  // MVP: most round damage, kills break ties.
  let best = null, bestScore = -1;
  for (const a of S.agents) {
    if (a.team !== winner) continue;
    const score = a.roundDamage + a.roundKills * 50;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  if (best) {
    best.mvps++;
    S.mvpId = best.id;
    pushRadio(S, winner, '★ MVP: ' + best.name + ' (' + best.roundKills + ' kills, ' + Math.round(best.roundDamage) + ' dmg).');
  }
}

export function scoreboardRows(S) {
  const rows = { atk: [], def: [] };
  for (const a of S.agents) {
    rows[a.team].push({
      name: a.name, kills: a.kills, deaths: a.deaths,
      damage: Math.round(a.damage), mvps: a.mvps, money: a.money,
      weapon: a.weapon, alive: a.alive, me: a.isPlayer,
    });
  }
  for (const t of ['atk', 'def']) rows[t].sort((p, q) => q.kills - p.kills || q.damage - p.damage);
  return rows;
}

export function matchSummary(S) {
  const winner = S.winner;
  const rows = scoreboardRows(S);
  const all = rows.atk.concat(rows.def);
  all.sort((p, q) => q.kills - p.kills || q.damage - p.damage);
  const top = all[0];
  const me = S.agents[0];
  const acc = S.stats.shots > 0 ? Math.round(100 * S.stats.hits / S.stats.shots) : 0;
  return {
    winner, top,
    scoreLine: S.wins.atk + ' — ' + S.wins.def,
    rounds: S.roundHistory.length,
    meLine: me.name + ': ' + me.kills + ' kills / ' + me.deaths + ' deaths, ' + Math.round(me.damage) + ' damage, ' + acc + '% accuracy, ' + S.stats.headshots + ' headshots, ' + me.mvps + ' MVPs.',
  };
}
