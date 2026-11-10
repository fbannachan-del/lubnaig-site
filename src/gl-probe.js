// Decide, before loading the 3D code, whether this device should draw the loch live and at what quality.
export function probeTier(force = false) {
  let gl = null;
  try {
    const c = document.createElement('canvas');
    gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: !force });
  } catch (e) { gl = null; }
  if (!gl) return null;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  if (!force && /swiftshader|llvmpipe|software|basic render/i.test(name)) return null;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  let tier = 'high';
  if (coarse && small) tier = 'low';
  else if (coarse || cores < 8 || mem < 8) tier = 'mid';
  return { tier, name };
}
