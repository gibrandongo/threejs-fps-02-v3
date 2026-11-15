// Amberline: three.js tactical FPS — submission program.
//
// Copies game/ and screenshots/ from this repository into the output
// directory and writes dossier.json with the kit library. Plain JavaScript
// syntax only (no TypeScript-only constructs) so it passes `node --check`
// on Node 22 and Node 24 alike.
//
// Grader safety: the output directory itself is NEVER removed. The grader
// runs as uid 65534 with a read-only parent of /output, so removing the
// directory itself fails with EACCES. Order of operations:
//   1. build the dossier bytes FIRST, in memory, from the repository,
//   2. create the output directory (recursive mkdir),
//   3. clear ONLY the directory's CONTENTS, child by child,
//   4. copy game/ and screenshots/ in, then write dossier.json.
// Both grader runs read the same read-only repository, so both runs write
// byte-identical output.
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// 1. Dossier first, from the repository's own game/ + screenshots/.
const dossierBytes = buildDossier(repoRoot, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
});

// 2. Create the output directory; never remove it.
mkdirSync(outputDir, { recursive: true });

// 3. Clear only the contents, one child at a time.
for (const child of readdirSync(outputDir)) {
  rmSync(join(outputDir, child), { recursive: true, force: true });
}

// 4. Copy the game and the screenshots, then write the dossier.
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
writeFileSync(join(outputDir, 'dossier.json'), dossierBytes);
