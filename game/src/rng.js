// Seeded RNG: every bot decision, plan pick, spawn pick and map-dressing
// roll draws from one stream, so a match seeded the same way plays the
// same way. mulberry32: small, fast, and deterministic across engines.
export function makeRng(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(min, max) { return min + this.next() * (max - min); },
    int(min, max) { return Math.floor(this.range(min, max + 1)); },
    pick(list) { return list[Math.floor(this.next() * list.length)]; },
    chance(p) { return this.next() < p; },
    // Fisher-Yates on a caller-owned array; returns the same array.
    shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        const t = list[i]; list[i] = list[j]; list[j] = t;
      }
      return list;
    },
  };
}

// Stable hash of a short string into a 32-bit seed (map dressing, bot names).
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
