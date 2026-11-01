(()=>{document.getElementById('y').textContent=new Date().getFullYear();
const nav=document.querySelector('.nav');const onS=()=>nav.classList.toggle('scrolled',scrollY>20);addEventListener('scroll',onS,{passive:true});onS();
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.15});
document.querySelectorAll('.reveal').forEach((el,i)=>{el.style.transitionDelay=(i%4)*80+'ms';io.observe(el)});
const c=document.getElementById('orbs'),x=c.getContext('2d');const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let w,h,dpr;const orbs=[{c:'31,138,138',r:.34,sx:.00011,sy:.00016,px:.25,py:.35},{c:'36,54,90',r:.42,sx:.00008,sy:.00012,px:.75,py:.6},{c:'95,208,200',r:.18,sx:.00017,sy:.0001,px:.6,py:.25},{c:'60,90,150',r:.22,sx:.00013,sy:.00019,px:.35,py:.75}];
let mx=0,my=0;addEventListener('pointermove',e=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5},{passive:true});
function size(){dpr=Math.min(devicePixelRatio||1,2);w=c.clientWidth;h=c.clientHeight;c.width=w*dpr;c.height=h*dpr;x.setTransform(dpr,0,0,dpr,0,0)}
addEventListener('resize',size);size();
function draw(t){x.clearRect(0,0,w,h);const m=Math.max(w,h),sc=scrollY*.25;
for(const o of orbs){const cx=(o.px+Math.sin(t*o.sx)*.12+mx*.04)*w,cy=(o.py+Math.cos(t*o.sy)*.1+my*.04)*h-sc,r=o.r*m;
const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,`rgba(${o.c},.55)`);g.addColorStop(1,`rgba(${o.c},0)`);x.fillStyle=g;x.beginPath();x.arc(cx,cy,r,0,7);x.fill()}
x.lineWidth=1.4;for(let i=0;i<5;i++){const ph=t*.00025+i*1.3;x.strokeStyle=`rgba(${i%2?'143,179,255':'95,208,200'},${.12+.05*i})`;x.beginPath();
for(let s=0;s<=40;s++){const px=s/40*w*1.2-w*.1,py=h*(.3+i*.1)+Math.sin(s/40*Math.PI*2+ph)*h*.08+Math.cos(s/40*Math.PI*3-ph*1.4)*h*.04-sc;s?x.lineTo(px,py):x.moveTo(px,py)}x.stroke()}
if(!reduce)requestAnimationFrame(draw)}requestAnimationFrame(draw)})();
