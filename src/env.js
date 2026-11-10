// Light and weather at Loch Lubnaig, for the WebGL scene.
// One mutable `state` object; the scene keeps a reference and reads it each frame.
import * as SunCalc from 'suncalc';

export const LOCH = { lat: 56.28, lon: -4.28, name: 'Loch Lubnaig', tz: 'Europe/London' };

const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=56.28&lon=-4.28';
const MIN_MS = 10 * 60e3;
const MAX_MS = 60 * 60e3;
const TIMEOUT_MS = 8000;
const DAY_MS = 86400e3;
const RAD = Math.PI / 180;
const MONTH_TEMP = [3, 3, 5, 7, 10, 13, 15, 14, 12, 9, 5, 3];
const WEATHER_KEYS = ['cloud', 'fog', 'precip', 'precipKind', 'windSpeed', 'windFrom', 'tempC', 'humidity', 'symbol'];
const LABELS = { live: 'Live', dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' };
const PRESET_WEATHER = {
  dawn: { cloud: 0.25, fog: 0.3, windSpeed: 0.6, windFrom: 250, tempC: 2, humidity: 0.97, precip: 0 },
  day: { cloud: 0.45, fog: 0, windSpeed: 4, windFrom: 240, tempC: 9, humidity: 0.7, precip: 0 },
  dusk: { cloud: 0.35, fog: 0.1, windSpeed: 1.5, windFrom: 260, tempC: 5, humidity: 0.85, precip: 0 },
  night: { cloud: 0.08, fog: 0.2, windSpeed: 0.5, windFrom: 350, tempC: 0, humidity: 0.95, precip: 0 },
};
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: LOCH.tz });

// World frame: +X east, +Y up, +Z south. SunCalc azimuth is 0 at south, positive toward west.
// Writes into `out` in place; `+ 0` turns -0 into 0.
export function dirFromAzAlt(az, alt, out = [0, 0, 0]) {
  out[0] = -Math.sin(az) * Math.cos(alt) + 0;
  out[1] = Math.sin(alt) + 0;
  out[2] = Math.cos(az) * Math.cos(alt) + 0;
  return out;
}

function defaultWeather(date) {
  return {
    cloud: 0.6, fog: 0, precip: 0, precipKind: 'none', windSpeed: 3, windFrom: 225,
    humidity: 0.85, symbol: 'cloudy', tempC: MONTH_TEMP[date.getUTCMonth()],
  };
}

// Pick the timeseries entry closest to `nowMs` and convert it to our fields.
function parseMet(body, nowMs) {
  const series = body && body.properties && body.properties.timeseries;
  if (!Array.isArray(series) || !series.length) throw new Error('no timeseries');
  let best = null;
  let bestGap = Infinity;
  for (const entry of series) {
    const gap = Math.abs(Date.parse(entry.time) - nowMs);
    if (gap < bestGap) { best = entry; bestGap = gap; }
  }
  if (bestGap > 3 * 3600e3) throw new Error('forecast does not cover the present hour');
  const d = best.data.instant.details;
  const tempC = d.air_temperature;
  const humidity = d.relative_humidity / 100;
  const windSpeed = d.wind_speed;
  const windFrom = d.wind_from_direction;
  const cloud = clamp(d.cloud_area_fraction / 100, 0, 1);
  if (![tempC, humidity, windSpeed, windFrom, cloud].every(Number.isFinite)) throw new Error('bad instant details');
  const next = best.data.next_1_hours;
  const symbol = (next && next.summary && next.summary.symbol_code) || 'cloudy';
  const p = next && next.details && next.details.precipitation_amount;
  const precip = Number.isFinite(p) ? p : 0;
  let precipKind = 'none';
  if (symbol.includes('snow')) precipKind = 'snow';
  else if (symbol.includes('sleet')) precipKind = 'sleet';
  else if (symbol.includes('rain')) precipKind = 'rain';
  else if (precip > 0.1) precipKind = tempC <= 0.5 ? 'snow' : 'rain';
  let fog = 0;
  if (symbol.startsWith('fog')) fog = 0.85;
  else if (humidity >= 0.95 && windSpeed < 2 && tempC < 8) fog = 0.2 + 0.25 * Math.min(1, (humidity - 0.95) / 0.05);
  return { cloud, fog, precip, precipKind, windSpeed, windFrom, tempC, humidity, symbol };
}

