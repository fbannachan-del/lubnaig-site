import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { COMMON, WATER_FN } from './glsl.js';

const VERT = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vRefl;
varying vec3 vWorld;
void main(){
  vRefl = textureMatrix * vec4(position, 1.0);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
${COMMON}
${WATER_FN}
uniform sampler2D tDiffuse;
uniform sampler2D tMask;
uniform sampler2D tShadow;
uniform vec3 color;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform float uWaveAmp;
uniform float uRain;
uniform vec4 uRipples[8];     // xy: where the water was touched, z: when, w: size (0 = unused)
varying vec4 vRefl;
varying vec3 vWorld;

// rings spreading from wherever the visitor touched the loch
vec2 touchRipples(vec2 p){
  vec2 g = vec2(0.0);
  for (int i = 0; i < 8; i++){
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 8.0) continue;
    vec2 d = p - r.xy;
    float len = length(d);
    float dist = len / r.w;
    float x = dist - age * 5.0;
    float env = exp(-x * x * 0.3) * exp(-age * 0.5) * smoothstep(0.0, 0.3, age) / (1.0 + dist * 0.1);
    g += (d / max(len, 1e-3)) * cos(x * 2.3) * env;
  }
  return g;
}

void main(){
  vec2 uv = vWorld.xz / uSize + 0.5;
  vec4 mask = texture2D(tMask, uv);
  float sd = (mask.r * 255.0 - 128.0) * 2.0;     // metres from the shore, positive on the water
  if (sd < -45.0) discard;

  vec3 V = cameraPosition - vWorld;
  float dist = length(V); V /= dist;
  vec2 p = vWorld.xz;

  // detail falls away with distance and at grazing angles so the far water stays calm, not noisy
  float lod = clamp(1.0 - smoothstep(40.0, 900.0, dist), 0.0, 1.0);
  vec2 slope = waveSlope(p, uTime, lod);
  // gusts: patches of ruffled water wandering down the loch
  float gust = 0.55 + 0.9 * smoothstep(0.35, 0.75, fbm3(p * 0.004 - uWind * uTime * 0.012));
  // sheltered close to the shore
  float shelter = 0.35 + 0.65 * smoothstep(0.0, 70.0, sd);
  float amp = uWaveAmp * gust * shelter;
  slope *= amp;
  if (uRain > 0.01){
    float nearCam = 1.0 - smoothstep(25.0, 110.0, dist);
    slope += rainRings(p, uTime) * uRain * 0.55 * nearCam;
  }
  slope += touchRipples(p) * 0.3;
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

  float ndv = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // mirror image, smeared vertically the way real reflections stretch toward you
  vec4 rc = vRefl;
  vec2 smear = vec2(N.x * 0.035, N.z * 0.11) * (0.25 + 0.75 * lod);
  rc.xy += smear * rc.w;
  // three taps up and down: takes the stair-steps off mirrored ridgelines
  vec4 r2 = rc;
  vec3 refl = texture2DProj(tDiffuse, rc).rgb * 0.5;
  r2.y = rc.y + 0.003 * rc.w; refl += texture2DProj(tDiffuse, r2).rgb * 0.25;
  r2.y = rc.y - 0.003 * rc.w; refl += texture2DProj(tDiffuse, r2).rgb * 0.25;
  refl *= 1.0 - 0.22 * uRain;      // rain-pocked water is duller than the sky it mirrors

  // peat-stained body of the loch: amber in the shallows, near black in the deep
  float depth = clamp(sd * 0.09, 0.0, 22.0);
  vec3 body = mix(uWaterShallow, uWaterDeep, 1.0 - exp(-depth * 0.5));
  float sh = texture2D(tShadow, uv).r;
  vec3 light = uAmbSky * 0.9 + uKeyColor * max(uKeyDir.y, 0.0) * 0.35 * sh;
  body *= light;

  vec3 col = mix(body, refl, F);

  // glitter path under the sun or moon
  vec3 R = reflect(-V, N);
  float spec = pow(max(dot(R, uKeyDir), 0.0), 900.0) * 14.0 + pow(max(dot(R, uKeyDir), 0.0), 90.0) * 0.12;
  col += uKeyColor * spec * sh * cloudShadow(vWorld) * (0.3 + 0.7 * min(amp * 60.0, 1.0));

  // wet margin: the land shows through right at the edge
  float edge = smoothstep(-2.0, 2.5, sd);
  col = mix(body * 1.4, col, edge);

  col = applyAtmosphere(col, vWorld);
  gl_FragColor = vec4(finalize(col), 1.0);
}`;

export function makeWater(renderer, U, T, tShadow, rtScale = 0.5, samples = 0) {
  const geo = new THREE.PlaneGeometry(T.size, T.size, 1, 1);
  const water = new Reflector(geo, {
    textureWidth: 512, textureHeight: 512, clipBias: 0.003, multisample: samples,
    shader: {
      name: 'LochWater',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
      vertexShader: VERT, fragmentShader: FRAG,
    },
  });
  // Reflector clones its uniforms; point the shared ones back at the live objects
  const ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -100, 0));
  Object.assign(water.material.uniforms, U, {
    tMask: { value: T.tMask }, tShadow: { value: tShadow }, uRipples: { value: ripples },
  });
  let next = 0;
  water.touch = (x, z, time, size) => { ripples[next].set(x, z, time, size); next = (next + 1) % ripples.length; };
  // older phones cannot render to a floating-point target: use plain 8-bit there rather than a black mirror
  if (!renderer.extensions.has('EXT_color_buffer_float') && !renderer.extensions.has('EXT_color_buffer_half_float')) {
    water.getRenderTarget().texture.type = THREE.UnsignedByteType;
  }
  water.rotation.x = -Math.PI / 2;
  water.position.y = T.level;
  water.frustumCulled = false;
  water.updateMatrixWorld(true);

  const inner = water.onBeforeRender;
  water.onBeforeRender = function (renderer, scene, camera) {
    U.uReflPass.value = 1;
    inner.call(this, renderer, scene, camera);
    U.uReflPass.value = 0;
  };
  // rain, snow and other near-camera effects live on layer 1 and stay out of the mirror
  const hide = water.getReflectionCamera;
  water.getReflectionCamera = function (camera) {
    const c = hide.call(this, camera);
    c.layers.set(0);
    return c;
  };
  water.setReflectionSize = (w, h) => water.getRenderTarget().setSize(Math.max(64, Math.round(w * rtScale)), Math.max(64, Math.round(h * rtScale)));
  return water;
}
