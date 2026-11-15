// Rendering: three.js meshes driven by sim state, and nothing else. Agent
// bodies are styled primitives (team colours, helmet, rifle), the
// viewmodel gun bobs, kicks and inspects, and tracers/impacts draw from
// fixed pools. No sim logic lives here; sync() only copies state to meshes.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { playerOf } from './state.js';
import { spectateTarget } from './sim.js';
import { eyeHeight } from './movement.js';

const _e = new THREE.Euler();

export function createRenderer(canvas, S) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 300);
  buildWorld(scene, S.seed);
  scene.add(camera);

  // Shared agent parts.
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.62, 0.3);
  const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.22);
  const headGeo = new THREE.SphereGeometry(0.21, 14, 12);
  const helmetGeo = new THREE.SphereGeometry(0.24, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const gunGeo = new THREE.BoxGeometry(0.09, 0.12, 0.72);
  const armGeo = new THREE.BoxGeometry(0.13, 0.5, 0.13);
  const mats = {
    atk: new THREE.MeshStandardMaterial({ color: 0xb5772a, roughness: 0.8 }),
    def: new THREE.MeshStandardMaterial({ color: 0x3d6f8f, roughness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.85 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc9a17e, roughness: 0.7 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.5, metalness: 0.6 }),
  };
  const bodies = [];
  // Bodies are built lazily on the first sync after agents exist, because
  // createRenderer runs before startMatch populates S.agents.
  function ensureBodies() {
    if (bodies.length > 0 || S.agents.length === 0) return;
    for (const a of S.agents) {
    const g = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, a.team === 'atk' ? mats.atk : mats.def);
    torso.position.y = 1.12; torso.castShadow = true; g.add(torso);
    const head = new THREE.Mesh(headGeo, mats.skin);
    head.position.y = 1.62; head.castShadow = true; g.add(head);
    const helmet = new THREE.Mesh(helmetGeo, mats.dark);
    helmet.position.y = 1.64; g.add(helmet);
    const legL = new THREE.Mesh(legGeo, mats.dark); legL.position.set(-0.14, 0.36, 0); g.add(legL);
    const legR = new THREE.Mesh(legGeo, mats.dark); legR.position.set(0.14, 0.36, 0); g.add(legR);
    const armL = new THREE.Mesh(armGeo, torso.material); armL.position.set(-0.33, 1.14, 0.1); armL.rotation.x = -0.9; g.add(armL);
    const armR = new THREE.Mesh(armGeo, torso.material); armR.position.set(0.33, 1.14, 0.1); armR.rotation.x = -0.9; g.add(armR);
    const gun = new THREE.Mesh(gunGeo, mats.gun); gun.position.set(0.18, 1.28, 0.42); g.add(gun);
    g.visible = false;
    scene.add(g);
    bodies.push({ group: g, legL, legR, gun, walkPhase: 0, deadTilt: 0 });
    }
  }

  // Viewmodel gun: body, barrel, magazine, sight; per-weapon tint/length.
  // Slightly emissive so it reads against the dark yard.
  const vmGunMat = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.5, metalness: 0.5, emissive: 0x14181c });
  const vmAccentMat = new THREE.MeshStandardMaterial({ color: 0x8a6b3a, roughness: 0.7, emissive: 0x1a1206 });
  const vm = new THREE.Group();
  const vmBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.55), vmGunMat);
  const vmBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.32, 8), vmGunMat);
  vmBarrel.rotation.x = Math.PI / 2; vmBarrel.position.set(0, 0.02, 0.4);
  const vmMag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.11), vmAccentMat);
  vmMag.position.set(0, -0.13, 0.05); vmMag.rotation.x = 0.15;
  const vmSight = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.055, 0.07), vmGunMat);
  vmSight.position.set(0, 0.085, 0.12);
  const vmGrip = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.14, 0.1), vmAccentMat);
  vmGrip.position.set(0, -0.11, -0.17); vmGrip.rotation.x = 0.3;
  vm.add(vmBody, vmBarrel, vmMag, vmSight, vmGrip);
  const flashSprite = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  flashSprite.position.set(0, 0.02, 0.56);
  vm.add(flashSprite);
  vm.position.set(0.24, -0.22, -0.45);
  camera.add(vm);
  const muzzleLight = new THREE.PointLight(0xffc07a, 0, 9, 2);
  muzzleLight.position.set(0.3, -0.1, -1.2);
  camera.add(muzzleLight);

  // Tracer pool: lines with a fading basic material each.
  const tracerPool = [];
  for (let i = 0; i < 48; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
    line.frustumCulled = false; line.visible = false;
    scene.add(line); tracerPool.push(line);
  }
  // Impact pool: small tetra sparks / puffs.
  const impactPool = [];
  const impactGeo = new THREE.TetrahedronGeometry(0.09);
  const impactMats = [0xcfc8b8, 0xc23a2e, 0xff5040, 0xff8a3a, 0xffffff].map(
    (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true }));
  for (let i = 0; i < 64; i++) {
    const m = new THREE.Mesh(impactGeo, impactMats[0]);
    m.visible = false; scene.add(m); impactPool.push(m);
  }
  // Bomb mesh: dark case, blinking lamp.
  const bombGroup = new THREE.Group();
  const bombCase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.3), mats.gun);
  bombCase.position.y = 0.13; bombGroup.add(bombCase);
  const bombLamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
  bombLamp.position.set(0.12, 0.3, 0); bombGroup.add(bombLamp);
  bombGroup.visible = false; scene.add(bombGroup);
  // Grenade meshes (pooled with projectiles).
  const nadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const nadeMat = new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.6 });
  const nadeMeshes = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(nadeGeo, nadeMat);
    m.visible = false; scene.add(m); nadeMeshes.push(m);
  }

  let bobPhase = 0, kick = 0, fov = 75;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function sync(dt, paused) {
    const me = S.agents.length ? playerOf(S) : null;
    const view = S.agents.length ? spectateTarget(S) : null;
    // Camera: eye of the viewed agent, or a high overview in the menu.
    if (S.phase === 'menu' || !view) {
      const t = S.time * 0.05;
      camera.position.set(Math.sin(t) * 20, 14, Math.cos(t) * 16);
      camera.lookAt(0, 0, 0);
      camera.fov = 60; camera.updateProjectionMatrix();
      vm.visible = false;
      if (!paused) renderer.render(scene, camera);
      return;
    }
      const eye = view.y + eyeHeight(view);
      camera.position.set(view.x, eye, view.z);
      _e.set(view.pitch, view.yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(_e);
      const wantFov = view.scopeOn ? 29 : 75;
      fov += (wantFov - fov) * Math.min(1, dt * 14);
      if (Math.abs(fov - camera.fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    ensureBodies();
    // Agent bodies.
    for (let i = 0; i < S.agents.length; i++) {
      const a = S.agents[i], b = bodies[i];
      if (a.isPlayer && a.alive && S.phase !== 'menu') { b.group.visible = false; continue; }
      b.group.visible = true;
      b.group.position.set(a.x, a.y, a.z);
      if (a.alive) {
        b.deadTilt = 0;
        b.group.rotation.set(0, a.yaw, 0);
        b.group.scale.y = a.crouched ? 0.78 : 1;
        b.walkPhase += a.moving * dt * 2.2;
        const swing = Math.min(0.55, a.moving * 0.09) * Math.sin(b.walkPhase);
        b.legL.rotation.x = swing; b.legR.rotation.x = -swing;
      } else {
        // Fall over once and stay down.
        b.deadTilt = Math.min(Math.PI / 2, b.deadTilt + dt * 4);
        b.group.rotation.set(-b.deadTilt, a.yaw, 0);
        b.group.position.y = a.y + 0.15 * Math.sin(b.deadTilt);
      }
    }
    // Viewmodel: bob, kick, reload dip, inspect spin.
    const vmVisible = me.alive && S.phase !== 'menu' && !me.scopeOn;
    vm.visible = vmVisible;
    if (vmVisible) {
      bobPhase += me.moving * dt * 1.6;
      const bob = Math.min(0.02, me.moving * 0.003);
      const sinceShot = S.time - me.lastShot;
      kick = Math.max(0, kick - dt * 3);
      if (sinceShot < 0.06) kick = Math.min(0.06, kick + 0.03);
      let dip = 0;
      if (me.reloading > 0) dip = 0.18;
      vm.position.set(0.24 + Math.sin(bobPhase) * bob, -0.22 + Math.abs(Math.cos(bobPhase)) * bob - dip, -0.45 + kick);
      vm.rotation.x = kick * 2.2;
      if (S.time < me.inspectUntil) {
        const t = (me.inspectUntil - S.time) / 1.2;
        vm.rotation.y = Math.sin(t * Math.PI) * 1.1;
        vm.rotation.z = Math.sin(t * Math.PI) * 0.3;
      } else { vm.rotation.y = 0; vm.rotation.z = 0; }
      const scale = { p9: 0.65, kestrel: 0.8, breacher: 0.9, vk7: 0.85, longbow: 1.05 }[me.weapon] || 1;
      vm.scale.setScalar(scale);
      flashSprite.material.opacity = sinceShot < 0.05 ? 0.9 : 0;
      flashSprite.rotation.z = S.time * 40; // visual only: never draws sim RNG
      muzzleLight.intensity = sinceShot < 0.05 ? 6 : 0;
    } else {
      flashSprite.material.opacity = 0; muzzleLight.intensity = 0;
    }
    // Tracers + impacts: copy pool state, decay visually.
    for (let i = 0; i < S.tracers.length; i++) {
      const t = S.tracers[i], line = tracerPool[i];
      if (!t.active) { line.visible = false; continue; }
      t.life -= dt;
      if (t.life <= 0) { t.active = false; line.visible = false; continue; }
      const pos = line.geometry.attributes.position;
      pos.setXYZ(0, t.x0, t.y0, t.z0); pos.setXYZ(1, t.x1, t.y1, t.z1);
      pos.needsUpdate = true;
      line.material.color.setHex(t.color);
      line.material.opacity = Math.min(1, t.life / 0.06);
      line.visible = true;
    }
    for (let i = 0; i < S.impacts.length; i++) {
      const p = S.impacts[i], m = impactPool[i];
      if (!p.active) { m.visible = false; continue; }
      p.life -= dt;
      if (p.life <= 0) { p.active = false; m.visible = false; continue; }
      m.visible = true;
      m.position.set(p.x, p.y, p.z);
      m.material = impactMats[p.kind] || impactMats[0];
      m.material.opacity = Math.min(1, p.life / 0.35);
      const s = p.kind === 3 ? 2.2 : p.kind === 4 ? 3 : 1;
      m.scale.setScalar(s * (0.6 + p.life));
      m.rotation.x += dt * 6; m.rotation.y += dt * 4;
    }
    // Bomb + grenades.
    const bomb = S.bomb;
    bombGroup.visible = bomb.state === 'dropped' || bomb.state === 'planted';
    if (bombGroup.visible) {
      bombGroup.position.set(bomb.x, bomb.y, bomb.z);
      const blink = bomb.state === 'planted' ? (Math.sin(S.time * (bomb.timer < 10 ? 18 : 7)) > 0 ? 1 : 0.15) : 0.6;
      bombLamp.material.color.setRGB(1, 0.15 * blink, 0.1 * blink);
    }
    for (let i = 0; i < S.projectiles.length; i++) {
      const pr = S.projectiles[i];
      nadeMeshes[i].visible = pr.active;
      if (pr.active) nadeMeshes[i].position.set(pr.x, pr.y, pr.z);
    }
    if (!paused) renderer.render(scene, camera);
  }
  return { renderer, scene, camera, sync, resize };
}
