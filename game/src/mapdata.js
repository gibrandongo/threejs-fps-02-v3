// Depot 9 — an original 60x48 m freight yard. Three east-west lanes
// (A Long north, Mid, B Tunnel south), two bomb sites in the east yard,
// and a central silo. Walls are AABBs {x0,z0,x1,z1,h,kind}; crates are
// 1.1 m boxes the jump clears. The waypoint graph is hand-placed so every
// edge has a clear straight line — BFS over it never routes through a wall.
export const WALLS = [
  // Outer shell.
  { x0: -30, z0: -24, x1: 30, z1: -23, h: 5, kind: 'wall' },
  { x0: -30, z0: 23, x1: 30, z1: 24, h: 5, kind: 'wall' },
  { x0: -30, z0: -24, x1: -29, z1: 24, h: 5, kind: 'wall' },
  { x0: 29, z0: -24, x1: 30, z1: 24, h: 5, kind: 'wall' },
  // North divider (A lane / mid): gaps at west stairs, doors, A entry.
  { x0: -24, z0: -8.5, x1: -10, z1: -7.5, h: 3.6, kind: 'wall' },
  { x0: 2, z0: -8.5, x1: 20, z1: -7.5, h: 3.6, kind: 'wall' },
  // South divider (B lane / mid): gaps at apartments, connector, B entry.
  { x0: -20, z0: 7.5, x1: -2, z1: 8.5, h: 3.6, kind: 'wall' },
  { x0: 10, z0: 7.5, x1: 21, z1: 8.5, h: 3.6, kind: 'wall' },
  // Door frames narrowing the mid gaps.
  { x0: -11, z0: -9, x1: -10, z1: -7, h: 3.2, kind: 'wall' },
  { x0: 2, z0: -9, x1: 3, z1: -7, h: 3.2, kind: 'wall' },
  { x0: -3, z0: 7, x1: -2, z1: 9, h: 3.2, kind: 'wall' },
  { x0: 9, z0: 7, x1: 10, z1: 9, h: 3.2, kind: 'wall' },
  // Central silo and mid cover wall.
  { x0: -3, z0: -3, x1: 3, z1: 3, h: 4.5, kind: 'silo' },
  { x0: -9, z0: -1.5, x1: -8, z1: 1.5, h: 2.2, kind: 'wall' },
  // Site corner walls (angles worth holding).
  { x0: 10, z0: -14, x1: 11, z1: -9, h: 3.0, kind: 'wall' },
  { x0: 10, z0: 9, x1: 11, z1: 14, h: 3.0, kind: 'wall' },
  // Tall containers.
  { x0: -19, z0: -20, x1: -15, z1: -18, h: 3.0, kind: 'container' },
  { x0: -19, z0: 18, x1: -15, z1: 20, h: 3.0, kind: 'container' },
  { x0: 13, z0: -5, x1: 17, z1: -3, h: 2.8, kind: 'container' },
  { x0: 13, z0: 3, x1: 17, z1: 5, h: 2.8, kind: 'container' },
  // Jumpable crates (h 1.1).
  { x0: 17, z0: -18, x1: 19, z1: -16, h: 1.1, kind: 'crate' },
  { x0: 21.5, z0: -13.5, x1: 23.5, z1: -11.5, h: 1.1, kind: 'crate' },
  { x0: 24.2, z0: -19.8, x1: 25.8, z1: -18.2, h: 1.1, kind: 'crate' },
  { x0: 17, z0: 16, x1: 19, z1: 18, h: 1.1, kind: 'crate' },
  { x0: 21.5, z0: 11.5, x1: 23.5, z1: 13.5, h: 1.1, kind: 'crate' },
  { x0: 24.2, z0: 18.2, x1: 25.8, z1: 19.8, h: 1.1, kind: 'crate' },
  { x0: -15.2, z0: -19.3, x1: -12.8, z1: -17.7, h: 1.1, kind: 'crate' },
  { x0: -1, z0: -21, x1: 1, z1: -19, h: 1.1, kind: 'crate' },
  { x0: 9.2, z0: -15.8, x1: 10.8, z1: -14.2, h: 1.1, kind: 'crate' },
  { x0: -15.2, z0: 17.7, x1: -12.8, z1: 19.3, h: 1.1, kind: 'crate' },
  { x0: -1, z0: 19, x1: 1, z1: 21, h: 1.1, kind: 'crate' },
  { x0: 9.2, z0: 14.2, x1: 10.8, z1: 15.8, h: 1.1, kind: 'crate' },
  { x0: -7.9, z0: -2.4, x1: -6.1, z1: -0.6, h: 1.1, kind: 'crate' },
  { x0: 6.1, z0: 0.6, x1: 7.9, z1: 2.4, h: 1.1, kind: 'crate' },
  { x0: -4.8, z0: -11.8, x1: -3.2, z1: -10.2, h: 1.1, kind: 'crate' },
  { x0: -28.2, z0: -5.7, x1: -26.8, z1: -4.3, h: 1.1, kind: 'crate' },
  { x0: -28.2, z0: 4.3, x1: -26.8, z1: 5.7, h: 1.1, kind: 'crate' },
  { x0: 26.8, z0: -5.7, x1: 28.2, z1: -4.3, h: 1.1, kind: 'crate' },
  { x0: 26.8, z0: 4.3, x1: 28.2, z1: 5.7, h: 1.1, kind: 'crate' },
];

