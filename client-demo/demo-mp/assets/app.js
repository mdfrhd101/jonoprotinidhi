/* Jonoshetu demo — shared shell + page renderers.
   Every page is a thin HTML file with <body data-page="…">; content comes from window.SITE (assets/data.js),
   the same shape the real CMS will serve. */
(function(){
'use strict';
const S=window.SITE, M=S.mp, A=S.about, U=S.area.upz;
const page=document.body.dataset.page||'home';

/* ---------- demo CMS overlay ----------
   The admin demo (../admin/) saves approved posts, promise updates and homepage settings in this browser's
   localStorage. In the real product the same data comes from the CMS API; here we merge it into SITE. */
const CMS=(()=>{try{return JSON.parse(localStorage.getItem('jonoshetu-demo-cms')||'null')||{}}catch(e){return {}}})();
(function applyOverlay(){
  const e=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const now=Date.now();
  const posts=(CMS.posts||[]).filter(p=>p&&(p.status==='published'||(p.status==='scheduled'&&p.schedule&&new Date(p.schedule).getTime()<=now)));
  posts.sort((a,b)=>(b.dateISO||'').localeCompare(a.dateISO||'')||b.created-a.created);
  const mapped=posts.map(p=>({id:String(p.id),k:p.k,cat:e(p.cat),date:e(p.dateT),month:e(p.month),upz:e(p.upz||''),place:e(p.place||'পুরো আসন'),img:S.img[p.img]?p.img:'river',imgs:[S.img[p.img]?p.img:'river'],
    title:e(p.title),summary:e(p.summary),body:(String(p.body||'').split(/\n\s*\n/).filter(Boolean).map(e)).concat(p.body?[]:[e(p.summary)]),quote:''}));
  if(mapped.length)S.activities=[...mapped,...S.activities];
  Object.entries(CMS.promiseEdits||{}).forEach(([i,x])=>{const pr=S.promises[+i];if(!pr||!x)return;
    const st=['done','ongoing','late','plan'].includes(x.st)?x.st:pr.st;
    Object.assign(pr,{pct:Math.max(0,Math.min(100,+x.pct||0)),st,note:x.note?e(x.note):'',updates:(x.updates||[]).map(u=>[e(u[0]),e(u[1])])})});
  if(CMS.slogan)S.mp.slogan=e(CMS.slogan);
  if(Array.isArray(CMS.banners)&&CMS.banners.length&&CMS.bannersRev===S.rev)S.banners=CMS.banners.filter(b=>S.img[b.img]).map(b=>({img:b.img,cap:e(b.cap)}));
  if(Array.isArray(CMS.complaintCats)&&CMS.complaintCats.length)S.complaintCats=CMS.complaintCats.map(e);
  if(Array.isArray(CMS.accentColors)&&CMS.accentColors.every(c=>/^#[0-9A-Fa-f]{6}$/.test(c))){const r=document.documentElement.style;r.setProperty('--brass',CMS.accentColors[0]);r.setProperty('--brass-2',CMS.accentColors[1]);r.setProperty('--brass-deep',CMS.accentColors[2])}
})();
const qs=new URLSearchParams(location.search);

/* ---------- helpers ---------- */
const BN='০১২৩৪৫৬৭৮৯';
const bn=s=>String(s).replace(/\d/g,d=>BN[d]);
const toEn=s=>String(s).replace(/[০-৯]/g,c=>BN.indexOf(c));
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MONTHS=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
const bnDate=d=>bn(d.getDate())+' '+MONTHS[d.getMonth()]+' '+bn(d.getFullYear());
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const groupBD=n=>{const s=String(n);if(s.length<=3)return s;return s.slice(0,-3).replace(/\B(?=(\d{2})+(?!\d))/g,',')+','+s.slice(-3)};
const actById=id=>S.activities.find(a=>a.id===id);

const IC={
  menu:'<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
  x:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l12 12M16 4L4 16" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
  l:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4l-6 6 6 6" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
  r:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4l6 6-6 6" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
  play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l14 8-14 8z" fill="currentColor"/></svg>',
  check:'<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>'
};

/* Photos come from S.img; an empty key renders a neutral placeholder until a licensed photo is added. */
function img(k,alt='',lazy=true){
  const i=S.img[k];
  if(!i||!i.src)return `<span class="noimg"${alt?` role="img" aria-label="${esc(alt)}"`:''}></span>`;
  return `<img alt="${esc(alt)}" src="${i.src}"${i.orig?` data-orig="${i.orig}"`:''}${i.pos?` style="--pos:${i.pos};--posm:${i.posM||i.pos}"`:''}${lazy?' loading="lazy"':''} decoding="async">`;
}
document.addEventListener('error',e=>{
  const t=e.target;if(t.tagName!=='IMG')return;
  if(t.dataset.orig&&t.src!==t.dataset.orig){t.src=t.dataset.orig;return}
  const ph=document.createElement('span');ph.className='noimg';t.replaceWith(ph);
},true);

/* ---------- shell: header + footer ---------- */
const NAV=[['home','index.html','হোম'],['about','about.html','পরিচিতি'],['activities','activities.html','কার্যক্রম'],['promises','promises.html','প্রতিশ্রুতি'],['area','area.html','নির্বাচনী এলাকা'],['gallery','gallery.html','গ্যালারি'],['contact','contact.html','যোগাযোগ']];
const navKey=page==='activity'?'activities':page==='biography'?'about':page;
const cur=k=>k===navKey?' aria-current="page"':'';
const logo=`<a class="logo" href="index.html"><span><b>${M.name}</b><small>${M.title}</small></span></a>`;
document.body.insertAdjacentHTML('afterbegin',`<a class="skip" href="#main">মূল অংশে যান</a>
<header class="site-head" id="head"><div class="head-row">${logo}
<nav id="nav" aria-label="প্রধান মেনু">${NAV.map(([k,h,t])=>`<a href="${h}"${cur(k)}>${t}</a>`).join('')}<a class="m-only" href="complaint.html"${cur('complaint')}>অভিযোগ বক্স</a></nav>
<a class="btn btn-brass head-cta" href="complaint.html"${cur('complaint')} style="padding:11px 20px;font-size:15px">অভিযোগ বক্স</a>
<button id="menuBtn" type="button" aria-label="মেনু" aria-expanded="false" aria-controls="nav">${IC.menu}</button>
</div></header>`);

const office=S.offices[0];
const credits=[...new Set(Object.values(S.img).map(i=>i.credit).filter(Boolean))];
document.body.insertAdjacentHTML('beforeend',`<footer><div class="wrap foot-grid v4">
<div>${logo}<p style="margin-top:16px;max-width:40ch">চরকান্দি, শালবাগান ও নতুনহাটের মানুষের জন্য। প্রতিটি অভিযোগের উত্তর, প্রতিটি প্রতিশ্রুতির হিসাব।</p></div>
<div><h4>সাইট</h4><ul>${NAV.map(([k,h,t])=>`<li><a href="${h}">${t}</a></li>`).join('')}<li><a href="biography.html">জীবনপঞ্জি</a></li><li><a href="complaint.html">অভিযোগ বক্স</a></li></ul></div>
<div><h4>${office.name}</h4><ul>${office.rows.map(r=>`<li>${r[1]}</li>`).join('')}</ul></div>
<div><h4>অন্যান্য</h4><ul><li>ফেসবুক পেজ</li><li>ইউটিউব চ্যানেল</li><li>গোপনীয়তা নীতি</li><li>অভিযোগ নীতিমালা</li></ul></div>
${credits.length?`<details class="credits"><summary>ছবির কৃতজ্ঞতা ও লাইসেন্স</summary><p>${credits.map(esc).join(' · ')}</p></details>`:''}
</div></footer>
<div class="demo-pill">ডেমো · সব নাম, আসন ও তথ্য কাল্পনিক</div>`);

const head=$('#head'), menuBtn=$('#menuBtn'), nav=$('#nav');
menuBtn.addEventListener('click',()=>{const o=nav.classList.toggle('open');menuBtn.setAttribute('aria-expanded',String(o));head.classList.toggle('solid',o||scrollY>40)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){nav.classList.remove('open');menuBtn.setAttribute('aria-expanded','false');menuBtn.focus()}});

/* ---------- motion plumbing (created before rendering so renderers can register rows) ---------- */
const useIO='IntersectionObserver' in window&&!reduce;
function countUp(el){
  const to=+el.dataset.count;if(reduce||!to)return;
  const t0=performance.now(),dur=1500;
  const step=t=>{const p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);el.textContent=bn(groupBD(Math.round(to*e)));if(p<1)requestAnimationFrame(step)};
  requestAnimationFrame(step);
}
const io=useIO?new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;e.target.classList.add('in');$$('[data-count]',e.target).forEach(countUp);io.unobserve(e.target)}),{threshold:.12,rootMargin:'0px 0px -6% 0px'}):null;
const rowIO=useIO?new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');rowIO.unobserve(e.target)}}),{threshold:.3}):null;
const watch=(root=document)=>$$('.reveal',root).forEach(el=>io?io.observe(el):el.classList.add('in'));
const watchRows=rows=>rows.forEach(r=>rowIO?rowIO.observe(r):r.classList.add('in'));

