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
x.lineWidth=2;for(let i=0;i<7;i++){const ph=t*.00025+i*1.3;x.strokeStyle=`rgba(${i%2?'143,179,255':'95,208,200'},${.16+.05*i})`;x.beginPath();
for(let s=0;s<=40;s++){const px=s/40*w*1.2-w*.1,py=h*(.2+i*.1)+Math.sin(s/40*Math.PI*2+ph)*h*.08+Math.cos(s/40*Math.PI*3-ph*1.4)*h*.04-sc;s?x.lineTo(px,py):x.moveTo(px,py)}x.stroke()}
if(!reduce)requestAnimationFrame(draw)}requestAnimationFrame(draw)})();
(()=>{const S=[
['Come in','A relaxed first chat','We meet you and the team, learn how the business really runs, and agree what good looks like.',['Your goals and pressure points','Where the work piles up','What success means to you'],'1 to 2 meetings'],
['Assess','We look under the bonnet','We map your workflows, time spend, tools and data, and measure where hours go today.',['Workflow and time map','Tooling and data review','Baseline throughput numbers'],'1 to 2 weeks'],
['Find savings and capacity','Where the wins are','We rank every opportunity by hours freed, savings and risk, so you see exactly where you can save and where you can grow capacity.',['Ranked opportunity list','Savings and capacity estimates','A clear first pick'],'Delivered with the assessment'],
['Design','Redraw the work','We design new flows where AI agents carry the repeatable load and your people steer, check and handle the human moments.',['Future state workflow','Guardrails and sign off points','Rollout plan your team backs'],'1 to 2 weeks'],
['Build','Wire it in','We connect agents to your tools, data and processes. Tested, guarded and documented, with your team trained to use it.',['Working agents in your stack','Testing and quality checks','Training and handover notes'],'2 to 6 weeks'],
['Run','Keep it getting sharper','We operate and tune the system every week, report the capacity and savings gained, and pick the next win.',['Weekly tuning and support','Monthly capacity report','Roadmap of next wins'],'Ongoing']];
const ol=document.querySelector('.steps'),st=document.getElementById('stage');let cur=0,timer;
S.forEach((s,i)=>{const li=document.createElement('li');li.innerHTML=`<button role="tab" aria-selected="false"><i>${i+1}</i><span><b>${s[0]}</b><small>${s[1]}</small></span></button>`;li.firstChild.onclick=()=>{stop();show(i)};ol.append(li)});
const bs=[...ol.querySelectorAll('button')];
function show(i){cur=(i+S.length)%S.length;bs.forEach((b,j)=>{b.setAttribute('aria-selected',j===cur);b.classList.toggle('done',j<cur)});const s=S[cur];
st.innerHTML=`<div class="big-n">0${cur+1}</div><h3>${s[0]}</h3><p>${s[2]}</p><div class="meta"><div><h4>You get</h4><ul>${s[3].map(x=>`<li>${x}</li>`).join('')}</ul></div><div><h4>Typical time</h4><ul><li>${s[4]}</li></ul></div></div><div class="navbtns"><button data-d="-1">← Back</button><span class="bar"><i style="width:${(cur+1)/S.length*100}%"></i></span><button data-d="1">${cur===S.length-1?'Start again':'Next →'}</button></div>`;
st.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{stop();show(cur+ +b.dataset.d)});st.firstChild&&st.style.setProperty('--k',cur)}
function stop(){clearInterval(timer)}show(0);
const fo=new IntersectionObserver(e=>{if(e[0].isIntersecting){timer=setInterval(()=>show(cur+1),6000);fo.disconnect()}},{threshold:.5});fo.observe(document.querySelector('.flow'));
const $=id=>document.getElementById(id);let last=[0,0,0];
function anim(el,to,i){const from=last[i];last[i]=to;const t0=performance.now();(function f(t){const k=Math.min((t-t0)/500,1);el.textContent=Math.round(from+(to-from)*(1-Math.pow(1-k,3))).toLocaleString('en-GB');if(k<1)requestAnimationFrame(f)})(t0)}
function calc(){const p=+$('p').value,h=+$('h').value,s=+$('s').value/100;$('oP').textContent=p;$('oH').textContent=h;$('oS').textContent=Math.round(s*100)+'%';const hw=p*h*s;anim($('rH'),hw,0);anim($('rF'),hw/37.5,1);anim($('rY'),hw*46,2)}
['p','h','s'].forEach(k=>$(k).oninput=calc);calc();
const pr=document.querySelector('.progress');addEventListener('scroll',()=>{pr.style.width=scrollY/(document.body.scrollHeight-innerHeight)*100+'%'},{passive:true});
if(matchMedia('(hover:hover)').matches){document.querySelectorAll('.tilt,.card').forEach(el=>{el.onpointermove=e=>{const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;el.style.transform=`perspective(800px) rotateY(${x*8}deg) rotateX(${-y*8}deg) translateY(-4px)`};el.onpointerleave=()=>el.style.transform=''});
document.querySelectorAll('.mag').forEach(el=>{el.onpointermove=e=>{const r=el.getBoundingClientRect();el.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.2}px,${(e.clientY-r.top-r.height/2)*.3}px)`};el.onpointerleave=()=>el.style.transform=''})}})();
