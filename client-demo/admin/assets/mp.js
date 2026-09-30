/* MP Admin panel for tenant ndp3 (ড. তাহমিনা নূর). Content comes from ../demo-mp/assets/data.js;
   edits are kept in localStorage (KEYS.cms) and the public demo site reads that overlay, so an approved post
   or a promise update shows up on the site immediately. Roles: owner (MP), pr, officer, super (impersonating). */
(function(){
'use strict';
const {bn,toEn,$,$$,esc,fmt,ic,store,KEYS,audit,toast,dialog,shell,router,go,bnDate,bnTime,uid,columns,heatColor,MONTHS}=window.JA;
const S=window.SITE, PL=window.PLATFORM, U=S.area.upz, TENANT='ndp3';
const TODAY=new Date(2026,8,30); /* demo "today" for seeded ages */
const qs=new URLSearchParams(location.search);
const AS_SUPER=qs.get('as')==='super';

/* ---------- roles ---------- */
const ROLES={
  owner:{t:'MP (মালিক)',who:'ড. তাহমিনা নূর',short:'MP',av:'তনূ'},
  pr:{t:'PR / কনটেন্ট এডিটর',who:'সাদিয়া আফরিন',short:'PR এডিটর',av:'সাআ'},
  officer:{t:'অভিযোগ কর্মকর্তা · নতুনহাট',who:'মো. কামরুল হাসান',short:'অভিযোগ কর্মকর্তা',av:'কাহা',upz:'notunhat'},
  super:{t:'Super Admin (প্ল্যাটফর্ম)',who:'নাফিসা রহমান',short:'Super Admin',av:'নার',sa:true}
};
let role=AS_SUPER?'super':store.get(KEYS.role,'owner');
if(!ROLES[role]||(role==='super'&&!AS_SUPER))role='owner';
const R=()=>ROLES[role];
const can={
  publish:()=>role==='owner'||role==='super',
  write:()=>role!=='officer',
  site:()=>role==='owner'||role==='super',
  promises:()=>role==='owner'||role==='super',
  allComplaints:()=>role!=='officer'&&role!=='pr',
  complaints:()=>role!=='pr',
  team:()=>role==='owner'||role==='super'
};
const log=(action,target)=>audit({tenant:TENANT,actor:R().who,actorRole:R().short,sa:!!R().sa,action,target});

/* ---------- CMS overlay (shared with the public demo site) ---------- */
const cms=()=>store.get(KEYS.cms,{});
const saveCms=fn=>store.update(KEYS.cms,{},c=>{fn(c);return c});
const CAT_IMG={dev:'road',health:'health',edu:'school',hearing:'hearing',parliament:'parliament',agri:'agri',social:'women'};
const CATS=S.activityCats.filter(c=>c[0]!=='all');
const catName=k=>(CATS.find(c=>c[0]===k)||[,k])[1];
const PST={draft:['খসড়া','plain'],review:['অনুমোদনের অপেক্ষায়','warn'],scheduled:['নির্ধারিত সময়ে প্রকাশ','info'],published:['প্রকাশিত','ok'],rejected:['ফেরত পাঠানো','bad']};
const pill=(t,c)=>`<span class="pill ${c}">${t}</span>`;
function allPosts(){
  const mine=(cms().posts||[]).map(p=>({...p,own:true}));
  const seeded=S.activities.map(a=>({id:a.id,title:a.title,k:a.k,cat:a.cat,upz:a.upz,place:a.place,dateT:a.date,summary:a.summary,body:a.body.join('\n\n'),status:'published',photos:a.imgs.length,author:'সাদিয়া আফরিন',img:a.img,
    versions:[{when:a.date,who:'সাদিয়া আফরিন',what:'খসড়া তৈরি ও অনুমোদনের জন্য পাঠানো'},{when:a.date,who:'ড. তাহমিনা নূর',what:'অনুমোদন ও প্রকাশ'}]}));
  return [...mine.sort((a,b)=>b.created-a.created),...seeded];
}
const postById=id=>allPosts().find(p=>p.id===id);
const upsertPost=p=>saveCms(c=>{c.posts=c.posts||[];const i=c.posts.findIndex(x=>x.id===p.id);if(i<0)c.posts.push(p);else c.posts[i]=p});
const promises=()=>{const e=cms().promiseEdits||{};return S.promises.map((p,i)=>({...p,...(e[i]||{}),i}))};

/* ---------- complaints (seed + public submissions); PII only in `pii` ---------- */
const CST={new:['নতুন','info'],verify:['যাচাই চলছে','warn'],progress:['প্রক্রিয়াধীন','warn'],solved:['সমাধান হয়েছে','ok'],closed:['বন্ধ','plain']};
const officerOf=k=>PL.team.find(t=>t.role==='officer'&&t.upz===k);
const daysAgo=d=>Math.max(0,Math.round((TODAY-d)/864e5));
function seedComplaints(){
  const keys=Object.keys(U), stat=['new','verify','progress','progress','solved','closed','solved','progress','new','solved','verify','closed'];
  return PL.complaintTitles.map(([cat,title],i)=>{
    const k=keys[i%3], u=U[k], st=stat[i%stat.length], d=new Date(2026,8,29-Math.floor(i*1.15)), anon=PL.fakeNames[i%PL.fakeNames.length]==='বেনামী';
    return {id:'NDP3-2026-0'+(1150+i*4),cat,title,upz:k,union:u.unions[(i*2)%u.unions.length],date:d,channel:i%4===1?'গণশুনানি':'অনলাইন',st,
      officer:st==='new'?null:officerOf(k).name,resolvedIn:(st==='solved'||st==='closed')?[3,5,6,4,2,9,5,3][i%8]:null,
      pii:anon?null:{name:PL.fakeNames[i%PL.fakeNames.length],phone:'০১৭০০-০'+bn(20000+i*37)}};
  });
}
function publicComplaints(){
  const out=[];
  Object.entries(S.complaintSamples).forEach(([id,t])=>{const k=Object.keys(U).find(x=>t.where.includes(U[x].short));out.push({id,cat:t.cat,title:t.title,upz:k,union:t.where.split(',')[0].replace(' ইউনিয়ন',''),date:new Date(2026,8,t.st==='done'?10:25),channel:t.st==='done'?'অনলাইন':'গণশুনানি',st:t.st==='done'?'solved':'progress',officer:officerOf(k).name,resolvedIn:t.st==='done'?13:null,pii:{name:t.st==='done'?'মো. শফিকুল':'সুমাইয়া আক্তার',phone:t.st==='done'?'০১৭০০-০২৯৯১০':'০১৭০০-০২৯৯১১'}})});
  Object.entries(store.get(KEYS.tickets,{})||{}).forEach(([id,t])=>{
    if(!t||typeof t!=='object')return;
    const k=Object.keys(U).find(x=>String(t.where||'').includes(U[x].short))||'notunhat';
    out.push({id,cat:String(t.cat||''),title:String(t.title||''),upz:k,union:String(t.where||'').split(',')[0],date:TODAY,channel:'অনলাইন (এই ব্রাউজার থেকে)',st:'new',officer:null,resolvedIn:null,pii:'demo'});
  });
  return out;
}
function complaints(){
  const st=store.get(KEYS.cmp,{});
  return [...publicComplaints(),...seedComplaints()].map(c=>{const s=st[c.id]||{};return {...c,st:s.st||c.st,officer:s.officer!==undefined?s.officer:c.officer,notes:s.notes||[],sms:s.sms||[],trail:s.trail||[]}})
    .filter(c=>can.allComplaints()||(role==='officer'&&c.upz===R().upz));
}
const saveCmp=(id,fn)=>store.update(KEYS.cmp,{},s=>{s[id]=s[id]||{};fn(s[id]);return s});

/* ---------- shell ---------- */
const pendingCount=()=>allPosts().filter(p=>p.status==='review').length;
const openCount=()=>complaints().filter(c=>c.st==='new').length;
const NAV=()=>[
  {grp:'নদীপুর-৩'},
  {path:'/',label:'ড্যাশবোর্ড',icon:'chart'},
  ...(can.write()?[{path:'/posts',label:'পোস্ট ও কার্যক্রম',icon:'doc'},{path:'/posts/new',label:'নতুন পোস্ট',icon:'plus'}]:[]),
  ...(can.publish()?[{path:'/approvals',label:'অনুমোদন',icon:'check',count:pendingCount()}]:[]),
  ...(can.complaints()?[{path:'/complaints',label:'অভিযোগ',icon:'inbox',count:openCount()}]:[]),
  ...(can.promises()?[{path:'/promises',label:'প্রতিশ্রুতি',icon:'target'}]:[]),
  ...(can.site()?[{grp:'সাইট'},{path:'/site',label:'ব্যানার ও হোমপেজ',icon:'image'},{path:'/settings',label:'সেটিংস',icon:'gear'}]:[]),
  ...(can.team()?[{grp:'অফিস'},{path:'/team',label:'টিম ও ভূমিকা',icon:'users'},{path:'/audit',label:'অডিট লগ',icon:'log'}]:[])
];
const sh=shell({
  brand:`<small>জনপ্রতিনিধি · MP অ্যাডমিন</small><b>${S.mp.name}</b><span>${S.mp.title}</span>`,
  nav:NAV,crumbRoot:'নদীপুর-৩',
  who:`<span class="av">${R().av}</span><div><b>${R().who}</b><small>${R().t}</small></div>`,
  impersonating:AS_SUPER?`<div class="imp">${ic('eye',16)} <span><b>Super Admin হিসেবে</b> নদীপুর-৩-এর প্যানেলে আছেন। এখানে যা বদলাবেন, অডিট লগে "Super Admin" নামে লেখা থাকবে।</span><a href="super.html#/tenants/ndp3">Super Admin প্যানেলে ফিরুন →</a></div>`:''
});
if(!AS_SUPER){
  $('#topExtra').innerHTML=`<label class="sr" for="roleSel">ডেমো ভূমিকা</label><select id="roleSel" style="width:auto;font-size:14px;padding:7px 10px" title="ডেমো: ভূমিকা বদলে দেখুন কে কী করতে পারেন">${Object.entries(ROLES).filter(([k])=>k!=='super').map(([k,r])=>`<option value="${k}"${k===role?' selected':''}>ভূমিকা: ${r.short}</option>`).join('')}</select>`;
  $('#roleSel').addEventListener('change',e=>{store.set(KEYS.role,e.target.value);location.hash='#/';location.reload()});
}

/* ---------- dashboard ---------- */
function dashboard(){
  const C=complaints(),open=C.filter(c=>!['solved','closed'].includes(c.st)),done=C.filter(c=>c.resolvedIn!=null);
  const sla=done.length?Math.round(done.filter(c=>c.resolvedIn<=7).length/done.length*100):0;
  const vis=PL.visitors.reduce((a,b)=>a+b,0);
  const unions=[];Object.entries(U).forEach(([k,u])=>u.unions.forEach(n=>unions.push({n,upz:u.short,v:C.filter(c=>c.upz===k&&c.union===n).length})));
  const umax=Math.max(1,...unions.map(u=>u.v));
  const stc=Object.keys(CST).map(k=>[k,C.filter(c=>c.st===k).length]);
  const col={new:'#2D5B86',verify:'#E2C88E',progress:'#C7A35A',solved:'#2E7D5B',closed:'#9AA0A8'};
  const officer=role==='officer';
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">${officer?'আমার এলাকা · '+U[R().upz].short:'ড্যাশবোর্ড'}</p><h1>স্বাগতম, ${R().who}</h1><p class="sub">${officer?'আপনার উপজেলার অভিযোগগুলো। শুধু আপনাকে দেওয়া অভিযোগের নাম ও নম্বর আপনি দেখতে পারেন।':'গত ৩০ দিনের হিসাব · হালনাগাদ আজ দুপুর ১২টা'}</p></div>
    <div class="acts">${can.write()?`<a class="btn btn-b" href="#/posts/new">${ic('plus')}নতুন পোস্ট</a>`:''}${can.complaints()?`<a class="btn btn-g" href="#/complaints">${ic('inbox')}অভিযোগ দেখুন</a>`:''}</div></div>
  <div class="kpis">
    ${officer?'':`<div class="kpi"><small>সাইটে ভিজিটর (৩০ দিন)</small><b>${fmt(vis)}</b><span><span class="up">+২২%</span> আগের ৩০ দিনের চেয়ে</span></div>`}
    <div class="kpi dark"><small>খোলা অভিযোগ</small><b>${bn(open.length)}</b><span>নতুন ${bn(C.filter(c=>c.st==='new').length)} · সাত দিনের বেশি পুরনো ${bn(open.filter(c=>daysAgo(c.date)>7).length)}</span></div>
    <div class="kpi"><small>৭ দিনে নিষ্পত্তি (SLA)</small><b>${bn(sla)}%</b><span>লক্ষ্য ৮০%</span></div>
    ${can.publish()?`<div class="kpi"><small>অনুমোদনের অপেক্ষায়</small><b>${bn(pendingCount())}</b><span><a href="#/approvals" style="color:var(--brass-deep)">দেখুন →</a></span></div>`:''}
    ${role==='pr'?`<div class="kpi"><small>আমার খসড়া</small><b>${bn(allPosts().filter(p=>p.own&&p.status==='draft').length)}</b><span>শেষ প্রকাশ: ২ দিন আগে</span></div>`:''}
    ${officer?`<div class="kpi"><small>আমাকে দেওয়া</small><b>${bn(C.filter(c=>c.officer===R().who&&!['solved','closed'].includes(c.st)).length)}</b><span>খোলা অবস্থায়</span></div><div class="kpi"><small>এ মাসে সমাধান</small><b>${bn(C.filter(c=>c.st==='solved').length)}</b><span>আমার উপজেলায়</span></div>`:''}
  </div>
  ${officer?'':`<div class="grid g21">
    <div class="card"><div class="sec-t"><h2 class="h2">দৈনিক ভিজিটর · সেপ্টেম্বর ২০২৬</h2><span class="muted" style="font-size:13px">কলামে মাউস রাখলে সংখ্যা দেখাবে</span></div><div id="vchart" data-label="সেপ্টেম্বরের দৈনিক ভিজিটর"></div>
      <p class="muted" style="font-size:13px;margin:8px 0 0">২৭ সেপ্টেম্বরের লাফ: সংযোগ সড়ক উদ্বোধনের পোস্ট ফেসবুকে শেয়ার হয়েছিল।</p></div>
    <div class="card"><h2 class="h2" style="margin-bottom:12px">সবচেয়ে বেশি পড়া</h2><div class="hbars">${PL.topPages.map(([t,v])=>`<div class="hbar" style="grid-template-columns:minmax(0,1fr) 4.2em"><span style="min-width:0"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t}</span><span class="t" style="display:block;margin-top:4px"><i style="width:${(v/PL.topPages[0][1]*100).toFixed(0)}%"></i></span></span><span class="n">${fmt(v)}</span></div>`).join('')}</div></div>
  </div>`}
  <div class="grid g12" style="margin-top:16px">
    <div class="card"><h2 class="h2">অভিযোগের অবস্থা</h2><div class="stackbar" role="img" aria-label="অভিযোগের অবস্থা">${stc.filter(s=>s[1]).map(([k,n])=>`<i style="width:${(n/C.length*100).toFixed(1)}%;background:${col[k]}" title="${CST[k][0]}: ${bn(n)}"></i>`).join('')}</div>
      <div class="legend">${stc.map(([k,n])=>`<span style="--c:${col[k]}">${CST[k][0]} ${bn(n)}</span>`).join('')}</div>
      <h2 class="h2" style="margin:20px 0 10px">বিষয় অনুযায়ী</h2><div class="hbars">${[...new Set(C.map(c=>c.cat))].map(cat=>[cat,C.filter(c=>c.cat===cat).length]).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([t,n],i,a)=>`<div class="hbar"><span>${esc(t)}</span><span class="t"><i style="width:${(n/a[0][1]*100).toFixed(0)}%"></i></span><span class="n">${bn(n)}</span></div>`).join('')}</div></div>
    <div class="card"><div class="sec-t"><h2 class="h2">ইউনিয়নভিত্তিক অভিযোগ</h2><span class="muted" style="font-size:13px">গাঢ় রং = বেশি অভিযোগ</span></div>
      <div class="heat">${unions.filter(u=>role!=='officer'||u.upz===U[R().upz].short).map(u=>{const c=heatColor(u.v,umax);return `<div style="background:${c.bg};color:${c.fg}" title="${u.n}, ${u.upz}: ${bn(u.v)}টি অভিযোগ"><b>${bn(u.v)}</b>${u.n}<small>${u.upz}</small></div>`}).join('')}</div>
      <div class="legend" style="margin-top:10px"><span style="--c:#F6EEDC">কম</span><span style="--c:#C7A35A">মাঝারি</span><span style="--c:#8A6A28">বেশি</span></div></div>
  </div>`;
  if(!officer){const days=PL.visitors.map((v,i)=>({x:bn(i+1),full:bn(i+1)+' সেপ্টেম্বর',v}));columns($('#vchart'),days,{xEvery:3})}
  return null;
}

/* ---------- posts ---------- */
function postsView(){
  let f='all';
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">পোস্ট ও কার্যক্রম</p><h1>সব পোস্ট</h1><p class="sub">খসড়া → অনুমোদন → প্রকাশ। MP-র অনুমোদন ছাড়া কোনো পোস্ট পাবলিক সাইটে যায় না।</p></div>
    <div class="acts"><a class="btn btn-b" href="#/posts/new">${ic('plus')}নতুন পোস্ট</a></div></div>
  <div class="bar"><div class="chips" id="pf">${[['all','সব'],['draft','খসড়া'],['review','অপেক্ষায়'],['scheduled','নির্ধারিত'],['published','প্রকাশিত'],['rejected','ফেরত']].map(([k,t],i)=>`<button class="chip" data-k="${k}" aria-pressed="${!i}">${t}<span class="c">${bn(k==='all'?allPosts().length:allPosts().filter(p=>p.status===k).length)}</span></button>`).join('')}</div></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>শিরোনাম</th><th>বিষয়</th><th>তারিখ</th><th>লেখক</th><th>অবস্থা</th></tr></thead><tbody id="pb"></tbody></table></div>`;
  const render=()=>{$('#pb').innerHTML=allPosts().filter(p=>f==='all'||p.status===f).map(p=>`<tr class="row-link" data-go="/posts/${p.id}"><td><b>${esc(p.title)}</b><small>${esc(p.place||'')}</small></td><td>${esc(catName(p.k))}</td><td class="num" style="white-space:nowrap">${esc(p.dateT)}</td><td>${esc(p.author)}</td><td>${pill(...PST[p.status])}</td></tr>`).join('')||`<tr><td colspan="5" class="empty">এই অবস্থায় কোনো পোস্ট নেই</td></tr>`;$$('#pb [data-go]').forEach(r=>r.addEventListener('click',()=>go(r.dataset.go)))};
  $('#pf').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;f=b.dataset.k;$$('#pf .chip').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));render()});
  render();
  return {crumb:'পোস্ট'};
}