/* ---------- shared building blocks ---------- */
function phero({k,kicker='',title,lead='',crumbs=[],meta='',long=false}){
  const ic=S.img[k];
  const trail=[['হোম','index.html'],...crumbs];
  return `<section class="phero dark${long?' long':''}"><div class="phero-bg" data-px=".25">${img(k,'',false)}</div><div class="hero-shade"></div>
  <div class="phero-content">
    <nav aria-label="অবস্থান"><ol class="crumbs">${trail.map(([t,h],i)=>i<trail.length-1?`<li><a href="${h}">${t}</a></li>`:`<li><span aria-current="page">${t}</span></li>`).join('')}</ol></nav>
    ${kicker?`<p class="kicker">${kicker}</p>`:''}${meta}<h1>${title}</h1>${lead?`<p class="lead">${lead}</p>`:''}
  </div>${ic&&ic.credit?`<span class="credit">ছবি: ${esc(ic.credit)}</span>`:''}</section>`;
}
const secHead=(kicker,title,right='')=>`<div class="sec-head reveal"><div><p class="kicker">${kicker}</p><h2>${title}</h2></div>${right}</div>`;
const more=(href,t)=>`<a class="more" href="${href}">${t}</a>`;

function card(a,feat){
  return `<a class="ncard${feat?' feat':''}" href="activity.html?id=${a.id}"><div class="ph">${img(a.img,'')}</div><div class="body"><p class="meta"><span class="cat">${a.cat}</span><span>${a.date}</span><span>${a.place}</span></p><h3>${a.title}</h3><p class="txt">${a.summary}</p><p class="foot">বিস্তারিত পড়ুন · ${bn(a.imgs.length)}টি ছবি</p></div></a>`;
}

const ST={done:{t:'সম্পন্ন',c:'var(--ok-d)',s:'var(--ok-s)'},ongoing:{t:'চলমান',c:'var(--warn-d)',s:'var(--warn-s)'},late:{t:'বিলম্বিত',c:'var(--late-d)',s:'var(--late-s)'},plan:{t:'শুরু হয়নি',c:'var(--plan-d)',s:'var(--plan-s)'}};
const BAR={done:'var(--ok-d)',ongoing:'var(--brass)',late:'var(--late-d)',plan:'var(--plan-d)'};
function pRow(p,withUpd){
  const s=ST[p.st];
  return `<div class="p-row" style="--c:${s.c};--cs:${s.s}"><div class="p-name"><b>${p.name}</b><span>${p.place}</span></div><div class="p-money">${p.budget}<small>${p.due}</small></div><div class="prog"><div class="track" role="progressbar" aria-label="অগ্রগতি" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}"><i style="width:${p.pct}%;background:${BAR[p.st]}"></i></div><div class="pct"><span>অগ্রগতি</span><span>${bn(p.pct)}%</span></div></div><span class="pill">${s.t}</span>${p.note?`<p class="p-note">${p.note}</p>`:''}${withUpd&&p.updates&&p.updates.length?`<ul class="p-upd">${p.updates.map(u=>`<li><b>${u[0]}:</b> ${u[1]}</li>`).join('')}</ul>`:''}</div>`;
}
function pSummary(){
  const P=S.promises, n=P.length, c={done:0,ongoing:0,late:0,plan:0};
  P.forEach(p=>c[p.st]++);
  const w=k=>(c[k]/n*100).toFixed(2)+'%';
  return `<div class="p-summary reveal"><div class="p-total"><b>${bn(n)}</b><span>নির্বাচনী প্রতিশ্রুতি</span></div><div>
  <div class="stack" role="img" aria-label="${bn(n)}টির মধ্যে ${bn(c.done)}টি সম্পন্ন, ${bn(c.ongoing)}টি চলমান, ${bn(c.late)}টি বিলম্বিত, ${bn(c.plan)}টি শুরু হয়নি"><i style="width:${w('done')};--c:var(--ok-d)"></i><i style="width:${w('ongoing')};--c:var(--brass)"></i><i style="width:${w('late')};--c:var(--late-d)"></i><i style="width:${w('plan')};--c:var(--plan-s)"></i></div>
  <div class="legend"><span style="--c:var(--ok-d)">সম্পন্ন ${bn(c.done)}</span><span style="--c:var(--brass)">চলমান ${bn(c.ongoing)}</span><span style="--c:var(--late-d)">বিলম্বিত ${bn(c.late)}</span><span style="--c:#CFC6B5">শুরু হয়নি ${bn(c.plan)}</span></div></div></div>`;
}

const mapSVG=()=>`<svg class="map" viewBox="0 0 400 300" role="group" aria-label="${M.seat} আসনের ম্যাপ">
  <polygon class="upz" data-k="charkandi" tabindex="0" role="button" aria-label="চরকান্দি উপজেলা" points="20,70 130,28 175,95 165,175 90,265 18,180"/>
  <polygon class="upz" data-k="shalbagan" tabindex="0" role="button" aria-label="শালবাগান উপজেলা" points="130,28 250,22 375,55 385,150 280,150 175,95"/>
  <polygon class="upz" data-k="notunhat" tabindex="0" role="button" aria-label="নতুনহাট উপজেলা" points="175,95 280,150 385,150 330,250 210,280 90,265 165,175"/>
  <path class="river" d="M0,214 C60,196 110,228 160,202 S250,152 300,162 S370,192 400,178"/>
  <circle class="pin" cx="84" cy="160" r="6.5"/><circle class="pin" cx="262" cy="238" r="6.5"/>
  <text class="map-label" data-k="charkandi" x="98" y="128">চরকান্দি</text><text class="map-label" data-k="shalbagan" x="268" y="90">শালবাগান</text><text class="map-label" data-k="notunhat" x="238" y="205">নতুনহাট</text>
</svg><p class="map-legend"><span><i></i>এলাকা অফিস</span><span><i class="w"></i>কাজলা নদী</span><span>উপজেলায় চাপ দিয়ে তথ্য দেখুন</span></p>`;
function areaWidget(full,initial){
  const chips=$('#areaChips'), info=$('#areaInfo');
  chips.innerHTML=Object.entries(U).map(([k,a])=>`<button type="button" class="chip" data-k="${k}" aria-pressed="false">${a.short}</button>`).join('');
  function select(k){
    const a=U[k];if(!a)return;
    $$('.upz').forEach(p=>p.classList.toggle('on',p.dataset.k===k));
    $$('.map-label').forEach(t=>t.classList.toggle('on',t.dataset.k===k));
    $$('.chip',chips).forEach(c=>c.setAttribute('aria-pressed',String(c.dataset.k===k)));
    const kv=full
      ?[[a.pop,'জনসংখ্যা'],[a.voters,'ভোটার'],[a.size,'বর্গকিমি আয়তন'],[a.lit,'সাক্ষরতা'],[a.hh,'খানা (পরিবার)'],[a.schools,'মাধ্যমিক বিদ্যালয়'],[a.clinics,'কমিউনিটি ক্লিনিক'],[a.proj,'চলমান প্রকল্প'],[a.cmp,'এ মাসে অভিযোগ']]
      :[[a.pop,'জনসংখ্যা'],[a.voters,'ভোটার'],[a.proj,'চলমান প্রকল্প'],[a.cmp,'এ মাসে অভিযোগ']];
    info.innerHTML=`<h3>${a.name}</h3>${full?`<p class="about-upz">${a.about}</p>`:''}<div class="kv">${kv.map(([v,l])=>`<div><b>${v}</b><span>${l}</span></div>`).join('')}</div><p class="lbl">ইউনিয়ন ও পৌরসভা (${bn(a.unions.length)}টি)</p><ul class="unions">${a.unions.map(u=>`<li>${u}</li>`).join('')}</ul><p class="office-line">${a.office}</p>`;
  }
  $$('.upz').forEach(p=>{
    p.addEventListener('click',()=>select(p.dataset.k));
    p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(p.dataset.k)}});
  });
  chips.addEventListener('click',e=>{const b=e.target.closest('.chip');if(b)select(b.dataset.k)});
  select(U[initial]?initial:'notunhat');
}

