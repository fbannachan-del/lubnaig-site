import Lenis from 'lenis';
import { createEnv } from './env.js';
import { probeTier } from './gl-probe.js';
import { computeLook, toCss } from './scene/look.js';
import meta from './data/meta.json';
import heightUrl from './data/height.png';
import waterUrl from './data/water.png';
import stillUrl from './data/loch-still.jpg';

const params = new URLSearchParams(location.search);
const force = params.has('force');
const still = params.has('still');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches && !force;
const root = document.documentElement;
if (params.has('clean')) root.classList.add('clean');
if (params.has('og')) root.classList.add('og');
const $ = (id) => document.getElementById(id);
const state = (window.__loch = { ready: false, frames: 0 });

// ---------- light and weather ----------
let scene = null;
let needsFrame = true;
const env = createEnv({ onChange: () => onEnv() });

// preview switches, for checking a look without waiting for the weather to oblige
const override = {};
if (params.get('time')) override.date = new Date(params.get('time'));
if (params.get('wx')) {
  for (const part of params.get('wx').split(',')) {
    const [k, v] = part.split(':');
    override[k] = Number.isNaN(Number(v)) ? v : Number(v);
  }
}
const previewing = Object.keys(override).length > 0;
if (previewing) env.setOverride(override);
if (params.get('light') && params.get('light') !== 'live') {
  try { env.setPreset(params.get('light')); } catch (e) { /* unknown preset: stay live */ }
}
env.tick();

function paintTheme(look) {
  root.dataset.light = look.theme;
  root.style.setProperty('--sky-top', toCss(look.zen, look.exposure));
  root.style.setProperty('--sky-low', toCss(look.hor, look.exposure));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', look.theme === 'day' ? '#e9eeec' : '#0a1216');
}

// Only ever call the weather "now" when it is a real reading.
function paintReadout() {
  const d = env.describe();
  const t = $('nowTime');
  t.textContent = d.time;
  t.setAttribute('datetime', env.state.date.toISOString());
  const wx = $('nowWx');
  if (previewing) wx.textContent = `Preview: ${d.sentence}`;
  else if (env.state.preset !== 'live') wx.textContent = `${d.light} light, with typical weather.`;
  else if (env.state.source === 'met') wx.textContent = `Now: ${d.sentence}`;
  else if (env.state.status === 'failed') wx.textContent = 'Live weather is unavailable. Showing a typical day.';
  else wx.textContent = 'Reading the weather';
  document.querySelectorAll('.lights button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === env.state.preset)));
}

function onEnv() {
  const look = scene ? scene.setLook() : computeLook(env.state);
  if (!root.classList.contains('no-gl')) paintTheme(look);
  paintReadout();
  needsFrame = true;
}

document.querySelectorAll('.lights button').forEach((b) => {
  b.addEventListener('click', () => { env.setPreset(b.dataset.preset); env.tick(); onEnv(); });
});

// ---------- page furniture ----------
$('y').textContent = new Date().getFullYear();

// calculator: the same sums as before. A 37.5 hour week and £38,000 a year per role.
const gb = new Intl.NumberFormat('en-GB');
let sayTimer = 0;
function calc() {
  const p = +$('p').value, h = +$('h').value, s = +$('s').value / 100;
  $('oP').textContent = p; $('oH').textContent = h; $('oS').textContent = `${Math.round(s * 100)}%`;
  for (const k of ['p', 'h', 's']) { const el = $(k); el.style.setProperty('--fill', `${((el.value - el.min) / (el.max - el.min)) * 100}%`); }
  const hours = p * h * s, roles = hours / 37.5;
  const hoursTxt = gb.format(Math.round(hours));
  const rolesTxt = roles >= 10 ? gb.format(Math.round(roles)) : roles.toFixed(1);
  const saveTxt = `£${gb.format(Math.round(roles * 38000))}`;
  $('rH').textContent = hoursTxt; $('rF').textContent = rolesTxt; $('rY').textContent = saveTxt;
  // screen readers get one settled sentence, not a stream of numbers while the slider moves
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => {
    $('calcStatus').textContent = `${hoursTxt} hours a week back, ${rolesTxt} full time roles freed, about ${saveTxt} a year if you reduce headcount.`;
  }, 600);
}
['p', 'h', 's'].forEach((k) => $(k).addEventListener('input', calc));
calc();

