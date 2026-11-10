import * as THREE from 'three';
import { COMMON } from './glsl.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(position * 100.0 + cameraPosition, 1.0);
  gl_Position = p.xyww;   // pinned to the far plane, so it only fills what the land leaves open
}`;

const FRAG = /* glsl */ `
${COMMON}
uniform vec3 uSunDisc;      // colour x brightness of the visible disc
uniform vec3 uMoonColor;
uniform float uMoonFrac;
uniform float uStars;
varying vec3 vDir;

float starLayer(vec3 d, float scale, float cut){
  vec3 p = d * scale;
  vec3 i = floor(p), f = fract(p) - 0.5;
  float h = hash13(i);
  float tw = 0.75 + 0.25 * sin(uTime * (1.5 + h * 4.0) + h * 80.0);
  float size = mix(0.05, 0.2, pow(hash13(i + 7.3), 2.0));
  return step(cut, h) * smoothstep(size, 0.0, length(f + (vec3(hash13(i+1.1), hash13(i+2.2), hash13(i+3.3)) - 0.5) * 0.5)) * tw * (0.35 + 0.65 * hash13(i + 5.1));
}

void main(){
  vec3 d = normalize(vDir);
  vec3 col = skyGradient(d);

  // stars and a faint band of galaxy, washed out by cloud, dawn and the horizon haze
  if (uStars > 0.003 && d.y > -0.02){
    float s = starLayer(d, 210.0, 0.975) + starLayer(d, 120.0, 0.99) * 1.6 + starLayer(d, 420.0, 0.955) * 0.5;
    vec3 axis = normalize(vec3(0.55, 0.35, -0.75));
    float band = exp(-pow(dot(d, axis) * 3.6, 2.0));
    // texture the band in its own coordinates (along it, across it) so it clumps like dust lanes, not streaks
    vec3 b1 = normalize(cross(axis, vec3(0.0, 1.0, 0.0)));
    vec3 b2 = cross(axis, b1);
    vec2 gq = vec2(atan(dot(d, b1), dot(d, b2)) * 2.2, dot(d, axis) * 7.0);
    float galaxy = band * smoothstep(0.32, 0.8, fbm(gq * 2.4 + 3.0)) * 0.026;
    float horizonFade = smoothstep(0.0, 0.22, d.y);
    col += (vec3(0.85, 0.9, 1.0) * s * 1.3 + vec3(0.55, 0.62, 0.9) * galaxy) * uStars * horizonFade;
  }

  // moon with its phase
  float md = dot(d, uMoonDir);
  if (md > 0.9995){
    vec3 mx = normalize(uSunDir - uMoonDir * dot(uSunDir, uMoonDir));
    vec3 my = cross(uMoonDir, mx);
    vec3 rel = d - uMoonDir * md;
    vec2 q = vec2(dot(rel, mx), dot(rel, my)) / 0.0105;
    float r = length(q);
    if (r < 1.0){
      float term = -(2.0 * uMoonFrac - 1.0) * sqrt(max(1.0 - q.y * q.y, 0.0));
      float lit = smoothstep(term - 0.06, term + 0.06, q.x);
      float mare = 0.82 + 0.18 * fbm3(q * 2.3 + 4.0);
      float edge = smoothstep(1.0, 0.92, r);
      // the moon only ever adds light: its dark side is hidden by the sky in front of it
      col += uMoonColor * lit * mare * edge;
    }
  }
  col += uMoonColor * 0.05 * pow(max(md, 0.0), 900.0) * (0.3 + 0.7 * uMoonFrac);

  // sun: a small hot disc inside a soft corona, the way it looks through moist air
  float sd = dot(d, uSunDir);
  float ang = acos(clamp(sd, -1.0, 1.0));
  col += uSunDisc * (smoothstep(0.0062, 0.0046, ang) + 0.05 * exp(-ang * 60.0) + 0.012 * exp(-ang * 14.0));

  // clouds on a plane overhead, lit from the sun side
  if (d.y > 0.0 && uCloudCover > 0.01){
    vec2 plane = d.xz / (d.y + 0.11) * CLOUD_H + cameraPosition.xz;
    vec2 uv = cloudUV(plane);
    float dens = cloudDensity(uv);
    float a = cloudAlpha(dens);
    if (a > 0.001){
      vec2 toSun = normalize(uKeyDir.xz + vec2(1e-4)) * 0.12;
      float dens2 = cloudDensity(uv + toSun);
      float lit = clamp(0.5 + (dens - dens2) * 3.2, 0.0, 1.0);
      float thr = mix(0.80, 0.24, uCloudCover);
      float thick = smoothstep(thr, thr + 0.45, dens);
      vec3 cc = mix(uCloudDark, uCloudLit, lit * (1.0 - thick * 0.55));
      float sdc = max(dot(d, uSunDir), 0.0);
      cc += uSunGlow * pow(sdc, 14.0) * (1.0 - thick) * 1.4;      // silver lining
      float far = smoothstep(0.0, 0.2, d.y);
      cc = mix(hazeColor(d), cc, far * 0.9 + 0.1);
      col = mix(col, cc, a * smoothstep(0.0, 0.07, d.y));
    }
  }

  if (d.y < 0.0) col = mix(col, hazeColor(d), smoothstep(0.0, -0.05, d.y));
  gl_FragColor = vec4(finalize(col), 1.0);
}`;

export function makeSky(U) {
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const mat = new THREE.ShaderMaterial({
    name: 'Sky', uniforms: U, vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, depthWrite: false, depthTest: true, depthFunc: THREE.LessEqualDepth,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return mesh;
}