function events(list,cls=''){
  return `<ul class="events ${cls}">${list.map(e=>`<li><div class="date">${/^\d|^[০-৯]/.test(e.d)?`<b>${e.d}</b><span>${e.m}${e.w?' · '+e.w:''}</span>`:`<b class="w">${e.d}</b><span>${e.m}</span>`}</div><div><h3>${e.title}</h3><p>${e.where}। ${e.note}</p></div></li>`).join('')}</ul>`;
}
function offices(){
  return S.offices.map(o=>`<div class="office"><h3>${o.name}</h3><dl>${o.rows.map(r=>`<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('')}</dl></div>`).join('');
}
const cs=S.complaintStats;
const big3=()=>`<div class="big3"><div><b>${cs.got}</b><span>গৃহীত</span></div><div><b>${cs.solved}</b><span>নিষ্পত্তি</span></div><div><b>${cs.avg}</b><span>দিন গড় সময়</span></div></div>`;

/* ---------- lightbox ---------- */
let LB=null, lbItems=[], lbI=0, lbReturn=null;
function lbBuild(){
  if(LB)return;
  document.body.insertAdjacentHTML('beforeend',`<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="ছবি দেখুন" hidden>
  <div class="lb-top"><p id="lbCount"></p><button class="lb-btn" id="lbClose" type="button" aria-label="বন্ধ করুন">${IC.x}</button></div>
  <div class="lb-stage" id="lbStage"></div>
  <div class="lb-bot"><button class="lb-btn" id="lbPrev" type="button" aria-label="আগের ছবি">${IC.l}</button><p class="lb-cap" id="lbCap" aria-live="polite"></p><button class="lb-btn" id="lbNext" type="button" aria-label="পরের ছবি">${IC.r}</button></div></div>`);
  LB=$('#lb');
  $('#lbClose').addEventListener('click',lbClose);
  $('#lbPrev').addEventListener('click',()=>lbShow(lbI-1));
  $('#lbNext').addEventListener('click',()=>lbShow(lbI+1));
  LB.addEventListener('click',e=>{if(e.target===LB||e.target.id==='lbStage')lbClose()});
  LB.addEventListener('keydown',e=>{
    if(e.key==='Escape')lbClose();
    else if(e.key==='ArrowLeft')lbShow(lbI-1);
    else if(e.key==='ArrowRight')lbShow(lbI+1);
    else if(e.key==='Tab'){const f=$$('button:not([hidden])',LB);const i=f.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus()}}
  });
  let x0=null;
  LB.addEventListener('touchstart',e=>{x0=e.touches[0].clientX},{passive:true});
  LB.addEventListener('touchend',e=>{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>50)lbShow(lbI+(dx<0?1:-1));x0=null});
}
function lbShow(i){
  const n=lbItems.length;lbI=(i+n)%n;const it=lbItems[lbI], ic=S.img[it.k]||{};
  $('#lbStage').innerHTML=`<div>${img(it.k,it.cap,false)}</div>`;
  $('#lbCount').textContent=n>1?bn(lbI+1)+' / '+bn(n):'';
  $('#lbCap').innerHTML=`${it.cap}${it.sub?`<small>${it.sub}</small>`:''}${ic.credit?`<small>ছবি: ${esc(ic.credit)}</small>`:''}${it.note?`<em>${it.note}</em>`:''}`;
  $('#lbPrev').hidden=$('#lbNext').hidden=n<2;
}
function openLB(items,i){
  lbBuild();lbItems=items;lbReturn=document.activeElement;
  LB.hidden=false;document.body.classList.add('lb-open');lbShow(i||0);$('#lbClose').focus();
}
function lbClose(){LB.hidden=true;document.body.classList.remove('lb-open');if(lbReturn&&lbReturn.focus)lbReturn.focus()}
const albumItems=a=>a.imgs.map(k=>({k,cap:a.title,sub:a.date+' · '+a.place}));
const videoItem=v=>({k:v.img,cap:v.title,sub:v.date+' · '+v.dur+' মিনিট',note:'ডেমোতে ভিডিও চলবে না। আসল সাইটে ইউটিউব ভিডিও এখানেই চলবে।'});

/* ---------- biography timeline (shared by about + biography pages) ---------- */
const BIO=[['edu','শিক্ষাজীবন','education'],['work','পেশাগত জীবন','profession'],['politics','রাজনৈতিক জীবন','politics']];
const yrHtml=y=>{const m=y.match(/^(\S+)\s+(\S+)$/);return m?`<small>${m[1]}</small>${m[2]}`:y};
const tl=(list,cls,nowLast)=>`<ol class="tl ${cls}">${list.map((e,i)=>`<li class="reveal${nowLast&&i===list.length-1?' now':''}"><span class="yr">${yrHtml(e.yr)}</span><div><h3>${e.title}</h3><p><span class="place">${e.place}</span>${e.note}</p></div></li>`).join('')}</ol>`;

/* ---------- pages ---------- */
const main=$('#main');

const PAGES={
home(){
  const ev=S.events[0];
  const acts=S.activities.slice(0,6);
  const homeP=S.promises.filter(p=>p.home);
  const tiles=S.activities.slice(0,5);
  main.innerHTML=`
  <section class="hero" aria-label="প্রধান ব্যানার">
    <div class="hero-bg" id="heroBg" data-px=".3"></div><div class="hero-shade"></div>
    <div class="hero-content">
      <p class="kicker">সংসদ সদস্য · ${M.seat}</p><h1>${M.name}</h1><div class="rule"></div>
      <p class="roles">${M.roleLine}</p><p class="tag">${M.slogan}</p>
      <div class="acts"><a class="btn btn-brass" href="complaint.html">অভিযোগ জানান</a><a class="btn btn-line" href="promises.html">প্রতিশ্রুতির হিসাব দেখুন</a></div>
      <p class="notice"><b>পরবর্তী ${ev.title}</b><span>${ev.w}বার, ${ev.d} ${ev.m} · ${ev.where}</span></p>
    </div>
    <div class="hero-cap"><p id="heroCap"></p><div class="hdots" id="hdots"></div></div>
  </section>

  <section data-sec="stats" class="stats" aria-label="সংখ্যায় কাজ"><div class="wrap">
    <p class="kicker" style="margin-bottom:26px">সংখ্যায় সাত মাসের কাজ</p>
    <div class="stats-grid">${S.stats.map(s=>`<div class="stat reveal"><b><span data-count="${s.n}">${bn(groupBD(s.n))}</span>${s.unit?`<small>${s.unit}</small>`:''}</b><span>${s.label}</span></div>`).join('')}</div>
    <p class="src">${S.statsNote}</p>
  </div></section>

  <section data-sec="about" class="sec light"><div class="wrap about-grid">
    <div class="about-left reveal">
      <p class="kicker">পরিচিতি</p><h2>${A.headline}</h2><p class="lead">${A.intro}</p>
      <ul class="facts">
        <li><span>শিক্ষা</span>${A.education.slice(2).map(e=>e.title).join(' · ')}</li>
        <li><span>পেশা</span>জনস্বাস্থ্য চিকিৎসক ও গবেষক</li>
        <li><span>দায়িত্ব</span><ul>${A.roles.slice(1,3).map(r=>`<li>${r[0]}</li>`).join('')}</ul></li>
      </ul>
      <p class="sec-foot">${more('about.html','পূর্ণ পরিচিতি পড়ুন')}</p>
    </div>
    <div>
      <figure class="about-fig reveal">${img('river','নদীপুরের চরাঞ্চল')}<figcaption>নদীপুরের চরাঞ্চল · বর্ষায় যেখানে নৌকাই একমাত্র পথ</figcaption></figure>
      <ol class="tl" aria-label="জীবনের গুরুত্বপূর্ণ বছর">${A.milestones.map(m=>`<li class="reveal${m.now?' now':''}"><span class="yr">${m.yr}</span><div><h3>${m.title}</h3><p>${m.note}</p></div></li>`).join('')}</ol>
    </div>
  </div></section>

  <section data-sec="activities" class="sec dark"><div class="wrap">
    ${secHead('কার্যক্রম','সাম্প্রতিক কাজ',more('activities.html','সব কার্যক্রম'))}
    <div class="news">${acts.map((a,i)=>card(a,i===0)).join('')}</div>
  </div></section>

  <section data-sec="office" class="band dark" aria-label="সংসদে">
    <div class="band-bg" data-px=".18">${img('parliament','')}</div><div class="band-shade"></div>
    <div class="wrap band-grid">
      <div class="reveal"><p class="kicker">দায়িত্ব</p><h2 class="h2">সংসদে চরাঞ্চলের কণ্ঠস্বর</h2>
        <ul class="roles-list">${A.roles.slice(0,3).map(r=>`<li><b>${r[0]}</b><span>${r[1]}</span></li>`).join('')}</ul></div>
      <div class="video reveal">
        <button class="play" id="playBtn" type="button" aria-label="ভিডিও চালান">${IC.play}</button>
        <h3>${S.videos[0].title}</h3><p>${S.videos[0].date} · ${S.videos[0].dur} মিনিট</p>
        <p style="margin-top:16px">${more('gallery.html#videos','সব ভিডিও')}</p>
      </div>
    </div>
    ${S.img.parliament.credit?`<span class="credit">ছবি: ${esc(S.img.parliament.credit)}</span>`:''}
  </section>

  <section data-sec="promises" class="sec light"><div class="wrap">
    ${secHead('উন্নয়ন ও প্রতিশ্রুতি','নির্বাচনী প্রতিশ্রুতির হিসাব',more('promises.html','সব প্রতিশ্রুতি দেখুন'))}
    <div class="home-prom">
      <div>${pSummary()}<p class="lead reveal" style="margin-top:8px">প্রতিটি প্রকল্পের বাজেট, সময়সীমা আর অগ্রগতি। কাজ পিছিয়ে গেলে কারণসহ জানানো হয়।</p></div>
      <div class="p-list" id="pList" style="margin-top:0">${homeP.map(p=>pRow(p)).join('')}</div>
    </div>
  </div></section>

  <section data-sec="area" class="sec light-2"><div class="wrap">
    ${secHead('নির্বাচনী এলাকা',M.seat+' আসন',`<p class="lead" style="margin:0">৩টি উপজেলা · ১৮টি ইউনিয়ন ও ১টি পৌরসভা · মোট ভোটার ${S.area.totals[1][0]} · জনসংখ্যা ${S.area.totals[0][0]}</p>`)}
    <div class="area-grid">
      <div class="reveal">${mapSVG()}</div>
      <div class="reveal"><div class="chips" id="areaChips" aria-label="উপজেলা বেছে নিন"></div><div class="area-info" id="areaInfo" aria-live="polite"></div>
        <p class="sec-foot" style="margin-top:28px">${more('area.html','এলাকার পূর্ণ তথ্য')}</p></div>
    </div>
  </div></section>

  <section data-sec="gallery" class="sec dark"><div class="wrap">
    ${secHead('গ্যালারি','ছবিতে কাজের খবর',more('gallery.html','পুরো গ্যালারি'))}
    <div class="mosaic reveal">${tiles.map((a,i)=>`<button class="tile" type="button" data-i="${i}" aria-label="ছবি বড় করে দেখুন: ${esc(a.title)}">${img(a.img,'')}<span class="c">${a.title}</span></button>`).join('')}</div>
  </div></section>

  <section data-sec="events" class="sec light"><div class="wrap">
    ${secHead('দেখা করুন','আসন্ন কর্মসূচি',more('contact.html','সব কর্মসূচি ও অফিস'))}
    <div class="reveal">${events(S.events.slice(0,3))}</div>
  </div></section>

  <section data-sec="cta" class="sec cta-band dark"><div class="wrap cta-grid">
    <div class="reveal"><p class="kicker">অভিযোগ ও পরামর্শ বক্স</p><h2 class="h2">আপনার সমস্যা সরাসরি জানান</h2>
      <p class="lead">প্রতিটি অভিযোগ ট্র্যাকিং আইডিসহ নথিভুক্ত হয়। প্রতিটি ধাপে আপনাকে SMS-এ জানানো হয়। চাইলে বেনামেও জানাতে পারেন।</p>
      <div class="acts"><a class="btn btn-brass" href="complaint.html">অভিযোগ জানান</a><a class="btn btn-line" href="complaint.html#track">অভিযোগের অবস্থা দেখুন</a></div></div>
    <div class="side-box reveal"><p class="kicker">${cs.period}</p>${big3()}<p class="hint">শুধু সংখ্যা প্রকাশ করা হয়। কোনো অভিযোগকারীর নাম বা অভিযোগের বিবরণ প্রকাশ হয় না।</p></div>
  </div></section>`;

  /* CMS overlay: section order + visibility chosen in the MP admin panel */
  if(CMS.sections){const ms=$$('[data-sec]',main),by={};ms.forEach(s=>by[s.dataset.sec]=s);CMS.sections.forEach(s=>{const el=by[s.key];if(!el)return;if(s.on)main.appendChild(el);else el.remove()})}
  /* banner slideshow */
  const B=S.banners, heroBg=$('#heroBg'), hdots=$('#hdots'), heroCap=$('#heroCap');
  // framed slides (data.js img.frame): blurred full-bleed backdrop + the sharp photo in a frame beside the text
  heroBg.innerHTML=B.map((s,i)=>S.img[s.img]&&S.img[s.img].frame
    ?`<div class="hs hs-framed${i?'':' on'}"><div class="hs-blur">${img(s.img,'',i>0)}</div><figure class="hs-frame">${img(s.img,s.cap,i>0)}</figure></div>`
    :`<div class="hs${i?'':' on'}">${img(s.img,'',i>0)}</div>`).join('');
  hdots.innerHTML=B.map((s,i)=>`<button class="hdot${i?'':' on'}" type="button" aria-label="ব্যানার ${bn(i+1)}"></button>`).join('');
  let curI=0,timer=null;
  const go=i=>{curI=(i+B.length)%B.length;$$('.hs',heroBg).forEach((el,j)=>el.classList.toggle('on',j===curI));$$('.hdot',hdots).forEach((el,j)=>el.classList.toggle('on',j===curI));heroCap.textContent=B[curI].cap};
  const restart=()=>{clearInterval(timer);if(!reduce)timer=setInterval(()=>go(curI+1),3000)};
  $$('.hdot',hdots).forEach((d,i)=>d.addEventListener('click',()=>{go(i);restart()}));
  go(0);restart();

  watchRows($$('#pList .p-row'));
  areaWidget(false,'notunhat');
  $('#playBtn').addEventListener('click',()=>openLB([videoItem(S.videos[0])],0));
  const tItems=tiles.map(a=>({k:a.img,cap:a.title,sub:a.date+' · '+a.place}));
  $$('.mosaic .tile').forEach(t=>t.addEventListener('click',()=>openLB(tItems,+t.dataset.i)));
},

about(){
  main.innerHTML=phero({k:'river',kicker:'পরিচিতি',title:M.name,lead:M.title+'। '+A.headline+'।',crumbs:[['পরিচিতি']]})+`
  <section class="sec light"><div class="wrap about-grid">
    <div class="about-left reveal"><p class="kicker">ব্যক্তিগত তথ্য</p><h2 class="h3" style="margin-top:10px">এক নজরে</h2>
      <ul class="facts wide">${A.personal.map(p=>`<li><span>${p[0]}</span>${p[1]}</li>`).join('')}</ul></div>
    <div>
      <div class="reveal"><p class="kicker">জীবনের গল্প</p><h2>${A.headline}</h2></div>
      <div class="prose reveal" style="margin-top:28px">${A.story.map(p=>`<p>${p}</p>`).join('')}</div>
      <figure class="about-fig reveal" style="margin-top:36px">${img('health','চরাঞ্চলের স্বাস্থ্যসেবা')}<figcaption>চরাঞ্চলের স্বাস্থ্যসেবা · প্রতীকী ছবি</figcaption></figure>
    </div>
  </div></section>

  <section class="sec light-2"><div class="wrap">
    ${secHead('জীবনপঞ্জি','শিক্ষা, পেশা ও রাজনীতি',more('biography.html','পূর্ণ জীবনপঞ্জি'))}
    <nav class="sec-sum three reveal" aria-label="জীবনপঞ্জি">${BIO.map(([id,t,k])=>{const l=A[k], last=l[l.length-1];return `<a href="biography.html#${id}"><b>${t}</b><span>${bn(l.length)}টি ধাপ · সর্বশেষ: ${last.title}, ${last.yr}</span></a>`}).join('')}</nav>
  </div></section>

  <section class="band dark" aria-label="সংসদীয় দায়িত্ব">
    <div class="band-bg" data-px=".18">${img('parliament','')}</div><div class="band-shade"></div>
    <div class="wrap"><div class="reveal" style="max-width:820px"><p class="kicker">সংসদীয় দায়িত্ব</p><h2 class="h2">সংসদে চরাঞ্চলের কণ্ঠস্বর</h2>
      <ul class="roles-list">${A.roles.map(r=>`<li><b>${r[0]}</b><span>${r[1]}</span></li>`).join('')}</ul>
      <div class="pnums">${A.parliament.map(p=>`<div><b>${p.n}</b><span>${p.label}</span></div>`).join('')}</div>
      <p class="src">দ্বাদশ অধিবেশন পর্যন্ত · মার্চ–সেপ্টেম্বর ২০২৬</p></div></div>
    ${S.img.parliament.credit?`<span class="credit">ছবি: ${esc(S.img.parliament.credit)}</span>`:''}
  </section>

  <section class="sec light"><div class="wrap two-col">
    <div class="reveal"><p class="kicker">সম্মাননা</p><h2 class="h3" style="margin-top:10px">স্বীকৃতি</h2>
      <ul class="ylist">${A.awards.map(a=>`<li><span class="y">${a.yr}</span><div><b>${a.title}</b><span>${a.by}</span></div></li>`).join('')}</ul></div>
    <div class="reveal"><p class="kicker">গবেষণা ও প্রকাশনা</p><h2 class="h3" style="margin-top:10px">লেখালেখি</h2>
      <ul class="ylist">${A.works.map(w=>`<li><span class="y">${w.yr}</span><div><b>${w.title}</b><span>${w.type}</span></div></li>`).join('')}</ul></div>
  </div></section>

  <section class="sec light-2"><div class="wrap">
    ${secHead('অগ্রাধিকার','যে পাঁচটি কাজ আগে',more('promises.html','প্রতিশ্রুতির হিসাব দেখুন'))}
    <ol class="prio reveal">${A.priorities.map(p=>`<li><b>${p[0]}</b><span>${p[1]}</span></li>`).join('')}</ol>
  </div></section>`;
},

biography(){
  main.innerHTML=phero({k:'school',kicker:'পরিচিতি',title:'জীবনপঞ্জি',lead:`${M.name}-এর শিক্ষা, পেশা ও রাজনৈতিক জীবনের পূর্ণ বিবরণ, বছর ধরে ধরে।`,crumbs:[['পরিচিতি','about.html'],['জীবনপঞ্জি']]})+`
  <section class="sec light-2"><div class="wrap">
    <nav class="chips reveal" aria-label="অংশে যান" style="margin-bottom:64px">${BIO.map(([id,t])=>`<a class="chip" href="#${id}" style="text-decoration:none">${t}</a>`).join('')}</nav>
    ${BIO.map(([id,t,k],i)=>`<div class="tl-block" id="${id}" style="scroll-margin-top:96px"><h2 class="h3 reveal">${t}</h2>${tl(A[k],k==='profession'?'mid':'',k==='politics')}</div>`).join('')}
  </div></section>
  <section class="sec light"><div class="wrap two-col">
    <div class="reveal"><p class="kicker">পরিচিতি</p><h2 class="h3" style="margin:10px 0 16px">ব্যক্তিগত তথ্য, সংসদীয় দায়িত্ব ও সম্মাননা</h2>${more('about.html','পরিচিতি পেজে যান')}</div>
    <div class="reveal"><p class="kicker">কাজের হিসাব</p><h2 class="h3" style="margin:10px 0 16px">নির্বাচনী প্রতিশ্রুতি কতদূর এগোল</h2>${more('promises.html','প্রতিশ্রুতির হিসাব দেখুন')}</div>
  </div></section>`;
},

activities(){
  const cats=S.activityCats, months=[...new Set(S.activities.map(a=>a.month))];
  const st={cat:cats.some(c=>c[0]===qs.get('cat'))?qs.get('cat'):'all',upz:'',month:''};
  main.innerHTML=phero({k:'road',kicker:'কার্যক্রম',title:'মাঠে, সংসদে, মানুষের পাশে',lead:`${M.seat} আসনের সব কার্যক্রমের নিয়মিত হালনাগাদ। বিষয়, উপজেলা বা মাস বেছে নিয়ে খুঁজুন।`,crumbs:[['কার্যক্রম']]})+`
  <section class="sec dark"><div class="wrap">
    <div class="filters">
      <div class="chips" id="fCats" aria-label="বিষয় অনুযায়ী দেখুন">${cats.map(([k,t])=>`<button type="button" class="chip" data-k="${k}" aria-pressed="${k===st.cat}">${t}</button>`).join('')}</div>
      <div class="field"><label for="fU">উপজেলা</label><select id="fU"><option value="">সব উপজেলা</option>${Object.values(U).map(a=>`<option>${a.short}</option>`).join('')}</select></div>
      <div class="field"><label for="fM">মাস</label><select id="fM"><option value="">সব মাস</option>${months.map(m=>`<option>${m} ২০২৬</option>`).join('')}</select></div>
      <button type="button" class="linkbtn" id="fReset" style="margin-bottom:12px">ফিল্টার মুছুন</button>
    </div>
    <p class="count" id="fCount" aria-live="polite"></p>
    <div class="news" id="news"></div>
  </div></section>`;
  const render=()=>{
    const list=S.activities.filter(a=>(st.cat==='all'||a.k===st.cat)&&(!st.upz||a.upz===st.upz)&&(!st.month||a.month===st.month));
    $('#fCount').textContent=bn(list.length)+'টি কার্যক্রম';
    $('#news').innerHTML=list.length?list.map((a,i)=>card(a,i===0&&list.length>2)).join(''):'<p class="empty">এই ফিল্টারে কোনো কার্যক্রম নেই। অন্য বিষয় বা মাস বেছে নিন।</p>';
    const u=new URL(location.href);if(st.cat==='all')u.searchParams.delete('cat');else u.searchParams.set('cat',st.cat);history.replaceState(null,'',u);
  };
  $('#fCats').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;st.cat=b.dataset.k;$$('.chip',$('#fCats')).forEach(c=>c.setAttribute('aria-pressed',String(c===b)));render()});
  $('#fU').addEventListener('change',e=>{st.upz=e.target.value;render()});
  $('#fM').addEventListener('change',e=>{st.month=e.target.value.split(' ')[0];render()});
  $('#fReset').addEventListener('click',()=>{st.cat='all';st.upz='';st.month='';$('#fU').value='';$('#fM').value='';$$('.chip',$('#fCats')).forEach(c=>c.setAttribute('aria-pressed',String(c.dataset.k==='all')));render()});
  render();
},

activity(){
  const a=actById(qs.get('id')||'');
  if(!a){
    document.title='কার্যক্রম পাওয়া যায়নি · '+M.name;
    main.innerHTML=phero({k:'road',kicker:'কার্যক্রম',title:'কার্যক্রমটি পাওয়া যায়নি',lead:'লিংকটি পুরনো বা ভুল হতে পারে।',crumbs:[['কার্যক্রম','activities.html'],['পাওয়া যায়নি']]})+`<section class="sec light"><div class="wrap"><p class="lead" style="margin:0 0 24px">সব কার্যক্রমের তালিকা থেকে খুঁজে দেখুন।</p>${more('activities.html','সব কার্যক্রম')}</div></section>`;
    return;
  }
  document.title=a.title+' · '+M.name;
  const idx=S.activities.indexOf(a), newer=S.activities[idx-1], older=S.activities[idx+1];
  const related=[...S.activities.filter(x=>x.k===a.k&&x!==a),...S.activities.filter(x=>x.k!==a.k)].slice(0,3);
  const body=a.body.map(p=>`<p>${p}</p>`);
  if(a.quote)body.splice(1,0,`<blockquote class="pull"><p>${a.quote}</p><cite>${M.name}</cite></blockquote>`);
  main.innerHTML=phero({k:a.img,long:true,title:a.title,crumbs:[['কার্যক্রম','activities.html'],[a.title]],meta:`<p class="pmeta"><span class="cat">${a.cat}</span><span>${a.date}</span><span>${a.place}</span></p>`})+`
  <section class="sec light"><div class="wrap art-grid">
    <article>
      <div class="art-body reveal">${body.join('')}</div>
      <div class="album-h reveal"><h2 class="h3">ছবির অ্যালবাম</h2><span>${bn(a.imgs.length)}টি ছবি · বড় করে দেখতে ছবিতে চাপ দিন</span></div>
      <div class="album reveal">${a.imgs.map((k,i)=>`<button class="tile" type="button" data-i="${i}" aria-label="ছবি ${bn(i+1)} বড় করে দেখুন">${img(k,'')}</button>`).join('')}</div>
      <nav class="pager" aria-label="অন্য কার্যক্রম">${newer?`<a href="activity.html?id=${newer.id}"><small>← নতুন কার্যক্রম</small><b>${newer.title}</b></a>`:'<span></span>'}${older?`<a class="next" href="activity.html?id=${older.id}"><small>আগের কার্যক্রম →</small><b>${older.title}</b></a>`:''}</nav>
    </article>
    <aside class="art-side reveal" aria-label="এক নজরে">
      <p class="kicker">এক নজরে</p>
      <dl class="dl"><dt>তারিখ</dt><dd>${a.date}</dd><dt>স্থান</dt><dd>${a.place}</dd><dt>উপজেলা</dt><dd>${a.upz||'পুরো আসন'}</dd><dt>বিষয়</dt><dd>${a.cat}</dd><dt>ছবি</dt><dd>${bn(a.imgs.length)}টি</dd></dl>
      <button type="button" class="btn btn-ghost" id="copyLink">লিংক কপি করুন</button>
      <a class="btn btn-dark" href="complaint.html" style="margin-top:10px">এ বিষয়ে কিছু জানাতে চান?</a>
    </aside>
  </div></section>
  <section class="sec dark"><div class="wrap">
    ${secHead('আরও পড়ুন','সম্পর্কিত কার্যক্রম',more('activities.html','সব কার্যক্রম'))}
    <div class="news">${related.map(x=>card(x,false)).join('')}</div>
  </div></section>`;
  const items=albumItems(a);
  $$('.album .tile').forEach(t=>t.addEventListener('click',()=>openLB(items,+t.dataset.i)));
  $('#copyLink').addEventListener('click',e=>{const b=e.currentTarget;try{navigator.clipboard.writeText(location.href).then(()=>{b.textContent='লিংক কপি হয়েছে'},()=>{b.textContent='কপি করা যায়নি'})}catch(err){b.textContent='কপি করা যায়নি'}});
},

promises(){
  const P=S.promises;
  main.innerHTML=phero({k:'bridge',kicker:'উন্নয়ন ও প্রতিশ্রুতি',title:'নির্বাচনী প্রতিশ্রুতির হিসাব',lead:`নির্বাচনের আগে দেওয়া ${bn(P.length)}টি প্রতিশ্রুতির প্রতিটির বাজেট, সময়সীমা আর অগ্রগতি। কাজ পিছিয়ে গেলে কারণসহ জানানো হয়।`,crumbs:[['প্রতিশ্রুতি']]})+`
  <section class="sec light"><div class="wrap">
    ${pSummary()}
    <nav class="sec-sum reveal" aria-label="খাত">${S.sectors.map(([k,t])=>{const l=P.filter(p=>p.sec===k);return `<a href="#sec-${k}"><b>${t}</b><span>${bn(l.length)}টি · ${bn(l.filter(p=>p.st==='done').length)}টি সম্পন্ন</span></a>`}).join('')}</nav>
    <div class="chips" id="pChips" style="margin-top:44px" aria-label="অবস্থা অনুযায়ী দেখুন">${[['all','সব'],['done','সম্পন্ন'],['ongoing','চলমান'],['late','বিলম্বিত'],['plan','শুরু হয়নি']].map(([k,t],i)=>`<button type="button" class="chip" data-k="${k}" aria-pressed="${i===0}">${t}</button>`).join('')}</div>
    <div id="sectors"></div>
    <div class="method reveal"><p class="kicker">অগ্রগতি কীভাবে মাপা হয়</p><p>অগ্রগতির হার আসে সংশ্লিষ্ট দপ্তরের (উপজেলা প্রকৌশল, স্বাস্থ্য প্রকৌশল, শিক্ষা প্রকৌশল) মাসিক প্রতিবেদন থেকে, আর প্রতি মাসের শেষ সপ্তাহে হালনাগাদ হয়। কোনো তথ্যে ভুল দেখলে অভিযোগ বক্সে "অন্যান্য" বিষয়ে জানান। শেষ হালনাগাদ: ২৮ সেপ্টেম্বর ২০২৬।</p></div>
  </div></section>`;
  const render=k=>{
    $('#sectors').innerHTML=S.sectors.map(([sk,t])=>{
      const all=P.filter(p=>p.sec===sk), l=all.filter(p=>k==='all'||p.st===k);
      if(!l.length)return '';
      const avg=Math.round(all.reduce((s,p)=>s+p.pct,0)/all.length);
      return `<div class="sector" id="sec-${sk}"><div class="sector-head"><h2 class="h3">${t}</h2><span>${bn(all.length)}টি প্রতিশ্রুতি · গড় অগ্রগতি ${bn(avg)}%</span></div><div class="p-list">${l.map(p=>pRow(p,true)).join('')}</div></div>`;
    }).join('')||'<p class="empty" style="color:var(--muted-dark)">এই অবস্থায় কোনো প্রতিশ্রুতি নেই।</p>';
    watchRows($$('#sectors .p-row'));
  };
  $('#pChips').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;$$('.chip',$('#pChips')).forEach(c=>c.setAttribute('aria-pressed',String(c===b)));render(b.dataset.k)});
  render('all');
},

area(){
  const ar=S.area, vs=ar.voters.map(v=>+toEn(v[1]).replace(/,/g,'')), vmax=Math.max(...vs);
  const rows=Object.values(U);
  main.innerHTML=phero({k:'agri',kicker:'নির্বাচনী এলাকা',title:M.seat+' আসন',lead:'চরকান্দি, শালবাগান ও নতুনহাট উপজেলা · ১৮টি ইউনিয়ন ও ১টি পৌরসভা। চর, কৃষিজমি আর হাট-বাজারের এলাকা।',crumbs:[['নির্বাচনী এলাকা']]})+`
  <section class="stats" aria-label="আসনের মোট হিসাব"><div class="wrap"><div class="stats-grid">${ar.totals.map(t=>`<div class="stat reveal"><b>${t[0]}</b><span>${t[1]}</span></div>`).join('')}</div></div></section>
  <section class="sec light-2"><div class="wrap">
    ${secHead('উপজেলা','ম্যাপে আসন')}
    <div class="area-grid"><div class="reveal">${mapSVG()}</div>
      <div class="reveal area-full"><div class="chips" id="areaChips" aria-label="উপজেলা বেছে নিন"></div><div class="area-info" id="areaInfo" aria-live="polite"></div></div></div>
  </div></section>
  <section class="sec light"><div class="wrap">
    ${secHead('এক নজরে','আসনের পরিসংখ্যান')}
    <div class="xgrid reveal">${ar.extra.map(x=>`<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>
    <div class="two-col" style="margin-top:72px">
      <div class="reveal"><h3 class="h3">ভোটার</h3><p class="lead" style="margin:8px 0 22px">মোট ভোটার ${ar.totals[1][0]}</p>
        <div class="hbars vbars">${ar.voters.map((v,i)=>`<div class="hbar"><span>${v[0]}</span><span class="t"><i style="width:${Math.max(.6,vs[i]/vmax*100).toFixed(1)}%"></i></span><span class="n">${v[1]}</span></div>`).join('')}</div></div>
      <div class="reveal"><h3 class="h3">উপজেলাভিত্তিক ভোটার</h3><p class="lead" style="margin:8px 0 22px">তিন উপজেলার তুলনা</p>
        <div class="hbars vbars">${rows.map(u=>{const n=+toEn(u.voters).replace(/,/g,'');return `<div class="hbar"><span>${u.short}</span><span class="t"><i style="width:${(n/200000*100).toFixed(1)}%"></i></span><span class="n">${u.voters}</span></div>`}).join('')}</div></div>
    </div>
    <h3 class="h3 reveal" style="margin-top:80px">উপজেলাভিত্তিক তুলনা</h3>
    <div class="tbl-wrap reveal" tabindex="0" role="region" aria-label="উপজেলাভিত্তিক তুলনার টেবিল"><table class="t">
      <thead><tr><th scope="col">উপজেলা</th><th scope="col" class="n">জনসংখ্যা</th><th scope="col" class="n">ভোটার</th><th scope="col" class="n">আয়তন (বর্গকিমি)</th><th scope="col" class="n">সাক্ষরতা</th><th scope="col" class="n">ইউনিয়ন/পৌরসভা</th><th scope="col" class="n">মাধ্যমিক বিদ্যালয়</th><th scope="col" class="n">কমিউনিটি ক্লিনিক</th></tr></thead>
      <tbody>${rows.map(u=>`<tr><th scope="row">${u.short}</th><td class="n">${u.pop}</td><td class="n">${u.voters}</td><td class="n">${u.size}</td><td class="n">${u.lit}</td><td class="n">${bn(u.unions.length)}</td><td class="n">${u.schools}</td><td class="n">${u.clinics}</td></tr>`).join('')}
      <tr><th scope="row">মোট</th><td class="n">${ar.totals[0][0]}</td><td class="n">${ar.totals[1][0]}</td><td class="n">${ar.totals[2][0]}</td><td class="n">${ar.extra[1][0]}</td><td class="n">${bn(rows.reduce((s,u)=>s+u.unions.length,0))}</td><td class="n">${ar.extra[2][0]}</td><td class="n">${ar.extra[5][0]}</td></tr></tbody>
    </table></div>
    <p class="hint" style="color:var(--muted-dark);margin-top:14px">উৎস: আদমশুমারি ও নির্বাচন কমিশনের ভোটার তালিকা (ডেমোতে কাল্পনিক সংখ্যা)।</p>
  </div></section>`;
  areaWidget(true,qs.get('upz'));
},

gallery(){
  const cats=S.activityCats;
  main.innerHTML=phero({k:'tree',kicker:'গ্যালারি',title:'ছবি ও ভিডিও',lead:'প্রতিটি কার্যক্রমের ছবির অ্যালবাম, সংসদের বক্তব্য আর গণশুনানির পূর্ণ ভিডিও।',crumbs:[['গ্যালারি']]})+`
  <section class="sec dark"><div class="wrap">
    <div class="gal-sec">
      ${secHead('ছবি','ছবির অ্যালবাম')}
      <div class="filters" style="border:0;padding:0"><div class="chips" id="gCats" aria-label="বিষয় অনুযায়ী দেখুন">${cats.map(([k,t],i)=>`<button type="button" class="chip" data-k="${k}" aria-pressed="${i===0}">${t}</button>`).join('')}</div></div>
      <div class="albums" id="albums"></div>
    </div>
    <div class="gal-sec" id="videos" style="scroll-margin-top:96px">
      ${secHead('ভিডিও','বক্তব্য, গণশুনানি ও সাক্ষাৎকার')}
      <div class="vids">${S.videos.map((v,i)=>`<button class="alb reveal" type="button" data-v="${i}"><span class="ph">${img(v.img,'')}<span class="vplay">${IC.play}</span><span class="n">${v.dur}</span></span><b>${v.title}</b><small>${v.date}</small></button>`).join('')}</div>
    </div>
  </div></section>`;
  const render=k=>{
    const list=S.activities.filter(a=>k==='all'||a.k===k);
    $('#albums').innerHTML=list.map(a=>`<button class="alb" type="button" data-id="${a.id}"><span class="ph">${img(a.img,'')}<span class="n">${bn(a.imgs.length)}টি ছবি</span></span><b>${a.title}</b><small>${a.date} · ${a.place}</small></button>`).join('');
  };
  $('#gCats').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;$$('.chip',$('#gCats')).forEach(c=>c.setAttribute('aria-pressed',String(c===b)));render(b.dataset.k)});
  $('#albums').addEventListener('click',e=>{const b=e.target.closest('.alb');if(b)openLB(albumItems(actById(b.dataset.id)),0)});
  $$('[data-v]').forEach(b=>b.addEventListener('click',()=>openLB([videoItem(S.videos[+b.dataset.v])],0)));
  render('all');
},

