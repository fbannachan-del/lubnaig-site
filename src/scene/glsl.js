// Shared GLSL for every material in the loch scene.
// One atmosphere model, one tone curve, so land, water, trees and sky always agree.

export const COMMON = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uSize;        // side of the terrain square in metres
uniform float uWaterLevel;  // loch surface, metres
uniform vec3  uSunDir;
uniform vec3  uMoonDir;
uniform vec3  uKeyDir;      // whichever of sun or moon is lighting the land
uniform vec3  uKeyColor;
uniform vec3  uAmbSky;
uniform vec3  uAmbGround;
uniform vec3  uSkyZenith;
uniform vec3  uSkyHorizon;
uniform vec3  uHazeColor;
uniform vec3  uSunGlow;
uniform float uFogDensity;
uniform float uMistDensity;
uniform float uMistHeight;
uniform float uCloudBase;
uniform float uCloudCover;
uniform vec3  uCloudLit;
uniform vec3  uCloudDark;
uniform vec2  uWind;        // metres per second, world xz
uniform float uExposure;
uniform float uReflPass;    // 1 while rendering the mirror image for the water
uniform float uNight;       // 0 day .. 1 night

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3){
  p3 = fract(p3 * .1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x),
             mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
}
// value noise with analytic derivatives: x = value, yz = gradient
vec3 noised(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 du = 30.0*f*f*(f*(f-2.0)+1.0);
  float a = hash12(i), b = hash12(i+vec2(1,0)), c = hash12(i+vec2(0,1)), d = hash12(i+vec2(1,1));
  float k1 = b-a, k2 = c-a, k4 = a-b-c+d;
  return vec3(a + k1*u.x + k2*u.y + k4*u.x*u.y, du*vec2(k1 + k4*u.y, k2 + k4*u.x));
}
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p){
  float a = .5, s = 0.;
  for (int i = 0; i < 5; i++){ s += a*vnoise(p); p = ROT*p*2.03 + vec2(17.1, 9.2); a *= .5; }
  return s;
}
float fbm3(vec2 p){
  float a = .5, s = 0.;
  for (int i = 0; i < 3; i++){ s += a*vnoise(p); p = ROT*p*2.03 + vec2(17.1, 9.2); a *= .5; }
  return s;
}

// Cloud field shared by the sky and by the shadows it drops on the hills.
const float CLOUD_H = 2600.0;
float cloudDensity(vec2 uv){
  return fbm(uv*1.15)*0.74 + fbm3(uv*3.3 + 5.0)*0.26;
}
float cloudAlpha(float dens){
  float thr = mix(0.80, 0.24, uCloudCover);
  return smoothstep(thr, thr + 0.2, dens);
}
vec2 cloudUV(vec2 worldXZ){
  return worldXZ / CLOUD_H * 0.9 + uWind * uTime * 0.0035;
}
float cloudShadow(vec3 wp){
  if (uReflPass > 0.5) return 1.0 - uCloudCover * 0.25;   // the mirror image does without moving shadows
  vec3 k = uKeyDir;
  vec2 at = wp.xz + k.xz / max(k.y, 0.12) * (CLOUD_H - wp.y);
  float a = cloudAlpha(cloudDensity(cloudUV(at)));
  return 1.0 - a * mix(0.55, 0.25, uCloudCover);
}

// Colour of the haze in a given direction: what distance fades into.
vec3 hazeColor(vec3 dir){
  float sd = max(dot(dir, uSunDir), 0.0);
  return uHazeColor + uSunGlow * (pow(sd, 5.0)*0.55 + pow(sd, 24.0)*0.6);
}

vec3 skyGradient(vec3 d){
  float h = max(d.y, 0.0);
  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(h, 0.42));
  float band = exp(-h * 9.0);
  c = mix(c, hazeColor(d), band * 0.85);
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunGlow * (pow(sd, 10.0)*0.35 + pow(sd, 90.0)*0.9) * (1.0 - band*0.5);
  return c;
}