// the loch itself as the progress marker: its real centreline, smoothed, north at the top
const mapEl = document.querySelector('.map');
const mapPts = (() => {
  const c = meta.centreline;
  const xs = c.map((p) => p[0]), zs = c.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const sc = 148 / (z1 - z0), ox = (60 - (x1 - x0) * sc) / 2;
  const q = c.map(([x, z]) => [ox + (x - x0) * sc, 6 + (z - z0) * sc]);
  const out = [];
  const at = (i) => q[Math.min(q.length - 1, Math.max(0, i))];
  for (let i = 0; i < q.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < 4; k++) {
      const t = k / 4, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (p2[a] - p0[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  out.push(q[q.length - 1]);
  return out;
})();
const mapCum = [0];
for (let i = 1; i < mapPts.length; i++) mapCum.push(mapCum[i - 1] + Math.hypot(mapPts[i][0] - mapPts[i - 1][0], mapPts[i][1] - mapPts[i - 1][1]));
const mapD = mapPts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
mapEl.querySelectorAll('path').forEach((p) => p.setAttribute('d', mapD));
const mapDot = mapEl.querySelector('.map-dot');
function mapPoint(f) {
  const target = f * mapCum[mapCum.length - 1];
  let i = 1;
  while (i < mapCum.length - 1 && mapCum[i] < target) i++;
  const span = mapCum[i] - mapCum[i - 1] || 1, t = (target - mapCum[i - 1]) / span;
  return [mapPts[i - 1][0] + (mapPts[i][0] - mapPts[i - 1][0]) * t, mapPts[i - 1][1] + (mapPts[i][1] - mapPts[i - 1][1]) * t];
}

// on small screens the conditions sit in the hero rather than floating
const nowEl = document.querySelector('.now');
const narrow = matchMedia('(max-width: 899px)');
const placeNow = () => { (narrow.matches ? document.querySelector('.hero-foot') : document.body).appendChild(nowEl); };
narrow.addEventListener('change', placeNow); placeNow();

// ---------- scrolling ----------
const coarse = matchMedia('(pointer: coarse)').matches;
let lenis = !reducedMotion && !coarse && !still ? new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 }) : null;
const dropLenis = () => { if (lenis) { lenis.destroy(); lenis = null; } };

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const t = document.querySelector(a.getAttribute('href'));
    if (!t) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(t, { offset: 0, duration: 1.6 });
    else t.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    // move keyboard focus with the view, so "skip to content" really skips
    if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
    t.focus({ preventScroll: true });
    history.replaceState(null, '', a.getAttribute('href'));
  });
});

const heroEl = document.querySelector('.hero');
function paintScroll() {
  const y = window.scrollY, vh = window.innerHeight;
  const max = Math.max(1, document.documentElement.scrollHeight - vh);
  const p = Math.min(1, Math.max(0, y / max));
  mapEl.style.setProperty('--p', p.toFixed(4));
  const pt = mapPoint(p);
  mapDot.setAttribute('cx', pt[0].toFixed(1)); mapDot.setAttribute('cy', pt[1].toFixed(1));
  const past = Math.min(1, y / (heroEl.offsetHeight * 0.6));
  root.style.setProperty('--map-o', past.toFixed(3));
  root.style.setProperty('--bar-veil', past.toFixed(3));
}

// ---------- the scene ----------
let rafId = 0;
let fellBack = false;

