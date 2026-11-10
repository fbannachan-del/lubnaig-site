// Turns "what time is it and what is the weather doing" into the scene's colours and densities.
// All colours are linear, scene-referred.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lum = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

// keyed on sun altitude in degrees
const KEYS = [
  { alt: -18, zen: [0.0022, 0.0045, 0.013], hor: [0.006, 0.01, 0.024], sun: [0, 0, 0], glow: [0, 0, 0], exp: 3.3 },
  { alt: -9, zen: [0.006, 0.014, 0.046], hor: [0.022, 0.032, 0.075], sun: [0, 0, 0], glow: [0.02, 0.015, 0.03], exp: 2.0 },
  { alt: -4, zen: [0.022, 0.05, 0.16], hor: [0.3, 0.14, 0.15], sun: [0.05, 0.022, 0.014], glow: [0.55, 0.2, 0.1], exp: 1.0 },
  { alt: -1, zen: [0.07, 0.14, 0.33], hor: [0.78, 0.4, 0.22], sun: [0.62, 0.27, 0.11], glow: [1.25, 0.52, 0.19], exp: 1.05 },
  { alt: 2, zen: [0.11, 0.2, 0.43], hor: [0.9, 0.56, 0.32], sun: [2.3, 1.25, 0.6], glow: [1.4, 0.72, 0.3], exp: 1.0 },
  { alt: 6, zen: [0.13, 0.25, 0.5], hor: [0.84, 0.64, 0.42], sun: [3.3, 2.2, 1.25], glow: [1.15, 0.72, 0.36], exp: 0.95 },
  { alt: 14, zen: [0.13, 0.3, 0.62], hor: [0.62, 0.7, 0.78], sun: [4.0, 3.5, 2.85], glow: [0.5, 0.45, 0.38], exp: 0.95 },
  { alt: 35, zen: [0.1, 0.27, 0.68], hor: [0.55, 0.68, 0.85], sun: [4.6, 4.35, 4.0], glow: [0.3, 0.3, 0.3], exp: 0.9 },
];

// ground colours at mid-winter, mid-spring, mid-summer, mid-autumn
const SEASONS = [
  { grass: [0.085, 0.09, 0.04], moor: [0.095, 0.06, 0.03], moorB: [0.07, 0.06, 0.035], high: [0.11, 0.1, 0.07], treeB: [0.022, 0.03, 0.02] },
  { grass: [0.06, 0.11, 0.035], moor: [0.085, 0.075, 0.035], moorB: [0.06, 0.08, 0.035], high: [0.1, 0.105, 0.065], treeB: [0.035, 0.07, 0.02] },
  { grass: [0.045, 0.11, 0.03], moor: [0.05, 0.085, 0.03], moorB: [0.085, 0.05, 0.085], high: [0.085, 0.1, 0.055], treeB: [0.03, 0.06, 0.02] },
  { grass: [0.075, 0.095, 0.035], moor: [0.15, 0.07, 0.025], moorB: [0.1, 0.075, 0.03], high: [0.12, 0.1, 0.06], treeB: [0.058, 0.052, 0.022] },
];

function seasonal(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const doy = (date.getTime() - start) / 864e5;
  // season centres: 15 Jan, 15 Apr, 15 Jul, 15 Oct
  const pos = (((doy - 15) / 365) * 4 + 4) % 4;
  const i = Math.floor(pos), t = pos - i, a = SEASONS[i], b = SEASONS[(i + 1) % 4];
  const s = t * t * (3 - 2 * t);
  const out = {};
  for (const k of Object.keys(a)) out[k] = mix3(a[k], b[k], s);
  out.winterness = Math.max(0, Math.cos(((doy - 15) / 365) * 2 * Math.PI));
  return out;
}

function skyKey(altDeg) {
  if (altDeg <= KEYS[0].alt) return KEYS[0];
  for (let i = 1; i < KEYS.length; i++) {
    if (altDeg <= KEYS[i].alt) {
      const a = KEYS[i - 1], b = KEYS[i];
      const t = (altDeg - a.alt) / (b.alt - a.alt);
      return { zen: mix3(a.zen, b.zen, t), hor: mix3(a.hor, b.hor, t), sun: mix3(a.sun, b.sun, t), glow: mix3(a.glow, b.glow, t), exp: lerp(a.exp, b.exp, t) };
    }
  }
  return KEYS[KEYS.length - 1];
}

// brightness of the sky behind the headline after the tone curve: decides dark ink or pale ink
function skyLum(zen, hor, exposure) {
  const tm = (x) => { x *= exposure; return (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14); };
  const c = mix3(hor, zen, 0.5);
  return lum([tm(c[0]), tm(c[1]), tm(c[2])]);
}

