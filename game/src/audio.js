// Synthesized sound: every effect is built from oscillators and filtered
// noise in WebAudio — no audio files, no network. Positional sounds lose
// volume with distance and pan left/right of the player's view. The sim
// queues {name,x,z,vol} into S.sounds; drain() plays them once per frame.
let ctx = null, master = null, noiseBuf = null;

export function ensureAudio(volume) {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 0.5;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  } catch (e) { return false; }
}
export function setVolume(v) { if (master) master.gain.value = v; }

function outFor(x, z, px, pz, yaw, vol) {
  // Distance attenuation + stereo pan relative to facing.
  const dx = x - px, dz = z - pz;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const att = vol / (1 + dist * 0.09);
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = -fz, rz = fx;
  const pan = Math.max(-0.9, Math.min(0.9, (dx * rx + dz * rz) / Math.max(1, dist)));
  const g = ctx.createGain(); g.gain.value = Math.min(1, att);
  let node = g;
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
  node.connect(master);
  return { gain: g, dist };
}
function noise(dur, filterFreq, type, peak, dest, when) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(when); src.stop(when + dur + 0.05);
}
function tone(freq, dur, peak, type, dest, when, slideTo) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, when);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  o.connect(g); g.connect(dest); o.start(when); o.stop(when + dur + 0.05);
}

function playOne(name, dest, when) {
  switch (name) {
    case 'shot_rifle': noise(0.13, 1800, 'lowpass', 0.9, dest, when); tone(160, 0.09, 0.5, 'square', dest, when, 60); break;
    case 'shot_smg': noise(0.09, 2200, 'lowpass', 0.7, dest, when); tone(200, 0.06, 0.4, 'square', dest, when, 80); break;
    case 'shot_pistol': noise(0.1, 1600, 'lowpass', 0.75, dest, when); tone(140, 0.08, 0.45, 'square', dest, when, 55); break;
    case 'shot_shotgun': noise(0.28, 900, 'lowpass', 1.0, dest, when); tone(110, 0.2, 0.6, 'sawtooth', dest, when, 40); break;
    case 'shot_sniper': noise(0.32, 2600, 'lowpass', 1.0, dest, when); tone(90, 0.25, 0.55, 'sawtooth', dest, when, 35); break;
    case 'dry': tone(1200, 0.04, 0.25, 'square', dest, when); break;
    case 'reload': tone(500, 0.05, 0.3, 'square', dest, when); tone(340, 0.05, 0.3, 'square', dest, when + 0.18); tone(640, 0.06, 0.35, 'square', dest, when + 0.42); break;
    case 'step': noise(0.06, 500, 'lowpass', 0.32, dest, when); break;
    case 'jump': noise(0.07, 400, 'lowpass', 0.25, dest, when); break;
    case 'land': noise(0.09, 350, 'lowpass', 0.4, dest, when); break;
    case 'hit': tone(1900, 0.05, 0.35, 'sine', dest, when); break;
    case 'kill': tone(880, 0.09, 0.4, 'sine', dest, when); tone(1320, 0.12, 0.4, 'sine', dest, when + 0.07); break;
    case 'hurt': tone(220, 0.12, 0.4, 'sawtooth', dest, when, 90); break;
    case 'beep': tone(1350, 0.07, 0.5, 'sine', dest, when); break;
    case 'beep_fast': tone(1550, 0.05, 0.55, 'sine', dest, when); break;
    case 'plant': tone(700, 0.1, 0.4, 'square', dest, when); tone(1050, 0.14, 0.4, 'square', dest, when + 0.12); break;
    case 'defuse': tone(950, 0.08, 0.35, 'sine', dest, when); tone(950, 0.08, 0.35, 'sine', dest, when + 0.2); break;
    case 'explode': noise(1.1, 300, 'lowpass', 1.0, dest, when); tone(70, 0.9, 0.8, 'sine', dest, when, 28); break;
    case 'bounce': tone(300, 0.05, 0.3, 'square', dest, when, 180); break;
    case 'flashpop': noise(0.4, 3500, 'highpass', 0.9, dest, when); tone(2400, 0.3, 0.3, 'sine', dest, when); break;
    case 'buy': tone(660, 0.07, 0.3, 'sine', dest, when); tone(990, 0.09, 0.3, 'sine', dest, when + 0.08); break;
    case 'deny': tone(180, 0.15, 0.35, 'square', dest, when); break;
    case 'round_win': tone(523, 0.14, 0.35, 'sine', dest, when); tone(659, 0.14, 0.35, 'sine', dest, when + 0.13); tone(784, 0.22, 0.4, 'sine', dest, when + 0.26); break;
    case 'round_lose': tone(392, 0.16, 0.35, 'sine', dest, when); tone(330, 0.16, 0.35, 'sine', dest, when + 0.15); tone(262, 0.26, 0.4, 'sine', dest, when + 0.3); break;
    case 'scope': tone(900, 0.05, 0.2, 'sine', dest, when, 500); break;
    case 'inspect': tone(440, 0.05, 0.2, 'square', dest, when); tone(520, 0.05, 0.2, 'square', dest, when + 0.15); break;
    case 'pickup': tone(760, 0.08, 0.35, 'sine', dest, when); break;
    default: break;
  }
}

export function playSound(S, name, x, z, vol) {
  if (!ctx) return;
  const p = S.agents[0];
  const when = ctx.currentTime;
  if (x === undefined) { playOne(name, master, when); return; }
  const o = outFor(x, z, p.x, p.z, p.yaw, vol === undefined ? 1 : vol);
  playOne(name, o.gain, when);
}

export function drainSounds(S) {
  if (!ctx || S.sounds.length === 0) return;
  for (const s of S.sounds) playSound(S, s.name, s.x, s.z, s.vol);
  S.sounds.length = 0;
}

export function queueSound(S, name, x, z, vol) {
  if (S.sounds.length < 40) S.sounds.push({ name, x, z, vol: vol === undefined ? 1 : vol });
}
