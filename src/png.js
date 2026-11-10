// A minimal PNG reader for the terrain data: 8-bit RGB or RGBA, not interlaced.
// It exists so the heights never pass through a canvas. Privacy-minded browsers deliberately
// perturb canvas read-back, and one flipped bit in the high byte would be a 128 metre spike.
export async function decodePng(buffer) {
  const u8 = new Uint8Array(buffer), dv = new DataView(buffer);
  let p = 8, w = 0, h = 0, depth = 0, type = 0;
  const idat = [];
  while (p + 8 <= u8.length) {
    const len = dv.getUint32(p);
    const tag = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
    if (tag === 'IHDR') {
      w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); depth = u8[p + 16]; type = u8[p + 17];
      if (u8[p + 20] !== 0) throw new Error('interlaced PNG');
    } else if (tag === 'IDAT') idat.push(u8.subarray(p + 8, p + 8 + len));
    else if (tag === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6)) throw new Error('unsupported PNG');
  const ch = type === 2 ? 3 : 4, stride = w * ch;
  const inflated = new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(inflated).arrayBuffer());
  if (raw.length < h * (stride + 1)) throw new Error('truncated PNG');
  const out = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[dst + x - ch] : 0;
      const b = y ? out[dst - stride + x] : 0;
      const c = x >= ch && y ? out[dst - stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[dst + x] = v & 255;
    }
  }
  return { width: w, height: h, channels: ch, data: out };
}
