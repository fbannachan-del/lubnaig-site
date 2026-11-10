import assert from 'node:assert/strict';
import { createEnv, dirFromAzAlt, LOCH } from '../src/env.js';

const DEG = Math.PI / 180;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
const NOW = new Date('2026-11-09T10:00:00Z');
const results = [];
const test = async (name, fn) => { await fn(); results.push(name); console.log('ok - ' + name); };

const SAMPLE = {
  properties: { timeseries: [
    { time: '2026-11-09T04:00:00Z', data: { instant: { details: { air_temperature: 9, relative_humidity: 60, wind_speed: 6, wind_from_direction: 200, cloud_area_fraction: 90 } } } },
    { time: '2026-11-09T10:00:00Z', data: {
      instant: { details: { air_temperature: 1.3, relative_humidity: 97, wind_speed: 0.9, wind_from_direction: 351.9, cloud_area_fraction: 8.6 } },
      next_1_hours: { summary: { symbol_code: 'clearsky_night' }, details: { precipitation_amount: 0 } } } },
  ] },
};
const okFetch = (calls) => async (url, init) => {
  calls.push({ url, init });
  return { ok: true, json: async () => SAMPLE, headers: { get: () => null } };
};

await test('dir vector maths', () => {
  const a = dirFromAzAlt(0, 0);
  assert.deepStrictEqual(a, [0, 0, 1]);
  const b = dirFromAzAlt(90 * DEG, 0);
  near(b[0], -1, 1e-12, 'x'); near(b[1], 0, 1e-12, 'y'); near(b[2], 0, 1e-12, 'z');
  near(dirFromAzAlt(0, 90 * DEG)[1], 1, 1e-12, 'zenith');
});

await test('successful fetch gives met data', async () => {
  const calls = [];
  const changes = [];
  const env = createEnv({ now: () => NOW, fetchImpl: okFetch(calls), onChange: (s) => changes.push(s) });
  assert.equal(env.state.source, 'default');
  assert.equal(env.state.cloud, 0.6);
  await env.start();
  assert.equal(calls[0].url, 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=56.28&lon=-4.28');
  assert.deepEqual(Object.keys(calls[0].init), ['signal']);
  assert.equal(env.state.source, 'met');
  near(env.state.fog, 0.3, 1e-9, 'fog');
  near(env.state.cloud, 0.086, 1e-9, 'cloud');
  assert.equal(env.state.symbol, 'clearsky_night');
  assert.equal(env.state.precipKind, 'none');
  assert.equal(env.describe().sentence, 'Clear and misty, 1\u00b0C, light air.');
  assert.equal(env.describe().light, 'Live');
  assert.ok(changes.length >= 2 && changes.every((s) => s === env.state));
  const n = changes.length;
  env.tick();
  assert.equal(changes.length, n, 'no notification when nothing changed');
});

await test('rejected fetch falls back to defaults', async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    const env = createEnv({ now: () => NOW, fetchImpl: async () => { throw new Error('offline'); } });
    await env.start();
    assert.equal(env.state.source, 'default');
    assert.equal(env.state.tempC, 5); // November
    assert.equal(env.state.windFrom, 225);
    assert.equal(env.state.symbol, 'cloudy');
  } finally { console.warn = warn; }
});

for (const day of ['2026-11-09T10:00:00Z', '2026-06-21T10:00:00Z']) {
  await test('presets on ' + day.slice(0, 10), () => {
    const env = createEnv({ now: () => new Date(day) });
    env.setPreset('dawn');
    near(env.state.sun.altitude, 6 * DEG, 0.3 * DEG, 'dawn');
    assert.equal(env.state.source, 'preset');
    assert.equal(env.state.fog, 0.3);
    assert.equal(env.describe().light, 'Dawn');
    env.setPreset('day');
    assert.ok(env.state.sun.altitude > 0);
    env.setPreset('dusk');
    near(env.state.sun.altitude, -4.5 * DEG, 0.3 * DEG, 'dusk');
    env.setPreset('night');
    assert.ok(env.state.sun.altitude < 0);
    assert.equal(env.describe().light, 'Night');
    env.setPreset('live');
    assert.equal(env.state.source, 'default');
    assert.equal(env.state.date.getTime(), new Date(day).getTime());
    assert.throws(() => env.setPreset('noon'), RangeError);
  });
}

await test('override merges and clears', () => {
  const env = createEnv({ now: () => NOW });
  const ref = env.state;
  env.setOverride({ cloud: 0.1, tempC: 12, date: '2026-06-21T11:00:00Z' });
  assert.equal(env.state, ref);
  assert.equal(env.state.cloud, 0.1);
  assert.equal(env.state.tempC, 12);
  assert.equal(env.state.windSpeed, 3, 'untouched fields keep their values');
  assert.equal(env.state.date.toISOString(), '2026-06-21T11:00:00.000Z');
  env.tick();
  assert.equal(env.state.cloud, 0.1, 'override persists across ticks');
  env.setOverride(null);
  assert.equal(env.state.cloud, 0.6);
  assert.equal(env.state.date.getTime(), NOW.getTime());
});

await test('describe wording and temperature formatting', () => {
  const env = createEnv({ now: () => NOW });
  env.setOverride({ tempC: -3.4, cloud: 0.5, windSpeed: 6, windFrom: 225 });
  assert.equal(env.describe().sentence, 'Broken cloud, \u22123\u00b0C, a moderate breeze from the south-west.');
  env.setOverride({ tempC: -0.2, fog: 0.9 });
  assert.equal(env.describe().sentence, 'Fog, 0\u00b0C, a light breeze from the south-west.');
  env.setOverride({ tempC: -0.4, precipKind: 'snow', precip: 1, windSpeed: 0.2 });
  assert.equal(env.describe().sentence, 'Snow, 0\u00b0C, calm.');
  env.setOverride({ tempC: 8, precipKind: 'rain', precip: 5, windSpeed: 20, windFrom: 10 });
  assert.equal(env.describe().sentence, 'Heavy rain, 8\u00b0C, a gale from the north.');
  assert.equal(env.describe().place, LOCH.name);
  assert.match(env.describe().time, /^\d\d:\d\d$/);
});

console.log(`${results.length} tests passed`);
