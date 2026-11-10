import{A as Me,B as Oe,C as J,D as Ge,E as K,F as je,G as Ie,H as Ke,I as $e,J as Qe,K as Xe,L as Ye,M as ve,N as Ze,O as Je,P as U,Q as et,R as tt,S as ot,T as at,U as rt,V as Re,W as xe,b as De,c as We,d as Fe,e as Pe,f as ce,g as X,h as ue,i as fe,j as me,k as Be,l as Le,m as de,n as qe,o as Ve,p as I,q as A,r as re,s as he,t as Y,u as _e,v as Ne,w as Ee,x as pe,y as Ue,z as Z}from"/assets/chunk-CY3CZG4D.js";var $=`
precision highp float;

uniform float uTime;
uniform float uSize;        // side of the terrain square in metres
uniform float uWaterLevel;  // loch surface, metres
uniform vec3  uSunDir;
uniform vec3  uMoonDir;
uniform vec3  uKeyDir;      // whichever of sun or moon is lighting the land
uniform vec3  uKeyColor;
uniform vec3  uAmbSky;
uniform vec3  uAmbGround;
uniform vec3  uSkyZenith;
uniform vec3  uSkyHorizon;
uniform vec3  uHazeColor;
uniform vec3  uSunGlow;
uniform float uFogDensity;
uniform float uMistDensity;
uniform float uMistHeight;
uniform float uCloudBase;
uniform float uCloudCover;
uniform vec3  uCloudLit;
uniform vec3  uCloudDark;
uniform vec2  uWind;        // metres per second, world xz
uniform float uExposure;
uniform float uReflPass;    // 1 while rendering the mirror image for the water
uniform float uNight;       // 0 day .. 1 night

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3){
  p3 = fract(p3 * .1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x),
             mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
}
// value noise with analytic derivatives: x = value, yz = gradient
vec3 noised(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 du = 30.0*f*f*(f*(f-2.0)+1.0);
  float a = hash12(i), b = hash12(i+vec2(1,0)), c = hash12(i+vec2(0,1)), d = hash12(i+vec2(1,1));
  float k1 = b-a, k2 = c-a, k4 = a-b-c+d;
  return vec3(a + k1*u.x + k2*u.y + k4*u.x*u.y, du*vec2(k1 + k4*u.y, k2 + k4*u.x));
}
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p){
  float a = .5, s = 0.;
  for (int i = 0; i < 5; i++){ s += a*vnoise(p); p = ROT*p*2.03 + vec2(17.1, 9.2); a *= .5; }
  return s;
}
float fbm3(vec2 p){
  float a = .5, s = 0.;
  for (int i = 0; i < 3; i++){ s += a*vnoise(p); p = ROT*p*2.03 + vec2(17.1, 9.2); a *= .5; }
  return s;
}

// Cloud field shared by the sky and by the shadows it drops on the hills.
const float CLOUD_H = 2600.0;
float cloudDensity(vec2 uv){
  return fbm(uv*1.15)*0.74 + fbm3(uv*3.3 + 5.0)*0.26;
}
float cloudAlpha(float dens){
  float thr = mix(0.80, 0.24, uCloudCover);
  return smoothstep(thr, thr + 0.2, dens);
}
vec2 cloudUV(vec2 worldXZ){
  return worldXZ / CLOUD_H * 0.9 + uWind * uTime * 0.0035;
}
float cloudShadow(vec3 wp){
  if (uReflPass > 0.5) return 1.0 - uCloudCover * 0.25;   // the mirror image does without moving shadows
  vec3 k = uKeyDir;
  vec2 at = wp.xz + k.xz / max(k.y, 0.12) * (CLOUD_H - wp.y);
  float a = cloudAlpha(cloudDensity(cloudUV(at)));
  return 1.0 - a * mix(0.55, 0.25, uCloudCover);
}

// Colour of the haze in a given direction: what distance fades into.
vec3 hazeColor(vec3 dir){
  float sd = max(dot(dir, uSunDir), 0.0);
  return uHazeColor + uSunGlow * (pow(sd, 5.0)*0.55 + pow(sd, 24.0)*0.6);
}

vec3 skyGradient(vec3 d){
  float h = max(d.y, 0.0);
  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(h, 0.42));
  float band = exp(-h * 9.0);
  c = mix(c, hazeColor(d), band * 0.85);
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunGlow * (pow(sd, 10.0)*0.35 + pow(sd, 90.0)*0.9) * (1.0 - band*0.5);
  return c;
}

// Distance haze plus low mist lying on the water, plus hills vanishing into the cloud base.
vec3 applyAtmosphere(vec3 col, vec3 wp){
  vec3 v = wp - cameraPosition;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-3);
  float y0 = cameraPosition.y - uWaterLevel;
  float dy = dir.y;
  if (uReflPass > 0.5){
    // mirror image: the light really travelled above the water the whole way
    y0 = 0.0;
    dy = max(wp.y - uWaterLevel, 0.0) / max(dist, 1.0);
    dir.y = abs(dir.y);
  }
  float fd = 1.0 - exp(-dist * uFogDensity);
  float b = 1.0 / uMistHeight;
  float k = dy * b;
  float along = abs(k) < 1e-5 ? dist : (1.0 - exp(-dist * k)) / k;
  float integ = uMistDensity * exp(-max(y0, 0.0) * b) * along;
  float fm = 1.0 - exp(-max(integ, 0.0));
  float f = 1.0 - (1.0 - fd) * (1.0 - fm);
  float rim = max(abs(wp.x), abs(wp.z)) / (uSize * 0.5);
  f = max(f, smoothstep(0.8, 0.985, rim));
  col = mix(col, hazeColor(dir), clamp(f, 0.0, 1.0));
  float n = vnoise(wp.xz * 0.0011 + uTime * 0.004) - 0.5;
  float cb = smoothstep(uCloudBase - 90.0, uCloudBase + 160.0, wp.y + n * 220.0);
  col = mix(col, mix(uCloudDark, uCloudLit, 0.45), cb * 0.96);
  return col;
}

vec3 finalize(vec3 c){
  if (uReflPass > 0.5) return c;
  c *= uExposure;
  // filmic curve
  c = (c*(2.51*c + 0.03)) / (c*(2.43*c + 0.59) + 0.14);
  c = clamp(c, 0.0, 1.0);
  // a little toe lift so night never crushes to pure black
  c = mix(c, sqrt(c), 0.06 * uNight);
  c = pow(c, vec3(1.0/2.2));
  c += (hash12(gl_FragCoord.xy + fract(uTime)*61.0) - 0.5) / 255.0 * 1.6;
  return c;
}
`,nt=`
vec2 waveSlope(vec2 p, float t, float lod){
  vec2 w = normalize(uWind + vec2(1e-3, 0.0));
  mat2 toWind = mat2(w.x, -w.y, w.y, w.x);
  vec2 q = toWind * p;
  vec2 g = vec2(0.0);
  float sp = 0.35 + length(uWind) * 0.22;
  // long, lazy swell
  vec3 n = noised(vec2(q.x*0.11, q.y*0.035) - vec2(t*sp*0.11, 0.0));
  g += vec2(n.y*0.11, n.z*0.035) * 1.9;
  n = noised(ROT*vec2(q.x*0.27, q.y*0.09) - vec2(t*sp*0.24, t*0.02));
  vec2 gr = n.yz * ROT;
  g += vec2(gr.x*0.27, gr.y*0.09) * 0.9 * lod;
  // fine ripples
  n = noised(vec2(q.x*0.9, q.y*0.33) - vec2(t*sp*0.8, t*0.05));
  g += vec2(n.y*0.9, n.z*0.33) * 0.24 * lod * lod;
  n = noised(ROT*vec2(q.x*2.3, q.y*0.9) + vec2(-t*sp*1.7, t*0.11));
  gr = n.yz * ROT;
  g += vec2(gr.x*2.3, gr.y*0.9) * 0.07 * lod * lod * lod;
  return g * toWind;
}
// expanding rings where raindrops land
vec2 rainRings(vec2 p, float t){
  vec2 g = vec2(0.0);
  for (int k = 0; k < 2; k++){
    vec2 pp = p * (k == 0 ? 0.9 : 1.7) + float(k)*13.7;
    vec2 cell = floor(pp), f = fract(pp);
    float h = hash12(cell + float(k)*7.0);
    float age = fract(t*0.9 + h);
    vec2 c = vec2(hash12(cell+3.1), hash12(cell+8.7))*0.6 + 0.2;
    vec2 d = f - c; float r = length(d);
    float ring = sin((r - age*0.55)*46.0) * smoothstep(0.08, 0.0, abs(r - age*0.55)) * (1.0 - age);
    g += (d / max(r, 1e-3)) * ring;
  }
  return g;
}
`;async function it(f){let t=new Uint8Array(f),e=new DataView(f),a=8,h=0,m=0,i=0,n=0,r=[];for(;a+8<=t.length;){let c=e.getUint32(a),T=String.fromCharCode(t[a+4],t[a+5],t[a+6],t[a+7]);if(T==="IHDR"){if(h=e.getUint32(a+8),m=e.getUint32(a+12),i=t[a+16],n=t[a+17],t[a+20]!==0)throw new Error("interlaced PNG")}else if(T==="IDAT")r.push(t.subarray(a+8,a+8+c));else if(T==="IEND")break;a+=12+c}if(i!==8||n!==2&&n!==6)throw new Error("unsupported PNG");let l=n===2?3:4,p=h*l,d=new Blob(r).stream().pipeThrough(new DecompressionStream("deflate")),w=new Uint8Array(await new Response(d).arrayBuffer());if(w.length<m*(p+1))throw new Error("truncated PNG");let x=new Uint8Array(m*p);for(let c=0;c<m;c++){let T=w[c*(p+1)],R=c*(p+1)+1,C=c*p;for(let D=0;D<p;D++){let k=D>=l?x[C+D-l]:0,S=c?x[C-p+D]:0,g=D>=l&&c?x[C-p+D-l]:0,M=w[R+D];if(T===1)M+=k;else if(T===2)M+=S;else if(T===3)M+=k+S>>1;else if(T===4){let o=Math.abs(S-g),u=Math.abs(k-g),v=Math.abs(k+S-2*g);M+=o<=u&&o<=v?k:u<=v?S:g}x[C+D]=M&255}}return{width:h,height:m,channels:l,data:x}}async function st(f){let t=await fetch(f);if(!t.ok)throw new Error(`terrain asset ${f}: ${t.status}`);let e=await t.arrayBuffer();if(typeof DecompressionStream=="function")try{return await it(e)}catch(n){console.warn("terrain: falling back to canvas decode",n)}let a=new Blob([e],{type:"image/png"}),h=await createImageBitmap(a,{premultiplyAlpha:"none",colorSpaceConversion:"none"}),m=document.createElement("canvas");m.width=h.width,m.height=h.height;let i=m.getContext("2d",{willReadFrequently:!0});return i.drawImage(h,0,0),{data:i.getImageData(0,0,h.width,h.height).data,channels:4}}function ge(f,t){let e=Math.imul(f|0,374761393)^Math.imul(t|0,668265263);return e=Math.imul(e^e>>>13,1274126177),((e^e>>>16)>>>0)/4294967295}function bt(f,t){let e=Math.floor(f),a=Math.floor(t),h=f-e,m=t-a,i=h*h*(3-2*h),n=m*m*(3-2*m),r=ge(e,a),l=ge(e+1,a),p=ge(e,a+1),d=ge(e+1,a+1);return r+(l-r)*i+(p-r)*n+(r-l-p+d)*i*n}function lt(f,t){let e=0,a=.5;for(let h=0;h<4;h++)e+=a*bt(f,t),f=f*2.03+17.1,t=t*2.03+9.2,a*=.5;return e}function be(f,t,e){let a=new Float32Array(t*t),h=new Float32Array(t*t),m=2*e+1;for(let i=0;i<t;i++){let n=0;for(let r=-e;r<=e;r++)n+=f[i*t+Math.min(t-1,Math.max(0,r))];for(let r=0;r<t;r++)a[i*t+r]=n/m,n+=f[i*t+Math.min(t-1,r+e+1)]-f[i*t+Math.max(0,r-e)]}for(let i=0;i<t;i++){let n=0;for(let r=-e;r<=e;r++)n+=a[Math.min(t-1,Math.max(0,r))*t+i];for(let r=0;r<t;r++)h[r*t+i]=n/m,n+=a[Math.min(t-1,r+e+1)*t+i]-a[Math.max(0,r-e)*t+i]}return h}async function ct(f,t,e){let[a,h]=await Promise.all([st(f),st(t)]),m=a.data,i=a.channels,n=h.data,r=h.channels,l=e.n,p=e.size_m,d=e.texel_m,w=e.lubnaig.level_m,x=l*l,c=new Float32Array(x),T=new Float32Array(x),R=new Float32Array(x);for(let s=0;s<x;s++)c[s]=(m[s*i]<<8|m[s*i+1])*.5,T[s]=(n[s*r]-128)*2,R[s]=(n[s*r+1]-128)*2;T=be(T,l,1);let C=new Float32Array(x);for(let s=0;s<x;s++){let E=T[s];C[s]=E>0?w-Math.min(E*.09,22):Math.max(c[s],w-E*.04*Math.exp(E/60))}let D=be(c,l,9),k=be(c,l,3),S=new Uint8Array(x*4),g=new Float32Array(x);for(let s=0;s<l;s++)for(let E=0;E<l;E++){let b=s*l+E,z=c[s*l+Math.max(0,E-1)],V=c[s*l+Math.min(l-1,E+1)],N=c[Math.max(0,s-1)*l+E],_=c[Math.min(l-1,s+1)*l+E],B=(z-V)/(2*d),q=(N-_)/(2*d),P=1,oe=Math.hypot(B,P,q);B/=oe,P/=oe,q/=oe,g[b]=1-P;let ie=1-Math.min(.55,Math.max(0,(D[b]-c[b])/150)+Math.max(0,(k[b]-c[b])/40)*.5);S[b*4]=(B*.5+.5)*255,S[b*4+1]=(P*.5+.5)*255,S[b*4+2]=(q*.5+.5)*255,S[b*4+3]=ie*255}let M=new Float32Array(x),o=new Uint8Array(x*4);for(let s=0;s<l;s++)for(let E=0;E<l;E++){let b=s*l+E,z=(E+.5)*d-p/2,V=(s+.5)*d-p/2,N=c[b]-w,_=lt(z*.0011+40,V*.0011+12),B=Math.exp(-Math.abs(T[b])/420),q=250+170*lt(z*7e-4,V*7e-4),P=0;T[b]<-4&&R[b]<-4&&N>1.2&&N<q&&g[b]<.2&&(P=Math.min(1,Math.max(0,(_+B*.34-.47)*6)),P*=Math.min(1,Math.max(0,(q-N)/60)),g[b]<.0035&&N<16&&(P*=.15)),M[b]=P,o[b*4]=Math.max(0,Math.min(255,128+T[b]/2)),o[b*4+1]=Math.max(0,Math.min(255,128+R[b]/2)),o[b*4+2]=P*255,o[b*4+3]=255}let u=(s,E=fe,b=Be)=>{let z=new je(s,l,l,b,E);return z.magFilter=X,z.minFilter=X,z.wrapS=z.wrapT=ce,z.colorSpace=de,z.needsUpdate=!0,z},v=u(S);v.minFilter=ue,v.generateMipmaps=!0,v.anisotropy=4;let y=u(o),F=new Uint16Array(x);for(let s=0;s<x;s++)F[s]=Ue.toHalfFloat(c[s]);let H=u(F,me,Le),W=(s,E,b)=>{let z=Math.min(l-1.001,Math.max(0,(E+p/2)/d-.5)),V=Math.min(l-1.001,Math.max(0,(b+p/2)/d-.5)),N=Math.floor(z),_=Math.floor(V),B=z-N,q=V-_,P=_*l+N;return(s[P]*(1-B)+s[P+1]*B)*(1-q)+(s[P+l]*(1-B)+s[P+l+1]*B)*q};return{n:l,size:p,texel:d,level:w,H:c,Y:C,sdL:T,sdO:R,forest:M,slope:g,tNormal:v,tMask:y,tHeight:H,heightAt:(s,E)=>W(C,s,E),shoreAt:(s,E)=>W(T,s,E),forestAt:(s,E)=>W(M,s,E),slopeAt:(s,E)=>W(g,s,E),otherWaterAt:(s,E)=>W(R,s,E)}}function ut(f,t=2,e={x0:-3900,x1:1900,z0:-4500,z1:3700}){let{n:a,size:h,texel:m}=f,i=t,n=Math.floor((a-1)/i)*i,r=g=>(g+h/2)/m-.5,l=(g,M)=>Math.min(n,Math.max(0,(M?Math.ceil(g/i):Math.floor(g/i))*i)),p=l(r(e.x0),!0),d=l(r(e.x1),!1),w=l(r(e.z0),!0),x=l(r(e.z1),!1),c=Float32Array.from(f.Y),T=(g,M)=>{let o=M?p:w,u=M?d:x;for(let v=o;v<u;v+=i)for(let y=1;y<i;y++){let F=y/i,H=W=>M?g*a+W:W*a+g;c[H(v+y)]=c[H(v)]*(1-F)+c[H(v+i)]*F}};i>1&&(T(w,!0),T(x,!0),T(p,!1),T(d,!1));let R=n+1,C=new Float32Array(R*R*3);for(let g=0;g<R;g++)for(let M=0;M<R;M++){let o=(g*R+M)*3;C[o]=(M+.5)*m-h/2,C[o+1]=c[g*a+M],C[o+2]=(g+.5)*m-h/2}let D=[],k=(g,M,o)=>{let u=M*R+g,v=u+o,y=u+o*R,F=y+o;D.push(u,y,v,v,y,F)};for(let g=0;g<n;g+=i)for(let M=0;M<n;M+=i)if(M>=p&&M+i<=d&&g>=w&&g+i<=x&&i>1)for(let u=0;u<i;u++)for(let v=0;v<i;v++)k(M+v,g+u,1);else k(M,g,i);let S=new J;return S.setAttribute("position",new Z(C,3)),S.setIndex(new Z(new Uint32Array(D),1)),S.boundingSphere=new Oe(new A(0,400,0),h),S}var Tt=`
varying vec3 vWorld;
void main(){
  vWorld = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`,St=`
${$}
uniform sampler2D tNormal;
uniform sampler2D tMask;
uniform sampler2D tShadow;
uniform vec3 uColGrass;
uniform vec3 uColMoor;
uniform vec3 uColMoorB;
uniform vec3 uColHigh;
uniform vec3 uColRock;
uniform vec3 uColForest;
uniform vec3 uColShore;
uniform vec3 uColSnow;
uniform float uSnowLine;
uniform float uWet;
uniform vec3 uWaterDeep;
varying vec3 vWorld;

void main(){
  vec2 uv = vWorld.xz / uSize + 0.5;
  vec4 nt = texture2D(tNormal, uv);
  vec3 N = normalize(nt.xyz * 2.0 - 1.0);
  float ao = nt.a;
  vec4 mask = texture2D(tMask, uv);
  float sdOther = (mask.g * 255.0 - 128.0) * 2.0;
  float sdLoch = (mask.r * 255.0 - 128.0) * 2.0;
  vec2 p = vWorld.xz;
  float dist = length(vWorld - cameraPosition);
  float near = 1.0 - smoothstep(600.0, 3500.0, dist);

  float n1 = fbm(p * 0.0034);
  float n2 = fbm(p * 0.019 + 3.0);
  float n3 = vnoise(p * 0.21);
  // the survey is smooth at this scale: add the knolls, gullies and tussocks it cannot see
  float slope0 = 1.0 - N.y;
  vec3 d1 = noised(p * 0.011 + 5.0);
  vec3 d2 = noised(ROT * p * 0.043 + 11.0);
  vec3 d3 = noised(p * 0.17 - 3.0);
  float mid = 1.0 - smoothstep(1500.0, 7000.0, dist);
  vec2 relief = d1.yz * 0.2 + (d2.yz * ROT) * 0.17 * mid + d3.yz * 0.13 * near;
  relief *= 0.55 + 2.2 * smoothstep(0.08, 0.4, slope0);
  N = normalize(N - vec3(relief.x, 0.0, relief.y));
  float slope = mix(slope0, 1.0 - N.y, 0.5);
  float alt = vWorld.y - uWaterLevel;

  vec3 moor = mix(uColMoor, uColMoorB, smoothstep(0.44, 0.56, n1 + (n2 - 0.5) * 0.7));
  moor = mix(moor, uColGrass * 0.9, smoothstep(0.55, 0.62, d2.x) * 0.55);
  moor *= 0.82 + 0.36 * n3 * near + 0.18 * (1.0 - near);
  vec3 grass = uColGrass * (0.8 + 0.4 * n2);
  float lowland = (1.0 - smoothstep(15.0, 150.0, alt + (n1 - 0.5) * 110.0)) * (1.0 - smoothstep(0.02, 0.1, slope));
  vec3 alb = mix(moor, grass, lowland);
  float high = smoothstep(330.0, 680.0, alt + (n1 - 0.5) * 220.0);
  alb = mix(alb, uColHigh * (0.85 + 0.3 * n2), high * 0.8);
  float rock = smoothstep(0.2, 0.4, slope + (n2 - 0.5) * 0.16 + high * 0.06);
  alb = mix(alb, uColRock * (0.62 + 0.7 * n3 * n2 * 2.0), rock);
  float forest = mask.b;
  alb = mix(alb, uColForest * (0.75 + 0.5 * n2), forest * 0.9);
  float shore = (1.0 - smoothstep(0.3, 3.2, alt)) * step(-40.0, sdLoch);
  alb = mix(alb, uColShore * (0.7 + 0.5 * n3), shore);
  float snowLine = uSnowLine + (n1 - 0.5) * 190.0;
  float snow = smoothstep(snowLine - 30.0, snowLine + 110.0, vWorld.y) * (1.0 - smoothstep(0.34, 0.6, slope)) * (0.75 + 0.25 * n2);
  alb = mix(alb, uColSnow, clamp(snow, 0.0, 1.0));
  alb *= 1.0 - 0.28 * uWet * (1.0 - snow);

  float sh = texture2D(tShadow, uv).r * cloudShadow(vWorld);
  float ndl = dot(N, uKeyDir);
  vec3 direct = uKeyColor * max(ndl * 0.92 + 0.08, 0.0) * sh;
  vec3 amb = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5) * (0.35 + 0.65 * ao);
  vec3 col = alb * (direct + amb);

  // other lochs in the distance: flat water mirroring the sky
  float w = smoothstep(-6.0, 6.0, sdOther);
  if (w > 0.0){
    vec3 V = normalize(cameraPosition - vWorld);
    float F = 0.03 + 0.97 * pow(1.0 - max(V.y, 0.0), 5.0);
    vec3 wc = mix(uWaterDeep * (uAmbSky + uKeyColor * 0.2), skyGradient(reflect(-V, vec3(0, 1, 0))), F);
    col = mix(col, wc, w);
  }

  col = applyAtmosphere(col, vWorld);
  gl_FragColor = vec4(finalize(col), 1.0);
}`;function ft(f,t,e){return new U({name:"Terrain",uniforms:{...f,tNormal:{value:t.tNormal},tMask:{value:t.tMask},tShadow:{value:e}},vertexShader:Tt,fragmentShader:St})}function mt(f,t){let e=new he(t.n,t.n,{depthBuffer:!1,minFilter:X,magFilter:X}),a=new U({uniforms:{tHeight:{value:t.tHeight},uDir:{value:new A(0,1,0)},uSize:{value:t.size},uMaxH:{value:1e3}},vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",fragmentShader:`
      precision highp float;
      uniform sampler2D tHeight; uniform vec3 uDir; uniform float uSize; uniform float uMaxH;
      varying vec2 vUv;
      void main(){
        if (uDir.y <= 0.004){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
        float h0 = texture2D(tHeight, vUv).r + 2.0;
        vec2 xz = vUv * uSize;
        float res = 1.0, t = 35.0;
        for (int i = 0; i < 110; i++){
          vec2 q = (xz + uDir.xz * t) / uSize;
          float y = h0 + uDir.y * t;
          if (y > uMaxH || q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) break;
          float d = y - texture2D(tHeight, q).r;
          if (d < 0.0){ res = 0.0; break; }
          res = min(res, 14.0 * d / t);
          t += clamp(d * 0.7, 26.0, 320.0);
        }
        gl_FragColor = vec4(vec3(clamp(res, 0.0, 1.0)), 1.0);
      }`,depthTest:!1,depthWrite:!1}),h=new K(new ve(2,2),a);h.frustumCulled=!1;let m=new pe;m.add(h);let i=new et,n=new A(0,-1,0),r=-1e9;return{texture:e.texture,update(l,p=!1){if(n.dot(l)>.99996)return!1;let d=performance.now();if(!p&&d-r<220)return!1;r=d,n.copy(l),a.uniforms.uDir.value.copy(l);let w=f.getRenderTarget();return f.setRenderTarget(e),f.render(m,i),f.setRenderTarget(w),!0}}}var ne=class f extends K{constructor(t,e={}){super(t),this.isReflector=!0,this.type="Reflector",this.forceUpdate=!1,this._reflectionCameras=new WeakMap;let a=this,h=e.color!==void 0?new Ee(e.color):new Ee(8355711),m=e.textureWidth||512,i=e.textureHeight||512,n=e.clipBias||0,r=e.shader||f.ReflectorShader,l=e.multisample!==void 0?e.multisample:4,p=new Ge,d=new A,w=new A,x=new A,c=new Y,T=new A(0,0,-1),R=new re,C=new A,D=new A,k=new re,S=new Y,g=new he(m,i,{samples:l,type:me}),M=new U({name:r.name!==void 0?r.name:"unspecified",uniforms:Je.clone(r.uniforms),fragmentShader:r.fragmentShader,vertexShader:r.vertexShader});M.uniforms.tDiffuse.value=g.texture,M.uniforms.color.value=h,M.uniforms.textureMatrix.value=S,this.material=M,this.onBeforeRender=function(o,u,v){let y=this.getReflectionCamera(v);if(w.setFromMatrixPosition(a.matrixWorld),x.setFromMatrixPosition(v.matrixWorld),c.extractRotation(a.matrixWorld),d.set(0,0,1),d.applyMatrix4(c),C.subVectors(w,x),C.dot(d)>0===!0&&this.forceUpdate===!1)return;C.reflect(d).negate(),C.add(w),c.extractRotation(v.matrixWorld),T.set(0,0,-1),T.applyMatrix4(c),T.add(x),D.subVectors(w,T),D.reflect(d).negate(),D.add(w),y.position.copy(C),y.up.set(0,1,0),y.up.applyMatrix4(c),y.up.reflect(d),y.lookAt(D),y.far=v.far,y.updateMatrixWorld(),y.projectionMatrix.copy(v.projectionMatrix),y.projectionMatrix.elements[8]*=-1,y.projectionMatrix.elements[12]*=-1,S.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),S.multiply(y.projectionMatrix),S.multiply(y.matrixWorldInverse),S.multiply(a.matrixWorld),p.setFromNormalAndCoplanarPoint(d,w),p.applyMatrix4(y.matrixWorldInverse),R.set(p.normal.x,p.normal.y,p.normal.z,p.constant);let H=y.projectionMatrix;y.isOrthographicCamera?(k.x=(Math.sign(R.x)+H.elements[8])/H.elements[0],k.y=(Math.sign(R.y)+H.elements[9])/H.elements[5],k.z=-v.far,k.w=1):(k.x=(Math.sign(R.x)+H.elements[8])/H.elements[0],k.y=(Math.sign(R.y)+H.elements[9])/H.elements[5],k.z=-1,k.w=(1+H.elements[10])/H.elements[14]),R.multiplyScalar(2/R.dot(k)),H.elements[2]=R.x,H.elements[6]=R.y,y.isOrthographicCamera?(H.elements[10]=R.z-n,H.elements[14]=R.w-1):(H.elements[10]=R.z+1-n,H.elements[14]=R.w),a.visible=!1;let W=o.getRenderTarget(),s=o.xr.enabled,E=o.shadowMap.autoUpdate;o.xr.enabled=!1,o.shadowMap.autoUpdate=!1,o.setRenderTarget(g),o.state.buffers.depth.setMask(!0),o.autoClear===!1&&o.clear(),o.render(u,y),o.xr.enabled=s,o.shadowMap.autoUpdate=E,o.setRenderTarget(W);let b=v.viewport;b!==void 0&&o.state.viewport(b),a.visible=!0,this.forceUpdate=!1},this.getRenderTarget=function(){return g},this.dispose=function(){g.dispose(),a.material.dispose()},this.getReflectionCamera=function(o){let u=this._reflectionCameras.get(o);return u===void 0&&(u=o.clone(),this._reflectionCameras.set(o,u)),u}}};ne.ReflectorShader={name:"ReflectorShader",uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null}},vertexShader:`
		uniform mat4 textureMatrix;
		varying vec4 vUv;

		#include <common>
		#include <logdepthbuf_pars_vertex>

		void main() {

			vUv = textureMatrix * vec4( position, 1.0 );

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

			#include <logdepthbuf_vertex>

		}`,fragmentShader:`
		uniform vec3 color;
		uniform sampler2D tDiffuse;
		varying vec4 vUv;

		#include <logdepthbuf_pars_fragment>

		float blendOverlay( float base, float blend ) {

			return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );

		}

		vec3 blendOverlay( vec3 base, vec3 blend ) {

			return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );

		}

		void main() {

			#include <logdepthbuf_fragment>

			vec4 base = texture2DProj( tDiffuse, vUv );
			gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>

		}`};var Ht=`
uniform mat4 textureMatrix;
varying vec4 vRefl;
varying vec3 vWorld;
void main(){
  vRefl = textureMatrix * vec4(position, 1.0);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,Ct=`
${$}
${nt}
uniform sampler2D tDiffuse;
uniform sampler2D tMask;
uniform sampler2D tShadow;
uniform vec3 color;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform float uWaveAmp;
uniform float uRain;
uniform vec4 uRipples[8];     // xy: where the water was touched, z: when, w: size (0 = unused)
varying vec4 vRefl;
varying vec3 vWorld;

// rings spreading from wherever the visitor touched the loch
vec2 touchRipples(vec2 p){
  vec2 g = vec2(0.0);
  for (int i = 0; i < 8; i++){
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 8.0) continue;
    vec2 d = p - r.xy;
    float len = length(d);
    float dist = len / r.w;
    float x = dist - age * 5.0;
    float env = exp(-x * x * 0.3) * exp(-age * 0.5) * smoothstep(0.0, 0.3, age) / (1.0 + dist * 0.1);
    g += (d / max(len, 1e-3)) * cos(x * 2.3) * env;
  }
  return g;
}

void main(){
  vec2 uv = vWorld.xz / uSize + 0.5;
  vec4 mask = texture2D(tMask, uv);
  float sd = (mask.r * 255.0 - 128.0) * 2.0;     // metres from the shore, positive on the water
  if (sd < -45.0) discard;

  vec3 V = cameraPosition - vWorld;
  float dist = length(V); V /= dist;
  vec2 p = vWorld.xz;

  // detail falls away with distance and at grazing angles so the far water stays calm, not noisy
  float lod = clamp(1.0 - smoothstep(40.0, 900.0, dist), 0.0, 1.0);
  vec2 slope = waveSlope(p, uTime, lod);
  // gusts: patches of ruffled water wandering down the loch
  float gust = 0.55 + 0.9 * smoothstep(0.35, 0.75, fbm3(p * 0.004 - uWind * uTime * 0.012));
  // sheltered close to the shore
  float shelter = 0.35 + 0.65 * smoothstep(0.0, 70.0, sd);
  float amp = uWaveAmp * gust * shelter;
  slope *= amp;
  if (uRain > 0.01){
    float nearCam = 1.0 - smoothstep(25.0, 110.0, dist);
    slope += rainRings(p, uTime) * uRain * 0.55 * nearCam;
  }
  slope += touchRipples(p) * 0.3;
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

  float ndv = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // mirror image, smeared vertically the way real reflections stretch toward you
  vec4 rc = vRefl;
  vec2 smear = vec2(N.x * 0.035, N.z * 0.11) * (0.25 + 0.75 * lod);
  rc.xy += smear * rc.w;
  vec3 refl = texture2DProj(tDiffuse, rc).rgb;

  // peat-stained body of the loch: amber in the shallows, near black in the deep
  float depth = clamp(sd * 0.09, 0.0, 22.0);
  vec3 body = mix(uWaterShallow, uWaterDeep, 1.0 - exp(-depth * 0.5));
  float sh = texture2D(tShadow, uv).r;
  vec3 light = uAmbSky * 0.9 + uKeyColor * max(uKeyDir.y, 0.0) * 0.35 * sh;
  body *= light;

  vec3 col = mix(body, refl, F);

  // glitter path under the sun or moon
  vec3 R = reflect(-V, N);
  float spec = pow(max(dot(R, uKeyDir), 0.0), 900.0) * 14.0 + pow(max(dot(R, uKeyDir), 0.0), 90.0) * 0.12;
  col += uKeyColor * spec * sh * cloudShadow(vWorld) * (0.3 + 0.7 * min(amp * 60.0, 1.0));

  // wet margin: the land shows through right at the edge
  float edge = smoothstep(-2.0, 2.5, sd);
  col = mix(body * 1.4, col, edge);

  col = applyAtmosphere(col, vWorld);
  gl_FragColor = vec4(finalize(col), 1.0);
}`;function dt(f,t,e,a,h=.5,m=0){let i=new ve(e.size,e.size,1,1),n=new ne(i,{textureWidth:512,textureHeight:512,clipBias:.003,multisample:m,shader:{name:"LochWater",uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null}},vertexShader:Ht,fragmentShader:Ct}}),r=Array.from({length:8},()=>new re(0,0,-100,0));Object.assign(n.material.uniforms,t,{tMask:{value:e.tMask},tShadow:{value:a},uRipples:{value:r}});let l=0;n.touch=(w,x,c,T)=>{r[l].set(w,x,c,T),l=(l+1)%r.length},!f.extensions.has("EXT_color_buffer_float")&&!f.extensions.has("EXT_color_buffer_half_float")&&(n.getRenderTarget().texture.type=fe),n.rotation.x=-Math.PI/2,n.position.y=e.level,n.frustumCulled=!1,n.updateMatrixWorld(!0);let p=n.onBeforeRender;n.onBeforeRender=function(w,x,c){t.uReflPass.value=1,p.call(this,w,x,c),t.uReflPass.value=0};let d=n.getReflectionCamera;return n.getReflectionCamera=function(w){let x=d.call(this,w);return x.layers.set(0),x},n.setReflectionSize=(w,x)=>n.getRenderTarget().setSize(Math.max(64,Math.round(w*h)),Math.max(64,Math.round(x*h))),n}var kt=`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(position * 100.0 + cameraPosition, 1.0);
  gl_Position = p.xyww;   // pinned to the far plane, so it only fills what the land leaves open
}`,zt=`
${$}
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
    float gtex = fbm3(d.xz * 7.0 + d.y * 4.0);
    float galaxy = band * smoothstep(0.3, 0.75, gtex) * 0.03;
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
}`;function ht(f){let t=new Ze(1,48,24),e=new U({name:"Sky",uniforms:f,vertexShader:kt,fragmentShader:zt,side:De,depthWrite:!1,depthTest:!0,depthFunc:Fe}),a=new K(t,e);return a.frustumCulled=!1,a.renderOrder=10,a}var At=`
attribute vec2 aSeed;      // x: colour tint, y: which silhouette
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
varying float vTint;
void main(){
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  // a rounded pseudo-normal: outward from the trunk, tilted up
  vN = normalize(mat3(instanceMatrix) * vec3(position.x, 0.0, position.z) + vec3(0.0, 0.45, 0.0));
  vUv = vec2((uv.x + floor(aSeed.y * 2.0)) * 0.5, uv.y);
  vTint = aSeed.x;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,Dt=`
${$}
uniform sampler2D tShadow;
uniform sampler2D tTree;
uniform vec3 uColTree;
uniform vec3 uColTreeB;
uniform vec3 uColSnow;
uniform float uSnowLine;
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
varying float vTint;
void main(){
  vec4 tex = texture2D(tTree, vUv);
  float dist = length(vWorld - cameraPosition);
  // hold the canopy together as the texture shrinks with distance
  float a = tex.a * (1.0 + smoothstep(120.0, 2200.0, dist) * 1.6);
  // crisp, anti-aliased cut-out edge
  float cover = clamp((a - 0.45) / max(fwidth(a), 1e-4) + 0.5, 0.0, 1.0);
  // far forest must read as a solid mass, so the soft edge is for near trees only
  cover = mix(cover, step(0.45, a), smoothstep(90.0, 320.0, dist));
  if (cover < 0.04) discard;

  vec2 uvm = vWorld.xz / uSize + 0.5;
  vec3 N = normalize(vN);
  float larch = step(0.9, vTint);
  vec3 alb = mix(uColTree * (0.75 + 0.5 * vTint), uColTreeB, larch) * (0.35 + 1.0 * tex.r);
  float snow = smoothstep(uSnowLine - 60.0, uSnowLine + 60.0, vWorld.y) * tex.r;
  alb = mix(alb, uColSnow, snow * 0.3);
  float sh = texture2D(tShadow, uvm).r * cloudShadow(vWorld);
  float ndl = dot(N, uKeyDir);
  vec3 direct = uKeyColor * max(ndl * 0.55 + 0.45, 0.0) * sh;
  vec3 amb = mix(uAmbGround, uAmbSky, 0.25 + 0.75 * vUv.y);
  vec3 col = alb * (direct + amb);
  col = applyAtmosphere(col, vWorld);
  gl_FragColor = vec4(finalize(col), uReflPass > 0.5 ? 1.0 : cover);
}`;function pt(f){let t=f>>>0;return()=>{t|=0,t=t+1831565813|0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}function Wt(){let e=document.createElement("canvas");e.width=384*2,e.height=768;let a=e.getContext("2d"),h=pt(7);for(let i=0;i<2;i++){let n=i*384,r=n+384/2,l=i===0?30:20,p=i===0?.4:.46;a.fillStyle="rgb(60,60,60)",a.fillRect(r-384*.014,768*.2,384*.028,768*.8);for(let d=l-1;d>=0;d--){let w=d/(l-1),x=768*(.035+w*.86),c=768*.03*(.5+w*1.1);for(let T of[-1,1]){let R=384*p*Math.pow(w,.8)*(.7+h()*.45)+6.144;if(i===1&&h()<.16)continue;let C=Math.round(96+(1-w)*60+h()*44);a.beginPath(),a.moveTo(r,x-768*.024);let D=6;for(let g=1;g<=D;g++){let M=g/D;a.lineTo(r+T*R*M,x+c*M*M+(g%2?-1:1)*768*.007*(.6+h()))}a.lineTo(r+T*R*.5,x+c+768*.012),a.lineTo(r,x+768*.04),a.closePath();let k=a.createLinearGradient(0,x-768*.024,0,x+c+768*.03),S=Math.round(C*.42);k.addColorStop(0,`rgb(${C},${C},${C})`),k.addColorStop(1,`rgb(${S},${S},${S})`),a.fillStyle=k,a.fill()}}}let m=new Xe(e);return m.colorSpace=de,m.wrapS=m.wrapT=ce,m.minFilter=ue,m.magFilter=X,m.generateMipmaps=!0,m.anisotropy=4,m}function Ft(){let f=[],t=[],e=[],a=(m,i)=>{let n=f.length/3;f.push(-.5*m,0,-.5*i,.5*m,0,.5*i,.5*m,1,.5*i,-.5*m,1,-.5*i),t.push(0,0,1,0,1,1,0,1),e.push(n,n+1,n+2,n,n+2,n+3)};a(1,0),a(0,1);let h=new J;return h.setAttribute("position",new Me(f,3)),h.setAttribute("uv",new Me(t,2)),h.setIndex(e),h}function vt(f,t,e,a,h){let m=pt(20261109),i=Ft(),n=Wt(),r=new U({name:"Trees",uniforms:{...f,tShadow:{value:e},tTree:{value:n}},vertexShader:At,fragmentShader:Dt,side:We,alphaToCoverage:!0}),l=new Ke(i,r,a),p=new Float32Array(a*2),d=new Y,w=new I,x=new A,c=new A,T=new A(0,1,0),R=0,C=0,D=a*50;for(;R<a&&C<D;){C++;let k=h[Math.floor(m()*h.length)],S=m()<.72?800:2800,g=m()*Math.PI*2,M=Math.sqrt(m())*S,o=k[0]+Math.cos(g)*M,u=k[1]+Math.sin(g)*M;if(Math.abs(o)>t.size/2-60||Math.abs(u)>t.size/2-60)continue;let v=t.forestAt(o,u);if(m()>v*1.15)continue;let y=t.shoreAt(o,u);if(y>-4||t.otherWaterAt(o,u)>-4)continue;let F=t.heightAt(o,u),H=(13+m()*14)*(y>-40?.8:1),W=H*(.4+m()*.12);c.set(o,F-.5,u),w.setFromAxisAngle(T,m()*Math.PI),x.set(W,H,W),d.compose(c,w,x),l.setMatrixAt(R,d),p[R*2]=m(),p[R*2+1]=m()<.7?.1:.9,R++}return l.count=R,l.instanceMatrix.needsUpdate=!0,i.setAttribute("aSeed",new Ie(p,2)),l.frustumCulled=!1,l}var Pt=new A(46,30,46);function xt(f,t=3500){let e=new Ne,a=new Float32Array(t*2*3),h=new Float32Array(t*2);for(let d=0;d<t;d++){let w=Math.random(),x=Math.random(),c=Math.random();a.set([w,x,c,w,x,c],d*6),h[d*2]=0,h[d*2+1]=1}let m=new J;m.setAttribute("position",new Z(a,3)),m.setAttribute("aEnd",new Z(h,1));let i={uBox:{value:Pt},uTime:f.uTime,uWind:f.uWind,uAmbSky:f.uAmbSky,uExposure:f.uExposure},n=new $e(m,new U({uniforms:{...i,uRain:f.uRain},vertexShader:`
      attribute float aEnd; uniform vec3 uBox; uniform float uTime; uniform vec2 uWind; varying float vA;
      void main(){
        float sp = 17.0 + position.x * 7.0;
        vec3 vel = vec3(uWind.x * 0.8, -sp, uWind.y * 0.8);
        vec3 p = position * uBox + vel * uTime;
        p = mod(p - cameraPosition, uBox) - uBox * 0.5;
        p += normalize(vel) * aEnd * (0.5 + position.z * 0.5);
        vA = (1.0 - aEnd * 0.7) * smoothstep(23.0, 14.0, length(p.xz));
        gl_Position = projectionMatrix * viewMatrix * vec4(p + cameraPosition, 1.0);
      }`,fragmentShader:`
      precision highp float; uniform vec3 uAmbSky; uniform float uRain; uniform float uExposure; varying float vA;
      void main(){ vec3 c = uAmbSky * 1.6 * uExposure + 0.04; gl_FragColor = vec4(pow(c / (1.0 + c), vec3(1.0/2.2)), vA * 0.32 * uRain); }`,transparent:!0,depthWrite:!1}));n.frustumCulled=!1,n.layers.set(1),e.add(n);let r=new Float32Array(t*3);for(let d=0;d<t*3;d++)r[d]=Math.random();let l=new J;l.setAttribute("position",new Z(r,3));let p=new Qe(l,new U({uniforms:{...i,uSnowFall:f.uSnowFall,uScale:{value:600}},vertexShader:`
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
      }`,fragmentShader:`
      precision highp float; uniform vec3 uAmbSky; uniform float uSnowFall; uniform float uExposure; varying float vA;
      void main(){
        float r = length(gl_PointCoord - 0.5);
        vec3 c = uAmbSky * 2.4 * uExposure + 0.08;
        gl_FragColor = vec4(pow(c / (1.0 + c), vec3(1.0/2.2)), smoothstep(0.5, 0.15, r) * vA * 0.75 * uSnowFall);
      }`,transparent:!0,depthWrite:!1}));return p.frustumCulled=!1,p.layers.set(1),e.add(p),e.update=()=>{n.visible=f.uRain.value>.01,p.visible=f.uSnowFall.value>.01},e.setHeight=d=>{p.material.uniforms.uScale.value=d},e}var Bt={hero:{u:.075,h:2.4,side:0,lu:.34,lh:30,ls:0,fov:40,shift:0},loch:{u:.15,h:16,side:-40,lu:.3,lh:10,ls:0,fov:40,shift:.13},promise:{u:.235,h:5,side:40,lu:.26,lh:110,ls:0,fov:38,shift:.15},step1:{u:.3,h:3.2,side:-30,lu:.2,lh:70,ls:0,fov:38,shift:.17},step2:{u:.37,h:9,side:60,lu:.2,lh:40,ls:-120,fov:38,shift:.17},step3:{u:.44,h:4,side:-70,lu:.18,lh:140,ls:260,fov:38,shift:.17},step4:{u:.5,h:14,side:30,lu:.2,lh:60,ls:0,fov:38,shift:.17},step5:{u:.57,h:3.4,side:-50,lu:.2,lh:120,ls:200,fov:38,shift:.17},step6:{u:.64,h:7,side:30,lu:.2,lh:60,ls:0,fov:38,shift:.17},calc:{pos:[1500,1250,4500],look:[-1e3,60,-900],fov:40,shift:.17},feel:{u:.78,h:3.2,side:-110,lu:.1,lh:330,ls:1100,fov:40,shift:.15},faq:{u:.87,h:24,side:0,lu:.1,lh:10,ls:0,fov:40,shift:.15},contact:{u:.955,h:2.3,side:30,lu:-.5,lh:150,ls:0,fov:40,shift:0}},Lt=new A(0,1,0),Te=(f,t,e)=>Math.min(e,Math.max(t,f)),te=(f,t,e)=>f+(t-f)*e;function gt(f,t){let e=f.lubnaig.level_m,a=new Ye(f.centreline.map(([o,u])=>new A(o,e,u)),!1,"centripetal");a.arcLengthDivisions=400;let h=new A,m=new A,i=(o,u,v,y)=>(o=Te(o,0,1),a.getPointAt(o,y),a.getTangentAt(o,h),m.set(-h.z,0,h.x).normalize(),y.addScaledVector(m,u),y.y=e+v,y),n=(o,u,v)=>{if(o.pos){u.set(o.pos[0],e+o.pos[1],o.pos[2]),v.set(o.look[0],e+o.look[1],o.look[2]).sub(u).normalize();return}i(o.u,o.side,o.h,u);let y=t.heightAt(u.x,u.z);u.y<y+2&&(u.y=y+2),i(o.u+o.lu,o.ls,o.lh,v),v.sub(u).normalize()},r=[],l=()=>{r=[...document.querySelectorAll("[data-shot]")].map(o=>{let u=o.getBoundingClientRect();return{y:u.top+window.scrollY+u.height/2,shot:Bt[o.dataset.shot],name:o.dataset.shot}}).filter(o=>o.shot).sort((o,u)=>o.y-u.y)},p=new A,d=new A,w=new A,x=new A,c=new A,T=new I,R=new I,C=new Y,D=new A,k=(o,u)=>{C.lookAt(D,o,Lt),u.setFromRotationMatrix(C)},S={};return{measure:l,target:(o,u,v)=>{r.length||l();let y=o+u*.5,F=0;for(;F<r.length-2&&y>r[F+1].y;)F++;let H=r[F],W=r[Math.min(F+1,r.length-1)],s=W.y>H.y?Te((y-H.y)/(W.y-H.y),0,1):0;if(s=s*s*(3-2*s),n(H.shot,p,w),n(W.shot,d,x),H.shot.pos||W.shot.pos){let b=d.y>p.y?1-(1-s)*(1-s):s*s;v.pos.set(te(p.x,d.x,s),te(p.y,d.y,b),te(p.z,d.z,s));let z=t.heightAt(v.pos.x,v.pos.z);v.pos.y<z+12&&(v.pos.y=z+12)}else{for(let E of["u","h","side","lu","lh","ls"])S[E]=te(H.shot[E],W.shot[E],s);n(S,v.pos,c)}return S.fov=te(H.shot.fov,W.shot.fov,s),S.shift=te(H.shot.shift,W.shot.shift,s),k(w,T),k(x,R),v.quat.copy(T).slerp(R,s),v.fov=S.fov,v.shift=S.shift,v.name=s<.5?H.name:W.name,v.progress=r.length>1?Te((y-r[0].y)/(r[r.length-1].y-r[0].y),0,1):0,v},curve:a,mapPoints:(o=60)=>{let u=[];for(let v=0;v<=o;v++){let y=a.getPointAt(v/o);u.push([y.x,y.z])}return u}}}var yt={high:{dpr:2,pixels:32e5,stride:2,trees:11e4,refl:.75,reflAA:4,precip:4e3,aa:!0},mid:{dpr:1.5,pixels:22e5,stride:3,trees:6e4,refl:.6,reflAA:4,precip:3e3,aa:!0},low:{dpr:1.5,pixels:11e5,stride:4,trees:22e3,refl:.45,reflAA:0,precip:1500,aa:!1}};async function so({canvas:f,env:t,assets:e,tier:a,still:h=!1,reducedMotion:m=!1,force:i=!1}){let n=yt[a]||yt.mid,r=new at({canvas:f,antialias:n.aa,alpha:!1,stencil:!1,powerPreference:"high-performance",failIfMajorPerformanceCaveat:!i});r.outputColorSpace=qe,r.toneMapping=Pe,r.setClearColor(329740,1);let l=e.meta,p=await ct(e.heightUrl,e.waterUrl,l),d=rt(p.size,p.level),w=mt(r,p),x=new pe,c=new tt(40,1,1.5,42e3);c.layers.enable(1);let T=ht(d);x.add(T);let R=new K(ut(p,n.stride),ft(d,p,w.texture));R.frustumCulled=!1,R.matrixAutoUpdate=!1,x.add(R);let C=dt(r,d,p,w.texture,n.refl,n.reflAA);C.renderOrder=-5,x.add(C);let D=vt(d,p,w.texture,n.trees,l.centreline);x.add(D);let k=xt(d,n.precip);x.add(k);let S=gt(l,p),g=Re(t.state);xe(d,g,1),w.update(d.uKeyDir.value);let M=!1,o={pos:new A,quat:new I,fov:40,shift:0,u:0,progress:0,name:"hero"},u={pos:new A,quat:new I,fov:40,shift:0},v=!0,y=h?40:0,F=0,H=0,W=0,s=0,E=1,b=1,z=1,V=1,N=!1,_=16,B=0,q=0,P=0,oe=new I,ie=new _e,Se=new A,ye=new ot,He=new Ve,wt=(L,O,we=1,le=0)=>{He.set(L*2,-O*2),ye.setFromCamera(He,c);let G=ye.ray.origin,Q=ye.ray.direction;if(Q.y>-.001)return!1;let ae=(p.level-G.y)/Q.y;if(ae<2||ae>1400)return!1;let ze=G.x+Q.x*ae,Ae=G.z+Q.z*ae;return p.shoreAt(ze,Ae)<2?!1:(C.touch(ze,Ae,y-le,Math.max(.35,ae*.011)*we),!0)},se=()=>{r.setPixelRatio(z),r.setSize(E,b,!1),C.setReflectionSize(E*z,b*z),k.setHeight(b*z)},Ce=()=>{let L=Math.max(1,f.clientWidth),O=Math.max(1,f.clientHeight);if(!v&&L===E&&O===b){S.measure();return}E=L,b=O,V=Math.min(window.devicePixelRatio||1,n.dpr,Math.sqrt(n.pixels/(E*b))),V=Math.max(.6,V),z=v?V:Math.min(z,V),N=E>=900,c.aspect=E/b,se(),S.measure()},Et=()=>(g=Re(t.state),M=!0,g),Mt=L=>{if(L=Math.min(L,.1),!h&&!m&&(y+=L),d.uTime.value=y,M||v){let G=v||h?1:1-Math.exp(-L*1.6);xe(d,g,G);let Q=G>=1||d.uKeyDir.value.dot(g.keyDir)>.999999;Q&&(xe(d,g,1),M=!1),w.update(d.uKeyDir.value,Q)}S.target(m?0:window.scrollY,window.innerHeight,o);let O=v||h?1:1-Math.exp(-L*2.4);if(u.pos.lerp(o.pos,O),u.quat.slerp(o.quat,O),u.fov+=(o.fov-u.fov)*O,u.shift+=(o.shift-u.shift)*O,c.position.copy(u.pos),c.quaternion.copy(u.quat),!h&&!m){let G=1-Math.min(1,Math.max(0,(u.pos.y-p.level-30)/200));W+=(F-W)*Math.min(1,L*2),s+=(H-s)*Math.min(1,L*2),c.position.y+=Math.sin(y*.55)*.07*G,Se.set(1,0,0).applyQuaternion(u.quat),c.position.addScaledVector(Se,Math.sin(y*.17)*.9*G),ie.set(-s*.02+Math.sin(y*.31)*.0025,-W*.035,Math.sin(y*.23)*.0035*G,"YXZ"),c.quaternion.multiply(oe.setFromEuler(ie))}let we=c.aspect<1?1+(1-c.aspect)*.75:1;c.fov=u.fov*we;let le=N?u.shift:0;return le>.002?c.setViewOffset(E,b,-le*E,0,E,b):c.clearViewOffset(),c.updateProjectionMatrix(),c.updateMatrixWorld(),k.update(),r.render(x,c),v=!1,P++,!h&&P>20&&(_+=(L*1e3-_)*.08,_>25?(B+=L,q=0):_<18.5?(q+=L,B=0):(B=0,q=0),j&&performance.now()-j.at>2500&&(_>j.before*.88&&(z=j.dpr,ke=!0,se()),j=null,B=0),!ke&&!j&&B>1.5&&z>.6&&(j={at:performance.now(),before:_,dpr:z},z=Math.max(.6,z*.82),B=0,se()),!j&&q>5&&z<V&&(z=Math.min(V,z*1.12),q=0,se())),o},j=null,ke=!1,Rt=()=>{_=16,B=0,q=0,j=null};return Ce(),{frame:Mt,resize:Ce,setLook:Et,journey:S,meta:l,resetPacing:Rt,get look(){return g},get frames(){return P},setPointer(L,O){F=L,H=O},touch:wt,info:()=>({tier:a,dpr:+z.toFixed(2),trees:D.count,tris:r.info.render.triangles,calls:r.info.render.calls,frameMs:+_.toFixed(1)}),dispose(){r.dispose()}}}export{so as createLochScene};
