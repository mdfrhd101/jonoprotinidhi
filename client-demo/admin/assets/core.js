/* Jonoprotinidhi admin — shared core: helpers, icons, demo store, shell, hash router, dialog, toast, audit, charts.
   Demo only: everything persists in this browser's localStorage. In the real product each of these calls
   is an authenticated API request scoped to one tenant. */
(function(){
'use strict';
const BN='০১২৩৪৫৬৭৮৯';
const bn=s=>String(s).replace(/\d/g,d=>BN[d]);
const toEn=s=>String(s).replace(/[০-৯]/g,c=>BN.indexOf(c));
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MONTHS=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
const bnDate=d=>bn(d.getDate())+' '+MONTHS[d.getMonth()]+' '+bn(d.getFullYear());
const bnTime=d=>bn(String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'));
const groupBD=n=>{const s=String(Math.round(n));if(s.length<=3)return s;return s.slice(0,-3).replace(/\B(?=(\d{2})+(?!\d))/g,',')+','+s.slice(-3)};
const fmt=n=>bn(groupBD(n));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);

/* ---------- icons (thin line, 20x20) ---------- */
const P={
  home:'M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z',
  users:'M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5 8c0-2.8 2.2-5 5-5s5 2.2 5 5M14 4.2a3 3 0 0 1 0 5.6M18 17c0-2.2-1.3-4-3.2-4.7',
  plus:'M10 4v12M4 10h12',
  globe:'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM3 10h14M10 3c2 2 3 4.3 3 7s-1 5-3 7c-2-2-3-4.3-3-7s1-5 3-7z',
  log:'M5 3h8l3 3v11H5zM8 8h6M8 11h6M8 14h4',
  shield:'M10 3l6 2.5V10c0 3.5-2.6 6-6 7-3.4-1-6-3.5-6-7V5.5z M7.5 10l2 2 3.5-3.5',
  doc:'M5 3h7l3 3v11H5zM12 3v3h3',
  check:'M4 10.5l4 4 8-9',
  flag:'M5 17V3m0 1h9l-2 3 2 3H5',
  inbox:'M3 11l2-7h10l2 7v5H3zM3 11h4l1 2h4l1-2h4',
  image:'M3 4h14v12H3zM3 13l4-4 3 3 2-2 5 5M13 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  gear:'M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18M4.3 4.3l1.8 1.8M13.9 13.9l1.8 1.8M4.3 15.7l1.8-1.8M13.9 6.1l1.8-1.8',
  chart:'M3 17h14M5 14V9M9 14V5M13 14v-7M17 14v-3',
  cal:'M3 5h14v12H3zM3 8h14M7 3v4M13 3v4',
  out:'M8 4H4v12h4M12 6l4 4-4 4M16 10H8',
  up:'M5 12l5-5 5 5',
  down:'M5 8l5 5 5-5',
  x:'M5 5l10 10M15 5L5 15',
  menu:'M3 6h14M3 10h14M3 14h14',
  eye:'M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5zM10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  lock:'M5 9h10v8H5zM7 9V6a3 3 0 0 1 6 0v3',
  ext:'M11 4h5v5M16 4l-7 7M14 12v4H4V6h4',
  db:'M10 7c3.9 0 7-1.1 7-2.5S13.9 2 10 2 3 3.1 3 4.5 6.1 7 10 7zM3 4.5v11C3 16.9 6.1 18 10 18s7-1.1 7-2.5v-11M3 10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5',
  target:'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  send:'M3 10l14-6-6 14-2-6z'
};
const ic=(k,sz)=>`<svg viewBox="0 0 20 20" width="${sz||18}" height="${sz||18}" aria-hidden="true"><path d="${P[k]||''}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ---------- demo store (localStorage, fail-safe) ---------- */
const store={
  get(k,def){try{const v=localStorage.getItem(k);return v==null?def:JSON.parse(v)}catch(e){return def}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},
  update(k,def,fn){const v=store.get(k,def);const r=fn(v);store.set(k,r===undefined?v:r);return r===undefined?v:r}
};
const KEYS={audit:'jonoprotinidhi-demo-audit',platform:'jonoprotinidhi-demo-platform',cms:'jonoprotinidhi-demo-cms',tickets:'jonoprotinidhi-demo-tickets',cmp:'jonoprotinidhi-demo-cmp-admin',role:'jonoprotinidhi-demo-role'};

/* ---------- audit log (shared across panels; each entry carries its tenant) ---------- */
function audit(entry){
  const d=new Date();
  store.update(KEYS.audit,[],l=>{l.unshift({id:uid(),at:d.toISOString(),when:bnDate(d)+', '+bnTime(d),...entry});return l.slice(0,300)});
}

/* ---------- toast ---------- */
function toast(msg){
  let box=$('.toasts');if(!box){box=document.createElement('div');box.className='toasts';box.setAttribute('role','status');box.setAttribute('aria-live','polite');document.body.appendChild(box)}
  const t=document.createElement('div');t.className='toast';t.textContent=msg;box.appendChild(t);
  setTimeout(()=>t.remove(),3800);
}

/* ---------- dialog ---------- */
function dialog({title,body,ok='ঠিক আছে',cancel='বাতিল',danger=false,onOk}){
  const d=document.createElement('dialog');
  d.innerHTML=`<form method="dialog"><div class="dlg-h"><h2>${title}</h2><button class="x" value="cancel" aria-label="বন্ধ করুন">${ic('x')}</button></div><div class="dlg-b">${body}</div><div class="dlg-f">${cancel?`<button class="btn btn-g" value="cancel">${cancel}</button>`:''}<button class="btn ${danger?'btn-d':'btn-p'}" value="ok" data-ok>${ok}</button></div></form>`;
  document.body.appendChild(d);
  d.querySelector('[data-ok]').addEventListener('click',e=>{if(onOk&&onOk(d)===false)e.preventDefault()});
  d.addEventListener('close',()=>d.remove());
  d.showModal();
  const f=d.querySelector('.dlg-b input,.dlg-b select,.dlg-b textarea');if(f)f.focus();
  return d;
}

/* ---------- shell ---------- */
function shell({brand,nav,who,crumbRoot,impersonating}){
  document.body.innerHTML=`<div class="shell">
  <aside class="side" id="side" aria-label="প্যানেলের মেনু">
    <div class="side-brand">${brand}</div>
    <nav id="sideNav"></nav>
    <div class="side-foot">জনপ্রতিনিধি প্ল্যাটফর্ম · ডেমো<br><a href="index.html">প্যানেল বদলান</a> · <a href="../demo-mp/index.html" target="_blank" rel="noopener">পাবলিক সাইট</a></div>
  </aside>
  <div class="scrim" id="scrim"></div>
  <div class="main">
    ${impersonating||''}
    <header class="top"><button id="menuBtn" type="button" aria-label="মেনু" aria-controls="side" aria-expanded="false">${ic('menu')}</button><p class="crumb" id="crumb">${crumbRoot}</p><span class="sp"></span><div id="topExtra"></div><div class="who">${who}</div></header>
    <main class="content" id="view" tabindex="-1"></main>
  </div></div><div class="demo-pill">ডেমো · সব নাম ও তথ্য কাল্পনিক</div>`;
  const side=$('#side'),scrim=$('#scrim'),mb=$('#menuBtn');
  const close=()=>{side.classList.remove('open');scrim.classList.remove('open');mb.setAttribute('aria-expanded','false')};
  mb.addEventListener('click',()=>{const o=side.classList.toggle('open');scrim.classList.toggle('open',o);mb.setAttribute('aria-expanded',String(o))});
  scrim.addEventListener('click',close);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  const renderNav=()=>{
    const items=typeof nav==='function'?nav():nav;
    $('#sideNav').innerHTML=items.map(it=>it.grp?`<div class="grp">${it.grp}</div>`:`<a href="#${it.path}" data-path="${it.path}">${ic(it.icon)}<span>${it.label}</span>${it.count?`<span class="cnt">${bn(it.count)}</span>`:''}</a>`).join('');
    $$('#sideNav a').forEach(a=>a.addEventListener('click',close));
  };
  renderNav();
  return {renderNav,close};
}

/* ---------- router ---------- */
function router(routes,{crumbRoot,notFound,onRoute}){
  const view=$('#view');
  function run(){
    const path=(location.hash.slice(1)||'/').split('?')[0];
    let hit=null,params=null;
    for(const r of routes){const m=path.match(r.re);if(m){hit=r;params=m.slice(1).map(decodeURIComponent);break}}
    $$('#sideNav a').forEach(a=>{const p=a.dataset.path;const on=p==='/'?path==='/':path===p||path.startsWith(p+'/');a.toggleAttribute('aria-current',on);if(on)a.setAttribute('aria-current','page')});
    if(!hit){view.innerHTML=notFound();return}
    const out=hit.render(...params);
    $('#crumb').innerHTML=crumbRoot+(out&&out.crumb?` / <b>${out.crumb}</b>`:'');
    if(onRoute)onRoute(path);
    view.focus({preventScroll:true});window.scrollTo(0,0);
  }
  addEventListener('hashchange',run);
  run();
  return {run};
}
const go=path=>{if(location.hash==='#'+path)dispatchEvent(new HashChangeEvent('hashchange'));else location.hash=path};

/* ---------- charts ---------- */
/* Single-series column chart (one hue — the title names the series, so no legend). Hover shows a tooltip. */
function columns(el,data,{h=160,label=v=>fmt(v),xEvery=5,unit=''}={}){
  const W=640,H=h,pad={l:34,r:6,t:10,b:22},max=Math.max(...data.map(d=>d.v))*1.1||1;
  const bw=(W-pad.l-pad.r)/data.length, y=v=>pad.t+(H-pad.t-pad.b)*(1-v/max);
  const ticks=[0,.5,1].map(f=>Math.round(max*f/100)*100);
  el.innerHTML=`<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(el.dataset.label||'')}">
    ${ticks.map(t=>`<line class="gl" x1="${pad.l}" x2="${W-pad.r}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${pad.l-6}" y="${y(t)+4}" text-anchor="end">${fmt(t)}</text>`).join('')}
    ${data.map((d,i)=>{const x=pad.l+i*bw+bw*.18,w=bw*.64,top=y(d.v),hh=H-pad.b-top;return `<g data-i="${i}"><rect class="bar-r${d.wk?' wk':''}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(hh,1).toFixed(1)}" rx="2"/><rect class="hit" x="${(pad.l+i*bw).toFixed(1)}" y="${pad.t}" width="${bw.toFixed(1)}" height="${H-pad.t-pad.b}"/>${i%xEvery===0?`<text class="ax" x="${(x+w/2).toFixed(1)}" y="${H-6}" text-anchor="middle">${d.x}</text>`:''}</g>`}).join('')}
  </svg><div class="tip" hidden></div></div>`;
  const tip=$('.tip',el),svg=$('svg',el);
  $$('g[data-i]',el).forEach(g=>{
    g.addEventListener('mouseenter',()=>{const d=data[+g.dataset.i],r=$('.bar-r',g).getBoundingClientRect(),c=el.getBoundingClientRect();tip.innerHTML=`${d.full||d.x}: <b>${label(d.v)}</b>${unit}`;tip.style.left=(r.left-c.left+r.width/2)+'px';tip.style.top=(r.top-c.top)+'px';tip.hidden=false});
    g.addEventListener('mouseleave',()=>{tip.hidden=true});
  });
  svg.addEventListener('mouseleave',()=>{tip.hidden=true});
}
/* Sequential single-hue ramp (brass, light→dark) for heat cells. */
const RAMP=['#F6EEDC','#EEDDB5','#E2C88E','#C7A35A','#A5823C','#8A6A28'];
function heatColor(v,max){const i=Math.min(RAMP.length-1,Math.floor(v/max*(RAMP.length-1)+.0001));return {bg:RAMP[i],fg:i>=3?'#fff':'#171C22'}}

window.JA={bn,toEn,$,$$,esc,bnDate,bnTime,fmt,groupBD,uid,ic,store,KEYS,audit,toast,dialog,shell,router,go,columns,heatColor,MONTHS};
})();