// no usable GPU, or it failed: a still of the loch at dusk, with the page in its night colours
function fallBack() {
  if (fellBack) return;
  fellBack = true;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  scene = null;
  dropLenis();
  root.classList.add('no-gl');
  root.dataset.light = 'night';
  document.querySelector('.still').style.backgroundImage = `url(${stillUrl})`;
  document.querySelector('.lights').hidden = true;
  state.ready = true; state.fallback = true;
  addEventListener('scroll', paintScroll, { passive: true });
  addEventListener('resize', paintScroll);
  setInterval(() => { env.tick(); paintReadout(); }, 30000);
  paintScroll();
}

async function boot() {
  paintTheme(computeLook(env.state));
  paintReadout();
  paintScroll();

  const shot = params.get('shot');
  if (shot) {
    const el = document.querySelector(`[data-shot="${CSS.escape(shot)}"]`);
    if (el) { const r = el.getBoundingClientRect(); window.scrollTo(0, r.top + window.scrollY + r.height / 2 - window.innerHeight / 2); }
  } else if (params.get('p')) {
    window.scrollTo(0, Number(params.get('p')) * (document.documentElement.scrollHeight - window.innerHeight));
  }

  const startWeather = () => {
    if (params.has('offline')) { env.state.status = 'failed'; paintReadout(); return; }
    const done = () => onEnv();
    Promise.resolve(env.start()).then(done, done);
  };

  const probe = probeTier(force);
  const canvas = $('scene');
  if (!probe) { fallBack(); startWeather(); return; }

  let api;
  try {
    const { createLochScene } = await import('./scene/index.js');
    api = await createLochScene({
      canvas, env, tier: params.get('tier') || probe.tier, still, reducedMotion, force,
      assets: { heightUrl, waterUrl, meta },
    });
  } catch (err) {
    console.error('Loch scene failed to start', err);
    fallBack(); startWeather();
    return;
  }
  scene = api;
  onEnv();
  startWeather();

  // if the GPU drops the scene (sleep, driver reset), fall back to the still rather than a blank page
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fallBack(); });

  addEventListener('resize', () => { api.resize(); paintScroll(); needsFrame = true; });
  if (document.fonts?.ready) document.fonts.ready.then(() => api.journey.measure());
  addEventListener('load', () => api.journey.measure());
  document.querySelectorAll('details').forEach((d) => d.addEventListener('toggle', () => api.journey.measure()));

  // the pointer leans the view a little and leaves rings on the water where it passes
  let rx = 0, ry = 0, rt = 0;
  addEventListener('pointermove', (e) => {
    const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
    if (e.pointerType !== 'touch') api.setPointer(nx, ny);
    if (reducedMotion) return;
    const now = performance.now();
    if (now - rt > 130 && Math.hypot(e.clientX - rx, e.clientY - ry) > 22) { rt = now; rx = e.clientX; ry = e.clientY; api.touch(nx, ny, 1); }
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (reducedMotion || e.target.closest('a, button, input, summary, label')) return;
    api.touch(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5, 1.7);
  }, { passive: true });
  state.touch = (x, y, s, age) => api.touch(x, y, s, age);

  let last = performance.now(), lastTick = 0, lastDraw = 0, shown = false;
  function loop(now) {
    rafId = 0;
    if (fellBack || document.hidden) return;
    const dt = (now - last) / 1000; last = now;
    if (lenis) lenis.raf(now);
    if (now - lastTick > 1000) { lastTick = now; env.tick(); paintReadout(); }
    // with reduced motion the picture is a still: draw only when something changed, and now and then for the light
    if (!reducedMotion || needsFrame || api.frames < 3 || now - lastDraw > 2000) {
      api.frame(dt); needsFrame = false; lastDraw = now;
    }
    paintScroll();
    state.frames = api.frames;
    if (!shown && api.frames >= 2) { shown = true; canvas.classList.add('on'); state.ready = true; state.info = api.info(); state.gpu = probe.name; }
    if (api.frames % 30 === 0) state.info = api.info();
    rafId = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => {
    if (fellBack || document.hidden || rafId) return;
    last = performance.now(); api.resetPacing();
    rafId = requestAnimationFrame(loop);
  });
  rafId = requestAnimationFrame(loop);
}

boot();
