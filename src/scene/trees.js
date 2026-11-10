import * as THREE from 'three';
import { COMMON } from './glsl.js';

const VERT = /* glsl */ `
attribute vec2 aSeed;      // x: colour tint, y: which silhouette
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
varying float vTint;
void main(){
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  // a rounded pseudo-normal: outward from the trunk, tilted up
  vN = normalize(mat3(instanceMatrix) * vec3(position.x, 0.0, position.z) + vec3(0.0, 0.45, 0.0));
  vUv = vec2((uv.x + floor(aSeed.y * 2.0)) * 0.5, uv.y);
  vTint = aSeed.x;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
${COMMON}
uniform sampler2D tShadow;
uniform sampler2D tTree;
uniform vec3 uColTree;
uniform vec3 uColTreeB;
uniform vec3 uColSnow;
uniform float uSnowLine;
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
varying float vTint;
void main(){
  vec4 tex = texture2D(tTree, vUv);
  float dist = length(vWorld - cameraPosition);
  // hold the canopy together as the texture shrinks with distance
  float a = tex.a * (1.0 + smoothstep(120.0, 2200.0, dist) * 1.6);
  // crisp, anti-aliased cut-out edge
  float cover = clamp((a - 0.45) / max(fwidth(a), 1e-4) + 0.5, 0.0, 1.0);
  // far forest must read as a solid mass, so the soft edge is for near trees only
  cover = mix(cover, step(0.45, a), smoothstep(90.0, 320.0, dist));
  if (cover < 0.04) discard;

  vec2 uvm = vWorld.xz / uSize + 0.5;
  vec3 N = normalize(vN);
  float larch = step(0.9, vTint);
  vec3 alb = mix(uColTree * (0.75 + 0.5 * vTint), uColTreeB, larch) * (0.35 + 1.0 * tex.r);
  float snow = smoothstep(uSnowLine - 60.0, uSnowLine + 60.0, vWorld.y) * tex.r;
  alb = mix(alb, uColSnow, snow * 0.3);
  float sh = texture2D(tShadow, uvm).r * cloudShadow(vWorld);
  float ndl = dot(N, uKeyDir);
  vec3 direct = uKeyColor * max(ndl * 0.55 + 0.45, 0.0) * sh;
  vec3 amb = mix(uAmbGround, uAmbSky, 0.25 + 0.75 * vUv.y);
  vec3 col = alb * (direct + amb);
  col = applyAtmosphere(col, vWorld);
  gl_FragColor = vec4(finalize(col), uReflPass > 0.5 ? 1.0 : cover);
}`;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Two conifer silhouettes drawn once into a texture: a dense spruce and a looser, gappier tree.
function coniferTexture() {
  const W = 384, H = 768;
  const c = document.createElement('canvas');
  c.width = W * 2; c.height = H;
  const ctx = c.getContext('2d');
  const rand = mulberry(7);
  for (let v = 0; v < 2; v++) {
    const ox = v * W, cx = ox + W / 2;
    const tiers = v === 0 ? 30 : 20;
    const spread = v === 0 ? 0.4 : 0.46;
    // trunk
    ctx.fillStyle = 'rgb(60,60,60)';
    ctx.fillRect(cx - W * 0.014, H * 0.2, W * 0.028, H * 0.8);
    for (let i = tiers - 1; i >= 0; i--) {
      const t = i / (tiers - 1);                       // 0 at the tip .. 1 at the skirt
      const y = H * (0.035 + t * 0.86);
      const droop = H * 0.03 * (0.5 + t * 1.1);
      for (const dir of [-1, 1]) {
        const half = W * spread * Math.pow(t, 0.8) * (0.7 + rand() * 0.45) + W * 0.016;
        if (v === 1 && rand() < 0.16) continue;         // gaps in the looser tree
        const shade = Math.round(96 + (1 - t) * 60 + rand() * 44);
        ctx.beginPath();
        ctx.moveTo(cx, y - H * 0.024);
        const steps = 6;
        for (let k = 1; k <= steps; k++) {
          const f = k / steps;
          ctx.lineTo(cx + dir * half * f, y + droop * f * f + (k % 2 ? -1 : 1) * H * 0.007 * (0.6 + rand()));
        }
        ctx.lineTo(cx + dir * half * 0.5, y + droop + H * 0.012);
        ctx.lineTo(cx, y + H * 0.04);
        ctx.closePath();
        // each bough: lit along its top edge, falling into shade underneath
        const gr = ctx.createLinearGradient(0, y - H * 0.024, 0, y + droop + H * 0.03);
        const lo = Math.round(shade * 0.42);
        gr.addColorStop(0, `rgb(${shade},${shade},${shade})`);
        gr.addColorStop(1, `rgb(${lo},${lo},${lo})`);
        ctx.fillStyle = gr;
        ctx.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4;
  return tex;
}

function crossGeometry() {
  // two upright quads at right angles, base at y = 0
  const p = [], uv = [], idx = [];
  const quad = (ax, az) => {
    const b = p.length / 3;
    p.push(-0.5 * ax, 0, -0.5 * az, 0.5 * ax, 0, 0.5 * az, 0.5 * ax, 1, 0.5 * az, -0.5 * ax, 1, -0.5 * az);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  quad(1, 0); quad(0, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function makeTrees(U, T, tShadow, count, centre) {
  const rand = mulberry(20261109);
  const geo = crossGeometry();
  const tTree = coniferTexture();
  const mat = new THREE.ShaderMaterial({
    name: 'Trees', uniforms: { ...U, tShadow: { value: tShadow }, tTree: { value: tTree } },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, alphaToCoverage: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const seed = new Float32Array(count * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // scatter along the loch: most trees within a few hundred metres of the shore, where they will be seen
  let placed = 0, tries = 0;
  const maxTries = count * 50;
  while (placed < count && tries < maxTries) {
    tries++;
    const c = centre[Math.floor(rand() * centre.length)];
    const reach = rand() < 0.72 ? 800 : 2800;
    const ang = rand() * Math.PI * 2, rad = Math.sqrt(rand()) * reach;
    const x = c[0] + Math.cos(ang) * rad, z = c[1] + Math.sin(ang) * rad;
    if (Math.abs(x) > T.size / 2 - 60 || Math.abs(z) > T.size / 2 - 60) continue;
    const f = T.forestAt(x, z);
    if (rand() > f * 1.15) continue;
    const sd = T.shoreAt(x, z);
    if (sd > -4 || T.otherWaterAt(x, z) > -4) continue;
    const y = T.heightAt(x, z);
    const h = (13 + rand() * 14) * (sd > -40 ? 0.8 : 1);
    const w = h * (0.4 + rand() * 0.12);
    p.set(x, y - 0.5, z);
    q.setFromAxisAngle(up, rand() * Math.PI);
    s.set(w, h, w);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    seed[placed * 2] = rand();
    seed[placed * 2 + 1] = rand() < 0.7 ? 0.1 : 0.9;
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 2));
  mesh.frustumCulled = false;
  return mesh;
}
