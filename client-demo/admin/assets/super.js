/* Super Admin panel (platform owner). Sees every tenant's site, domains, backups and audit log —
   but never a citizen's name or phone number (that stays with the assigned complaint officer). */
(function(){
'use strict';
const {bn,$,$$,esc,fmt,ic,store,KEYS,audit,toast,dialog,shell,router,go,bnDate}=window.JA;
const PL=window.PLATFORM;
const ME={name:'নাফিসা রহমান',role:'Super Admin'};

/* ---------- state (seed + demo changes) ---------- */
const pstate=()=>store.get(KEYS.platform,{tenants:[],status:{},domains:[],dom:{}});
const savePS=fn=>store.update(KEYS.platform,{tenants:[],status:{},domains:[],dom:{}},fn);
const tenants=()=>{const s=pstate();return [...PL.tenants,...s.tenants].map(t=>({...t,status:s.status[t.id]||t.status}))};
const tenant=id=>tenants().find(t=>t.id===id);
const domains=()=>{const s=pstate();return [...PL.domains,...s.domains].map(d=>({...d,...(s.dom[d.host]||{})}))};
const auditAll=()=>[...store.get(KEYS.audit,[]),...PL.seedAudit];
const saLog=(tenantId,action,target)=>audit({tenant:tenantId,actor:ME.name,actorRole:'Super Admin',sa:true,action,target});

const ST={live:['লাইভ','ok'],setup:['সেটআপ চলছে','info'],suspended:['স্থগিত','bad']};
const pill=(t,c)=>`<span class="pill ${c}">${t}</span>`;
const stPill=s=>pill(...ST[s]);
const staleness=t=>t.lastPost==null?pill('এখনো পোস্ট নেই','plain'):t.lastPost>14?pill(bn(t.lastPost)+' দিন আগে','bad'):t.lastPost>7?pill(bn(t.lastPost)+' দিন আগে','warn'):`<span class="muted">${bn(t.lastPost)} দিন আগে</span>`;
const tname=id=>{if(id==='all')return 'পুরো প্ল্যাটফর্ম';const t=tenant(id);return t?t.seat:id};

/* ---------- shell ---------- */
const NAV=()=>[
  {grp:'প্ল্যাটফর্ম'},
  {path:'/',label:'ড্যাশবোর্ড',icon:'home'},
  {path:'/tenants',label:'MP ও সাইট',icon:'users',count:tenants().filter(t=>t.status==='setup').length},
  {path:'/tenants/new',label:'নতুন MP যোগ করুন',icon:'plus'},
  {path:'/domains',label:'ডোমেইন',icon:'globe',count:domains().filter(d=>d.dns==='pending').length},
  {grp:'নিরাপত্তা'},
  {path:'/audit',label:'অডিট লগ',icon:'log'},
  {path:'/security',label:'ব্যাকআপ ও নিরাপত্তা',icon:'shield'},
  {path:'/staff',label:'প্ল্যাটফর্ম টিম',icon:'gear'}
];
const sh=shell({
  brand:`<small>জনপ্রতিনিধি · SUPER ADMIN</small><b>প্ল্যাটফর্ম নিয়ন্ত্রণ</b><span>সব MP-র সাইট এক জায়গা থেকে</span>`,
  nav:NAV,crumbRoot:'Super Admin',
  who:`<span class="av">নার</span><div><b>${ME.name}</b><small>Super Admin · 2FA চালু</small></div>`
});

/* ---------- views ---------- */
function dashboard(){
  const T=tenants(),live=T.filter(t=>t.status==='live');
  const cmp=T.reduce((s,t)=>s+t.cmpMonth,0),vis=T.reduce((s,t)=>s+t.visitors,0);
  const warnDom=domains().filter(d=>d.ssl==='warn'||d.dns==='pending');
  const stale=live.filter(t=>t.lastPost!=null&&t.lastPost>14);
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">SUPER ADMIN</p><h1>প্ল্যাটফর্মের অবস্থা</h1><p class="sub">সেপ্টেম্বর ২০২৬ · সব MP-র সাইট, ডোমেইন আর ব্যাকআপ এক নজরে।</p></div>
    <div class="acts"><a class="btn btn-b" href="#/tenants/new">${ic('plus')}নতুন MP যোগ করুন</a></div></div>
  <div class="kpis">
    <div class="kpi dark"><small>মোট MP / মন্ত্রী</small><b>${bn(T.length)}</b><span>লাইভ ${bn(live.length)} · সেটআপ ${bn(T.filter(t=>t.status==='setup').length)} · স্থগিত ${bn(T.filter(t=>t.status==='suspended').length)}</span></div>
    <div class="kpi"><small>এ মাসে ভিজিটর (সব সাইট)</small><b>${fmt(vis)}</b><span><span class="up">+১৮%</span> আগের মাসের চেয়ে</span></div>
    <div class="kpi"><small>এ মাসে অভিযোগ (সব সাইট)</small><b>${fmt(cmp)}</b><span>শুধু সংখ্যা · পরিচয় দেখা যায় না</span></div>
    <div class="kpi"><small>আপটাইম (৩০ দিন)</small><b>৯৯.৯৮%</b><span>শেষ ব্যাকআপ: আজ রাত ২:০০</span></div>
  </div>
  <div class="grid g21">
    <div class="card"><div class="sec-t"><h2 class="h2">সাইটগুলোর অবস্থা</h2><a href="#/tenants">সব দেখুন →</a></div>
      <div class="tbl-wrap" style="border:0"><table class="tbl"><thead><tr><th>MP · আসন</th><th>অবস্থা</th><th>শেষ পোস্ট</th><th class="n">ভিজিটর</th><th></th></tr></thead><tbody>
      ${T.map(t=>`<tr class="row-link" data-go="/tenants/${t.id}"><td><b>${t.name}</b><small>${t.seat} · ${t.role}</small></td><td>${stPill(t.status)}</td><td>${staleness(t)}</td><td class="n">${fmt(t.visitors)}</td><td class="n">${ic('ext',14)}</td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="stack">
      <div class="card"><h2 class="h2" style="margin-bottom:10px">নজর দেওয়া দরকার</h2><ul class="list">
        ${stale.map(t=>`<li><span class="dot sa"></span><div><b>${t.seat}: ${bn(t.lastPost)} দিন কোনো পোস্ট নেই</b><small>নিয়মিত হালনাগাদ না থাকলে সাইট উল্টো ভাবমূর্তির ক্ষতি করে। PR টিমকে জানান।</small></div></li>`).join('')}
        ${warnDom.map(d=>`<li><span class="dot"></span><div><b>${esc(d.host)}</b><small>${d.dns==='pending'?'DNS যাচাই বাকি':'SSL সার্টিফিকেট শেষ হবে '+d.sslExp}</small></div></li>`).join('')}
        ${T.filter(t=>t.status==='setup').map(t=>`<li><span class="dot"></span><div><b>${t.seat}: সেটআপ চলছে</b><small>কনটেন্ট ও ছবি অফিস থেকে আসার অপেক্ষায়</small></div></li>`).join('')}
      </ul></div>
      <div class="card"><div class="sec-t"><h2 class="h2">সাম্প্রতিক কাজ</h2><a href="#/audit">অডিট লগ →</a></div><ul class="list">
        ${auditAll().slice(0,5).map(a=>`<li><span class="dot${a.sa?' sa':''}"></span><div><b>${esc(a.actor)}</b> ${esc(a.action)}<small>${esc(tname(a.tenant))} · ${esc(a.when)}</small></div></li>`).join('')}
      </ul></div>
    </div>
  </div>`;
  $$('[data-go]').forEach(r=>r.addEventListener('click',()=>go(r.dataset.go)));
}

function tenantsView(){
  let f='all',q='';
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">MP ও সাইট</p><h1>সব MP-র সাইট</h1><p class="sub">প্রতিটি MP একটি আলাদা tenant। এক MP-র ডেটা আরেকজনের প্যানেলে কখনো দেখা যায় না, প্রতিদ্বন্দ্বী দলের MP হলেও না।</p></div>
    <div class="acts"><a class="btn btn-b" href="#/tenants/new">${ic('plus')}নতুন MP</a></div></div>
  <div class="bar"><input type="search" class="grow" id="q" placeholder="নাম বা আসন দিয়ে খুঁজুন" aria-label="খুঁজুন">
    <div class="chips" id="fch">${[['all','সব'],['live','লাইভ'],['setup','সেটআপ'],['suspended','স্থগিত']].map(([k,t],i)=>`<button class="chip" data-k="${k}" aria-pressed="${!i}">${t}</button>`).join('')}</div></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>MP · আসন</th><th>ঠিকানা</th><th>অবস্থা</th><th>প্যাকেজ</th><th>শেষ পোস্ট</th><th class="n">এ মাসে অভিযোগ</th><th class="n">অ্যাডমিন</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>`;
  const render=()=>{
    const L=tenants().filter(t=>(f==='all'||t.status===f)&&(!q||(t.name+t.seat).includes(q)));
    $('#tb').innerHTML=L.map(t=>`<tr><td><b>${esc(t.name)}</b><small>${esc(t.seat)} · ${esc(t.role)}</small></td><td><small style="color:var(--text)">${esc(t.custom||t.sub+'.'+PL.root)}</small>${t.custom?`<small>${t.sub}.${PL.root}</small>`:''}</td><td>${stPill(t.status)}</td><td>${t.plan}</td><td>${staleness(t)}</td><td class="n">${fmt(t.cmpMonth)}</td><td class="n">${bn(t.admins)}</td>
      <td><div class="acts"><a class="btn btn-g btn-s" href="#/tenants/${t.id}">বিস্তারিত</a>${t.demo?`<a class="btn btn-p btn-s" href="mp.html?as=super">সাইটে ঢুকুন</a>`:''}</div></td></tr>`).join('')||`<tr><td colspan="8" class="empty">কিছু পাওয়া যায়নি</td></tr>`;
  };
  $('#q').addEventListener('input',e=>{q=e.target.value.trim();render()});
  $('#fch').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;f=b.dataset.k;$$('#fch .chip').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));render()});
  render();
  return {crumb:'MP ও সাইট'};
}

function tenantDetail(id){
  const t=tenant(id);
  if(!t){$('#view').innerHTML=`<div class="card empty">এই MP পাওয়া যায়নি। <a href="#/tenants">তালিকায় ফিরুন</a></div>`;return {crumb:'পাওয়া যায়নি'}}
  const D=domains().filter(d=>d.tenant===id);
  const A=auditAll().filter(a=>a.tenant===id).slice(0,8);
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">${esc(t.seat)} · ${esc(t.role)}</p><h1>${esc(t.name)}</h1><p class="sub">${stPill(t.status)} &nbsp; ${t.since} থেকে প্ল্যাটফর্মে · প্যাকেজ: ${t.plan}</p></div>
    <div class="acts">${t.demo?`<a class="btn btn-p" href="mp.html?as=super">${ic('eye')}সাইটের অ্যাডমিনে ঢুকুন</a><a class="btn btn-g" href="../demo-mp/index.html" target="_blank" rel="noopener">${ic('ext')}পাবলিক সাইট</a>`:`<span class="note" style="font-size:13.5px">ডেমোতে শুধু নদীপুর-৩-এর পূর্ণ সাইট আছে</span>`}</div></div>
  ${t.note?`<p class="note bad" style="margin:0 0 16px">${esc(t.note)}</p>`:''}
  <div class="kpis"><div class="kpi"><small>প্রকাশিত পোস্ট</small><b>${bn(t.posts)}</b><span>শেষ পোস্ট: ${t.lastPost==null?'—':bn(t.lastPost)+' দিন আগে'}</span></div><div class="kpi"><small>এ মাসে ভিজিটর</small><b>${fmt(t.visitors)}</b></div><div class="kpi"><small>এ মাসে অভিযোগ</small><b>${fmt(t.cmpMonth)}</b><span>বিবরণ শুধু MP অফিস দেখে</span></div><div class="kpi"><small>অ্যাডমিন অ্যাকাউন্ট</small><b>${bn(t.admins)}</b><span>সবার 2FA বাধ্যতামূলক</span></div></div>
  <div class="grid g2">
    <div class="card"><div class="sec-t"><h2 class="h2">ডোমেইন</h2><a href="#/domains">ডোমেইন পরিচালনা →</a></div>
      <ul class="list">${D.map(d=>`<li><div><b>${esc(d.host)}</b> ${d.primary?pill('প্রধান','brass plain'):''}<small>${d.type==='custom'?'কাস্টম ডোমেইন':'প্ল্যাটফর্ম সাবডোমেইন'} · SSL: ${d.ssl==='ok'?'সক্রিয়, মেয়াদ '+d.sslExp:d.ssl==='warn'?'শিগগির শেষ ('+d.sslExp+')':'এখনো নেই'}</small></div>${d.dns==='pending'?pill('DNS বাকি','warn'):pill('সক্রিয়','ok')}</li>`).join('')}</ul></div>
    <div class="card"><div class="sec-t"><h2 class="h2">এই সাইটের অডিট লগ</h2><a href="#/audit">সব →</a></div>
      <ul class="list">${A.map(a=>`<li><span class="dot${a.sa?' sa':''}"></span><div><b>${esc(a.actor)}</b> <span class="tag">${esc(a.actorRole)}</span> ${esc(a.action)}<small>${esc(a.target||'')} · ${esc(a.when)}</small></div></li>`).join('')||'<li class="muted">এখনো কিছু নেই</li>'}</ul></div>
  </div>
  <div class="card" style="margin-top:16px"><h2 class="h2">সাইটের অবস্থা বদলান</h2><p class="muted" style="margin:6px 0 14px">স্থগিত করলে পাবলিক সাইটে "সাময়িকভাবে বন্ধ" পেজ দেখাবে। কোনো ডেটা মুছবে না, আবার চালু করলে আগের মতো ফিরে আসবে।</p>
    <div class="acts">${t.status!=='live'?`<button class="btn btn-p" data-st="live">${ic('check')}লাইভ করুন</button>`:''}${t.status!=='suspended'?`<button class="btn btn-d" data-st="suspended">সাইট স্থগিত করুন</button>`:''}</div></div>`;
  $$('[data-st]').forEach(b=>b.addEventListener('click',()=>{
    const to=b.dataset.st;
    dialog({title:to==='live'?'সাইট লাইভ করবেন?':'সাইট স্থগিত করবেন?',danger:to!=='live',ok:to==='live'?'লাইভ করুন':'স্থগিত করুন',
      body:`<p style="margin:0 0 12px"><b>${esc(t.seat)}</b> · ${esc(t.name)}</p><div class="field"><label for="why">কারণ (অডিট লগে যাবে) <span class="req">*</span></label><input type="text" id="why" maxlength="160"></div>${to==='live'?'<label class="check" style="margin-top:12px"><input type="checkbox" id="cons"><span>MP অফিসের লিখিত সম্মতি ও কনটেন্ট যাচাই করা হয়েছে</span></label>':''}<p class="err" id="werr" hidden></p>`,
      onOk:d=>{const why=$('#why',d).value.trim(),c=$('#cons',d);if(!why||(c&&!c.checked)){const e=$('#werr',d);e.textContent=!why?'কারণ লিখুন।':'সম্মতি নিশ্চিত না করে লাইভ করা যাবে না।';e.hidden=false;return false}
        savePS(s=>{s.status[t.id]=to});saLog(t.id,to==='live'?'সাইট লাইভ করেছেন':'সাইট স্থগিত করেছেন',why);toast(to==='live'?'সাইট লাইভ হয়েছে':'সাইট স্থগিত হয়েছে');sh.renderNav();tenantDetail(id)}});
  }));
  return {crumb:t.seat};
}

function newTenant(){
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">নতুন MP</p><h1>নতুন MP / মন্ত্রী যোগ করুন</h1><p class="sub">তৈরি হলে MP-র জন্য নিজে থেকেই একটা অ্যাডমিন প্যানেল আর সাবডোমেইনে একটা খালি সাইট তৈরি হবে। অফিসের সম্মতি ও কনটেন্ট যাচাই না হওয়া পর্যন্ত সাইট "সেটআপ" অবস্থায় থাকবে, পাবলিকে দেখা যাবে না।</p></div></div>
  <form class="card form" id="nf" novalidate style="max-width:900px">
    <h2 class="h2">MP-র তথ্য</h2>
    <div class="frow"><div class="field"><label for="nName">পুরো নাম <span class="req">*</span></label><input type="text" id="nName" maxlength="80" placeholder="যেমন: ডা. আনোয়ার কবির"><p class="err" hidden></p></div>
      <div class="field"><label for="nRole">পদ <span class="req">*</span></label><select id="nRole"><option>সংসদ সদস্য</option><option>মন্ত্রী</option><option>প্রতিমন্ত্রী</option><option>উপমন্ত্রী</option></select></div></div>
    <div class="frow three"><div class="field"><label for="nSeat">আসনের নাম <span class="req">*</span></label><input type="text" id="nSeat" maxlength="40" placeholder="যেমন: তিস্তাচর"><p class="err" hidden></p></div>
      <div class="field"><label for="nNo">আসন নম্বর <span class="req">*</span></label><input type="number" id="nNo" min="1" max="20" value="1"></div>
      <div class="field" id="minF" hidden><label for="nMin">মন্ত্রণালয়</label><input type="text" id="nMin" maxlength="80"></div></div>
    <h2 class="h2" style="margin-top:8px">সাইটের ঠিকানা</h2>
    <div class="field"><label for="nSub">সাবডোমেইন <span class="req">*</span></label><div class="suffix"><input type="text" id="nSub" maxlength="30" placeholder="tcr2" autocomplete="off" spellcheck="false"><span>.${PL.root}</span></div><p class="hint">ইংরেজি ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন। পরে Super Admin প্যানেল থেকে MP-র নিজস্ব ডোমেইন যোগ করা যাবে।</p><p class="err" hidden></p></div>
    <h2 class="h2" style="margin-top:8px">অ্যাডমিন অ্যাকাউন্ট</h2>
    <div class="frow"><div class="field"><label for="nOwner">MP-র মোবাইল (মালিক অ্যাকাউন্ট) <span class="req">*</span></label><input type="tel" id="nOwner" inputmode="numeric" maxlength="16" placeholder="০১XXXXXXXXX"><p class="hint">এই নম্বরে লগইন লিংক আর 2FA সেটআপ যাবে।</p><p class="err" hidden></p></div>
      <div class="field"><label for="nPr">PR এডিটরের ইমেইল</label><input type="email" id="nPr" maxlength="80" placeholder="pr@example.com"><p class="err" hidden></p></div></div>
    <div class="frow"><div class="field"><label for="nPlan">প্যাকেজ</label><select id="nPlan"><option>পূর্ণ</option><option>মৌলিক</option></select></div>
      <div class="field"><span class="lab">অভিযোগ বক্স</span><label class="check"><input type="checkbox" id="nCmp" checked><span>চালু রাখুন (OTP ঐচ্ছিক)</span></label></div></div>
    <div class="note"><label class="check"><input type="checkbox" id="nCons"><span><b>MP অফিসের লিখিত সম্মতি পাওয়া গেছে।</b> সম্মতি ছাড়া কোনো আসল MP-র নামে সাইট তৈরি বা কনটেন্ট প্রকাশ করা যাবে না। দলীয় প্রতীক বা লোগো শুধু অফিসের অনুমতি থাকলে।</span></label><p class="err" id="eCons" hidden></p></div>
    <div class="form-foot"><button class="btn btn-b" type="submit">${ic('plus')}MP তৈরি করুন</button><a class="btn btn-g" href="#/tenants">বাতিল</a></div>
  </form>`;
  $('#nRole').addEventListener('change',e=>{$('#minF').hidden=e.target.value==='সংসদ সদস্য'});
  const err=(el,msg)=>{const p=el.closest('.field').querySelector('.err');p.textContent=msg;p.hidden=!msg;el.setAttribute('aria-invalid',msg?'true':'false');return !msg};
  $('#nf').addEventListener('submit',e=>{
    e.preventDefault();
    const name=$('#nName'),seat=$('#nSeat'),sub=$('#nSub'),own=$('#nOwner'),pr=$('#nPr');
    const subV=sub.value.trim().toLowerCase(), taken=domains().some(d=>d.host.split('.')[0]===subV);
    const phone=window.JA.toEn(own.value).replace(/[\s-]/g,'').replace(/^\+?88/,'');
    const ok=[err(name,name.value.trim().length<3?'নাম লিখুন।':''),err(seat,!seat.value.trim()?'আসনের নাম লিখুন।':''),
      err(sub,!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(subV)?'৩–৩০ অক্ষরের ইংরেজি ছোট হাতের অক্ষর, সংখ্যা বা হাইফেন দিন।':taken?'এই সাবডোমেইন আগে থেকেই আছে।':''),
      err(own,!/^01[3-9]\d{8}$/.test(phone)?'সঠিক মোবাইল নম্বর দিন।':''),err(pr,pr.value&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pr.value)?'সঠিক ইমেইল দিন।':'')];
    const ce=$('#eCons');ce.textContent=$('#nCons').checked?'':'সম্মতি নিশ্চিত না করে MP তৈরি করা যাবে না।';ce.hidden=$('#nCons').checked;
    if(ok.includes(false)||!$('#nCons').checked){($('[aria-invalid="true"]')||$('#nCons')).focus();return}
    const id=subV.replace(/-/g,'');
    const t={id,name:name.value.trim(),seat:seat.value.trim()+'-'+bn($('#nNo').value),role:$('#nRole').value==='সংসদ সদস্য'?'সংসদ সদস্য':$('#nRole').value+($('#nMin').value?', '+$('#nMin').value.trim():''),sub:subV,custom:'',status:'setup',plan:$('#nPlan').value,since:bnDate(new Date()),lastPost:null,posts:0,cmpMonth:0,visitors:0,admins:pr.value?2:1};
    savePS(s=>{s.tenants.push(t);s.domains.push({host:subV+'.'+PL.root,tenant:id,type:'sub',dns:'ok',ssl:'ok',sslExp:'৯০ দিন পর',primary:true})});
    saLog(id,'নতুন MP অ্যাকাউন্ট তৈরি করেছেন',t.name+' · '+t.seat);
    toast('MP তৈরি হয়েছে। মালিকের মোবাইলে লগইন লিংক যাবে (ডেমোতে যায় না)।');sh.renderNav();go('/tenants/'+id);
  });
  return {crumb:'নতুন MP'};
}

function domainsView(){
  const T=tenants();
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">ডোমেইন</p><h1>ডোমেইন ও SSL</h1><p class="sub">প্রতিটি সাইট প্ল্যাটফর্মের সাবডোমেইনে চলে। MP চাইলে নিজের ডোমেইন যুক্ত করা যায়: DNS ঠিক হলে host দেখে সঠিক MP-র সাইট খোলে, আর SSL নিজে থেকেই তৈরি হয়।</p></div>
    <div class="acts"><button class="btn btn-b" id="addD">${ic('plus')}কাস্টম ডোমেইন যোগ করুন</button></div></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ডোমেইন</th><th>সাইট</th><th>ধরন</th><th>DNS</th><th>SSL</th><th></th></tr></thead><tbody>
  ${domains().map(d=>`<tr><td><b>${esc(d.host)}</b>${d.primary?' '+pill('প্রধান','brass plain'):''}</td><td>${esc(tname(d.tenant))}</td><td>${d.type==='custom'?'কাস্টম':'সাবডোমেইন'}</td>
    <td>${d.dns==='ok'?pill('ঠিক আছে','ok'):pill('যাচাই বাকি','warn')}</td><td>${d.ssl==='ok'?pill('সক্রিয় · '+d.sslExp,'ok'):d.ssl==='warn'?pill('শেষ হবে '+d.sslExp,'warn'):pill('নেই','plain')}</td>
    <td><div class="acts">${d.dns==='pending'?`<button class="btn btn-g btn-s" data-dns="${esc(d.host)}">DNS নির্দেশনা</button><button class="btn btn-p btn-s" data-ver="${esc(d.host)}">যাচাই করুন</button>`:d.ssl==='warn'?`<button class="btn btn-g btn-s" data-ssl="${esc(d.host)}">SSL নবায়ন</button>`:''}</div></td></tr>`).join('')}
  </tbody></table></div>`;
  const dnsBody=d=>`<p style="margin:0 0 12px">MP-র ডোমেইন যেখানে কেনা (registrar), সেখানে এই দুটো রেকর্ড যোগ করতে হবে:</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ধরন</th><th>নাম</th><th>মান</th></tr></thead><tbody>
    <tr><td>CNAME</td><td>${esc(d.host)}</td><td>sites.${PL.root}</td></tr><tr><td>TXT</td><td>_jonoprotinidhi.${esc(d.host)}</td><td>${esc(d.token)}</td></tr></tbody></table></div>
    <p class="muted" style="margin:12px 0 0;font-size:13.5px">DNS ছড়াতে কয়েক মিনিট থেকে কয়েক ঘণ্টা লাগতে পারে। যাচাই হলে SSL নিজে থেকে তৈরি হবে।</p>`;
  $$('[data-dns]').forEach(b=>b.addEventListener('click',()=>{const d=domains().find(x=>x.host===b.dataset.dns);dialog({title:'DNS নির্দেশনা',body:dnsBody(d),cancel:'',ok:'বুঝেছি'})}));
  $$('[data-ver]').forEach(b=>b.addEventListener('click',()=>{
    b.disabled=true;b.textContent='যাচাই হচ্ছে…';
    setTimeout(()=>{const h=b.dataset.ver;savePS(s=>{s.dom[h]={dns:'ok',ssl:'ok',sslExp:'৯০ দিন পর'}});const d=domains().find(x=>x.host===h);saLog(d.tenant,'কাস্টম ডোমেইন যাচাই করেছেন, SSL চালু',h);toast(h+' যাচাই হয়েছে, SSL চালু');sh.renderNav();domainsView()},1200);
  }));
  $$('[data-ssl]').forEach(b=>b.addEventListener('click',()=>{const h=b.dataset.ssl;savePS(s=>{s.dom[h]={ssl:'ok',sslExp:'৯০ দিন পর'}});const d=domains().find(x=>x.host===h);saLog(d.tenant,'SSL নবায়ন করেছেন',h);toast('SSL নবায়ন হয়েছে');domainsView()}));
  $('#addD').addEventListener('click',()=>dialog({title:'কাস্টম ডোমেইন যোগ করুন',ok:'যোগ করুন',
    body:`<div class="form"><div class="field"><label for="dT">কোন MP-র সাইট</label><select id="dT">${T.map(t=>`<option value="${t.id}">${esc(t.seat)} · ${esc(t.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="dH">ডোমেইন <span class="req">*</span></label><input type="text" id="dH" placeholder="example.com" autocomplete="off" spellcheck="false"><p class="err" id="dErr" hidden></p></div></div>`,
    onOk:d=>{const h=$('#dH',d).value.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'');
      const bad=!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(h)?'সঠিক ডোমেইন লিখুন, যেমন example.com':domains().some(x=>x.host===h)?'এই ডোমেইন আগে থেকেই যুক্ত।':'';
      if(bad){const e=$('#dErr',d);e.textContent=bad;e.hidden=false;return false}
      const tok='jonoprotinidhi-verify='+Math.random().toString(16).slice(2,10);
      savePS(s=>{s.domains.push({host:h,tenant:$('#dT',d).value,type:'custom',dns:'pending',ssl:'none',sslExp:'—',token:tok})});
      saLog($('#dT',d).value,'কাস্টম ডোমেইন যোগ করেছেন',h);sh.renderNav();domainsView();
      setTimeout(()=>dialog({title:'DNS নির্দেশনা',body:dnsBody({host:h,token:tok}),cancel:'',ok:'বুঝেছি'}),50)}}));
  return {crumb:'ডোমেইন'};
}

function auditView(){
  let ft='all',fa='all';
  const T=tenants();
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">অডিট লগ</p><h1>কে, কখন, কী বদলাল</h1><p class="sub">প্রতিটি পরিবর্তন রেকর্ড হয়, এমনকি Super Admin কোনো MP-র সাইটে কিছু ঠিক করলেও। এই লগ মোছা বা বদলানো যায় না।</p></div></div>
  <div class="bar"><select id="ft" aria-label="সাইট" style="max-width:260px"><option value="all">সব সাইট</option>${T.map(t=>`<option value="${t.id}">${esc(t.seat)}</option>`).join('')}</select>
    <div class="chips" id="fa">${[['all','সবাই'],['sa','শুধু Super Admin'],['office','শুধু MP অফিস']].map(([k,t],i)=>`<button class="chip" data-k="${k}" aria-pressed="${!i}">${t}</button>`).join('')}</div></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>সময়</th><th>কে</th><th>কী করেছেন</th><th>কোথায়</th></tr></thead><tbody id="ab"></tbody></table></div>`;
  const render=()=>{$('#ab').innerHTML=auditAll().filter(a=>(ft==='all'||a.tenant===ft)&&(fa==='all'||(fa==='sa'?a.sa:!a.sa))).map(a=>`<tr${a.sa?' style="background:#FBF3F1"':''}><td class="num" style="white-space:nowrap">${esc(a.when)}</td><td><b>${esc(a.actor)}</b><small>${esc(a.actorRole)}</small></td><td>${esc(a.action)}<small>${esc(a.target||'')}</small></td><td>${esc(tname(a.tenant))}</td></tr>`).join('')||`<tr><td colspan="4" class="empty">কিছু নেই</td></tr>`};
  $('#ft').addEventListener('change',e=>{ft=e.target.value;render()});
  $('#fa').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;fa=b.dataset.k;$$('#fa .chip').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));render()});
  render();
  return {crumb:'অডিট লগ'};
}

function securityView(){
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">নিরাপত্তা</p><h1>ব্যাকআপ ও নিরাপত্তা</h1><p class="sub">প্রতিদিন রাত ২টায় পুরো ডেটাবেস আর ছবির ব্যাকআপ হয়। ব্যাকআপ encrypted অবস্থায় আলাদা জায়গায় থাকে, ৩০ দিন রাখা হয়।</p></div>
    <div class="acts"><button class="btn btn-b" id="bNow">${ic('db')}এখনই ব্যাকআপ নিন</button></div></div>
  <div class="kpis">
    <div class="kpi"><small>অ্যাডমিনদের 2FA</small><b>৯৬%</b><span>১ জন বাকি (শালবাগান কর্মকর্তা)</span></div>
    <div class="kpi"><small>WAF / DDoS সুরক্ষা</small><b>চালু</b><span>গত ৩০ দিনে ১২,৪০৮টি অনুরোধ আটকানো</span></div>
    <div class="kpi"><small>অভিযোগে spam ঠেকানো</small><b>৩৮৬</b><span>Turnstile ও rate limit-এ আটকেছে (৩০ দিন)</span></div>
    <div class="kpi"><small>নাগরিকের নাম ও নম্বর</small><b>${ic('lock',26)}</b><span>encrypted; শুধু দায়িত্বপ্রাপ্ত কর্মকর্তা দেখেন</span></div>
  </div>
  <div class="grid g21">
    <div class="card"><div class="sec-t"><h2 class="h2">ব্যাকআপ</h2></div>
      <div class="tbl-wrap" style="border:0"><table class="tbl"><thead><tr><th>সময়</th><th>ধরন</th><th class="n">আকার</th><th>অবস্থা</th><th></th></tr></thead><tbody id="bk">
      ${PL.backups.map((b,i)=>`<tr><td class="num">${b.when}</td><td>${b.kind}</td><td class="n">${b.size}</td><td>${pill('সফল','ok')}</td><td><button class="btn btn-g btn-s" data-rs="${i}">রিস্টোর</button></td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="card"><h2 class="h2" style="margin-bottom:10px">নিয়ম (সব সাইটে প্রযোজ্য)</h2><ul class="list">
      <li><span class="dot"></span><div><b>Tenant আলাদা রাখা</b><small>প্রতিটি টেবিলে tenant_id; ডেটাবেস স্তরে row-level নিয়ম। এক MP-র ডেটা আরেক MP-র প্যানেলে যায় না।</small></div></li>
      <li><span class="dot"></span><div><b>সব অ্যাডমিনের 2FA বাধ্যতামূলক</b><small>2FA ছাড়া প্যানেলে ঢোকা যায় না। Super Admin-দের security key।</small></div></li>
      <li><span class="dot"></span><div><b>নাগরিকের গোপনীয়তা</b><small>Super Admin-ও অভিযোগকারীর নাম বা নম্বর দেখতে পারেন না। কর্মকর্তা দেখলে সেটাও লগ হয়।</small></div></li>
      <li><span class="dot"></span><div><b>অনুমোদন ছাড়া কিছু প্রকাশ হয় না</b><small>PR টিমের সব পোস্ট MP-র অনুমোদনের পর লাইভ হয়।</small></div></li>
    </ul></div>
  </div>`;
  $('#bNow').addEventListener('click',e=>{const b=e.currentTarget;b.disabled=true;b.textContent='ব্যাকআপ চলছে…';setTimeout(()=>{audit({tenant:'all',actor:ME.name,actorRole:'Super Admin',sa:true,action:'হাতে ব্যাকআপ নিয়েছেন',target:'পুরো প্ল্যাটফর্ম'});toast('ব্যাকআপ সম্পন্ন (ডেমো)');b.disabled=false;b.innerHTML=ic('db')+'এখনই ব্যাকআপ নিন'},1400)});
  $$('[data-rs]').forEach(b=>b.addEventListener('click',()=>{const bk=PL.backups[+b.dataset.rs];dialog({title:'ব্যাকআপ থেকে রিস্টোর',danger:true,ok:'রিস্টোর শুরু করুন',
    body:`<p style="margin:0 0 10px"><b>${bk.when}</b>-এর ব্যাকআপে ফিরে যাবে। এর পরের সব পরিবর্তন হারাবে।</p><p class="note bad" style="margin:0 0 12px">আসল সিস্টেমে রিস্টোরের জন্য দুজন Super Admin-এর অনুমোদন লাগে।</p><div class="field"><label for="rc">নিশ্চিত করতে লিখুন: RESTORE</label><input type="text" id="rc" autocomplete="off"></div><p class="err" id="rerr" hidden></p>`,
    onOk:d=>{if($('#rc',d).value.trim()!=='RESTORE'){const e=$('#rerr',d);e.textContent='RESTORE লিখুন।';e.hidden=false;return false}toast('রিস্টোরের অনুরোধ পাঠানো হয়েছে, দ্বিতীয় অনুমোদনের অপেক্ষায় (ডেমো)');audit({tenant:'all',actor:ME.name,actorRole:'Super Admin',sa:true,action:'রিস্টোরের অনুরোধ করেছেন',target:bk.when})}})}));
  return {crumb:'ব্যাকআপ ও নিরাপত্তা'};
}

function staffView(){
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">প্ল্যাটফর্ম টিম</p><h1>আমাদের টিম</h1><p class="sub">শুধু কোম্পানির নিজের লোকজন। MP অফিসের অ্যাকাউন্ট প্রতিটি MP-র নিজের প্যানেলে থাকে।</p></div></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>নাম</th><th>ভূমিকা</th><th>2FA</th><th>শেষ লগইন</th></tr></thead><tbody>
  ${PL.staff.map(s=>`<tr><td><b>${s.name}</b><small>${s.email}</small></td><td>${s.role==='Super Admin'?pill(s.role,'bad plain'):pill(s.role,'plain')}</td><td>${pill(s.tfa,'ok')}</td><td>${s.last}</td></tr>`).join('')}
  </tbody></table></div>`;
  return {crumb:'প্ল্যাটফর্ম টিম'};
}

router([
  {re:/^\/$/,render:()=>{dashboard();return null}},
  {re:/^\/tenants$/,render:tenantsView},
  {re:/^\/tenants\/new$/,render:newTenant},
  {re:/^\/tenants\/([\w-]+)$/,render:tenantDetail},
  {re:/^\/domains$/,render:domainsView},
  {re:/^\/audit$/,render:auditView},
  {re:/^\/security$/,render:securityView},
  {re:/^\/staff$/,render:staffView}
],{crumbRoot:'Super Admin',notFound:()=>`<div class="card empty">পেজ পাওয়া যায়নি। <a href="#/">ড্যাশবোর্ডে ফিরুন</a></div>`});
})();
