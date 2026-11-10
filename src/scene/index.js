import * as THREE from 'three';
import { loadTerrain, buildTerrainGeometry, makeTerrainMaterial, makeShadowBaker } from './terrain.js';
import { makeWater } from './water.js';
import { makeSky } from './sky.js';
import { makeTrees } from './trees.js';
import { makePrecip } from './precip.js';
import { makeUniforms, computeLook, applyLook } from './look.js';
import { makeJourney } from './journey.js';

const TIERS = {
  high: { dpr: 2, pixels: 3.2e6, stride: 2, trees: 110000, refl: 0.75, reflAA: 4, precip: 4000, aa: true },
  mid: { dpr: 1.5, pixels: 2.2e6, stride: 3, trees: 60000, refl: 0.6, reflAA: 4, precip: 3000, aa: true },
  low: { dpr: 1.5, pixels: 1.1e6, stride: 4, trees: 22000, refl: 0.45, reflAA: 0, precip: 1500, aa: false },
};

export async function createLochScene({ canvas, env, assets, tier, still = false, reducedMotion = false, force = false }) {
  const Q = TIERS[tier] || TIERS.mid;
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: Q.aa, alpha: false, stencil: false, powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: !force,
  });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // the shaders do their own tone curve
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x05080c, 1);

  const meta = assets.meta;
  const T = await loadTerrain(assets.heightUrl, assets.waterUrl, meta);
  const U = makeUniforms(T.size, T.level);
  const baker = makeShadowBaker(renderer, T);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 1.5, 42000);
  camera.layers.enable(1);

  const sky = makeSky(U);
  scene.add(sky);

  const terrain = new THREE.Mesh(buildTerrainGeometry(T, Q.stride), makeTerrainMaterial(U, T, baker.texture));
  terrain.frustumCulled = false;
  terrain.matrixAutoUpdate = false;
  scene.add(terrain);

  const water = makeWater(renderer, U, T, baker.texture, Q.refl, Q.reflAA);
  water.renderOrder = -5;
  scene.add(water);

  const trees = makeTrees(U, T, baker.texture, Q.trees, meta.centreline);
  scene.add(trees);

  const precip = makePrecip(U, Q.precip);
  scene.add(precip);

  const journey = makeJourney(meta, T);

  // ----- state -----
  let look = computeLook(env.state);
  applyLook(U, look, 1);
  baker.update(U.uKeyDir.value);
  let lookDirty = false;
  const pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 40, shift: 0, u: 0, progress: 0, name: 'hero' };
  const cur = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 40, shift: 0 };
  let first = true, time = still ? 40 : 0, pointerX = 0, pointerY = 0, px = 0, py = 0;
  let width = 1, height = 1, dpr = 1, dprCap = 1, wide = false;
  let frameAvg = 16, slowFor = 0, fastFor = 0, frames = 0;
  const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), right = new THREE.Vector3();
  const caster = new THREE.Raycaster(), ndc = new THREE.Vector2();

  // touch the water: find where the pointer's ray meets the loch and start a ring there
  const touch = (nx, ny, strength = 1, age = 0) => {
    ndc.set(nx * 2, -ny * 2);
    caster.setFromCamera(ndc, camera);
    const o = caster.ray.origin, d = caster.ray.direction;
    if (d.y > -1e-3) return false;
    const t = (T.level - o.y) / d.y;
    if (t < 2 || t > 1400) return false;
    const x = o.x + d.x * t, z = o.z + d.z * t;
    if (T.shoreAt(x, z) < 2) return false;
    water.touch(x, z, time - age, Math.max(0.35, t * 0.011) * strength);
    return true;
  };

  const applySize = () => {
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    water.setReflectionSize(width * dpr, height * dpr);
    precip.setHeight(height * dpr);
  };
  const resize = () => {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    if (!first && w === width && h === height) { journey.measure(); return; }
    width = w; height = h;
    dprCap = Math.min(window.devicePixelRatio || 1, Q.dpr, Math.sqrt(Q.pixels / (width * height)));
    dprCap = Math.max(0.6, dprCap);
    dpr = first ? dprCap : Math.min(dpr, dprCap);
    wide = width >= 900;
    camera.aspect = width / height;
    applySize();
    journey.measure();
  };

  const setLook = () => { look = computeLook(env.state); lookDirty = true; return look; };

  const frame = (dt) => {
    dt = Math.min(dt, 0.1);
    if (!still && !reducedMotion) time += dt;
    U.uTime.value = time;

    if (lookDirty || first) {
      const k = first || still ? 1 : 1 - Math.exp(-dt * 1.6);
      applyLook(U, look, k);
      const settled = k >= 1 || U.uKeyDir.value.dot(look.keyDir) > 0.999999;
      if (settled) { applyLook(U, look, 1); lookDirty = false; }
      baker.update(U.uKeyDir.value, settled);
    }

    journey.target(reducedMotion ? 0 : window.scrollY, window.innerHeight, pose);
    const k = first || still ? 1 : 1 - Math.exp(-dt * 2.4);
    cur.pos.lerp(pose.pos, k);
    cur.quat.slerp(pose.quat, k);
    cur.fov += (pose.fov - cur.fov) * k;
    cur.shift += (pose.shift - cur.shift) * k;

    camera.position.copy(cur.pos);
    camera.quaternion.copy(cur.quat);
    if (!still && !reducedMotion) {
      // breathing: a boat's worth of drift, and a glance toward the pointer
      const low = 1 - Math.min(1, Math.max(0, (cur.pos.y - T.level - 30) / 200));
      px += (pointerX - px) * Math.min(1, dt * 2); py += (pointerY - py) * Math.min(1, dt * 2);
      camera.position.y += Math.sin(time * 0.55) * 0.07 * low;
      right.set(1, 0, 0).applyQuaternion(cur.quat);
      camera.position.addScaledVector(right, Math.sin(time * 0.17) * 0.9 * low);
      tmpE.set(-py * 0.02 + Math.sin(time * 0.31) * 0.0025, -px * 0.035, Math.sin(time * 0.23) * 0.0035 * low, 'YXZ');
      camera.quaternion.multiply(tmpQ.setFromEuler(tmpE));
    }
    // narrow screens need a wider lens to hold both shores, and a lower gaze so the water fills the frame
    const portrait = camera.aspect < 1 ? 1 + (1 - camera.aspect) * 0.75 : 1;
    if (camera.aspect < 1) { tmpE.set(-(1 - camera.aspect) * 0.17, 0, 0, 'YXZ'); camera.quaternion.multiply(tmpQ.setFromEuler(tmpE)); }
    camera.fov = cur.fov * portrait;
    const sh = wide ? cur.shift : 0;
    if (sh > 0.002) camera.setViewOffset(width, height, -sh * width, 0, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    precip.update();
    renderer.render(scene, camera);
    first = false; frames++;

    // hold the frame rate by trading resolution
    if (!still && frames > 20) {
      frameAvg += (dt * 1000 - frameAvg) * 0.08;
      if (frameAvg > 25) { slowFor += dt; fastFor = 0; } else if (frameAvg < 18.5) { fastFor += dt; slowFor = 0; } else { slowFor = 0; fastFor = 0; }
      if (trial && performance.now() - trial.at > 2500) {
        // did dropping resolution actually help? if not, the display is simply capped (30 fps power saving): put it back
        if (frameAvg > trial.before * 0.88) { dpr = trial.dpr; capped = true; applySize(); }
        trial = null; slowFor = 0;
      }
      if (!capped && !trial && slowFor > 1.5 && dpr > 0.6) {
        trial = { at: performance.now(), before: frameAvg, dpr };
        dpr = Math.max(0.6, dpr * 0.82); slowFor = 0; applySize();
      }
      if (!trial && fastFor > 5 && dpr < dprCap) { dpr = Math.min(dprCap, dpr * 1.12); fastFor = 0; applySize(); }
    }
    return pose;
  };
  let trial = null, capped = false;
  const resetPacing = () => { frameAvg = 16; slowFor = 0; fastFor = 0; trial = null; };

  resize();
  return {
    frame, resize, setLook, journey, meta, resetPacing,
    get look() { return look; },
    get frames() { return frames; },
    setPointer(x, y) { pointerX = x; pointerY = y; },
    touch,
    info: () => ({ tier, dpr: +dpr.toFixed(2), trees: trees.count, tris: renderer.info.render.triangles, calls: renderer.info.render.calls, frameMs: +frameAvg.toFixed(1) }),
    dispose() { renderer.dispose(); },
  };
}
