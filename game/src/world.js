// The visible depot: procedural canvas textures (no image assets), dusk
// lighting, a gradient sky dome, painted site markers, and seeded dressing
// (barrels, lamps, banners). Geometry is built once from mapdata WALLS;
// shared geometries and materials keep draw calls low.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { WALLS, SITES } from './mapdata.js';
import { hashSeed, makeRng } from './rng.js';

function canvasTex(size, draw, repeatX, repeatY) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX || 1, repeatY || 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(g, size, rng, base, spots, n) {
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) {
    g.fillStyle = spots[i % spots.length];
    g.globalAlpha = 0.08 + rng.next() * 0.12;
    const s = 2 + rng.next() * 8;
    g.fillRect(rng.next() * size, rng.next() * size, s, s);
  }
  g.globalAlpha = 1;
}

export function buildWorld(scene, seed) {
  const rng = makeRng(hashSeed('depot9-' + seed));
  scene.fog = new THREE.Fog(PALETTE.fog, 45, 110);

  // Sky dome: dusk gradient with a low sun glow in the east.
  const skyTex = canvasTex(512, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#1c2736'); grad.addColorStop(0.55, '#3a4a5e');
    grad.addColorStop(0.78, '#b0723a'); grad.addColorStop(1, '#e8a04c');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(255,230,180,0.9)';
    g.beginPath(); g.arc(s * 0.72, s * 0.72, 26, 0, 7); g.fill();
    for (let i = 0; i < 90; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (0.2 + rng.next() * 0.5) + ')';
      g.fillRect(rng.next() * s, rng.next() * s * 0.4, 2, 2);
    }
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(160, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  // Lights: low amber sun + cool sky fill + site lamps.
  const hemi = new THREE.HemisphereLight(0x8fa8c8, 0x4a4038, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc07a, 1.6);
  sun.position.set(40, 34, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -38; sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38; sun.shadow.camera.bottom = -38;
  sun.shadow.camera.far = 120;
  scene.add(sun);
  for (const [cx, cz, color] of [[21, -16, PALETTE.siteA], [21, 16, PALETTE.siteB], [-26, 0, 0xffd9a0]]) {
    const lamp = new THREE.PointLight(color, 18, 22, 1.8);
    lamp.position.set(cx, 4.2, cz);
    scene.add(lamp);
  }

  // Procedural textures.
  const groundTex = canvasTex(256, (g, s) => {
    speckle(g, s, rng, '#4a4640', ['#555049', '#3f3b35', '#5d574e'], 900);
    g.strokeStyle = 'rgba(200,190,170,0.25)'; g.lineWidth = 2;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(0, rng.next() * s); g.lineTo(s, rng.next() * s); g.stroke(); }
  }, 12, 10);
  const wallTex = canvasTex(256, (g, s) => {
    speckle(g, s, rng, '#6b6259', ['#7a7166', '#5c534a', '#847a6d'], 700);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    g.strokeRect(4, 4, s - 8, s - 8);
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
  }, 2, 1);
  const crateTex = canvasTex(128, (g, s) => {
    speckle(g, s, rng, '#8a6b3a', ['#96774a', '#7a5c31', '#a5854f'], 260);
    g.strokeStyle = 'rgba(40,25,8,0.8)'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s);
    g.lineWidth = 3; g.stroke();
  });
  const metalTex = canvasTex(128, (g, s) => {
    speckle(g, s, rng, '#7d8590', ['#8b939e', '#6d757f', '#99a2ac'], 300);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < s; x += 32) g.fillRect(x, 0, 3, s);
  }, 2, 2);
  const hazardTex = canvasTex(128, (g, s) => {
    g.fillStyle = '#c9a227'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#1c1c1c';
    for (let i = -s; i < s * 2; i += 32) {
      g.beginPath(); g.moveTo(i, s); g.lineTo(i + 16, 0); g.lineTo(i + 32, 0); g.lineTo(i + 16, s); g.fill();
    }
  }, 4, 1);

  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85 });
  const crateBlueMat = new THREE.MeshStandardMaterial({ map: crateTex, color: 0x7fa8c8, roughness: 0.85 });
  const metalMat = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.6, metalness: 0.5 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.8 });

  // Ground + yard markings.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(62, 50), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Walls / crates / containers / silo from map data.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const mats = { wall: wallMat, crate: crateMat, container: metalMat, silo: wallMat };
  const meshes = [];
  for (const w of WALLS) {
    const m = new THREE.Mesh(boxGeo, mats[w.kind] || wallMat);
    m.scale.set(w.x1 - w.x0, w.h, w.z1 - w.z0);
    m.position.set((w.x0 + w.x1) / 2, w.h / 2, (w.z0 + w.z1) / 2);
    m.castShadow = w.h > 1.2; m.receiveShadow = true;
    if (w.kind === 'crate' && rng.chance(0.3)) m.material = crateBlueMat;
    scene.add(m); meshes.push(m);
    // Hazard strip on tall container ends.
    if (w.kind === 'container') {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w.x1 - w.x0 + 0.06, 0.3, w.z1 - w.z0 + 0.06), hazardMat);
      strip.position.set(m.position.x, w.h - 0.2, m.position.z);
      scene.add(strip);
    }
  }
  // Silo cap + ladder hint.
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.8, 12), metalMat);
  cap.position.set(0, 4.9, 0); cap.castShadow = true; scene.add(cap);

  // Painted site markers: letter + ring decals on the ground.
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const color = key === 'A' ? '#ffb340' : '#57b6e6';
    const tex = canvasTex(256, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.strokeStyle = color; g.lineWidth = 10;
      g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 14, 0, 7); g.stroke();
      g.fillStyle = color; g.font = 'bold 150px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(key, s / 2, s / 2 + 8);
    });
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(site.cx, 0.03, site.cz);
    scene.add(decal);
    // Beacon pole with a glowing head.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.4, 8), metalMat);
    pole.position.set(site.cx + 4.5, 2.2, site.cz + 4.2); pole.castShadow = true; scene.add(pole);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 10),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? PALETTE.siteA : PALETTE.siteB })
    );
    head.position.set(site.cx + 4.5, 4.6, site.cz + 4.2); scene.add(head);
  }

  // Dressing: barrels along walls, lamp posts, banners. Seeded, fixed.
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 12);
  const barrelMats = [new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0x3d5a74, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0x6b6b3a, roughness: 0.7 })];
  const barrelSpots = [[-28, -20], [-27, -21], [28, -21], [-28, 20], [27, 21], [-12, -21], [8, 21], [-8, -21], [27, -8], [-27, 8]];
  for (const [bx, bz] of barrelSpots) {
    const b = new THREE.Mesh(barrelGeo, barrelMats[Math.floor(rng.next() * 3)]);
    b.position.set(bx + rng.range(-0.4, 0.4), 0.53, bz + rng.range(-0.4, 0.4));
    b.castShadow = true; scene.add(b);
  }
  // Banners with the depot name on the divider walls.
  const bannerTex = canvasTex(256, (g, s) => {
    g.fillStyle = '#20262e'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#ffb340'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
    g.fillText('AMBERLINE', s / 2, s / 2 - 8);
    g.fillStyle = '#8fa3b8'; g.font = '20px sans-serif';
    g.fillText('FREIGHT · DEPOT 9', s / 2, s / 2 + 26);
  });
  const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex });
  for (const [bx, bz, ry] of [[-17, -7.4, 0], [11, -7.4, 0], [-11, 8.6, Math.PI], [15, 8.6, Math.PI]]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.2), bannerMat);
    banner.position.set(bx, 2.1, bz); banner.rotation.y = ry; scene.add(banner);
  }
  return { meshes };
}