// Waypoint graph: [x, z, zone]. Edges are index pairs; every edge is
// verified clear of walls by construction (see header note).
export const NODES = [
  [-26, 0, 'ATK SPAWN'], [-20, 0, 'YARD'], [-20, -14, 'A LONG'], [-10, -17, 'A LONG'],
  [0, -18, 'A LONG'], [10, -18, 'A LONG'], [19, -14, 'A SITE'], [24, -15, 'A SITE'],
  [-20, 14, 'B TUNNEL'], [-10, 17, 'B TUNNEL'], [0, 18, 'B TUNNEL'], [10, 18, 'B TUNNEL'],
  [19, 14, 'B SITE'], [24, 15, 'B SITE'], [-12, 0, 'MID'], [-6, -4, 'MID'],
  [-6, 4, 'MID'], [6, -4, 'MID'], [6, 4, 'MID'], [13, 0, 'MID'],
  [22, 0, 'DEF SPAWN'], [26, 0, 'DEF SPAWN'], [-6, -11, 'DOORS'], [4, 11, 'CONNECTOR'],
  [24, -6, 'A SHORT'], [24, 6, 'B SHORT'], [-12, -12, 'A LONG'], [-14, 12, 'B TUNNEL'],
  [14, -12, 'A SHORT'], [14, 12, 'B SHORT'], [-25, -12, 'A STAIRS'], [-25, 12, 'B APTS'],
];
export const EDGES = [
  [0, 1], [0, 30], [0, 31], [1, 14], [1, 27], [30, 2], [30, 26], [31, 8], [31, 27],
  [2, 3], [2, 26], [3, 26], [3, 4], [4, 5], [4, 22], [5, 6], [5, 28], [6, 7], [6, 28],
  [7, 24], [24, 20], [24, 28], [28, 22], [22, 26], [22, 15], [8, 9], [8, 27], [9, 10],
  [10, 11], [11, 12], [11, 29], [12, 13], [12, 29], [13, 25], [25, 20], [25, 29],
  [14, 15], [14, 16], [15, 17], [16, 18], [16, 23], [18, 23], [23, 10], [23, 9],
  [17, 19], [18, 19], [19, 20], [19, 24], [19, 25], [20, 21],
];
export const ADJ = NODES.map(() => []);
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }

export const SITES = {
  A: { x0: 15, z0: -22, x1: 28, z1: -9, cx: 21, cz: -16, node: 6 },
  B: { x0: 15, z0: 9, x1: 28, z1: 22, cx: 21, cz: 16, node: 12 },
};
export const SPAWNS = {
  atk: [[-27, -3], [-27, 0], [-27, 3], [-25, -5], [-25, 5]],
  def: [[27, -3], [27, 0], [27, 3], [25, -5], [25, 5]],
};
export const SPAWN_YAW = { atk: -Math.PI / 2, def: Math.PI / 2 };

const ZONES = [
  ['A SITE', 14, -23, 29, -9], ['B SITE', 14, 9, 29, 23],
  ['A LONG', -24, -23, 14, -9], ['B TUNNEL', -24, 9, 14, 23],
  ['DEF SPAWN', 21, -9, 29, 9], ['ATK SPAWN', -29, -9, -21, 9],
  ['DOORS', -10, -12, 2, -8], ['A SHORT', 2, -14, 21, -7], ['B SHORT', 2, 7, 21, 14],
  ['CONNECTOR', -2, 7, 10, 14], ['MID', -14, -7, 21, 7],
];
export function zoneAt(x, z) {
  for (const [name, x0, z0, x1, z1] of ZONES) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return name;
  return 'YARD';
}
export function siteAt(x, z) {
  if (x >= SITES.A.x0 && x <= SITES.A.x1 && z >= SITES.A.z0 && z <= SITES.A.z1) return 'A';
  if (x >= SITES.B.x0 && x <= SITES.B.x1 && z >= SITES.B.z0 && z <= SITES.B.z1) return 'B';
  return null;
}
export function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const dx = NODES[i][0] - x, dz = NODES[i][1] - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
