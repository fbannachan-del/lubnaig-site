// The hand-rolled PNG reader must reproduce the baked terrain exactly.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodePng } from '../src/png.js';
const meta = JSON.parse(await readFile(new URL('../src/data/meta.json', import.meta.url)));
for (const name of ['height.png', 'water.png']) {
  const buf = await readFile(new URL('../src/data/' + name, import.meta.url));
  const img = await decodePng(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.equal(img.width, meta.n); assert.equal(img.height, meta.n);
  if (name === 'height.png') {
    let lo = Infinity, hi = -Infinity, blue = 0;
    for (let i = 0; i < meta.n * meta.n; i++) {
      const h = ((img.data[i * img.channels] << 8) | img.data[i * img.channels + 1]) * 0.5;
      lo = Math.min(lo, h); hi = Math.max(hi, h); blue += img.data[i * img.channels + 2];
    }
    assert.ok(Math.abs(lo - meta.min_height_m) <= 0.26, `min ${lo}`);
    assert.ok(Math.abs(hi - meta.max_height_m) <= 0.26, `max ${hi}`);
    assert.equal(blue, 0);
    console.log(`ok - ${name}: ${img.width}x${img.height}, ${lo} to ${hi} m`);
  } else console.log(`ok - ${name}: ${img.width}x${img.height}`);
}