// suncalc 2.x reports degrees, with azimuth clockwise from north. Everything in this module uses
// radians, with azimuth measured from south and positive toward west, so convert at the door.
function sunAt(date) {
  const p = SunCalc.getPosition(date, LOCH.lat, LOCH.lon);
  return { altitude: p.altitude * RAD, azimuth: (p.azimuth - 180) * RAD };
}
function moonAt(date) {
  const p = SunCalc.getMoonPosition(date, LOCH.lat, LOCH.lon);
  return { altitude: p.altitude * RAD, azimuth: (p.azimuth - 180) * RAD };
}

// Find the moment in [lo, hi] (ms) where sun altitude crosses `target` radians; null if it does not.
function bisectAltitude(lo, hi, target) {
  const g = (t) => sunAt(new Date(t)).altitude - target;
  let glo = g(lo);
  if (glo * g(hi) > 0) return null;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const gm = g(mid);
    if (gm * glo <= 0) hi = mid; else { lo = mid; glo = gm; }
  }
  return new Date((lo + hi) / 2);
}

function presetDate(name, nowDate) {
  const t = SunCalc.getTimes(nowDate, LOCH.lat, LOCH.lon);
  const noon = t.solarNoon.getTime();
  if (name === 'day') return t.solarNoon;
  if (name === 'dawn') return bisectAltitude(t.nadir.getTime(), noon, 6 * RAD) || t.sunrise;
  if (name === 'dusk') return bisectAltitude(noon, t.nadir.getTime() + DAY_MS, -4.5 * RAD) || t.sunset;
  // night: the nadir of the coming night
  if (t.nadir.getTime() > nowDate.getTime()) return t.nadir;
  return SunCalc.getTimes(new Date(nowDate.getTime() + DAY_MS), LOCH.lat, LOCH.lon).nadir;
}