export function makeUniforms(size, level) {
  const v3 = () => ({ value: new THREE.Vector3() });
  const f = (x = 0) => ({ value: x });
  return {
    uTime: f(), uSize: f(size), uWaterLevel: f(level),
    uSunDir: v3(), uMoonDir: v3(), uKeyDir: v3(), uKeyColor: v3(),
    uAmbSky: v3(), uAmbGround: v3(), uSkyZenith: v3(), uSkyHorizon: v3(), uHazeColor: v3(), uSunGlow: v3(),
    uFogDensity: f(0.00004), uMistDensity: f(0), uMistHeight: f(20), uCloudBase: f(3000), uCloudCover: f(0.3),
    uCloudLit: v3(), uCloudDark: v3(), uWind: { value: new THREE.Vector2(1, 0) }, uExposure: f(1), uReflPass: f(0), uNight: f(0),
    uSunDisc: v3(), uMoonColor: v3(), uMoonFrac: f(1), uStars: f(0),
    uColGrass: v3(), uColMoor: v3(), uColMoorB: v3(), uColHigh: v3(), uColRock: v3(), uColForest: v3(), uColShore: v3(), uColSnow: v3(),
    uColTree: v3(), uColTreeB: v3(), uSnowLine: f(3000), uWet: f(0),
    uWaterDeep: v3(), uWaterShallow: v3(), uWaveAmp: f(0.1), uRain: f(0), uSnowFall: f(0),
  };
}

// Target look for an environment state. Returns plain numbers; the scene eases toward them.
export function computeLook(env) {
  const altDeg = env.sun.altitude / DEG;
  const k = skyKey(altDeg);
  const cloud = clamp01(env.cloud), fog = clamp01(env.fog);
  const oc = smooth(0.55, 1.0, cloud);                     // how overcast
  const daylight = smooth(-7, 8, altDeg);                  // 0 night .. 1 day
  const night = 1 - smooth(-12, -3, altDeg);

  let zen = k.zen, hor = k.hor;
  // cloud at night is never black: it carries a little glow, which is what lets the hills stand out against it
  const grey = Math.max(lum(zen) * 1.5, lum(hor) * 0.75) * (1 + 1.5 * (1 - smooth(-12, -3, altDeg)));
  zen = mix3(zen, mul3([0.92, 0.97, 1.05], grey * 0.9), oc);
  hor = mix3(hor, mul3([0.95, 0.98, 1.04], grey * 1.1), oc * 0.9);
  // fog and rain flatten the sky toward a pale wash
  const wash = clamp01(fog * 0.5 + Math.min(env.precip, 3) * 0.14);
  const washCol = mul3([0.96, 0.98, 1.02], Math.max(lum(hor), lum(zen)) * 1.05);
  zen = mix3(zen, washCol, wash * 0.75);
  hor = mix3(hor, washCol, wash * 0.6);

  const sunVis = (1 - oc * 0.93) * (1 - fog * 0.6);
  let sun = mul3(k.sun, sunVis);
  let glow = mul3(k.glow, (1 - oc * 0.85) * (1 - fog * 0.35));

  // moon takes over as the light is going
  const moonUp = smooth(0, 0.12, Math.sin(env.moon.altitude));
  const moonAmt = moonUp * (0.25 + 0.75 * env.moon.fraction) * (1 - oc * 0.85);
  const moonKey = mul3([0.5, 0.66, 1.0], 0.085 * moonAmt);
  const useSun = smooth(-7.5, -5, altDeg);
  const sunDir = new THREE.Vector3().fromArray(env.sun.dir);
  const moonDir = new THREE.Vector3().fromArray(env.moon.dir);
  const keyDir = (useSun > 0.5 ? sunDir.clone() : moonDir.clone());
  if (keyDir.y < 0.03) { keyDir.y = 0.03; keyDir.normalize(); }
  const keyColor = add3(mul3(sun, useSun), mul3(moonKey, 1 - useSun));

  const starlight = mul3([0.6, 0.75, 1.0], 0.0055 * night);
  // light from the whole sky, pulled a little toward grey so shadows are cool but not blue paint
  let ambSky = add3(add3(mul3(zen, 1.0), mul3(hor, 0.2)), starlight);
  const al = lum(ambSky);
  ambSky = mix3(ambSky, [al, al, al], 0.3);
  const ambGround = add3(mul3(hor, 0.16), mul3(zen, 0.12));
  const haze = add3(mul3(hor, 0.88), mul3(zen, 0.14));

  const cloudLit = add3(mul3(keyColor, 0.24), mul3(add3(zen, hor), 0.62));
  const cloudDark = add3(mul3(zen, 0.42), mul3(hor, 0.22));

  const month = env.date.getUTCMonth();
  const S = seasonal(env.date);
  const cold = month >= 10 || month <= 3;
  const snowLine = cold ? Math.min(3000, Math.max(260, 120 + env.tempC * 154 + 110)) : 3000;

  const wind = Math.max(0, env.windSpeed);
  const from = env.windFrom * DEG;
  const windVec = [-Math.sin(from) * Math.max(wind, 0.25), Math.cos(from) * Math.max(wind, 0.25)];
  const rain = env.precipKind === 'rain' || env.precipKind === 'sleet' ? clamp01(env.precip / 3 + 0.15) * (env.precip > 0.05 ? 1 : 0) : 0;
  const snowFall = env.precipKind === 'snow' || env.precipKind === 'sleet' ? clamp01(env.precip / 2 + 0.25) * (env.precip > 0.05 ? 1 : 0) : 0;

  const lowCloud = cloud > 0.7 && (env.precip > 0.05 || env.humidity > 0.9 || fog > 0.5);
  const cloudBase = lowCloud ? 430 + (1 - clamp01((env.humidity - 0.8) / 0.2)) * 500 - fog * 150 : 3000;

  const look = {
    sunDir, moonDir, keyDir,
    keyColor, ambSky, ambGround, zen, hor, haze, glow, cloudLit, cloudDark,
    fogDensity: 0.000026 + env.humidity * 0.000016 + Math.min(env.precip, 6) * 0.00011 + fog * 0.0003,
    mistDensity: fog * 0.0034 + (1 - daylight) * 0.0001,
    mistHeight: 6 + fog * 15,
    cloudBase, cloudCover: cloud,
    exposure: k.exp * (1 + oc * 0.12 * daylight),
    night,
    sunDisc: mul3(k.sun, 16 * sunVis * smooth(-1.2, 0.2, altDeg)),
    moonColor: mul3([0.9, 0.93, 1.0], 0.55 * moonUp * (1 - oc * 0.9) * lerp(1, 0.35, daylight)),
    moonFrac: env.moon.fraction,
    stars: night * (1 - smooth(0.25, 0.95, cloud)) * (1 - fog * 0.7),
    grass: S.grass, moor: S.moor, moorB: S.moorB, high: S.high,
    rock: [0.14, 0.135, 0.13], forest: [0.015, 0.032, 0.013], shore: [0.15, 0.13, 0.1], snow: [0.82, 0.86, 0.95],
    tree: [0.012, 0.034, 0.012], treeB: S.treeB,
    snowLine, wet: clamp01(rain * 1.2),
    waterDeep: [0.005, 0.011, 0.015], waterShallow: [0.075, 0.048, 0.02],
    waveAmp: 0.035 + 1.15 * Math.pow(smooth(0.2, 11, wind), 0.8),
    wind: windVec, rain, snowFall,
    // for the page itself
    theme: skyLum(zen, hor, k.exp) > 0.19 ? 'day' : 'night',
    daylight,
  };
  return look;
}