complaint(){
  main.innerHTML=phero({k:'hearing',kicker:'অভিযোগ ও পরামর্শ বক্স',title:'আপনার সমস্যা সরাসরি জানান',lead:'প্রতিটি অভিযোগ ট্র্যাকিং আইডিসহ নথিভুক্ত হয়। প্রতিটি ধাপে আপনাকে SMS-এ জানানো হয়। চাইলে বেনামেও জানাতে পারেন।',crumbs:[['অভিযোগ বক্স']]})+`
  <section class="sec dark"><div class="wrap">
    <div class="cmp-grid" style="margin-top:0">
      <div class="reveal">
        <div class="tabs" role="tablist" aria-label="অভিযোগ">
          <button class="tab" role="tab" type="button" id="tab-new" data-tab="new" aria-selected="true" aria-controls="pane-new">নতুন অভিযোগ</button>
          <button class="tab" role="tab" type="button" id="tab-track" data-tab="track" aria-selected="false" aria-controls="pane-track">অভিযোগের অবস্থা দেখুন</button>
        </div>
        <div id="pane-new" role="tabpanel" aria-labelledby="tab-new">
          <form class="cmp" id="cmpForm" novalidate>
            <div class="frow">
              <div class="field"><label for="fCat">বিষয় <span class="req">*</span></label><select id="fCat"></select><p class="err" id="eCat" hidden></p></div>
              <div class="field"><label for="fUpz">উপজেলা <span class="req">*</span></label><select id="fUpz"></select><p class="err" id="eUpz" hidden></p></div>
            </div>
            <div class="frow">
              <div class="field"><label for="fUnion">ইউনিয়ন / পৌরসভা <span class="req">*</span></label><select id="fUnion" disabled><option value="">আগে উপজেলা বেছে নিন</option></select><p class="err" id="eUnion" hidden></p></div>
              <div class="field"><label for="fPlace">গ্রাম / মহল্লা / ওয়ার্ড</label><input type="text" id="fPlace" maxlength="80" placeholder="যেমন: ৪ নম্বর ওয়ার্ড, মাঝিপাড়া"></div>
            </div>
            <div class="field">
              <label for="fText">সমস্যার বিবরণ <span class="req">*</span></label>
              <textarea id="fText" maxlength="1000" placeholder="কী সমস্যা, কবে থেকে, কতজন ভুক্তভোগী"></textarea>
              <div class="split"><p class="err" id="eText" hidden></p><span class="hint" id="cnt" style="margin-left:auto">০/১০০০</span></div>
            </div>
            <div class="field">
              <label for="fFiles">ছবি যুক্ত করুন (ঐচ্ছিক, সর্বোচ্চ ৩টি)</label>
              <input type="file" id="fFiles" accept="image/*" multiple>
              <p class="hint" id="fileHint">ছবি থাকলে সমস্যা দ্রুত যাচাই করা যায়।</p><p class="err" id="eFiles" hidden></p>
            </div>
            <label class="check" for="fAnon"><input type="checkbox" id="fAnon"><span>বেনামে অভিযোগ করতে চাই<small class="hint">নাম ও নম্বর জমা হবে না। তখন SMS যাবে না, ট্র্যাকিং আইডি লিখে রাখতে হবে।</small></span></label>
            <div class="frow" id="identity">
              <div class="field"><label for="fName">আপনার নাম (ঐচ্ছিক)</label><input type="text" id="fName" maxlength="60" autocomplete="name"></div>
              <div class="field"><label for="fPhone">মোবাইল নম্বর <span class="req">*</span></label><input type="tel" id="fPhone" inputmode="numeric" maxlength="16" placeholder="০১XXXXXXXXX" autocomplete="tel"><p class="err" id="ePhone" hidden></p></div>
            </div>
            <p class="privacy">আপনার নাম ও নম্বর শুধু দায়িত্বপ্রাপ্ত কর্মকর্তা দেখতে পারবেন। প্রচারণা বা অন্য কোনো কাজে এগুলো ব্যবহার করা হবে না।</p>
            <div><button class="btn btn-brass" type="submit">অভিযোগ জমা দিন</button></div>
          </form>
          <div class="ticket" id="ticket" hidden>
            <p class="kicker">অভিযোগ জমা হয়েছে</p><p class="hint" style="margin-top:10px">আপনার ট্র্যাকিং আইডি</p>
            <p class="tid" id="tId"></p><p id="tMsg" style="margin:0"></p>
            <div class="acts"><button type="button" class="btn btn-line" id="tCopy">আইডি কপি করুন</button><button type="button" class="btn btn-brass" id="tTrack">অবস্থা দেখুন</button><button type="button" class="linkbtn" id="tNew">আরেকটি অভিযোগ করুন</button></div>
          </div>
        </div>
        <div id="pane-track" role="tabpanel" aria-labelledby="tab-track" hidden>
          <form class="track-form" id="trackForm" novalidate><label class="sr" for="trackId">ট্র্যাকিং আইডি</label><input type="text" id="trackId" value="${M.idPrefix}00873" autocomplete="off" spellcheck="false"><button class="btn btn-brass" type="submit">অবস্থা দেখুন</button></form>
          <p class="hint">উদাহরণ: ${Object.entries(S.complaintSamples).map(([id,t])=>`<button type="button" class="linkbtn" data-id="${id}">${id}</button> (${t.st==='done'?'সমাধান হয়েছে':'প্রক্রিয়াধীন'})`).join(' · ')}</p>
          <div id="trackOut" aria-live="polite"></div>
        </div>
      </div>
      <aside class="reveal" aria-label="অভিযোগের পরিসংখ্যান">
        <div class="side-box"><p class="kicker">${cs.period}</p>${big3()}<p class="hint" style="font-weight:600">বিষয় অনুযায়ী</p><div class="hbars" id="hbars"></div><p class="hint">শুধু সংখ্যা প্রকাশ করা হয়। কোনো অভিযোগকারীর নাম বা অভিযোগের বিবরণ প্রকাশ হয় না।</p></div>
        <div class="side-box"><p class="kicker">যেভাবে কাজ করে</p><ol class="how"><li><span>অভিযোগ জমা দিলে ট্র্যাকিং আইডি পাবেন</span></li><li><span>এলাকা অফিস ২৪ ঘণ্টার মধ্যে যাচাই করে</span></li><li><span>সংশ্লিষ্ট দপ্তরের কর্মকর্তাকে দায়িত্ব দেওয়া হয়</span></li><li><span>প্রতিটি ধাপে SMS পাবেন, সমাধানের পর মতামত দিতে পারবেন</span></li></ol>
          <p class="hint" style="margin-top:10px">সরকারি দপ্তরের সেবা নিয়ে অভিযোগ জাতীয় অভিযোগ প্রতিকার ব্যবস্থা (GRS) বা ৩৩৩ নম্বরেও করা যায়।</p></div>
      </aside>
    </div>
  </div></section>
  <section class="sec light"><div class="wrap two-col wide-l">
    <div class="reveal"><p class="kicker">প্রশ্ন ও উত্তর</p><h2 class="h3" style="margin:10px 0 24px">প্রায়ই জিজ্ঞাসিত প্রশ্ন</h2>
      <div class="faq">${S.complaintFaq.map((q,i)=>`<details${i===0?' open':''}><summary>${q[0]}</summary><p>${q[1]}</p></details>`).join('')}</div></div>
    <div class="reveal"><p class="kicker">অন্য উপায়ে জানান</p><h2 class="h3" style="margin:10px 0 24px">সরাসরি যোগাযোগ</h2>
      ${events(S.events.filter(e=>/গণশুনানি|সাক্ষাৎ/.test(e.title)))}
      <div class="office"><h3>${S.social[3][0]}</h3><dl><dt>নম্বর</dt><dd>${S.social[3][1]}</dd></dl></div></div>
  </div></section>`;
  complaintLogic();
},

