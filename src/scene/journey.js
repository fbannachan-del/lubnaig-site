import * as THREE from 'three';

// The camera's trip down the loch, north to south, keyed to the sections of the page.
// u: 0 at the Strathyre end .. 1 at the Leny end. h: metres above the water.
// side: metres to the right of the centreline when facing south (so west is positive on the lower loch).
// lu / lh / ls: where it looks, as an offset along the loch, a height and a side offset.
// shift: how far the picture is pushed right to leave room for text (fraction of the frame).
export const SHOTS = {
  hero:    { u: 0.08, h: 2.4, side: 70, lu: 0.34, lh: 170, ls: 190, fov: 40, shift: 0 },
  loch:    { u: 0.15, h: 16, side: -40, lu: 0.3, lh: 10, ls: 0, fov: 40, shift: 0.13 },
  promise: { u: 0.235, h: 5, side: 40, lu: 0.26, lh: 110, ls: 0, fov: 38, shift: 0.15 },
  step1:   { u: 0.3, h: 3.2, side: -30, lu: 0.2, lh: 70, ls: 0, fov: 38, shift: 0.17 },
  step2:   { u: 0.37, h: 9, side: 60, lu: 0.2, lh: 40, ls: -120, fov: 38, shift: 0.17 },
  step3:   { u: 0.44, h: 4, side: -70, lu: 0.18, lh: 140, ls: 260, fov: 38, shift: 0.17 },
  step4:   { u: 0.5, h: 14, side: 30, lu: 0.2, lh: 60, ls: 0, fov: 38, shift: 0.17 },
  step5:   { u: 0.57, h: 3.4, side: -50, lu: 0.2, lh: 120, ls: 200, fov: 38, shift: 0.17 },
  step6:   { u: 0.64, h: 7, side: 30, lu: 0.2, lh: 60, ls: 0, fov: 38, shift: 0.17 },
  // from the air, south-east of the loch, looking back up its whole length: the bend the name comes from
  calc:    { pos: [1500, 1250, 4500], look: [-1000, 60, -900], fov: 40, shift: 0.17 },
  feel:    { u: 0.78, h: 3.2, side: -110, lu: 0.1, lh: 330, ls: 1100, fov: 40, shift: 0.15 },
  faq:     { u: 0.87, h: 24, side: 0, lu: 0.1, lh: 10, ls: 0, fov: 40, shift: 0.15 },
  contact: { u: 0.955, h: 2.3, side: 30, lu: -0.5, lh: 150, ls: 0, fov: 40, shift: 0 },
};

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

export function makeJourney(meta, T) {
  const level = meta.lubnaig.level_m;
  const curve = new THREE.CatmullRomCurve3(meta.centreline.map(([x, z]) => new THREE.Vector3(x, level, z)), false, 'centripetal');
  curve.arcLengthDivisions = 400;

  const tan = new THREE.Vector3(), right = new THREE.Vector3();
  const at = (u, side, h, out) => {
    u = clamp(u, 0, 1);
    curve.getPointAt(u, out);
    curve.getTangentAt(u, tan);
    right.set(-tan.z, 0, tan.x).normalize();
    out.addScaledVector(right, side);
    out.y = level + h;
    return out;
  };
  const resolve = (s, pos, dir) => {
    if (s.pos) {
      pos.set(s.pos[0], level + s.pos[1], s.pos[2]);
      dir.set(s.look[0], level + s.look[1], s.look[2]).sub(pos).normalize();
      return;
    }
    at(s.u, s.side, s.h, pos);
    // stay off the hillside
    const ground = T.heightAt(pos.x, pos.z);
    if (pos.y < ground + 2) pos.y = ground + 2;
    at(s.u + s.lu, s.ls, s.lh, dir);
    dir.sub(pos).normalize();
  };

  let anchors = [];   // [{ y, shot }]
  const measure = () => {
    anchors = [...document.querySelectorAll('[data-shot]')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { y: r.top + window.scrollY + r.height / 2, shot: SHOTS[el.dataset.shot], name: el.dataset.shot };
      })
      .filter((a) => a.shot)
      .sort((a, b) => a.y - b.y);
  };

  const pA = new THREE.Vector3(), pB = new THREE.Vector3(), dA = new THREE.Vector3(), dB = new THREE.Vector3(), dC = new THREE.Vector3();
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), m = new THREE.Matrix4(), zero = new THREE.Vector3();
  const quatFor = (dir, q) => { m.lookAt(zero, dir, UP); q.setFromRotationMatrix(m); };
  const mixed = {};

  // Target pose for a scroll position. Writes into out = { pos, quat, fov, shift, u, name }.
  const target = (scrollY, viewH, out) => {
    if (!anchors.length) measure();
    const y = scrollY + viewH * 0.5;
    let i = 0;
    while (i < anchors.length - 2 && y > anchors[i + 1].y) i++;
    const a = anchors[i], b = anchors[Math.min(i + 1, anchors.length - 1)];
    let t = b.y > a.y ? clamp((y - a.y) / (b.y - a.y), 0, 1) : 0;
    t = t * t * (3 - 2 * t);
    resolve(a.shot, pA, dA); resolve(b.shot, pB, dB);
    if (a.shot.pos || b.shot.pos) {
      // to or from the air: climb early, descend late, so the hills are always cleared
      const up = pB.y > pA.y;
      const ev = up ? 1 - (1 - t) * (1 - t) : t * t;
      out.pos.set(lerp(pA.x, pB.x, t), lerp(pA.y, pB.y, ev), lerp(pA.z, pB.z, t));
      const ground = T.heightAt(out.pos.x, out.pos.z);
      if (out.pos.y < ground + 12) out.pos.y = ground + 12;
    } else {
      // along the water: follow the loch round its bend rather than cutting the corner
      for (const k of ['u', 'h', 'side', 'lu', 'lh', 'ls']) mixed[k] = lerp(a.shot[k], b.shot[k], t);
      resolve(mixed, out.pos, dC);
    }
    mixed.fov = lerp(a.shot.fov, b.shot.fov, t); mixed.shift = lerp(a.shot.shift, b.shot.shift, t);
    // look direction: blend the two shots' own directions so a turn-around never passes through a dead point
    quatFor(dA, qA); quatFor(dB, qB);
    out.quat.copy(qA).slerp(qB, t);
    out.fov = mixed.fov; out.shift = mixed.shift;
    out.name = t < 0.5 ? a.name : b.name;
    out.progress = anchors.length > 1 ? clamp((y - anchors[0].y) / (anchors[anchors.length - 1].y - anchors[0].y), 0, 1) : 0;
    return out;
  };

  // outline of the loch for the little progress map: centreline in 0..1 space
  const mapPoints = (count = 60) => {
    const pts = [];
    for (let i = 0; i <= count; i++) { const p = curve.getPointAt(i / count); pts.push([p.x, p.z]); }
    return pts;
  };

  return { measure, target, curve, mapPoints };
}
