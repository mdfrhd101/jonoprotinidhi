import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { toEn, MONTHS_BN } from '@jonoprotinidhi/shared';
import { loadConfig } from './config.js';
import { buildDeps } from './bootstrap.js';
import { createServices } from './services/index.js';
import { runInTenant } from './context.js';
import { Tenant, User, Membership, Post, PromiseItem, Complaint, SiteConfig, Domain, GalleryItem, VideoItem, EventItem } from './models/index.js';
import { seedSiteContent } from './seedContent.js';
import { ConsoleSmsProvider } from './lib/sms.js';

/* Dev seed: one super admin + the FICTIONAL demo MP (ড. তাহমিনা নূর, নদীপুর-৩) with the demo site's content.
   Everything goes through the real services, so seeded data obeys the same rules as production data.
   Credentials are written to apps/api/.seed-credentials.local (git-ignored); TOTP is enrolled at first login in the UI. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.resolve(HERE, '../../../client-demo/demo-mp/assets/data.js');

function loadDemo(): any {
  const ctx: any = { window: {} };
  vm.runInNewContext(fs.readFileSync(DEMO, 'utf8'), ctx);
  return ctx.window.SITE;
}
const bnToDate = (s: string): Date => {
  const m = /(\d+)\s+(\S+)\s+(\d{4})/.exec(toEn(s));
  const mon = m ? MONTHS_BN.indexOf(m[2] as never) : -1;
  return m && mon >= 0 ? new Date(Date.UTC(+m[3]!, mon, +m[1]!)) : new Date();
};
const UPZ: Record<string, string> = { charkandi: 'চরকান্দি', shalbagan: 'শালবাগান', notunhat: 'নতুনহাট' };

async function main() {
  const config = loadConfig();
  if (config.isProd) throw new Error('refusing to seed a production database');
  const deps = buildDeps(config);
  const sms = deps.smsProvider as ConsoleSmsProvider;
  await mongoose.connect(config.MONGODB_URI);
  if (process.env.SEED_RESET === '1') {
    const name = mongoose.connection.name;
    if (!/dev|test/i.test(name)) throw new Error(`SEED_RESET refuses to drop "${name}" (name must contain dev or test)`);
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    console.log(`dropped database ${name}`);
  }
  const s = createServices(deps);
  const S = loadDemo();
  const password = process.env.SEED_PASSWORD || `Jn-${randomBytes(6).toString('base64url')}-9`;

  // 1. super admin
  const email = (process.env.SEED_SUPER_EMAIL || 'admin@octagram.example').toLowerCase();
  let root = await User.findOne({ email });
  if (!root) root = await s.auth.createUser({ name: 'Super Admin', email, password, platformRole: 'super_admin' });

  // 2. demo tenant
  if (await Tenant.exists({ slug: 'ndp3' })) { console.log('tenant ndp3 already exists; nothing more to seed'); await mongoose.disconnect(); return; }
  const created = await s.tenants.create({ mpName: S.mp.name, mpTitle: S.mp.title, mpRole: 'mp', ministry: '', seatName: 'নদীপুর', seatNumber: 3, slug: 'ndp3', ownerPhone: '01700000010', plan: 'full', consent: { confirmed: true, documentRef: 'DEMO-কাল্পনিক-২০২৬' } }, root._id);
  const tenant = (await Tenant.findById(created.tenant._id).select('+dek.wrapped'))!;
  const tid = tenant._id;
  await s.auth.acceptInvite(created.inviteToken!, password);
  const owner = (await User.findOne({ phone: '+8801700000010' }))!;
  const invite = async (name: string, phone: string, role: 'editor' | 'officer', upazilas: string[] = []) => {
    const r = await s.team.invite(tenant, { name, phone, role, upazilas }, owner._id);
    await s.auth.acceptInvite(r.inviteToken!, password);
    return (await User.findOne({ phone: '+88' + phone }))!;
  };
  const editor = await invite('সাদিয়া আফরিন', '01700000011', 'editor');
  const officer = await invite('মো. কামরুল হাসান', '01700000012', 'officer', ['নতুনহাট']);
  await invite('রুবিনা ইয়াসমিন', '01700000013', 'officer', ['চরকান্দি', 'শালবাগান']);
  await s.tenants.setStatus(String(tid), 'live', 'ডেমো ডেটা প্রস্তুত', true);
  const actor = { userId: owner._id, name: owner.name, viaSuperAdmin: false };
  const ed = { userId: editor._id, name: editor.name, viaSuperAdmin: false };

  await runInTenant(tid, async () => {
    // 3. posts: editor writes, owner approves (the real workflow)
    for (const a of [...S.activities].reverse()) {
      const src = S.img[a.img]?.src as string | undefined;
      const post = await s.posts.create({
        title: a.title, summary: a.summary, body: a.body.join('\n\n'), quote: a.quote || '', category: a.k, upazila: UPZ[a.upz] ?? a.upz ?? '', place: a.place, eventDate: bnToDate(a.date).toISOString(),
        media: src ? [{ url: src, caption: a.title.slice(0, 100), credit: S.img[a.img].credit ?? '' }] : [],
      }, ed);
      await s.posts.submit(String(post._id), ed);
      await s.posts.approve(String(post._id), actor, { version: 2 });
    }
    // 4. promises
    let order = 0;
    for (const p of S.promises) {
      const doc = await s.promises.create({ sector: p.sec, name: p.name, place: p.place, budgetLabel: p.budget, targetLabel: p.due, pct: p.pct, status: p.st, delayReason: p.st === 'late' ? p.note : '', featured: !!p.home, order: order++ });
      for (const u of [...(p.updates ?? [])].reverse()) await s.promises.addUpdate(String(doc._id), { text: `${u[0]}: ${u[1]}` }, actor.name);
    }
    // 5. every site page, banners, events, gallery and videos (see seedContent.ts)
    await seedSiteContent(s, S, { owner: actor, editor: ed }, path.resolve(HERE, '../seed-assets'));
  });

  // 6. citizen complaints through the real public path (Turnstile dev mode, OTP optional)
  const cats = tenant.settings.complaintCategories;
  const samples: Array<[string, string, string, string]> = [
    ['charkandi', 'কাশবন', 'বাজারের সামনের রাস্তায় বড় গর্ত, রিকশা উল্টে যাচ্ছে', cats[0]!], ['notunhat', 'রসুলপুর', 'বিদ্যালয়ের সামনের কালভার্ট ভেঙে গেছে, শিশুদের যেতে ঝুঁকি', cats[0]!],
    ['shalbagan', 'বনগ্রাম', 'কমিউনিটি ক্লিনিকে সপ্তাহে দুই দিন স্বাস্থ্যকর্মী থাকেন না', cats[3]!], ['notunhat', 'মাঝিপাড়া', 'বয়স্ক ভাতার কার্ড হয়েছে কিন্তু টাকা আসছে না', cats[5]!],
    ['charkandi', 'দক্ষিণ চর', 'তিন দিন ধরে ট্রান্সফরমার নষ্ট, পুরো পাড়া অন্ধকার', cats[1]!], ['shalbagan', 'পলাশতলী', 'নলকূপের পানিতে আয়রন, খাওয়ার অযোগ্য', cats[2]!],
    ['notunhat', 'নতুনহাট পৌরসভা', 'পৌরসভার ড্রেন উপচে রাস্তায় ময়লা পানি জমে আছে', cats[2]!], ['charkandi', 'হাজীরচর', 'খেয়াঘাটে লাইফ জ্যাকেট নেই, ঝুঁকি নিয়ে পারাপার', cats[0]!],
    ['shalbagan', 'শিমুলিয়া', 'বিদ্যালয়ের টয়লেট ব্যবহারের অযোগ্য, মেয়েরা সমস্যায়', cats[4]!], ['notunhat', 'কাজলা', 'জমির নামজারিতে অতিরিক্ত টাকা চাওয়া হচ্ছে', cats[7]!],
  ];
  const ids: string[] = [];
  let n = 0;
  await runInTenant(tid, async () => {
    for (const [upz, union, description, category] of samples) {
      const anon = n % 5 === 4;
      const r = await s.complaints.submit(tenant, { category, upazila: UPZ[upz], union, description, anonymous: anon, name: anon ? '' : `নাগরিক ${n + 1}`, phone: anon ? '' : `0171000${String(1000 + n)}`, turnstileToken: 'seed' }, { ip: `10.0.0.${n + 1}` });
      ids.push(r.trackingId); n++;
    }
    const mk = { userId: String(owner._id), name: owner.name, role: 'owner', perms: ['complaints.manage', 'complaints.view_all', 'complaints.view_scoped'] as never, scope: [] as string[], viaSuperAdmin: false };
    const rows = await Complaint.find().sort({ createdAt: 1 });
    // assign the notunhat cases to the notunhat officer and move a few along
    for (const c of rows.filter((x) => x.upazila === 'নতুনহাট')) await s.complaints.patch(tenant, mk, String(c._id), { assignedTo: String(officer._id) });
    const first = rows.filter((x) => x.upazila === 'নতুনহাট')[0]!;
    for (const st of ['verify', 'progress', 'solved']) await s.complaints.patch(tenant, mk, String(first._id), { status: st });
    await s.complaints.patch(tenant, mk, String(rows[0]!._id), { status: 'verify' });
  });

  const out = path.resolve(HERE, '../.seed-credentials.local');
  fs.writeFileSync(out, `Local dev credentials (git-ignored). TOTP is enrolled on first login in the admin UI.\npassword (all accounts): ${password}\nsuper admin: ${email}\nMP owner: 01700000010\neditor (PR): 01700000011\nofficer Notunhat: 01700000012\nofficer Charkandi+Shalbagan: 01700000013\npublic site host: ndp3.${config.PLATFORM_DOMAIN}\n`, { mode: 0o600 });
  console.log(`seeded: ${await Post.countDocuments({ tenantId: tid })} posts, ${await GalleryItem.countDocuments({ tenantId: tid })} photos, ${await VideoItem.countDocuments({ tenantId: tid })} videos, ${await EventItem.countDocuments({ tenantId: tid })} events, ${await PromiseItem.countDocuments({ tenantId: tid })} promises, ${n} complaints, ${await Domain.countDocuments({ tenantId: tid })} domain, ${await Membership.countDocuments({ tenantId: tid })} team members (sms sent: ${sms.outbox.length})`);
  console.log(`credentials written to ${out}`);
  await mongoose.disconnect();
}
const tl = (e: any) => ({ year: e.yr, title: e.title, place: e.place ?? '', note: e.note ?? '' });
main().catch((e) => { console.error(e); process.exit(1); });