contact(){
  main.innerHTML=phero({k:'parliament',kicker:'যোগাযোগ',title:'দেখা করুন, কথা বলুন',lead:'এলাকা অফিস, সাব-অফিস আর ঢাকা অফিসের ঠিকানা ও সময়, সঙ্গে আসন্ন সব কর্মসূচি।',crumbs:[['যোগাযোগ']]})+`
  <section class="sec light"><div class="wrap">
    <div class="meet-grid">
      <div class="reveal"><p class="kicker">আসন্ন কর্মসূচি</p><h2 class="h3" style="margin:10px 0 24px">অক্টোবর ২০২৬</h2>${events(S.events)}</div>
      <div class="reveal"><p class="kicker">অফিস</p><h2 class="h3" style="margin:10px 0 24px">ঠিকানা ও সময়</h2>${offices()}</div>
    </div>
  </div></section>
  <section class="sec dark"><div class="wrap two-col">
    <div class="reveal"><p class="kicker">অনলাইনে</p><h2 class="h2">সামাজিক মাধ্যম ও হটলাইন</h2>
      <ul class="social">${S.social.map(s=>`<li><b>${s[0]}</b><span>${s[1]}</span></li>`).join('')}</ul></div>
    <div class="reveal"><p class="kicker">অভিযোগ বা পরামর্শ</p><h2 class="h2">লিখিতভাবে জানাতে চান?</h2>
      <p class="lead">অভিযোগ বক্সে জমা দিলে ট্র্যাকিং আইডি পাবেন, আর প্রতিটি ধাপ অনলাইনে দেখতে পারবেন। এটাই সবচেয়ে দ্রুত পথ।</p>
      <p style="margin-top:28px"><a class="btn btn-brass" href="complaint.html">অভিযোগ বক্সে যান</a></p>
      <p class="hint" style="margin-top:18px">সরকারি দপ্তরের সেবা নিয়ে অভিযোগ জাতীয় অভিযোগ প্রতিকার ব্যবস্থা (GRS) বা ৩৩৩ নম্বরেও করা যায়।</p></div>
  </div></section>`;
}
};