const V3KEYS = {
  uKeyColor: 'keyColor', uAmbSky: 'ambSky', uAmbGround: 'ambGround', uSkyZenith: 'zen', uSkyHorizon: 'hor',
  uHazeColor: 'haze', uSunGlow: 'glow', uCloudLit: 'cloudLit', uCloudDark: 'cloudDark', uSunDisc: 'sunDisc', uMoonColor: 'moonColor',
  uColGrass: 'grass', uColMoor: 'moor', uColMoorB: 'moorB', uColHigh: 'high', uColRock: 'rock', uColForest: 'forest',
  uColShore: 'shore', uColSnow: 'snow', uColTree: 'tree', uColTreeB: 'treeB', uWaterDeep: 'waterDeep', uWaterShallow: 'waterShallow',
};
const FKEYS = {
  uFogDensity: 'fogDensity', uMistDensity: 'mistDensity', uMistHeight: 'mistHeight', uCloudBase: 'cloudBase', uCloudCover: 'cloudCover',
  uExposure: 'exposure', uNight: 'night', uMoonFrac: 'moonFrac', uStars: 'stars', uSnowLine: 'snowLine', uWet: 'wet',
  uWaveAmp: 'waveAmp', uRain: 'rain', uSnowFall: 'snowFall',
};

// Ease the uniforms toward the target look. k = 1 snaps.
export function applyLook(U, look, k) {
  for (const [u, key] of Object.entries(V3KEYS)) {
    const v = U[u].value, t = look[key];
    v.x += (t[0] - v.x) * k; v.y += (t[1] - v.y) * k; v.z += (t[2] - v.z) * k;
  }
  for (const [u, key] of Object.entries(FKEYS)) U[u].value += (look[key] - U[u].value) * k;
  U.uWind.value.x += (look.wind[0] - U.uWind.value.x) * k;
  U.uWind.value.y += (look.wind[1] - U.uWind.value.y) * k;
  // directions swing rather than fade
  if (k >= 1) { U.uSunDir.value.copy(look.sunDir); U.uMoonDir.value.copy(look.moonDir); U.uKeyDir.value.copy(look.keyDir); }
  else {
    U.uSunDir.value.lerp(look.sunDir, k).normalize();
    U.uMoonDir.value.lerp(look.moonDir, k).normalize();
    U.uKeyDir.value.lerp(look.keyDir, k).normalize();
  }
}

// The same tone curve as the shader, for matching the page's CSS to the sky.
export function toCss(c, exposure = 1) {
  const f = (x) => {
    x *= exposure;
    x = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
    return Math.round(Math.pow(clamp01(x), 1 / 2.2) * 255);
  };
  return `rgb(${f(c[0])} ${f(c[1])} ${f(c[2])})`;
}