export function createEnv(opts = {}) {
  const clock = () => new Date(opts.now ? opts.now() : Date.now());
  const doFetch = opts.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const state = {
    date: clock(), preset: 'live', source: 'default',
    status: 'pending',   // 'pending' until a weather request has finished, then 'ok' or 'failed'
    sun: { altitude: 0, azimuth: 0, dir: [0, 0, 0] },
    moon: { altitude: 0, azimuth: 0, dir: [0, 0, 0], fraction: 0, phase: 0 },
    ...defaultWeather(clock()),
  };
  let live = defaultWeather(clock());
  let liveSource = 'default';
  let hasMet = false;
  let metAt = 0;
  let fixedDate = null;
  let override = null;
  let dirty = true;
  let lastAlt = null;
  let lastKey = '';
  let timer = null;
  let nextAt = 0;
  let inflight = null;
  let listening = false;

  const hidden = () => typeof document !== 'undefined' && !!document.hidden;

  function tick() {
    const isLive = state.preset === 'live';
    const { date: overrideDate, ...overrideWeather } = override || {};
    let date = isLive ? clock() : new Date(fixedDate);
    if (overrideDate != null) date = new Date(overrideDate);
    const base = isLive ? live : { ...PRESET_WEATHER[state.preset], precipKind: 'none', symbol: 'preset-' + state.preset };
    state.date = date;
    state.source = isLive ? liveSource : 'preset';
    Object.assign(state, base, overrideWeather);

    const sp = sunAt(date);
    state.sun.altitude = sp.altitude;
    state.sun.azimuth = sp.azimuth;
    dirFromAzAlt(sp.azimuth, sp.altitude, state.sun.dir);
    const mp = moonAt(date);
    const mi = SunCalc.getMoonIllumination(date);
    state.moon.altitude = mp.altitude;
    state.moon.azimuth = mp.azimuth;
    dirFromAzAlt(mp.azimuth, mp.altitude, state.moon.dir);
    state.moon.fraction = mi.fraction;
    state.moon.phase = mi.phase;

    const key = [state.source, state.preset, ...WEATHER_KEYS.map((k) => state[k])].join('|');
    if (dirty || lastAlt === null || key !== lastKey || Math.abs(sp.altitude - lastAlt) > 0.05 * RAD) {
      dirty = false;
      lastAlt = sp.altitude;
      lastKey = key;
      if (opts.onChange) opts.onChange(state);
    }
  }

  function schedule(delay) {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { if (!hidden()) refresh(); }, delay);
    if (timer && timer.unref) timer.unref();
  }

  function refresh() {
    if (inflight) return inflight;
    if (!doFetch || hidden()) return Promise.resolve();
    inflight = (async () => {
      const ctl = new AbortController();
      const timeout = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      let delay = MIN_MS;
      try {
        const res = await doFetch(MET_URL, { signal: ctl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        live = parseMet(await res.json(), clock().getTime());
        liveSource = 'met';
        hasMet = true;
        metAt = clock().getTime();
        state.status = 'ok';
        const expires = Date.parse(res.headers && res.headers.get ? res.headers.get('Expires') : '');
        delay = Number.isFinite(expires) ? clamp(expires - clock().getTime(), MIN_MS, MAX_MS) : 30 * 60e3;
      } catch (err) {
        console.warn('env: weather fetch failed, using defaults:', err && err.message ? err.message : err);
        // a reading under three hours old is still the real weather; older than that, stop claiming it
        if (!hasMet || clock().getTime() - metAt > 3 * 3600e3) {
          live = defaultWeather(clock());
          liveSource = 'default';
          hasMet = false;
          state.status = 'failed';
        }
      } finally {
        clearTimeout(timeout);
      }
      nextAt = clock().getTime() + delay;
      schedule(delay);
      tick();
    })().finally(() => { inflight = null; });
    return inflight;
  }

  function start() {
    if (!listening && typeof document !== 'undefined' && document.addEventListener) {
      listening = true;
      document.addEventListener('visibilitychange', () => {
        if (!hidden() && clock().getTime() >= nextAt) refresh();
      });
    }
    tick();
    return refresh(); // not awaited by the scene; returned so tests can wait for it
  }

  function setPreset(name) {
    if (!(name in LABELS)) throw new RangeError('unknown preset: ' + name);
    state.preset = name;
    fixedDate = name === 'live' ? null : presetDate(name, clock());
    dirty = true;
    tick();
  }

  function setOverride(obj) {
    override = obj ? { ...obj } : null;
    dirty = true;
    tick();
  }

  function describe() {
    const time = timeFmt.format(state.date).replace(/^24/, '00');
    const { cloud, fog, precip, precipKind, tempC, windSpeed, windFrom } = state;
    let sky;
    if (fog > 0.6) sky = 'Fog';
    else if (precipKind === 'snow') sky = precip < 0.5 ? 'Light snow' : 'Snow';
    else if (precipKind === 'sleet') sky = 'Sleet';
    else if (precipKind === 'rain') sky = precip < 0.5 ? 'Light rain' : precip < 4 ? 'Rain' : 'Heavy rain';
    else {
      sky = cloud < 0.12 ? 'Clear' : cloud < 0.35 ? 'Mostly clear' : cloud < 0.65 ? 'Broken cloud' : cloud < 0.9 ? 'Mostly cloudy' : 'Overcast';
      if (fog >= 0.2 && fog <= 0.6) sky += ' and misty';
    }
    const t = Math.round(tempC);
    const temp = t < 0 ? '−' + -t : String(t === 0 ? 0 : t);
    const steps = [[0.5, 'calm'], [1.6, 'light air'], [3.4, 'a light breeze'], [5.5, 'a gentle breeze'],
      [8, 'a moderate breeze'], [10.8, 'a fresh breeze'], [13.9, 'a strong breeze'], [17.2, 'a near gale']];
    const found = steps.find(([limit]) => windSpeed < limit);
    let wind = found ? found[1] : 'a gale';
    if (windSpeed >= 1.6) wind += ' from the ' + COMPASS[Math.round((((windFrom % 360) + 360) % 360) / 45) % 8];
    return { place: LOCH.name, time, sentence: `${sky}, ${temp}°C, ${wind}.`, light: LABELS[state.preset] };
  }

  return { state, start, tick, setPreset, setOverride, describe };
}
