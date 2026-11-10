import * as THREE from 'three';
import { COMMON } from './glsl.js';
import { decodePng } from '../png.js';

// ---------- data ----------

// Returns { data, channels }. Decoded by hand where the browser can inflate a stream; a canvas only as a last resort.
async function loadPixels(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`terrain asset ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  if (typeof DecompressionStream === 'function') {
    try { return await decodePng(buf); } catch (err) { console.warn('terrain: falling back to canvas decode', err); }
  }
  const blob = new Blob([buf], { type: 'image/png' });
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return { data: ctx.getImageData(0, 0, bmp.width, bmp.height).data, channels: 4 };
}

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y) {
  let s = 0, a = 0.5;
  for (let i = 0; i < 4; i++) { s += a * vnoise(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 9.2; a *= 0.5; }
  return s;
}
function boxBlur(src, n, r) {
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
  const w = 2 * r + 1;
  for (let y = 0; y < n; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * n + Math.min(n - 1, Math.max(0, x))];
    for (let x = 0; x < n; x++) {
      tmp[y * n + x] = acc / w;
      acc += src[y * n + Math.min(n - 1, x + r + 1)] - src[y * n + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < n; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(n - 1, Math.max(0, y)) * n + x];
    for (let y = 0; y < n; y++) {
      out[y * n + x] = acc / w;
      acc += tmp[Math.min(n - 1, y + r + 1) * n + x] - tmp[Math.max(0, y - r) * n + x];
    }
  }
  return out;
}

export async function loadTerrain(heightUrl, waterUrl, meta) {
  const [hImg, wImg] = await Promise.all([loadPixels(heightUrl), loadPixels(waterUrl)]);
  const hp = hImg.data, hc = hImg.channels, wp = wImg.data, wc = wImg.channels;
  const n = meta.n, size = meta.size_m, texel = meta.texel_m, level = meta.lubnaig.level_m;
  const N = n * n;
  const H = new Float32Array(N);
  let sdL = new Float32Array(N);
  const sdO = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    H[i] = ((hp[i * hc] << 8) | hp[i * hc + 1]) * 0.5;
    sdL[i] = (wp[i * wc] - 128) * 2;
    sdO[i] = (wp[i * wc + 1] - 128) * 2;
  }
  // soften the shoreline so it reads as a curve, not a staircase
  sdL = boxBlur(sdL, n, 1);

  // carved surface: loch bed drops away from the shore, land never sits below the waterline next to it
  const Y = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const d = sdL[i];
    Y[i] = d > 0 ? level - Math.min(d * 0.09, 22) : Math.max(H[i], level - d * 0.04 * Math.exp(d / 60));
  }

  // normals + broad ambient occlusion
  const blurWide = boxBlur(H, n, 9), blurNear = boxBlur(H, n, 3);
  const normalData = new Uint8Array(N * 4);
  const slope = new Float32Array(N);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const xl = H[y * n + Math.max(0, x - 1)], xr = H[y * n + Math.min(n - 1, x + 1)];
      const zu = H[Math.max(0, y - 1) * n + x], zd = H[Math.min(n - 1, y + 1) * n + x];
      let nx = (xl - xr) / (2 * texel), nz = (zu - zd) / (2 * texel), ny = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      slope[i] = 1 - ny;
      const ao = 1 - Math.min(0.55, Math.max(0, (blurWide[i] - H[i]) / 150) + Math.max(0, (blurNear[i] - H[i]) / 40) * 0.5);
      normalData[i * 4] = (nx * 0.5 + 0.5) * 255;
      normalData[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
      normalData[i * 4 + 2] = (nz * 0.5 + 0.5) * 255;
      normalData[i * 4 + 3] = ao * 255;
    }
  }

  // where the forestry sits: lower slopes, thickest near the water, never on fields or crags
  const forest = new Float32Array(N);
  const maskData = new Uint8Array(N * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const wx = (x + 0.5) * texel - size / 2, wz = (y + 0.5) * texel - size / 2;
      const alt = H[i] - level;
      const patch = fbm(wx * 0.0011 + 40, wz * 0.0011 + 12);
      const nearLoch = Math.exp(-Math.abs(sdL[i]) / 420);
      const ceiling = 250 + 170 * fbm(wx * 0.0007, wz * 0.0007);
      let f = 0;
      if (sdL[i] < -4 && sdO[i] < -4 && alt > 1.2 && alt < ceiling && slope[i] < 0.2) {
        f = Math.min(1, Math.max(0, (patch + nearLoch * 0.34 - 0.47) * 6));
        f *= Math.min(1, Math.max(0, (ceiling - alt) / 60));
        if (slope[i] < 0.0035 && alt < 16) f *= 0.15; // valley-floor fields stay open
      }
      forest[i] = f;
      maskData[i * 4] = Math.max(0, Math.min(255, 128 + sdL[i] / 2));
      maskData[i * 4 + 1] = Math.max(0, Math.min(255, 128 + sdO[i] / 2));
      maskData[i * 4 + 2] = f * 255;
      maskData[i * 4 + 3] = 255;
    }
  }

  const mk = (data, type = THREE.UnsignedByteType, format = THREE.RGBAFormat) => {
    const t = new THREE.DataTexture(data, n, n, format, type);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    return t;
  };
  const tNormal = mk(normalData);
  tNormal.minFilter = THREE.LinearMipmapLinearFilter; tNormal.generateMipmaps = true; tNormal.anisotropy = 4;
  const tMask = mk(maskData);
  const half = new Uint16Array(N);
  for (let i = 0; i < N; i++) half[i] = THREE.DataUtils.toHalfFloat(H[i]);
  const tHeight = mk(half, THREE.HalfFloatType, THREE.RedFormat);

  const sample = (arr, wx, wz) => {
    const fx = Math.min(n - 1.001, Math.max(0, (wx + size / 2) / texel - 0.5));
    const fy = Math.min(n - 1.001, Math.max(0, (wz + size / 2) / texel - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const i = y0 * n + x0;
    return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - ty) + (arr[i + n] * (1 - tx) + arr[i + n + 1] * tx) * ty;
  };

  return {
    n, size, texel, level, H, Y, sdL, sdO, forest, slope, tNormal, tMask, tHeight,
    heightAt: (x, z) => sample(Y, x, z),
    shoreAt: (x, z) => sample(sdL, x, z),
    forestAt: (x, z) => sample(forest, x, z),
    slopeAt: (x, z) => sample(slope, x, z),
    otherWaterAt: (x, z) => sample(sdO, x, z),
  };
}

// ---------- geometry: full detail round the loch, coarser beyond ----------

export function buildTerrainGeometry(T, outerStride = 2, box = { x0: -3900, x1: 1900, z0: -4500, z1: 3700 }) {
  const { n, size, texel } = T;
  const s = outerStride;
  const M = Math.floor((n - 1) / s) * s;            // last usable vertex index
  const toIdx = (w) => (w + size / 2) / texel - 0.5;
  const al = (v, up) => Math.min(M, Math.max(0, (up ? Math.ceil(v / s) : Math.floor(v / s)) * s));
  const i0 = al(toIdx(box.x0), true), i1 = al(toIdx(box.x1), false);
  const j0 = al(toIdx(box.z0), true), j1 = al(toIdx(box.z1), false);

  const Y = Float32Array.from(T.Y);
  // stitch: vertices on the inner box edge must lie on the coarse edge outside it
  const lerpEdge = (fixed, horizontal) => {
    const a0 = horizontal ? i0 : j0, a1 = horizontal ? i1 : j1;
    for (let a = a0; a < a1; a += s) {
      for (let k = 1; k < s; k++) {
        const t = k / s;
        const idx = (p) => (horizontal ? fixed * n + p : p * n + fixed);
        Y[idx(a + k)] = Y[idx(a)] * (1 - t) + Y[idx(a + s)] * t;
      }
    }
  };
  if (s > 1) { lerpEdge(j0, true); lerpEdge(j1, true); lerpEdge(i0, false); lerpEdge(i1, false); }

  const W = M + 1;
  const pos = new Float32Array(W * W * 3);
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) {
      const p = (j * W + i) * 3;
      pos[p] = (i + 0.5) * texel - size / 2;
      pos[p + 1] = Y[j * n + i];
      pos[p + 2] = (j + 0.5) * texel - size / 2;
    }
  }
  const idx = [];
  const quad = (i, j, st) => {
    const a = j * W + i, b = a + st, c = a + st * W, d = c + st;
    idx.push(a, c, b, b, c, d);
  };
  for (let j = 0; j < M; j += s) {
    for (let i = 0; i < M; i += s) {
      const inner = i >= i0 && i + s <= i1 && j >= j0 && j + s <= j1;
      if (inner && s > 1) { for (let jj = 0; jj < s; jj++) for (let ii = 0; ii < s; ii++) quad(i + ii, j + jj, 1); }
      else quad(i, j, s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 400, 0), size);
  return g;
}

// ---------- material ----------

const VERT = /* glsl */ `
varying vec3 vWorld;
void main(){
  vWorld = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
${COMMON}
uniform sampler2D tNormal;
uniform sampler2D tMask;
uniform sampler2D tShadow;
uniform vec3 uColGrass;
uniform vec3 uColMoor;
uniform vec3 uColMoorB;
uniform vec3 uColHigh;
uniform vec3 uColRock;
uniform vec3 uColForest;
uniform vec3 uColShore;
uniform vec3 uColSnow;
uniform float uSnowLine;
uniform float uWet;
uniform vec3 uWaterDeep;
varying vec3 vWorld;

void main(){
  vec2 uv = vWorld.xz / uSize + 0.5;
  vec4 nt = texture2D(tNormal, uv);
  vec3 N = normalize(nt.xyz * 2.0 - 1.0);
  float ao = nt.a;
  vec4 mask = texture2D(tMask, uv);
  float sdOther = (mask.g * 255.0 - 128.0) * 2.0;
  float sdLoch = (mask.r * 255.0 - 128.0) * 2.0;
  vec2 p = vWorld.xz;
  float dist = length(vWorld - cameraPosition);
  float near = 1.0 - smoothstep(600.0, 3500.0, dist);

  float n1 = fbm(p * 0.0034);
  float n2 = fbm(p * 0.019 + 3.0);
  float n3 = vnoise(p * 0.21);
  // the survey is smooth at this scale: add the knolls, gullies and tussocks it cannot see
  float slope0 = 1.0 - N.y;
  vec3 d1 = noised(p * 0.011 + 5.0);
  vec3 d2 = noised(ROT * p * 0.043 + 11.0);
  vec3 d3 = noised(p * 0.17 - 3.0);
  float mid = 1.0 - smoothstep(1500.0, 7000.0, dist);
  vec2 relief = d1.yz * 0.2 + (d2.yz * ROT) * 0.17 * mid + d3.yz * 0.13 * near;
  relief *= 0.55 + 2.2 * smoothstep(0.08, 0.4, slope0);
  N = normalize(N - vec3(relief.x, 0.0, relief.y));
  float slope = mix(slope0, 1.0 - N.y, 0.5);
  float alt = vWorld.y - uWaterLevel;

  vec3 moor = mix(uColMoor, uColMoorB, smoothstep(0.44, 0.56, n1 + (n2 - 0.5) * 0.7));
  moor = mix(moor, uColGrass * 0.9, smoothstep(0.55, 0.62, d2.x) * 0.55);
  moor *= 0.82 + 0.36 * n3 * near + 0.18 * (1.0 - near);
  vec3 grass = uColGrass * (0.8 + 0.4 * n2);
  float lowland = (1.0 - smoothstep(15.0, 150.0, alt + (n1 - 0.5) * 110.0)) * (1.0 - smoothstep(0.02, 0.1, slope));
  vec3 alb = mix(moor, grass, lowland);
  float high = smoothstep(330.0, 680.0, alt + (n1 - 0.5) * 220.0);
  alb = mix(alb, uColHigh * (0.85 + 0.3 * n2), high * 0.8);
  float rock = smoothstep(0.2, 0.4, slope + (n2 - 0.5) * 0.16 + high * 0.06);
  alb = mix(alb, uColRock * (0.62 + 0.7 * n3 * n2 * 2.0), rock);
  float forest = mask.b;
  alb = mix(alb, uColForest * (0.75 + 0.5 * n2), forest * 0.9);
  float shore = (1.0 - smoothstep(0.3, 3.2, alt)) * step(-40.0, sdLoch);
  alb = mix(alb, uColShore * (0.7 + 0.5 * n3), shore);
  float snowLine = uSnowLine + (n1 - 0.5) * 190.0;
  float snow = smoothstep(snowLine - 30.0, snowLine + 110.0, vWorld.y) * (1.0 - smoothstep(0.34, 0.6, slope)) * (0.75 + 0.25 * n2);
  alb = mix(alb, uColSnow, clamp(snow, 0.0, 1.0));
  alb *= 1.0 - 0.28 * uWet * (1.0 - snow);

  float sh = texture2D(tShadow, uv).r * cloudShadow(vWorld);
  float ndl = dot(N, uKeyDir);
  vec3 direct = uKeyColor * max(ndl * 0.92 + 0.08, 0.0) * sh;
  vec3 amb = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5) * (0.35 + 0.65 * ao);
  vec3 col = alb * (direct + amb);

  // other lochs in the distance: flat water mirroring the sky
  float w = smoothstep(-6.0, 6.0, sdOther);
  if (w > 0.0){
    vec3 V = normalize(cameraPosition - vWorld);
    float F = 0.03 + 0.97 * pow(1.0 - max(V.y, 0.0), 5.0);
    vec3 wc = mix(uWaterDeep * (uAmbSky + uKeyColor * 0.2), skyGradient(reflect(-V, vec3(0, 1, 0))), F);
    col = mix(col, wc, w);
  }

  col = applyAtmosphere(col, vWorld);
  gl_FragColor = vec4(finalize(col), 1.0);
}`;

export function makeTerrainMaterial(U, T, tShadow) {
  return new THREE.ShaderMaterial({
    name: 'Terrain',
    uniforms: { ...U, tNormal: { value: T.tNormal }, tMask: { value: T.tMask }, tShadow: { value: tShadow } },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

// ---------- hill shadows: march the height field toward the light, once per light change ----------

export function makeShadowBaker(renderer, T) {
  const rt = new THREE.WebGLRenderTarget(T.n, T.n, {
    depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  const mat = new THREE.ShaderMaterial({
    uniforms: { tHeight: { value: T.tHeight }, uDir: { value: new THREE.Vector3(0, 1, 0) }, uSize: { value: T.size }, uMaxH: { value: 1000 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tHeight; uniform vec3 uDir; uniform float uSize; uniform float uMaxH;
      varying vec2 vUv;
      void main(){
        if (uDir.y <= 0.004){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
        float h0 = texture2D(tHeight, vUv).r + 2.0;
        vec2 xz = vUv * uSize;
        float res = 1.0, t = 35.0;
        for (int i = 0; i < 110; i++){
          vec2 q = (xz + uDir.xz * t) / uSize;
          float y = h0 + uDir.y * t;
          if (y > uMaxH || q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) break;
          float d = y - texture2D(tHeight, q).r;
          if (d < 0.0){ res = 0.0; break; }
          res = min(res, 14.0 * d / t);
          t += clamp(d * 0.7, 26.0, 320.0);
        }
        gl_FragColor = vec4(vec3(clamp(res, 0.0, 1.0)), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  const cam = new THREE.Camera();
  const last = new THREE.Vector3(0, -1, 0);
  let lastAt = -1e9;
  return {
    texture: rt.texture,
    // settle = true once the light has stopped moving: always bake the final direction
    update(dir, settle = false) {
      if (last.dot(dir) > 0.99996) return false;   // under about half a degree: keep the old bake
      const now = performance.now();
      if (!settle && now - lastAt < 220) return false;   // while the light swings, a few bakes a second is plenty
      lastAt = now;
      last.copy(dir);
      mat.uniforms.uDir.value.copy(dir);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
      return true;
    },
  };
}