// Distance haze plus low mist lying on the water, plus hills vanishing into the cloud base.
vec3 applyAtmosphere(vec3 col, vec3 wp){
  vec3 v = wp - cameraPosition;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-3);
  float y0 = cameraPosition.y - uWaterLevel;
  float dy = dir.y;
  if (uReflPass > 0.5){
    // mirror image: the light really travelled above the water the whole way
    y0 = 0.0;
    dy = max(wp.y - uWaterLevel, 0.0) / max(dist, 1.0);
    dir.y = abs(dir.y);
  }
  float fd = 1.0 - exp(-dist * uFogDensity);
  float b = 1.0 / uMistHeight;
  float k = dy * b;
  float along = abs(k) < 1e-5 ? dist : (1.0 - exp(-dist * k)) / k;
  float integ = uMistDensity * exp(-max(y0, 0.0) * b) * along;
  float fm = 1.0 - exp(-max(integ, 0.0));
  float f = 1.0 - (1.0 - fd) * (1.0 - fm);
  float rim = max(abs(wp.x), abs(wp.z)) / (uSize * 0.5);
  f = max(f, smoothstep(0.8, 0.985, rim));
  col = mix(col, hazeColor(dir), clamp(f, 0.0, 1.0));
  float n = vnoise(wp.xz * 0.0011 + uTime * 0.004) - 0.5;
  float cb = smoothstep(uCloudBase - 90.0, uCloudBase + 160.0, wp.y + n * 220.0);
  col = mix(col, mix(uCloudDark, uCloudLit, 0.45), cb * 0.96);
  return col;
}

vec3 finalize(vec3 c){
  if (uReflPass > 0.5) return c;
  c *= uExposure;
  // filmic curve
  c = (c*(2.51*c + 0.03)) / (c*(2.43*c + 0.59) + 0.14);
  c = clamp(c, 0.0, 1.0);
  // a little toe lift so night never crushes to pure black
  c = mix(c, sqrt(c), 0.06 * uNight);
  c = pow(c, vec3(1.0/2.2));
  c += (hash12(gl_FragCoord.xy + fract(uTime)*61.0) - 0.5) / 255.0 * 1.6;
  return c;
}
`;

// Water surface slope from a few drifting wavelet layers, stretched across the wind.
export const WATER_FN = /* glsl */ `
vec2 waveSlope(vec2 p, float t, float lod){
  vec2 w = normalize(uWind + vec2(1e-3, 0.0));
  mat2 toWind = mat2(w.x, -w.y, w.y, w.x);
  vec2 q = toWind * p;
  vec2 g = vec2(0.0);
  float sp = 0.35 + length(uWind) * 0.22;
  // long, lazy swell
  vec3 n = noised(vec2(q.x*0.11, q.y*0.035) - vec2(t*sp*0.11, 0.0));
  g += vec2(n.y*0.11, n.z*0.035) * 1.9;
  n = noised(ROT*vec2(q.x*0.27, q.y*0.09) - vec2(t*sp*0.24, t*0.02));
  vec2 gr = n.yz * ROT;
  g += vec2(gr.x*0.27, gr.y*0.09) * 0.9 * lod;
  // fine ripples
  n = noised(vec2(q.x*0.9, q.y*0.33) - vec2(t*sp*0.8, t*0.05));
  g += vec2(n.y*0.9, n.z*0.33) * 0.24 * lod * lod;
  n = noised(ROT*vec2(q.x*2.3, q.y*0.9) + vec2(-t*sp*1.7, t*0.11));
  gr = n.yz * ROT;
  g += vec2(gr.x*2.3, gr.y*0.9) * 0.07 * lod * lod * lod;
  return g * toWind;
}
// expanding rings where raindrops land
vec2 rainRings(vec2 p, float t){
  vec2 g = vec2(0.0);
  for (int k = 0; k < 2; k++){
    vec2 pp = p * (k == 0 ? 0.9 : 1.7) + float(k)*13.7;
    vec2 cell = floor(pp), f = fract(pp);
    float h = hash12(cell + float(k)*7.0);
    float age = fract(t*0.9 + h);
    vec2 c = vec2(hash12(cell+3.1), hash12(cell+8.7))*0.6 + 0.2;
    vec2 d = f - c; float r = length(d);
    float ring = sin((r - age*0.55)*46.0) * smoothstep(0.08, 0.0, abs(r - age*0.55)) * (1.0 - age);
    g += (d / max(r, 1e-3)) * ring;
  }
  return g;
}
`;
