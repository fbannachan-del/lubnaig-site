import * as THREE from 'three';

// Rain streaks and snowflakes in a box that travels with the camera. Layer 1: never in the mirror.
const BOX = new THREE.Vector3(46, 30, 46);

export function makePrecip(U, count = 3500) {
  const group = new THREE.Group();

  // rain: two vertices per streak
  const rp = new Float32Array(count * 2 * 3), re = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    rp.set([x, y, z, x, y, z], i * 6);
    re[i * 2] = 0; re[i * 2 + 1] = 1;
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rg.setAttribute('aEnd', new THREE.BufferAttribute(re, 1));
  const shared = { uBox: { value: BOX }, uTime: U.uTime, uWind: U.uWind, uAmbSky: U.uAmbSky, uExposure: U.uExposure };
  const rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
    uniforms: { ...shared, uRain: U.uRain },
    vertexShader: /* glsl */ `
      attribute float aEnd; uniform vec3 uBox; uniform float uTime; uniform vec2 uWind; varying float vA;
      void main(){
        float sp = 17.0 + position.x * 7.0;
        vec3 vel = vec3(uWind.x * 0.8, -sp, uWind.y * 0.8);
        vec3 p = position * uBox + vel * uTime;
        p = mod(p - cameraPosition, uBox) - uBox * 0.5;
        p += normalize(vel) * aEnd * (0.8 + position.z * 0.9);
        vA = (1.0 - aEnd * 0.7) * smoothstep(23.0, 14.0, length(p.xz));
        gl_Position = projectionMatrix * viewMatrix * vec4(p + cameraPosition, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; uniform vec3 uAmbSky; uniform float uRain; uniform float uExposure; varying float vA;
      void main(){ vec3 c = uAmbSky * 1.6 * uExposure + 0.04; gl_FragColor = vec4(pow(c / (1.0 + c), vec3(1.0/2.2)), vA * 0.5 * uRain); }`,
    transparent: true, depthWrite: false,
  }));
  rain.frustumCulled = false; rain.layers.set(1);
  group.add(rain);

  const sp = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) sp[i] = Math.random();
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snow = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: { ...shared, uSnowFall: U.uSnowFall, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      uniform vec3 uBox; uniform float uTime; uniform vec2 uWind; uniform float uScale; varying float vA;
      void main(){
        float sp = 1.1 + position.x * 0.9;
        vec3 p = position * uBox + vec3(uWind.x * 0.9, -sp, uWind.y * 0.9) * uTime;
        p.x += sin(uTime * 0.7 + position.z * 40.0) * 0.4;
        p = mod(p - cameraPosition, uBox) - uBox * 0.5;
        vec4 mv = viewMatrix * vec4(p + cameraPosition, 1.0);
        vA = smoothstep(23.0, 12.0, length(p.xz));
        gl_PointSize = clamp(uScale * (0.03 + position.y * 0.03) / -mv.z, 1.0, 9.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; uniform vec3 uAmbSky; uniform float uSnowFall; uniform float uExposure; varying float vA;
      void main(){
        float r = length(gl_PointCoord - 0.5);
        vec3 c = uAmbSky * 2.4 * uExposure + 0.08;
        gl_FragColor = vec4(pow(c / (1.0 + c), vec3(1.0/2.2)), smoothstep(0.5, 0.15, r) * vA * 0.75 * uSnowFall);
      }`,
    transparent: true, depthWrite: false,
  }));
  snow.frustumCulled = false; snow.layers.set(1);
  group.add(snow);

  group.update = () => {
    rain.visible = U.uRain.value > 0.01;
    snow.visible = U.uSnowFall.value > 0.01;
  };
  group.setHeight = (h) => { snow.material.uniforms.uScale.value = h; };
  return group;
}