function composer(id){
  if(!can.write()){$('#view').innerHTML='<div class="card empty">আপনার ভূমিকায় পোস্ট লেখা যায় না।</div>';return {crumb:'নতুন পোস্ট'}}
  const ed=id?postById(id):null;
  if(id&&(!ed||!ed.own||ed.status==='published')){go('/posts/'+id);return}
  const iso=d=>d.toISOString().slice(0,10);
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">${ed?'এডিট':'নতুন পোস্ট'}</p><h1>${ed?'পোস্ট এডিট করুন':'কার্যক্রমের খবর দিন'}</h1><p class="sub">মোবাইল থেকেই ২ মিনিটে: বিষয় বাছুন, শিরোনাম আর দু-চার লাইন লিখুন, ছবি দিন। ${can.publish()?'আপনি সরাসরি প্রকাশ করতে পারবেন।':'পাঠালে MP অনুমোদন দিলে প্রকাশ হবে।'}</p></div></div>
  <form class="composer form" id="cf" novalidate>
    <div class="field"><span class="lab">বিষয় <span class="req">*</span></span><div class="cat-pick" role="radiogroup" aria-label="বিষয়">${CATS.map(([k,t],i)=>`<label><input type="radio" name="cat" value="${k}"${(ed?ed.k===k:i===0)?' checked':''}><span>${t}</span></label>`).join('')}</div></div>
    <div class="field"><label for="cT">শিরোনাম <span class="req">*</span></label><input type="text" id="cT" maxlength="120" placeholder="যেমন: কাশবনে ১৫০ কৃষকের মাঝে বীজ বিতরণ" value="${ed?esc(ed.title):''}"><p class="err" hidden></p></div>
    <div class="frow three"><div class="field"><label for="cD">তারিখ</label><input type="date" id="cD" value="${ed&&ed.dateISO?ed.dateISO:iso(new Date())}"></div>
      <div class="field"><label for="cU">উপজেলা</label><select id="cU"><option value="">পুরো আসন</option>${Object.entries(U).map(([k,u])=>`<option value="${u.short}"${ed&&ed.upz===u.short?' selected':''}>${u.short}</option>`).join('')}</select></div>
      <div class="field"><label for="cP">স্থান</label><input type="text" id="cP" maxlength="60" placeholder="যেমন: কাশবন ইউনিয়ন পরিষদ" value="${ed?esc(ed.place||''):''}"></div></div>
    <div class="field"><label for="cS">এক লাইনে সারাংশ <span class="req">*</span></label><input type="text" id="cS" maxlength="160" placeholder="কার্ডে আর হোমপেজে এটা দেখাবে" value="${ed?esc(ed.summary):''}"><p class="err" hidden></p></div>
    <div class="field"><label for="cB">পুরো খবর</label><textarea id="cB" maxlength="4000" placeholder="কী হলো, কতজন উপকৃত, পরের ধাপ কী। অনুচ্ছেদ আলাদা করতে একটা লাইন ফাঁকা রাখুন।">${ed?esc(ed.body||''):''}</textarea><p class="hint" id="bc">০/৪০০০</p></div>
    <div class="field"><label for="cF">ছবি (সর্বোচ্চ ১০টি)</label><input type="file" id="cF" accept="image/*" multiple><div class="thumbs" id="th"></div><p class="hint">ডেমোতে ছবি আপলোড হয় না; প্রকাশিত পোস্টে বিষয় অনুযায়ী একটা ছবি দেখাবে। আসল সিস্টেমে ছবি ছোট করে WebP-তে রাখা হয়।</p><p class="err" hidden></p></div>
    <details><summary style="cursor:pointer;font-weight:600">নির্দিষ্ট সময়ে প্রকাশ করতে চান?</summary><div class="field" style="margin-top:10px"><label for="cW">প্রকাশের সময়</label><input type="datetime-local" id="cW" value="${ed&&ed.schedule?ed.schedule:''}"></div></details>
    ${ed&&ed.status==='rejected'?`<p class="note bad" style="margin:0"><b>ফেরত পাঠানোর কারণ:</b> ${esc(ed.reason||'')}</p>`:''}
    <div class="sticky-foot"><div class="form-foot">
      ${can.publish()?`<button class="btn btn-b" type="submit" data-a="publish">${ic('check')}প্রকাশ করুন</button>`:`<button class="btn btn-b" type="submit" data-a="review">${ic('send')}অনুমোদনের জন্য পাঠান</button>`}
      <button class="btn btn-g" type="submit" data-a="draft">খসড়া রাখুন</button><a class="btn btn-g" href="#/posts">বাতিল</a></div></div>
  </form>`;
  const cB=$('#cB');const cnt=()=>$('#bc').textContent=bn(cB.value.length)+'/৪০০০';cB.addEventListener('input',cnt);cnt();
  let nPhotos=ed?ed.photos||0:0;
  $('#cF').addEventListener('change',e=>{const fs=[...e.target.files];const er=e.target.closest('.field').querySelector('.err');er.hidden=fs.length<=10;er.textContent='সর্বোচ্চ ১০টি ছবি।';
    $('#th').innerHTML='';fs.slice(0,10).forEach(f=>{if(!f.type.startsWith('image/'))return;const im=document.createElement('img');im.alt='';im.src=URL.createObjectURL(f);im.onload=()=>URL.revokeObjectURL(im.src);$('#th').appendChild(im)});nPhotos=Math.min(fs.length,10)});
  let action='draft';
  $$('#cf [data-a]').forEach(b=>b.addEventListener('click',()=>{action=b.dataset.a}));
  $('#cf').addEventListener('submit',e=>{
    e.preventDefault();
    const T=$('#cT'),Sm=$('#cS');
    const bad=(el,m)=>{const p=el.closest('.field').querySelector('.err');p.textContent=m;p.hidden=!m;el.setAttribute('aria-invalid',m?'true':'false');return !!m};
    const e1=bad(T,T.value.trim().length<8?'অন্তত ৮ অক্ষরের শিরোনাম দিন।':''),e2=bad(Sm,action!=='draft'&&Sm.value.trim().length<10?'এক লাইনের সারাংশ দিন।':'');
    if(e1||e2){(e1?T:Sm).focus();return}
    const d=new Date($('#cD').value||Date.now()), k=$('input[name=cat]:checked').value, sched=$('#cW').value;
    const now=new Date(), stamp=bnDate(now)+', '+bnTime(now);
    const p=ed?{...ed}:{id:'p'+uid(),created:Date.now(),author:R().who,versions:[],own:true};
    Object.assign(p,{title:T.value.trim(),k,cat:catName(k),upz:$('#cU').value,place:$('#cP').value.trim()||$('#cU').value||'পুরো আসন',dateISO:$('#cD').value,dateT:bnDate(d),month:MONTHS[d.getMonth()],summary:Sm.value.trim(),body:cB.value.trim(),photos:nPhotos,img:CAT_IMG[k],schedule:sched||''});
    delete p.own;
    const what={draft:'খসড়া সংরক্ষণ',review:'অনুমোদনের জন্য পাঠানো',publish:sched?'অনুমোদন, নির্ধারিত সময়ে প্রকাশ':'প্রকাশ'}[action];
    p.status=action==='draft'?'draft':action==='review'?'review':(sched&&new Date(sched)>now?'scheduled':'published');
    if(p.status==='published'||p.status==='scheduled'){p.approvedBy=R().who}
    p.versions=[...(p.versions||[]),{when:stamp,who:R().who,what}];
    upsertPost(p);
    log({draft:'পোস্ট খসড়া রেখেছেন',review:'পোস্ট অনুমোদনের জন্য পাঠিয়েছেন',publish:p.status==='scheduled'?'পোস্ট নির্ধারিত সময়ে প্রকাশের জন্য রেখেছেন':'পোস্ট প্রকাশ করেছেন'}[action],p.title);
    toast({draft:'খসড়া সংরক্ষণ হয়েছে',review:'MP-র অনুমোদনের জন্য পাঠানো হয়েছে',publish:p.status==='scheduled'?'নির্ধারিত সময়ে প্রকাশ হবে':'প্রকাশ হয়েছে, পাবলিক সাইটে দেখা যাচ্ছে'}[action]);
    sh.renderNav();go('/posts/'+p.id);
  });
  return {crumb:ed?'এডিট':'নতুন পোস্ট'};
}

function postDetail(id){
  const p=postById(id);
  if(!p){$('#view').innerHTML='<div class="card empty">পোস্ট পাওয়া যায়নি। <a href="#/posts">তালিকায় ফিরুন</a></div>';return {crumb:'পাওয়া যায়নি'}}
  const own=(cms().posts||[]).some(x=>x.id===id);
  const S_=S.img[p.img]||{};
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">${esc(catName(p.k))} · ${esc(p.dateT)}</p><h1>${esc(p.title)}</h1><p class="sub">${pill(...PST[p.status])} &nbsp; লেখক: ${esc(p.author)}${p.approvedBy?' · অনুমোদন: '+esc(p.approvedBy):''}${p.schedule?' · প্রকাশের সময়: '+esc(p.schedule.replace('T',' ')):''}</p></div>
    <div class="acts">${p.status==='published'?`<a class="btn btn-g" href="../demo-mp/activity.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">${ic('ext')}সাইটে দেখুন</a>`:''}
      ${own&&p.status!=='published'&&can.write()&&(p.author===R().who||can.publish())?`<a class="btn btn-g" href="#/posts/${p.id}/edit">এডিট করুন</a>`:''}
      ${p.status==='review'&&can.publish()?`<button class="btn btn-d" id="rej">ফেরত পাঠান</button><button class="btn btn-b" id="apr">${ic('check')}অনুমোদন ও প্রকাশ</button>`:''}</div></div>
  <div class="grid g21">
    <div class="card"><div style="aspect-ratio:16/8;overflow:hidden;border-radius:2px;background:var(--paper-2);margin-bottom:16px">${S_.src?`<img src="${S_.src}" alt="" style="width:100%;height:100%;object-fit:cover">`:''}</div>
      <p style="font-size:17px;font-weight:600;margin:0 0 12px">${esc(p.summary)}</p>${String(p.body||'').split(/\n\s*\n/).filter(Boolean).map(x=>`<p style="margin:0 0 12px;line-height:1.85">${esc(x)}</p>`).join('')||'<p class="muted">পুরো খবর এখনো লেখা হয়নি।</p>'}</div>
    <div class="stack"><div class="card"><h2 class="h2" style="margin-bottom:10px">তথ্য</h2><dl class="dl"><dt>স্থান</dt><dd>${esc(p.place||'—')}</dd><dt>উপজেলা</dt><dd>${esc(p.upz||'পুরো আসন')}</dd><dt>ছবি</dt><dd>${bn(p.photos||0)}টি</dd></dl></div>
      <div class="card"><h2 class="h2" style="margin-bottom:12px">সংস্করণের ইতিহাস</h2><ol class="tline">${(p.versions||[]).map(v=>`<li class="done"><b>${esc(v.what)}</b><small>${esc(v.who)} · ${esc(v.when)}</small></li>`).join('')}</ol></div></div>
  </div>`;
  if($('#apr'))$('#apr').addEventListener('click',()=>approve(p,true));
  if($('#rej'))$('#rej').addEventListener('click',()=>approve(p,false));
  return {crumb:'পোস্ট'};
}
function approve(p,ok,after){
  const done=reason=>{const now=new Date(),stamp=bnDate(now)+', '+bnTime(now);
    const q={...p};delete q.own;
    q.status=ok?(q.schedule&&new Date(q.schedule)>now?'scheduled':'published'):'rejected';if(ok)q.approvedBy=R().who;else q.reason=reason;
    q.versions=[...(q.versions||[]),{when:stamp,who:R().who,what:ok?'অনুমোদন ও প্রকাশ':'ফেরত পাঠানো: '+reason}];
    upsertPost(q);log(ok?'পোস্ট অনুমোদন দিয়ে প্রকাশ করেছেন':'পোস্ট ফেরত পাঠিয়েছেন',q.title);
    toast(ok?'প্রকাশ হয়েছে, পাবলিক সাইটে দেখা যাচ্ছে':'PR এডিটরের কাছে ফেরত গেছে');sh.renderNav();(after||(()=>postDetail(p.id)))()};
  if(ok)return done();
  dialog({title:'ফেরত পাঠানোর কারণ',ok:'ফেরত পাঠান',danger:true,body:`<div class="field"><label for="rr">কী ঠিক করতে হবে <span class="req">*</span></label><textarea id="rr" maxlength="300" style="min-height:90px"></textarea></div><p class="err" id="rre" hidden>কারণ লিখুন।</p>`,
    onOk:d=>{const v=$('#rr',d).value.trim();if(!v){$('#rre',d).hidden=false;return false}done(v)}});
}
function approvals(){
  const L=allPosts().filter(p=>p.status==='review');
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">অনুমোদন</p><h1>অনুমোদনের অপেক্ষায় (${bn(L.length)})</h1><p class="sub">PR টিমের পাঠানো পোস্ট। অনুমোদন দিলেই পাবলিক সাইটে প্রকাশ হবে।</p></div></div>
  ${L.length?L.map(p=>`<div class="card"><div class="sec-t" style="margin:0"><div><p class="muted" style="margin:0;font-size:13px">${esc(catName(p.k))} · ${esc(p.dateT)} · ${esc(p.author)}</p><h2 class="h2" style="margin-top:2px">${esc(p.title)}</h2></div>${pill(...PST.review)}</div>
    <p style="margin:10px 0 14px">${esc(p.summary)}</p><div class="acts"><button class="btn btn-b" data-ok="${p.id}">${ic('check')}অনুমোদন ও প্রকাশ</button><button class="btn btn-d" data-no="${p.id}">ফেরত পাঠান</button><a class="btn btn-g" href="#/posts/${p.id}">পুরোটা পড়ুন</a></div></div>`).join(''):`<div class="card empty">${ic('check',28)}<p style="margin:8px 0 0">সব পোস্ট দেখা হয়ে গেছে। নতুন কিছু অপেক্ষায় নেই।</p><p class="muted" style="font-size:13.5px">ডেমো: ওপরে "ভূমিকা: PR এডিটর" বেছে একটা পোস্ট পাঠিয়ে দেখুন।</p></div>`}`;
  $$('[data-ok]').forEach(b=>b.addEventListener('click',()=>approve(postById(b.dataset.ok),true,approvals)));
  $$('[data-no]').forEach(b=>b.addEventListener('click',()=>approve(postById(b.dataset.no),false,approvals)));
  return {crumb:'অনুমোদন'};
}

/* ---------- complaints inbox ---------- */
function complaintsView(selId){
  let f=sessionStorage.getItem('cf')||'open',u='',q='';
  const officer=role==='officer';
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">অভিযোগ</p><h1>অভিযোগের ইনবক্স</h1><p class="sub">${officer?'আপনার উপজেলার অভিযোগ।':'সব উপজেলার অভিযোগ।'} নাগরিকের নাম ও নম্বর শুধু দায়িত্বপ্রাপ্ত কর্মকর্তা দেখতে পারেন, আর দেখলে সেটাও অডিট লগে যায়।</p></div>
    <div class="acts">${can.allComplaints()?`<button class="btn btn-g" id="csv">${ic('out')}রিপোর্ট (CSV)</button>`:''}</div></div>
  <div class="bar"><div class="chips" id="cf">${[['open','খোলা'],['new','নতুন'],['mine','আমার'],['late','৭ দিনের বেশি'],['solved','সমাধান'],['all','সব']].filter(x=>officer||x[0]!=='mine').map(([k,t])=>`<button class="chip" data-k="${k}" aria-pressed="${k===f}">${t}</button>`).join('')}</div>
    ${officer?'':`<select id="cu" aria-label="উপজেলা" style="width:auto"><option value="">সব উপজেলা</option>${Object.entries(U).map(([k,x])=>`<option value="${k}">${x.short}</option>`).join('')}</select>`}
    <input type="search" id="cq" class="grow" placeholder="আইডি বা বিষয় দিয়ে খুঁজুন" aria-label="খুঁজুন"></div>
  <div class="inbox"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>অভিযোগ</th><th>এলাকা</th><th>অবস্থা</th><th class="n">দিন</th></tr></thead><tbody id="cb"></tbody></table></div><div id="cd" class="detail"></div></div>`;
  const list=()=>complaints().filter(c=>{
    const open=!['solved','closed'].includes(c.st);
    return (f==='all'||(f==='open'&&open)||(f==='new'&&c.st==='new')||(f==='mine'&&c.officer===R().who)||(f==='late'&&open&&daysAgo(c.date)>7)||(f==='solved'&&!open))
      &&(!u||c.upz===u)&&(!q||(c.id+c.title+c.cat).toLowerCase().includes(q.toLowerCase()));
  });
  const render=()=>{
    const L=list();
    $('#cb').innerHTML=L.map(c=>{const age=daysAgo(c.date),open=!['solved','closed'].includes(c.st);return `<tr class="row-link${c.id===selId?' sel':''}" data-id="${esc(c.id)}"><td><b>${esc(c.title)}</b><small>${esc(c.id)} · ${esc(c.cat)}</small></td><td>${esc(c.union)}<small>${U[c.upz]?U[c.upz].short:''}</small></td><td>${pill(...CST[c.st])}</td><td class="n">${open&&age>7?`<span class="pill bad plain">${bn(age)}</span>`:bn(age)}</td></tr>`}).join('')||`<tr><td colspan="4" class="empty">এই ফিল্টারে কোনো অভিযোগ নেই</td></tr>`;
    $$('#cb tr[data-id]').forEach(r=>r.addEventListener('click',()=>{selId=r.dataset.id;history.replaceState(null,'','#/complaints/'+encodeURIComponent(selId));$$('#cb tr').forEach(x=>x.classList.toggle('sel',x===r));detail(selId);if(innerWidth<1100)$('#cd').scrollIntoView({behavior:'smooth'})}));
  };
  const detail=id=>{
    const c=complaints().find(x=>x.id===id), box=$('#cd');
    if(!c){box.innerHTML=`<div class="card empty">${ic('inbox',28)}<p style="margin:8px 0 0">বাঁ দিকের তালিকা থেকে একটা অভিযোগ বেছে নিন।</p></div>`;return}
    const mine=role==='officer'&&c.officer===R().who, canAct=can.allComplaints()||mine;
    const revealed=sessionStorage.getItem('rv-'+c.id)==='1'&&mine;
    const piiHtml=c.pii===null?`<div class="pii"><span class="lock">${ic('lock')}</span><span><b>বেনামী অভিযোগ।</b> নাম ও নম্বর নেই, তাই SMS যাবে না।</span></div>`
      :c.pii==='demo'?`<div class="pii"><span class="lock">${ic('lock')}</span><span>এই ব্রাউজারে পাবলিক সাইট থেকে জমা হয়েছে। ডেমোতে নাম ও নম্বর সংরক্ষণ করা হয় না।</span></div>`
      :revealed?`<div class="pii"><span>${ic('eye')}</span><span><b>${esc(c.pii.name)}</b> · ${esc(c.pii.phone)}</span><span class="muted" style="font-size:13px;margin-left:auto">দেখা অডিট লগে রেকর্ড হয়েছে</span></div>`
      :mine?`<div class="pii"><span class="lock">${ic('lock')}</span><span>নাম ও নম্বর encrypted অবস্থায় আছে।</span><button class="btn btn-g btn-s" id="rv" style="margin-left:auto">${ic('eye')}দেখুন (লগ হবে)</button></div>`
      :`<div class="pii"><span class="lock">${ic('lock')}</span><span>নাম ও নম্বর শুধু দায়িত্বপ্রাপ্ত কর্মকর্তা${c.officer?' ('+esc(c.officer)+')':''} দেখতে পারেন।${role==='super'?' Super Admin-ও দেখতে পারেন না।':''}</span></div>`;
    const officers=PL.team.filter(t=>t.role==='officer');
    const tpl={verify:'আপনার অভিযোগ {id} যাচাই করা হচ্ছে। - নদীপুর-৩ এলাকা অফিস',progress:'আপনার অভিযোগ {id} সংশ্লিষ্ট দপ্তরে পাঠানো হয়েছে, কাজ চলছে।',solved:'আপনার অভিযোগ {id}-এর সমাধান হয়েছে। মতামত দিন: jonoprotinidhi.example/f/{id}',closed:'আপনার অভিযোগ {id} বন্ধ করা হয়েছে। ধন্যবাদ।',new:'আপনার অভিযোগ {id} গ্রহণ করা হয়েছে।'};
    box.innerHTML=`<div class="card">
      <div class="sec-t" style="margin-bottom:6px"><span class="muted num" style="font-size:13.5px">${esc(c.id)} · ${esc(c.channel)}</span>${pill(...CST[c.st])}</div>
      <h2 class="h2" style="font-size:1.3rem">${esc(c.title)}</h2>
      <dl class="dl" style="margin:12px 0 14px"><dt>বিষয়</dt><dd>${esc(c.cat)}</dd><dt>এলাকা</dt><dd>${esc(c.union)}, ${U[c.upz]?U[c.upz].short:''}</dd><dt>গৃহীত</dt><dd>${bnDate(c.date)} · ${bn(daysAgo(c.date))} দিন আগে</dd><dt>দায়িত্বে</dt><dd>${c.officer?esc(c.officer):'<span class="muted">এখনো কাউকে দেওয়া হয়নি</span>'}</dd></dl>
      ${piiHtml}
      ${canAct?`<div class="frow" style="margin-top:16px">
        <div class="field"><label for="cs">অবস্থা</label><select id="cs">${Object.entries(CST).map(([k,[t]])=>`<option value="${k}"${k===c.st?' selected':''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label for="co">দায়িত্ব দিন</label><select id="co"${can.allComplaints()?'':' disabled'}><option value="">—</option>${officers.map(o=>`<option${o.name===c.officer?' selected':''}>${o.name}</option>`).join('')}</select></div></div>
        <div class="field" style="margin-top:12px"><label for="cn">ভেতরের নোট (নাগরিক দেখবেন না)</label><textarea id="cn" maxlength="600" style="min-height:70px" placeholder="যেমন: উপজেলা প্রকৌশলীর সাথে কথা হয়েছে, আগামী সপ্তাহে কাজ শুরু"></textarea></div>
        <div class="form-foot"><button class="btn btn-p" id="csave">সংরক্ষণ করুন</button><button class="btn btn-g" id="csms"${c.pii===null||c.pii==='demo'?' disabled title="বেনামী অভিযোগে SMS যায় না"':''}>${ic('send')}নাগরিককে SMS</button></div>`:`<p class="note" style="margin-top:14px">এই অভিযোগ আপনাকে দেওয়া হয়নি, তাই শুধু দেখতে পারবেন।</p>`}
      ${c.notes.length?`<h3 class="h2" style="font-size:1rem;margin:18px 0 8px">ভেতরের নোট</h3><ul class="list">${c.notes.map(n=>`<li><span class="dot"></span><div>${esc(n.text)}<small>${esc(n.who)} · ${esc(n.when)}</small></div></li>`).join('')}</ul>`:''}
      ${c.sms.length?`<h3 class="h2" style="font-size:1rem;margin:18px 0 8px">পাঠানো SMS</h3><ul class="list">${c.sms.map(n=>`<li><span class="dot"></span><div>${esc(n.text)}<small>${esc(n.when)}</small></div></li>`).join('')}</ul>`:''}
      ${c.trail.length?`<h3 class="h2" style="font-size:1rem;margin:18px 0 8px">কার্যক্রম</h3><ol class="tline">${c.trail.map(t=>`<li class="done"><b>${esc(t.what)}</b><small>${esc(t.who)} · ${esc(t.when)}</small></li>`).join('')}</ol>`:''}
    </div>`;
    if($('#rv'))$('#rv').addEventListener('click',()=>dialog({title:'নাগরিকের পরিচয় দেখবেন?',ok:'দেখুন',body:`<p style="margin:0">শুধু অভিযোগের কাজে ব্যবহার করবেন। প্রচারণা বা অন্য কাজে ব্যবহার নিষেধ। আপনি যে দেখেছেন, সেটা সময়সহ অডিট লগে রেকর্ড হবে।</p>`,
      onOk:()=>{sessionStorage.setItem('rv-'+c.id,'1');log('নাগরিকের নাম ও নম্বর দেখেছেন',c.id);detail(c.id)}}));
    if($('#csave'))$('#csave').addEventListener('click',()=>{
      const st=$('#cs').value,of=$('#co').value||null,note=$('#cn').value.trim(),now=new Date(),when=bnDate(now)+', '+bnTime(now);
      if(st===c.st&&of===c.officer&&!note){toast('কিছু বদলানো হয়নি');return}
      saveCmp(c.id,s=>{s.trail=s.trail||[];if(st!==c.st){s.st=st;s.trail.push({what:'অবস্থা: '+CST[st][0],who:R().who,when});log('অভিযোগের অবস্থা বদলেছেন: '+CST[st][0],c.id)}
        if(of!==c.officer){s.officer=of;s.trail.push({what:'দায়িত্ব: '+(of||'কেউ না'),who:R().who,when});log('অভিযোগের দায়িত্ব দিয়েছেন: '+(of||'—'),c.id)}
        if(note){s.notes=[...(s.notes||[]),{text:note,who:R().who,when}]}});
      toast(st!==c.st&&c.pii&&c.pii!=='demo'?'সংরক্ষণ হয়েছে। নাগরিক অবস্থা বদলের SMS পাবেন (ডেমোতে যায় না)।':'সংরক্ষণ হয়েছে');sh.renderNav();render();detail(c.id);
    });
    if($('#csms')&&!$('#csms').disabled)$('#csms').addEventListener('click',()=>{const txt=(tpl[c.st]||tpl.new).replace(/\{id\}/g,c.id);
      dialog({title:'নাগরিককে SMS',ok:'পাঠান',body:`<div class="field"><label for="st">বার্তা</label><textarea id="st" maxlength="300" style="min-height:90px">${esc(txt)}</textarea><p class="hint" id="stc"></p></div><p class="muted" style="font-size:13px;margin:8px 0 0">নম্বর আপনি দেখবেন না, সিস্টেম নিজে পাঠাবে। প্রেরক: NADIPUR3</p>`,
        onOk:d=>{const v=$('#st',d).value.trim();if(!v)return false;const now=new Date();saveCmp(c.id,s=>{s.sms=[...(s.sms||[]),{text:v,when:bnDate(now)+', '+bnTime(now)}]});log('নাগরিককে SMS পাঠিয়েছেন',c.id);toast('SMS পাঠানো হয়েছে (ডেমো)');detail(c.id)}});
      const t=$('#st'),c2=$('#stc'),upd=()=>c2.textContent=bn(t.value.length)+' অক্ষর · বাংলায় '+bn(Math.ceil(t.value.length/67)||1)+'টি SMS';t.addEventListener('input',upd);upd()});
  };
  $('#cf').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;f=b.dataset.k;sessionStorage.setItem('cf',f);$$('#cf .chip').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));render()});
  if($('#cu'))$('#cu').addEventListener('change',e=>{u=e.target.value;render()});
  $('#cq').addEventListener('input',e=>{q=e.target.value.trim();render()});
  if($('#csv'))$('#csv').addEventListener('click',()=>{
    const rows=[['আইডি','তারিখ','মাধ্যম','বিষয়','উপজেলা','ইউনিয়ন','অবস্থা','দায়িত্বে','দিন']].concat(list().map(c=>[c.id,bnDate(c.date),c.channel,c.cat,U[c.upz]?U[c.upz].short:'',c.union,CST[c.st][0],c.officer||'',bn(daysAgo(c.date))]));
    const csv='﻿'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='ndp3-complaints-report.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    log('অভিযোগের রিপোর্ট (CSV) নামিয়েছেন','নাম ও নম্বর ছাড়া');toast('রিপোর্ট নামানো হয়েছে। এতে নাগরিকের নাম বা নম্বর নেই।');
  });
  render();detail(selId);
  return {crumb:'অভিযোগ'};
}

/* ---------- promises ---------- */
const PSTAT={done:['সম্পন্ন','ok'],ongoing:['চলমান','warn'],late:['বিলম্বিত','bad'],plan:['শুরু হয়নি','plain']};
function promisesView(){
  const L=promises();
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">প্রতিশ্রুতি</p><h1>প্রতিশ্রুতির হালনাগাদ</h1><p class="sub">অগ্রগতি, অবস্থা আর নতুন হালনাগাদ দিন। বিলম্বিত হলে কারণ লেখা বাধ্যতামূলক, কারণ সেটা পাবলিক সাইটে দেখায়।</p></div>
    <div class="acts"><a class="btn btn-g" href="../demo-mp/promises.html" target="_blank" rel="noopener">${ic('ext')}সাইটে দেখুন</a></div></div>
  ${S.sectors.map(([sk,t])=>`<div class="card"><h2 class="h2" style="margin-bottom:10px">${t}</h2><div class="tbl-wrap" style="border:0"><table class="tbl"><thead><tr><th>প্রকল্প</th><th>বাজেট</th><th style="min-width:130px">অগ্রগতি</th><th>অবস্থা</th><th></th></tr></thead><tbody>
    ${L.filter(p=>p.sec===sk).map(p=>`<tr><td><b>${esc(p.name)}</b><small>${esc(p.due)}${p.updates&&p.updates[0]?' · শেষ হালনাগাদ: '+esc(p.updates[0][0]):''}</small></td><td>${esc(p.budget)}</td><td><div class="meter${p.st==='done'?' ok':p.st==='late'?' bad':''}"><i style="width:${p.pct}%"></i></div><small class="num">${bn(p.pct)}%</small></td><td>${pill(...PSTAT[p.st])}</td><td><button class="btn btn-g btn-s" data-p="${p.i}">হালনাগাদ</button></td></tr>`).join('')}
  </tbody></table></div></div>`).join('')}`;
  $$('[data-p]').forEach(b=>b.addEventListener('click',()=>{
    const p=promises()[+b.dataset.p];
    dialog({title:'হালনাগাদ: '+esc(p.name),ok:'সংরক্ষণ ও প্রকাশ',
      body:`<div class="form"><div class="field"><label for="pp">অগ্রগতি: <b id="ppv">${bn(p.pct)}%</b></label><input type="range" id="pp" min="0" max="100" step="1" value="${p.pct}"></div>
        <div class="field"><label for="ps">অবস্থা</label><select id="ps">${Object.entries(PSTAT).map(([k,[t]])=>`<option value="${k}"${k===p.st?' selected':''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label for="pu">নতুন হালনাগাদ (পাবলিক সাইটে দেখাবে)</label><input type="text" id="pu" maxlength="140" placeholder="যেমন: ৮.৫ কিমি অংশের কার্পেটিং শেষ"></div>
        <div class="field" id="pnF"${p.st==='late'?'':' hidden'}><label for="pn">দেরির কারণ ও নতুন লক্ষ্য <span class="req">*</span></label><textarea id="pn" maxlength="300" style="min-height:80px">${esc(p.note||'')}</textarea></div><p class="err" id="perr" hidden></p></div>`,
      onOk:d=>{const pct=+$('#pp',d).value,st=$('#ps',d).value,up=$('#pu',d).value.trim(),note=$('#pn',d).value.trim();
        if(st==='late'&&note.length<10){const e=$('#perr',d);e.textContent='বিলম্বিত প্রকল্পে দেরির কারণ লিখুন।';e.hidden=false;return false}
        if(st==='done'&&pct<100){const e=$('#perr',d);e.textContent='সম্পন্ন হলে অগ্রগতি ১০০% দিন।';e.hidden=false;return false}
        const ups=up?[[bnDate(new Date()),up],...(p.updates||[])]:(p.updates||[]);
        saveCms(c=>{c.promiseEdits=c.promiseEdits||{};c.promiseEdits[p.i]={pct,st,updates:ups,note:st==='late'?note:''}});
        log('প্রতিশ্রুতির অগ্রগতি হালনাগাদ করেছেন ('+bn(p.pct)+'% → '+bn(pct)+'%)',p.name);toast('হালনাগাদ হয়েছে, পাবলিক সাইটে দেখা যাচ্ছে');promisesView()}});
    const r=$('dialog #pp');r.addEventListener('input',()=>{$('dialog #ppv').textContent=bn(r.value)+'%'});
    $('dialog #ps').addEventListener('change',e=>{$('dialog #pnF').hidden=e.target.value!=='late';if(e.target.value==='done'){r.value=100;$('dialog #ppv').textContent='১০০%'}});
  }));
  return {crumb:'প্রতিশ্রুতি'};
}

/* ---------- site builder ---------- */
const SECTIONS=[['stats','সংখ্যায় কাজ'],['about','পরিচিতি'],['activities','সাম্প্রতিক কাজ'],['office','সংসদে (ব্যানার)'],['promises','প্রতিশ্রুতির হিসাব'],['area','নির্বাচনী এলাকা'],['gallery','গ্যালারি'],['events','আসন্ন কর্মসূচি'],['cta','অভিযোগ বক্সের লিংক']];
const ACCENTS={brass:['পিতল (ডিফল্ট)','#C7A35A','#E2C88E','#8A6A28'],river:['নদী-নীল','#6E9CB4','#A9CBDD','#2F5C73'],maroon:['মেরুন','#B06A5F','#DDA79D','#6E2F29']};
function siteView(){
  const c=cms();
  let banners=(c.banners||S.banners).map(b=>({...b}));
  let secs=(c.sections||SECTIONS.map(([k])=>({key:k,on:true}))).map(s=>({...s}));
  const imgKeys=Object.keys(S.img).filter(k=>S.img[k].src);
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">সাইট</p><h1>ব্যানার ও হোমপেজ</h1><p class="sub">ব্যানার, স্লোগান, হোমপেজের অংশগুলোর ক্রম আর রং। সংরক্ষণ করলেই পাবলিক সাইটে দেখা যাবে।</p></div>
    <div class="acts"><a class="btn btn-g" href="../demo-mp/index.html" target="_blank" rel="noopener">${ic('ext')}সাইটে দেখুন</a><button class="btn btn-b" id="save">${ic('check')}সংরক্ষণ ও প্রকাশ</button></div></div>
  <div class="grid g2">
    <div class="stack">
      <div class="card"><h2 class="h2" style="margin-bottom:12px">স্লোগান</h2><div class="field"><label class="sr" for="slg">স্লোগান</label><input type="text" id="slg" maxlength="90" value="${esc(c.slogan||S.mp.slogan)}"><p class="hint">হোমপেজে নামের নিচে দেখায়। ছোট আর সত্যি রাখুন।</p></div></div>
      <div class="card"><h2 class="h2" style="margin-bottom:6px">ব্যানার স্লাইডশো</h2><p class="muted" style="margin:0 0 12px;font-size:14px">তীর দিয়ে ক্রম বদলান। প্রথমটা আগে দেখাবে।</p><div class="rows" id="bn"></div></div>
      <div class="card"><h2 class="h2" style="margin-bottom:12px">রং</h2><div class="swatches">${Object.entries(ACCENTS).map(([k,a])=>`<label><input type="radio" name="acc" value="${k}"${(c.accent||'brass')===k?' checked':''}><i style="background:${a[1]}"></i>${a[0]}</label>`).join('')}</div><p class="hint" style="margin-top:8px">পুরো সাইটে একটাই accent রং থাকে। দলীয় রং ব্যবহারের আগে অফিসের নীতি দেখুন।</p></div>
    </div>
    <div class="card"><h2 class="h2" style="margin-bottom:6px">হোমপেজের অংশ</h2><p class="muted" style="margin:0 0 12px;font-size:14px">সুইচ দিয়ে চালু/বন্ধ, তীর দিয়ে ক্রম। প্রধান ব্যানার সবসময় সবার ওপরে থাকে।</p><div class="rows" id="sc"></div></div>
  </div>`;
  const grip=(i,n,kind)=>`<div class="grip"><button type="button" data-${kind}="${i}" data-d="-1" aria-label="ওপরে" ${i===0?'disabled':''}>${ic('up')}</button><button type="button" data-${kind}="${i}" data-d="1" aria-label="নিচে" ${i===n-1?'disabled':''}>${ic('down')}</button></div>`;
  const rb=()=>{$('#bn').innerHTML=banners.map((b,i)=>`<div class="rowi">${grip(i,banners.length,'bm')}<img src="${S.img[b.img]&&S.img[b.img].src||''}" alt=""><div class="grow"><select data-bi="${i}" aria-label="ছবি" style="margin-bottom:6px;padding:6px 8px;font-size:13.5px">${imgKeys.map(k=>`<option value="${k}"${k===b.img?' selected':''}>${esc((S.img[k].credit||k).split(' · ')[0])}</option>`).join('')}</select><input type="text" data-bc="${i}" maxlength="80" value="${esc(b.cap)}" aria-label="ক্যাপশন" style="padding:6px 8px;font-size:13.5px"></div></div>`).join('');
    $$('[data-bm]').forEach(x=>x.addEventListener('click',()=>{const i=+x.dataset.bm,j=i+(+x.dataset.d);[banners[i],banners[j]]=[banners[j],banners[i]];rb()}));
    $$('[data-bi]').forEach(x=>x.addEventListener('change',()=>{banners[+x.dataset.bi].img=x.value;rb()}));
    $$('[data-bc]').forEach(x=>x.addEventListener('input',()=>{banners[+x.dataset.bc].cap=x.value}))};
  const rs=()=>{$('#sc').innerHTML=`<div class="rowi"><div class="grip" style="visibility:hidden"><button disabled></button></div><div class="grow"><b>প্রধান ব্যানার</b></div><span class="tag">সবসময় চালু</span></div>`+secs.map((s,i)=>`<div class="rowi${s.on?'':' off'}">${grip(i,secs.length,'sm')}<div class="grow"><b>${(SECTIONS.find(x=>x[0]===s.key)||[,s.key])[1]}</b></div><label class="switch"><input type="checkbox" data-so="${i}"${s.on?' checked':''} aria-label="চালু/বন্ধ"><span></span></label></div>`).join('');
    $$('[data-sm]').forEach(x=>x.addEventListener('click',()=>{const i=+x.dataset.sm,j=i+(+x.dataset.d);[secs[i],secs[j]]=[secs[j],secs[i]];rs()}));
    $$('[data-so]').forEach(x=>x.addEventListener('change',()=>{secs[+x.dataset.so].on=x.checked;rs()}))};
  rb();rs();
  $('#save').addEventListener('click',()=>{
    const slg=$('#slg').value.trim()||S.mp.slogan,acc=$('input[name=acc]:checked').value;
    saveCms(c=>{c.slogan=slg;c.banners=banners.map(b=>({img:b.img,cap:b.cap.trim()}));c.bannersRev=S.rev;c.sections=secs;c.accent=acc;c.accentColors=ACCENTS[acc].slice(1)});
    log('হোমপেজ হালনাগাদ করেছেন (ব্যানার, অংশ, রং, স্লোগান)','হোমপেজ');toast('সংরক্ষণ হয়েছে, পাবলিক সাইটে দেখা যাচ্ছে');
  });
  return {crumb:'ব্যানার ও হোমপেজ'};
}

/* ---------- settings ---------- */
function settingsView(){
  let cats=[...(cms().complaintCats||S.complaintCats)];
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">সেটিংস</p><h1>সাইট ও অভিযোগ বক্সের সেটিংস</h1><p class="sub">ডোমেইন, হোস্টিং আর ব্যাকআপ প্ল্যাটফর্ম টিম দেখে। এখানে শুধু অফিসের নিজের সেটিংস।</p></div></div>
  <div class="grid g2">
    <div class="card"><h2 class="h2" style="margin-bottom:6px">অভিযোগের বিষয়</h2><p class="muted" style="margin:0 0 12px;font-size:14px">নাগরিক ফর্মে এই তালিকা দেখাবে।</p><div class="rows" id="cl"></div>
      <div class="bar" style="margin:12px 0 0"><input type="text" id="nc" class="grow" maxlength="40" placeholder="নতুন বিষয়" aria-label="নতুন বিষয়"><button class="btn btn-g" id="addc">${ic('plus')}যোগ করুন</button></div></div>
    <div class="stack"><div class="card"><h2 class="h2" style="margin-bottom:12px">অভিযোগ বক্স</h2><div class="form">
      <label class="check"><input type="checkbox" id="otp"${cms().otpRequired?' checked':''}><span>মোবাইল নম্বর OTP দিয়ে যাচাই বাধ্যতামূলক<small class="muted" style="display:block">বন্ধ থাকলে OTP ঐচ্ছিক; বেনামী অভিযোগ সবসময় চলবে।</small></span></label>
      <div class="field"><label for="sla">লক্ষ্য: কত দিনে নিষ্পত্তি</label><div class="suffix" style="max-width:200px"><input type="number" id="sla" min="1" max="30" value="${cms().slaDays||7}"><span>দিন</span></div></div>
      <div class="field"><span class="lab">SMS প্রেরকের নাম</span><input type="text" value="NADIPUR3" disabled><p class="hint">SMS gateway-র অনুমোদিত নাম; বদলাতে প্ল্যাটফর্ম টিমকে জানান।</p></div></div></div>
      <div class="card"><h2 class="h2" style="margin-bottom:10px">সাইটের ঠিকানা</h2><dl class="dl"><dt>প্রধান</dt><dd>tahmina-noor.example</dd><dt>সাবডোমেইন</dt><dd>ndp3.jonoprotinidhi.example</dd><dt>SSL</dt><dd>${pill('সক্রিয়','ok')}</dd></dl></div></div>
  </div>
  <div class="form-foot" style="margin-top:16px"><button class="btn btn-b" id="ss">${ic('check')}সংরক্ষণ করুন</button></div>`;
  const rc=()=>{$('#cl').innerHTML=cats.map((t,i)=>`<div class="rowi"><div class="grow">${esc(t)}</div><button class="x" data-rm="${i}" aria-label="${esc(t)} মুছুন">${ic('x')}</button></div>`).join('');$$('[data-rm]').forEach(b=>b.addEventListener('click',()=>{if(cats.length<=2){toast('অন্তত দুটো বিষয় রাখতে হবে');return}cats.splice(+b.dataset.rm,1);rc()}))};
  rc();
  $('#addc').addEventListener('click',()=>{const v=$('#nc').value.trim();if(!v||cats.includes(v))return;cats.splice(cats.length-1,0,v);$('#nc').value='';rc()});
  $('#ss').addEventListener('click',()=>{saveCms(c=>{c.complaintCats=cats;c.otpRequired=$('#otp').checked;c.slaDays=Math.max(1,Math.min(30,+$('#sla').value||7))});log('অভিযোগ বক্সের সেটিংস বদলেছেন','বিষয়ের তালিকা, OTP, SLA');toast('সংরক্ষণ হয়েছে')});
  return {crumb:'সেটিংস'};
}

/* ---------- team, audit ---------- */
function teamView(){
  const added=cms().team||[];
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">অফিস</p><h1>টিম ও ভূমিকা</h1><p class="sub">প্রত্যেকে শুধু নিজের কাজের অংশ দেখেন। অভিযোগ কর্মকর্তা শুধু নিজের উপজেলার অভিযোগ দেখেন। সবার 2FA বাধ্যতামূলক।</p></div>
    <div class="acts"><button class="btn btn-b" id="inv">${ic('plus')}সদস্য যোগ করুন</button></div></div>
  <div class="grid g21"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>নাম</th><th>ভূমিকা</th><th>2FA</th><th>শেষ লগইন</th></tr></thead><tbody>
    ${[...PL.team,...added].map(t=>`<tr><td><b>${esc(t.name)}</b><small>${esc(t.phone)}</small></td><td>${esc(t.roleT)}</td><td>${t.tfa?pill('চালু','ok'):pill(t.pending?'আমন্ত্রণ পাঠানো':'চালু করা বাকি','warn')}</td><td>${esc(t.last||'—')}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="card"><h2 class="h2" style="margin-bottom:10px">কে কী পারেন</h2><table class="tbl" style="font-size:13.5px"><thead><tr><th>কাজ</th><th>MP</th><th>PR</th><th>কর্মকর্তা</th></tr></thead><tbody>
    ${[['পোস্ট লেখা','✓','✓','—'],['প্রকাশ / অনুমোদন','✓','—','—'],['ব্যানার ও হোমপেজ','✓','—','—'],['প্রতিশ্রুতি হালনাগাদ','✓','—','—'],['সব অভিযোগ দেখা','✓','—','নিজ উপজেলা'],['নাগরিকের নাম/নম্বর','—','—','শুধু নিজেকে দেওয়া'],['টিম পরিচালনা','✓','—','—']].map(r=>`<tr><td>${r[0]}</td>${r.slice(1).map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div></div>`;
  $('#inv').addEventListener('click',()=>dialog({title:'নতুন সদস্য',ok:'আমন্ত্রণ পাঠান',
    body:`<div class="form"><div class="field"><label for="tn">নাম <span class="req">*</span></label><input type="text" id="tn" maxlength="60"></div><div class="field"><label for="tp">মোবাইল <span class="req">*</span></label><input type="tel" id="tp" inputmode="numeric" maxlength="16" placeholder="০১XXXXXXXXX"></div>
      <div class="field"><label for="tr">ভূমিকা</label><select id="tr"><option value="pr">PR / কনটেন্ট এডিটর</option>${Object.entries(U).map(([k,u])=>`<option value="officer-${k}">অভিযোগ কর্মকর্তা · ${u.short}</option>`).join('')}</select></div><p class="err" id="te" hidden></p></div>`,
    onOk:d=>{const n=$('#tn',d).value.trim(),ph=toEn($('#tp',d).value).replace(/[\s-]/g,'').replace(/^\+?88/,''),r=$('#tr',d).value;
      if(n.length<3||!/^01[3-9]\d{8}$/.test(ph)){const e=$('#te',d);e.textContent='নাম আর সঠিক মোবাইল নম্বর দিন।';e.hidden=false;return false}
      const roleT=r==='pr'?'PR / কনটেন্ট এডিটর':'অভিযোগ কর্মকর্তা · '+U[r.split('-')[1]].short;
      saveCms(c=>{c.team=[...(c.team||[]),{name:n,phone:bn(ph.slice(0,5))+'-'+bn(ph.slice(5)),roleT,tfa:false,pending:true,last:'—'}]});
      log('নতুন সদস্য আমন্ত্রণ করেছেন ('+roleT+')',n);toast('আমন্ত্রণ SMS পাঠানো হয়েছে (ডেমো)। প্রথম লগইনে 2FA সেটআপ করতে হবে।');teamView()}}));
  return {crumb:'টিম ও ভূমিকা'};
}
function auditView(){
  const L=[...store.get(KEYS.audit,[]),...PL.seedAudit].filter(a=>a.tenant===TENANT);
  $('#view').innerHTML=`
  <div class="ph"><div><p class="kick">অফিস</p><h1>অডিট লগ</h1><p class="sub">এই সাইটে কে, কখন, কী বদলেছেন। প্ল্যাটফর্ম টিম (Super Admin) কিছু ঠিক করলে সেটাও এখানে দেখা যায়।</p></div></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>সময়</th><th>কে</th><th>কী করেছেন</th></tr></thead><tbody>
  ${L.map(a=>`<tr${a.sa?' style="background:#FBF3F1"':''}><td class="num" style="white-space:nowrap">${esc(a.when)}</td><td><b>${esc(a.actor)}</b><small>${esc(a.actorRole)}</small></td><td>${esc(a.action)}<small>${esc(a.target||'')}</small></td></tr>`).join('')}
  </tbody></table></div>`;
  return {crumb:'অডিট লগ'};
}

const guard=(ok,fn)=>(...a)=>ok()?fn(...a):($('#view').innerHTML=`<div class="card empty">${ic('lock',28)}<p style="margin:8px 0 0">আপনার ভূমিকায় (${R().t}) এই অংশ দেখা যায় না।</p></div>`,{crumb:'অনুমতি নেই'});
router([
  {re:/^\/$/,render:dashboard},
  {re:/^\/posts$/,render:guard(can.write,postsView)},
  {re:/^\/posts\/new$/,render:guard(can.write,()=>composer())},
  {re:/^\/posts\/([\w-]+)\/edit$/,render:guard(can.write,composer)},
  {re:/^\/posts\/([\w-]+)$/,render:guard(can.write,postDetail)},
  {re:/^\/approvals$/,render:guard(can.publish,approvals)},
  {re:/^\/complaints$/,render:guard(can.complaints,()=>complaintsView(null))},
  {re:/^\/complaints\/([\w-]+)$/,render:guard(can.complaints,complaintsView)},
  {re:/^\/promises$/,render:guard(can.promises,promisesView)},
  {re:/^\/site$/,render:guard(can.site,siteView)},
  {re:/^\/settings$/,render:guard(can.site,settingsView)},
  {re:/^\/team$/,render:guard(can.team,teamView)},
  {re:/^\/audit$/,render:guard(can.team,auditView)}
],{crumbRoot:'নদীপুর-৩',notFound:()=>`<div class="card empty">পেজ পাওয়া যায়নি। <a href="#/">ড্যাশবোর্ডে ফিরুন</a></div>`});
})();
