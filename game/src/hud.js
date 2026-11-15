// HUD: DOM text, the canvas minimap, kill feed, radio log, buy menu,
// scoreboard, banners and damage feedback. Reads S only; the one write
// is the buy menu purchase (via economy.buyItem). Updates run once per
// rendered frame; the minimap redraws from map data every frame.
import { MATCH } from './config.js';
import { NODES, SITES, WALLS, zoneAt } from './mapdata.js';
import { aliveOn, playerOf } from './state.js';
import { spreadFor } from './weapons.js';
import { buyStatus, buyItem, lossBonus, BUY_ITEMS } from './economy.js';
import { bombProgress } from './bomb.js';
import { scoreboardRows } from './stats.js';
import { spectateTarget } from './sim.js';

function el(id) { return document.getElementById(id); }
const fmtClock = (t) => {
  const s = Math.max(0, Math.ceil(t));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

export function buildHud(S) {
  const H = {
    clock: el('clock'), roundLabel: el('roundlabel'),
    scoreAtk: el('score-atk'), scoreDef: el('score-def'),
    planName: el('plan-name'), planRole: el('plan-role'),
    healthNum: el('healthnum'), armorBar: el('armorbar').firstElementChild, armorNum: el('armornum'),
    ammoNum: el('ammonum'), ammoReserve: el('ammo-reserve'), weaponName: el('weaponname'),
    fireMode: el('firemode'), grenades: el('grenades'),
    moneyNum: el('moneynum'), streakLabel: el('streaklabel'), mvpStars: el('mvpstars'),
    killfeed: el('killfeed'), radiolog: el('radiolog'), bombStatus: el('bombstatus'),
    banner: el('banner'), subbanner: el('subbanner'),
    minimap: el('minimap'), callout: el('callout'), teambar: el('teambar'),
    spectate: el('spectate'), damageFeed: el('damagefeed'),
    crosshair: el('crosshair'), hitmarker: el('hitmarker'), hitdir: el('hitdir'),
    flash: el('flash'), vignette: el('vignette'), interact: el('interact'),
    scope: el('scope'), buy: el('buy'), buyGrid: el('buy-grid'),
    buyMoney: el('buy-money'), buyTimer: el('buy-timer'),
    scoreboard: el('scoreboard'), sbAtk: el('sb-atk'), sbDef: el('sb-def'),
    sbHistory: el('sb-history'), sbRound: el('sb-round'),
    soak: el('soak-status'),
  };
  const mm = H.minimap.getContext('2d');
  let lastHits = 0, lastFeedLen = 0, lastDmgAt = -9, hitUntil = 0, hitKill = false;
  let frame = 0;

  // Buy menu grid: built once from the catalogue (agents do not exist yet
  // at boot), refreshed on open and after each purchase.
  const buyEls = [];
  for (const item of BUY_ITEMS) {
    const d = document.createElement('div');
    d.className = 'buy-item';
    d.innerHTML = '<span><b></b><small></small></span><span class="price"></span>';
    d.addEventListener('click', () => {
      const ok = buyItem(S, playerOf(S), item.id);
      if (!ok) { /* denied: refresh shows the state */ }
      refreshBuy();
    });
    H.buyGrid.appendChild(d);
    buyEls.push({ item, root: d });
  }
  function refreshBuy() {
    if (S.agents.length === 0) return;
    const p = playerOf(S);
    const status = buyStatus(S, p);
    status.forEach((s, i) => {
      const e = buyEls[i];
      e.root.querySelector('b').textContent = '[' + s.key + '] ' + s.name;
      e.root.querySelector('small').textContent = s.blurb;
      e.root.querySelector('.price').textContent = s.owned ? 'OWNED' : '$' + s.price;
      e.root.classList.toggle('owned', s.owned);
      e.root.classList.toggle('cant', !s.afford);
    });
    H.buyMoney.textContent = '$' + p.money;
  }

  function drawMinimap() {
    const W = 220, Hh = 176;
    const px = (x) => (x + 30) * (W / 60);
    const pz = (z) => (z + 24) * (Hh / 48);
    mm.fillStyle = '#141c26'; mm.fillRect(0, 0, W, Hh);
    // Site zones.
    mm.fillStyle = 'rgba(255,179,64,0.16)'; mm.fillRect(px(SITES.A.x0), pz(SITES.A.z0), px(SITES.A.x1) - px(SITES.A.x0), pz(SITES.A.z1) - pz(SITES.A.z0));
    mm.fillStyle = 'rgba(87,182,230,0.16)'; mm.fillRect(px(SITES.B.x0), pz(SITES.B.z0), px(SITES.B.x1) - px(SITES.B.x0), pz(SITES.B.z1) - pz(SITES.B.z0));
    mm.fillStyle = '#ffb340'; mm.font = 'bold 13px sans-serif'; mm.fillText('A', px(21) - 4, pz(-16) + 4);
    mm.fillStyle = '#57b6e6'; mm.fillText('B', px(21) - 4, pz(16) + 4);
    mm.fillStyle = '#5a6675';
    for (const w of WALLS) mm.fillRect(px(w.x0), pz(w.z0), Math.max(1, px(w.x1) - px(w.x0)), Math.max(1, pz(w.z1) - pz(w.z0)));
    // Waypoint dots (faint route skeleton).
    mm.fillStyle = 'rgba(255,255,255,0.18)';
    for (const n of NODES) mm.fillRect(px(n[0]) - 1, pz(n[1]) - 1, 2, 2);
    // Bomb.
    if (S.bomb.state === 'dropped' || S.bomb.state === 'planted') {
      mm.fillStyle = S.bomb.state === 'planted' ? '#ff4030' : '#ffb340';
      mm.beginPath(); mm.arc(px(S.bomb.x), pz(S.bomb.z), 4, 0, 7); mm.fill();
    }
    // Agents: teammates always; enemies only just after firing (heard).
    for (const a of S.agents) {
      if (!a.alive) continue;
      const isMate = a.team === 'atk';
      const heard = !isMate && S.time - a.lastShot < 1.5;
      if (!isMate && !heard) continue;
      mm.fillStyle = a.isPlayer ? '#ffffff' : isMate ? '#ffb340' : '#ff5a4e';
      mm.beginPath(); mm.arc(px(a.x), pz(a.z), a.isPlayer ? 4 : 3, 0, 7); mm.fill();
      if (a.isPlayer) {
        mm.strokeStyle = '#fff'; mm.beginPath();
        mm.moveTo(px(a.x), pz(a.z));
        mm.lineTo(px(a.x) + -Math.sin(a.yaw) * 8, pz(a.z) + -Math.cos(a.yaw) * 8);
        mm.stroke();
      }
    }
  }

  function renderScoreboard() {
    const rows = scoreboardRows(S);
    const table = (list, cls) => {
      let h = '<h3 class="' + cls + '">' + (cls === 'atk' ? 'JACKALS (ATTACK)' : 'WARDENS (DEFENCE)') + '</h3><table><tr><th>Name</th><th>K</th><th>D</th><th>DMG</th><th>★</th><th>$</th></tr>';
      for (const r of list) h += '<tr class="' + (r.me ? 'me' : '') + (r.alive ? '' : ' dead') + '"><td>' + r.name + (r.alive ? '' : ' †') + '</td><td>' + r.kills + '</td><td>' + r.deaths + '</td><td>' + r.damage + '</td><td>' + r.mvps + '</td><td>' + r.money + '</td></tr>';
      return h + '</table>';
    };
    H.sbAtk.innerHTML = table(rows.atk, 'atk');
    H.sbDef.innerHTML = table(rows.def, 'def');
    H.sbRound.textContent = (S.overtime > 0 ? 'OVERTIME ' + S.overtime : 'ROUND ' + S.round + ' / ' + MATCH.maxRounds);
    H.sbHistory.innerHTML = 'Rounds: ' + S.roundHistory.map((r) => '<span class="pip ' + r.winner + '">' + r.round + '</span>').join('') + (S.roundHistory.length === 0 ? '—' : '');
  }

  function update() {
    frame++;
    if (S.agents.length === 0) return; // menu: no match state to show yet
    const p = playerOf(S);
    // Score + clock.
    H.scoreAtk.textContent = S.wins.atk;
    H.scoreDef.textContent = S.wins.def;
    const planted = S.bomb.state === 'planted';
    H.clock.textContent = planted ? fmtClock(S.bomb.timer) : fmtClock(S.phaseTime);
    H.clock.className = planted ? 'bomb' : (S.phase === 'live' && S.phaseTime < 15 ? 'low' : '');
    H.clock.id = 'clock';
    H.roundLabel.textContent = (S.overtime > 0 ? 'OVERTIME ' + S.overtime : 'ROUND ' + S.round) + ' · FIRST TO ' + MATCH.roundsToWin + (S.phase === 'freeze' ? ' · BUY TIME' : '');
    // Plan banner.
    if (S.plan) {
      H.planName.textContent = 'PLAN: ' + S.plan.def.name + (S.plan.rotated ? ' → ' + S.plan.site : S.plan.site ? ' · SITE ' + S.plan.site : '');
      H.planRole.textContent = 'Your role: ' + p.brain.role.toUpperCase() + ' · ' + S.plan.def.desc;
    }
    // Vitals.
    H.healthNum.textContent = Math.max(0, Math.ceil(p.hp));
    H.healthNum.className = p.hp <= 30 ? 'low' : '';
    H.healthNum.id = 'healthnum';
    H.armorBar.style.width = Math.min(100, p.armor) + '%';
    H.armorNum.textContent = Math.round(p.armor);
    const wname = { p9: 'P9 SIDEARM', kestrel: 'KESTREL SMG', breacher: 'BREACHER', vk7: 'VK-7 RIFLE', longbow: 'LONGBOW' }[p.weapon];
    H.ammoNum.innerHTML = (p.reloading > 0 ? '--' : p.mag) + '<span id="ammo-reserve"> / ' + p.reserve + '</span>';
    H.ammoNum.className = p.mag <= 5 ? 'low' : '';
    H.ammoNum.id = 'ammonum';
    H.weaponName.textContent = wname + (p.reloading > 0 ? ' · RELOADING' : '');
    H.fireMode.textContent = p.weapon === 'longbow' ? 'BOLT' : (p.weapon === 'p9' || p.weapon === 'breacher') ? 'SEMI' : 'AUTO';
    H.grenades.innerHTML = '<span class="' + (p.grenadeSel === 'frag' ? 'sel' : '') + '">FRAG ×' + p.grenades.frag + '</span><span class="' + (p.grenadeSel === 'dazzler' ? 'sel' : '') + '">FLASH ×' + p.grenades.dazzler + '</span>' + (p.hasBomb ? '<span class="sel">CHARGE</span>' : '');
    H.moneyNum.textContent = '$' + p.money;
    H.streakLabel.textContent = p.lossStreak > 0 ? 'Loss bonus next: $' + lossBonus(p.lossStreak + 1) : 'Win pays $3250+';
    H.mvpStars.textContent = '★'.repeat(p.mvps);
    // Crosshair gap from live spread; hide while scoped.
    const spread = spreadFor(S, p);
    H.crosshair.style.setProperty('--gap', (5 + spread * 420) + 'px');
    H.crosshair.classList.toggle('scoped', p.scopeOn);
    H.scope.classList.toggle('on', p.scopeOn);
    // Hitmarker on new hits; red when the latest feed entry is your kill.
    if (S.stats.hits !== lastHits) { lastHits = S.stats.hits; hitUntil = S.time + 0.14; }
    if (S.killfeed.length !== lastFeedLen) {
      const last = S.killfeed[S.killfeed.length - 1];
      lastFeedLen = S.killfeed.length;
      if (last && last.killer === 'You') { hitUntil = S.time + 0.22; hitKill = true; }
    }
    H.hitmarker.style.opacity = S.time < hitUntil ? 1 : 0;
    H.hitmarker.classList.toggle('kill', hitKill && S.time < hitUntil);
    if (S.time >= hitUntil) hitKill = false;
    // Damage direction: red arc toward the last attacker.
    if (p.lastDamageAt !== lastDmgAt && p.lastDmgX !== undefined) {
      lastDmgAt = p.lastDamageAt;
      const ang = Math.atan2(-(p.lastDmgX - p.x), -(p.lastDmgZ - p.z)) - p.yaw;
      let i = H.hitdir.firstElementChild;
      if (!i) { i = document.createElement('i'); H.hitdir.appendChild(i); }
      i.style.transform = 'rotate(' + ang + 'rad)';
      i.style.opacity = 0.95;
      i.dataset.until = String(S.time + 0.9);
    }
    const di = H.hitdir.firstElementChild;
    if (di && S.time > parseFloat(di.dataset.until || '0')) di.style.opacity = 0;
    // Flash + low-hp vignette.
    const flashLeft = p.flashUntil - S.time;
    H.flash.style.opacity = flashLeft > 0 ? Math.min(1, p.flashPeak * Math.min(1, flashLeft / 0.4 + 0.3)) : 0;
    H.vignette.style.opacity = p.hp < 35 && p.alive ? (1 - p.hp / 35) * 0.9 : 0;
    // Kill feed + radio.
    H.killfeed.innerHTML = S.killfeed.slice().reverse().map((k) => {
      const kc = S.agents.find((a) => a.name === k.killer);
      const vc = S.agents.find((a) => a.name === k.victim);
      return '<div><span class="' + (kc ? kc.team : '') + '">' + k.killer + '</span> ▸ <span class="' + (vc ? vc.team : '') + '">' + k.victim + '</span>' + (k.headshot ? ' <span class="hs">HEADSHOT</span>' : '') + ' <span style="color:#8fa3b8">' + k.weaponName + '</span></div>';
    }).join('');
    H.radiolog.innerHTML = S.radio.slice(-4).map((r) => '<div>' + r.text + '</div>').join('');
    // Bomb status + interact prompt.
    if (planted) {
      H.bombStatus.className = 'on'; H.bombStatus.id = 'bombstatus';
      H.bombStatus.innerHTML = 'CHARGE PLANTED · SITE ' + S.bomb.site + ' · ' + fmtClock(S.bomb.timer) + '<span class="bar"><i style="width:' + (100 * S.bomb.timer / MATCH.bombTime) + '%"></i></span>';
    } else if (S.bomb.state === 'dropped') {
      H.bombStatus.className = 'on'; H.bombStatus.id = 'bombstatus';
      H.bombStatus.textContent = 'CHARGE DROPPED — RECOVER IT';
    } else {
      H.bombStatus.className = ''; H.bombStatus.id = 'bombstatus';
    }
    const prog = bombProgress(S, p);
    if (prog) {
      H.interact.className = 'on'; H.interact.id = 'interact';
      H.interact.textContent = prog.label + ' ' + Math.round(prog.frac * 100) + '%';
    } else if (p.hasBomb && S.phase === 'live' && zoneAt(p.x, p.z).endsWith('SITE')) {
      H.interact.className = 'on'; H.interact.id = 'interact';
      H.interact.textContent = 'HOLD E TO PLANT THE CHARGE';
    } else if (S.bomb.state === 'dropped' && Math.hypot(p.x - S.bomb.x, p.z - S.bomb.z) < 3) {
      H.interact.className = 'on'; H.interact.id = 'interact';
      H.interact.textContent = 'WALK OVER THE CHARGE TO PICK IT UP';
    } else { H.interact.className = ''; H.interact.id = 'interact'; }
    // Banner.
    if (S.banner && S.time < S.banner.until && S.banner.main) {
      H.banner.textContent = S.banner.main;
      H.banner.className = 'show ' + S.banner.cls; H.banner.id = 'banner';
      H.subbanner.textContent = S.banner.sub;
      H.subbanner.className = 'show'; H.subbanner.id = 'subbanner';
    } else { H.banner.className = ''; H.banner.id = 'banner'; H.subbanner.className = ''; H.subbanner.id = 'subbanner'; }
    // Team bar + spectate.
    H.teambar.innerHTML = S.agents.filter((a) => a.team === 'atk' && !a.isPlayer).map((a) =>
      '<div class="' + (a.alive ? '' : 'dead') + '">' + a.name + ' <span class="hp"><i style="width:' + Math.max(0, a.hp) + '%"></i></span> ' + Math.max(0, Math.ceil(a.hp)) + '</div>').join('')
      + '<div style="color:#8fa3b8">Wardens left: ' + aliveOn(S, 'def') + '</div>';
    const view = spectateTarget(S);
    if (!p.alive && S.phase === 'live') {
      H.spectate.className = 'on'; H.spectate.id = 'spectate';
      H.spectate.textContent = 'SPECTATING ' + view.name + ' — death cam';
    } else { H.spectate.className = ''; H.spectate.id = 'spectate'; }
    // Damage feed.
    H.damageFeed.innerHTML = S.damageFeed.filter((d) => S.time - d.at < 1.2).map((d) => '<div>-' + d.text + '</div>').join('');
    // Buy menu + scoreboard visibility.
    H.buy.classList.toggle('hidden', !S.buyOpen);
    if (S.buyOpen) { refreshBuy(); H.buyTimer.textContent = S.phaseTime.toFixed(1); }
    const wantScore = !!S.input.keys['Tab'] || S.scoreOpen;
    H.scoreboard.classList.toggle('hidden', !wantScore);
    if (wantScore && frame % 20 === 0) renderScoreboard();
    H.callout.textContent = zoneAt(p.x, p.z);
    drawMinimap();
    // Soak hook: machine-readable status for headless verification.
    if (frame % 30 === 0) {
      H.soak.textContent = JSON.stringify({
        phase: S.phase, round: S.round, wins: S.wins, soakRounds: S.soak.rounds,
        aliveAtk: aliveOn(S, 'atk'), aliveDef: aliveOn(S, 'def'),
        bomb: S.bomb.state, time: Math.round(S.time),
      });
    }
  }
  return { update, refreshBuy, renderScoreboard };
}