/* ---------- complaint form + tracking (demo: tickets live only in this browser) ---------- */
function complaintLogic(){
  const fCat=$('#fCat'), fUpz=$('#fUpz'), fUnion=$('#fUnion'), fText=$('#fText'), fFiles=$('#fFiles'), fAnon=$('#fAnon'), fPhone=$('#fPhone');
  fCat.innerHTML='<option value="">বেছে নিন</option>'+S.complaintCats.map(c=>`<option>${c}</option>`).join('');
  fUpz.innerHTML='<option value="">বেছে নিন</option>'+Object.entries(U).map(([k,a])=>`<option value="${k}">${a.short}</option>`).join('');
  const resetUnion=()=>{fUnion.disabled=true;fUnion.innerHTML='<option value="">আগে উপজেলা বেছে নিন</option>'};
  fUpz.addEventListener('change',()=>{const a=U[fUpz.value];if(!a)return resetUnion();fUnion.disabled=false;fUnion.innerHTML='<option value="">বেছে নিন</option>'+a.unions.map(u=>`<option>${u}</option>`).join('')});
  const setErr=(id,msg,field)=>{const e=$('#'+id);e.textContent=msg;e.hidden=!msg;if(field)field.setAttribute('aria-invalid',msg?'true':'false')};
  fText.addEventListener('input',()=>{$('#cnt').textContent=bn(fText.value.length)+'/১০০০'});
  fFiles.addEventListener('change',()=>{
    const n=fFiles.files.length;
    setErr('eFiles',n>3?'সর্বোচ্চ ৩টি ছবি দেওয়া যাবে। কিছু ছবি বাদ দিয়ে আবার বেছে নিন।':'',fFiles);
    $('#fileHint').textContent=n?bn(n)+'টি ছবি যুক্ত হয়েছে':'ছবি থাকলে সমস্যা দ্রুত যাচাই করা যায়।';
  });
  fAnon.addEventListener('change',()=>{$('#identity').hidden=fAnon.checked;if(fAnon.checked)setErr('ePhone','',fPhone)});
  const normPhone=v=>toEn(v).replace(/[\s-]/g,'').replace(/^\+?88/,'');
  const KEY='jonoshetu-demo-tickets';
  let store={};
  try{store=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){store={}}
  const saveStore=()=>{try{localStorage.setItem(KEY,JSON.stringify(store))}catch(e){}};
  $('#cmpForm').addEventListener('submit',e=>{
    e.preventDefault();
    let ok=true, first=null;
    const need=(cond,id,msg,field)=>{setErr(id,cond?'':msg,field);if(!cond){ok=false;first=first||field}};
    need(!!fCat.value,'eCat','বিষয় বেছে নিন।',fCat);
    need(!!fUpz.value,'eUpz','উপজেলা বেছে নিন।',fUpz);
    need(!!fUnion.value,'eUnion','ইউনিয়ন বা পৌরসভা বেছে নিন।',fUnion);
    need(fText.value.trim().length>=20,'eText','সমস্যাটা অন্তত ২০ অক্ষরে লিখুন, যাতে কর্মকর্তা বুঝতে পারেন কী করতে হবে।',fText);
    need(fFiles.files.length<=3,'eFiles','সর্বোচ্চ ৩টি ছবি দেওয়া যাবে।',fFiles);
    const phone=normPhone(fPhone.value);
    if(!fAnon.checked)need(/^01[3-9]\d{8}$/.test(phone),'ePhone','সঠিক মোবাইল নম্বর দিন, ১১ সংখ্যার, ০১ দিয়ে শুরু।',fPhone);
    if(!ok){(first.disabled?fUpz:first).focus();return}
    const id=M.idPrefix+String(1241+Object.keys(store).length).padStart(5,'0');
    const txt=fText.value.trim();
    store[id]={cat:fCat.value,where:fUnion.value+', '+U[fUpz.value].short,title:txt.length>70?txt.slice(0,70)+'…':txt,st:'new',done:1,steps:[['অভিযোগ গৃহীত',bnDate(new Date())+' · অনলাইন'],['যাচাই','অপেক্ষমাণ · সাধারণত ২৪ ঘণ্টার মধ্যে'],['দায়িত্ব দেওয়া','অপেক্ষমাণ'],['সমাধান','অপেক্ষমাণ']]};
    saveStore();
    $('#tId').textContent=id;
    $('#tMsg').textContent=fAnon.checked
      ?'বেনামী অভিযোগে SMS যায় না। আইডিটি লিখে রাখুন, এটা দিয়েই অবস্থা দেখতে পারবেন।'
      :'আইডিসহ একটি SMS যাবে '+bn(phone.slice(0,3))+'•••••'+bn(phone.slice(-3))+' নম্বরে। (ডেমোতে SMS যায় না।)';
    $('#cmpForm').hidden=true;$('#ticket').hidden=false;$('#tCopy').textContent='আইডি কপি করুন';
    $('#ticket').scrollIntoView({block:'center',behavior:reduce?'auto':'smooth'});
  });
  $('#tCopy').addEventListener('click',()=>{
    const id=$('#tId').textContent, btn=$('#tCopy');
    const fallback=()=>{const r=document.createRange();r.selectNodeContents($('#tId'));const s=getSelection();s.removeAllRanges();s.addRange(r);btn.textContent='আইডি সিলেক্ট করা হয়েছে'};
    try{navigator.clipboard.writeText(id).then(()=>{btn.textContent='কপি হয়েছে'},fallback)}catch(e){fallback()}
  });
  $('#tTrack').addEventListener('click',()=>{$('#trackId').value=$('#tId').textContent;showTab('track');track($('#trackId').value)});
  $('#tNew').addEventListener('click',()=>{
    const f=$('#cmpForm');f.reset();resetUnion();$('#identity').hidden=false;$('#cnt').textContent='০/১০০০';
    $('#fileHint').textContent='ছবি থাকলে সমস্যা দ্রুত যাচাই করা যায়।';f.hidden=false;$('#ticket').hidden=true;fCat.focus();
  });
  function showTab(w){
    $$('.tab').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.tab===w)));
    $('#pane-new').hidden=w!=='new';$('#pane-track').hidden=w!=='track';
  }
  $$('.tab').forEach(t=>t.addEventListener('click',()=>showTab(t.dataset.tab)));
  const STT={done:['সমাধান হয়েছে','var(--ok)'],ongoing:['প্রক্রিয়াধীন','var(--warn)'],new:['নতুন','var(--brass-2)']};
  function track(raw){
    const id=toEn(raw).trim().toUpperCase().replace(/\s+/g,''), out=$('#trackOut');
    if(!id){out.innerHTML='<p class="err" style="margin-top:14px">ট্র্যাকিং আইডি লিখুন।</p>';return}
    const t=S.complaintSamples[id]||(Object.prototype.hasOwnProperty.call(store,id)?store[id]:null);
    if(!t){out.innerHTML=`<p class="err" style="margin-top:14px">${esc(id.slice(0,40))} আইডিতে কোনো অভিযোগ পাওয়া যায়নি। আইডিটি আবার দেখে লিখুন, যেমন ${M.idPrefix}00873।</p>`;return}
    const s=STT[t.st]||STT.new;
    out.innerHTML=`<div class="track-card"><div class="tc-head"><div><p class="tc-id">${esc(id)}</p><b>${esc(t.title)}</b><p class="tc-meta">${esc(t.cat)} · ${esc(t.where)}</p></div><span class="tpill" style="--c:${s[1]}">${s[0]}</span></div><ol class="steps">${t.steps.map((st,i)=>`<li class="${i<t.done?'done':(i===t.done?'now':'')}"><span class="dotc">${i<t.done?IC.check:''}</span><div><b>${esc(st[0])}</b><small>${esc(st[1])}</small></div></li>`).join('')}</ol></div>`;
  }
  $('#trackForm').addEventListener('submit',e=>{e.preventDefault();track($('#trackId').value)});
  $$('[data-id]').forEach(b=>b.addEventListener('click',()=>{$('#trackId').value=b.dataset.id;track(b.dataset.id)}));
  track(M.idPrefix+'00873');
  const bc=cs.byCat, maxC=Math.max(...bc.map(c=>c[1]));
  $('#hbars').innerHTML=bc.map(([t,n])=>`<div class="hbar"><span>${t}</span><span class="t"><i style="width:${(n/maxC*100).toFixed(1)}%"></i></span><span class="n">${bn(n)}</span></div>`).join('');
  if(location.hash==='#track')showTab('track');
}

(PAGES[page]||PAGES.home)();

/* ---------- scroll: sticky header + parallax ---------- */
const pxEls=$$('[data-px]');
let ticking=false;
function onScroll(){
  head.classList.toggle('solid',scrollY>40||nav.classList.contains('open'));
  if(reduce||ticking)return;
  ticking=true;
  requestAnimationFrame(()=>{
    pxEls.forEach(el=>{
      const r=el.parentElement.getBoundingClientRect();
      if(r.bottom<0||r.top>innerHeight)return;
      el.style.transform=`translate3d(0,${((r.top+r.height/2-innerHeight/2)*-(+el.dataset.px)).toFixed(1)}px,0)`;
    });
    ticking=false;
  });
}
addEventListener('scroll',onScroll,{passive:true});onScroll();
watch();
})();
