import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { toEn, MONTHS_BN } from '@jonoprotinidhi/shared';
import type { Services } from './services/index.js';

/* Demo content for every editable part of the public site, for the FICTIONAL MP only (ড. তাহমিনা নূর, নদীপুর-৩).
   Everything is written through the real services (editor drafts, owner publishes) so the seed obeys production rules.
   YouTube samples are open-licence films from the Blender Foundation (CC BY) standing in for the office's own videos;
   the two uploaded clips in seed-assets/ are generated title cards. Nothing here may ever be used for a real politician. */

type Actor = { userId: unknown; name: string; viaSuperAdmin: boolean };
const who = (a: Actor, canPublish: boolean) => ({ ...a, canPublish });

const UPZ: Record<string, string> = { charkandi: 'চরকান্দি', shalbagan: 'শালবাগান', notunhat: 'নতুনহাট' };
const monthDate = (d: string, m: string, year = 2026) => {
  const mon = MONTHS_BN.indexOf(m as never);
  return new Date(Date.UTC(year, mon >= 0 ? mon : 9, Number(toEn(d)) || 1, 4, 0));
};
const tl = (e: any) => ({ year: e.yr, title: e.title, place: e.place ?? '', note: e.note ?? '' });

export async function seedSiteContent(s: Services, S: any, people: { owner: Actor; editor: Actor }, assetsDir: string) {
  const owner = who(people.owner, true), editor = who(people.editor, false);
  const M = S.mp, A = S.about, img = (k: string) => S.img[k]?.src as string, credit = (k: string) => (S.img[k]?.credit ?? '') as string;
  const page = async (key: string, data: object) => { await s.pages.put(key, data, editor); await s.pages.publish(key, owner); };

  /* ---- the MP's own photos (owner-supplied AI-generated images of the fictional MP), uploaded through the real pipeline ---- */
  const AI = 'AI-নির্মিত কাল্পনিক ছবি (ডেমো)';
  const upload = async (file: string) => {
    const f = path.join(assetsDir, file);
    return fs.existsSync(f) ? (await s.media.upload(fs.readFileSync(f), { name: file, credit: AI }, people.editor)).url : '';
  };
  const mpPhoto = await upload('mp-hero.jpg'), mpOpen = await upload('mp-inauguration.jpg'), mpFood = await upload('mp-food-aid.jpg');

  /* ---- hero banners + section order (site config, owner) ---- */
  const own = [
    mpPhoto && { url: mpPhoto, caption: `জাতীয় সংসদ ভবন প্রাঙ্গণে · ${AI}`, title: M.name, subtitle: M.slogan, ctaLabel: 'অভিযোগ জানান', ctaHref: '/complaint' },
    mpOpen && { url: mpOpen, caption: `কমিউনিটি খাদ্য কেন্দ্র উদ্বোধন · ${AI}`, title: 'কমিউনিটি খাদ্য কেন্দ্র চালু', subtitle: 'নিম্ন আয়ের পরিবারের জন্য প্রতিদিন স্বল্পমূল্যে রান্না করা খাবার', ctaLabel: 'কার্যক্রম দেখুন', ctaHref: '/activities' },
    mpFood && { url: mpFood, caption: `খাদ্য সহায়তা কর্মসূচিতে খাবার বিতরণ · ${AI}`, title: 'খাদ্য সহায়তা কর্মসূচি', subtitle: 'বন্যা-পরবর্তী সময়ে ১,২০০ পরিবারের কাছে রান্না করা খাবার', ctaLabel: 'ছবিতে দেখুন', ctaHref: '/gallery' },
  ].filter(Boolean) as object[];
  await s.site.putSiteConfig({
    slogan: M.slogan, accent: 'brass',
    banners: own.length ? own : [
      { url: img('hero'), caption: S.banners[0].cap, title: M.name, subtitle: M.slogan, ctaLabel: 'অভিযোগ জানান', ctaHref: '/complaint' },
      { url: img('road'), caption: 'চরকান্দি–নতুনহাট সংযোগ সড়ক', title: 'চরকান্দি–নতুনহাট সংযোগ সড়ক চালু', subtitle: '৬.২ কিমি অংশে যান চলাচল শুরু', ctaLabel: 'খবরটি পড়ুন', ctaHref: '/activities' },
    ],
    sections: ['stats', 'about', 'activities', 'office', 'promises', 'area', 'gallery', 'videos', 'events', 'cta'].map((key) => ({ key, on: true })),
  }, people.owner.userId);
  const HERO_CREDIT = AI;

  /* ---- pages ---- */
  await page('layout', {
    tagline: M.slogan,
    notice: { on: true, text: 'শুক্রবার ২ অক্টোবর সকাল ১০টায় চরকান্দিতে গণশুনানি, সবাই আমন্ত্রিত', link: '/contact' },
    footerAbout: `${M.title}। ${M.roleLine}`,
    footerNote: 'এটি জনপ্রতিনিধি প্ল্যাটফর্মের ডেমো সাইট। নাম, আসন, সংখ্যা ও ঘটনা সবই কাল্পনিক।',
    photoCredit: 'ছবি: উইকিমিডিয়া কমন্স (প্রতিটি ছবির নিচে লাইসেন্স ও আলোকচিত্রীর নাম দেওয়া আছে)। নমুনা ভিডিও: Blender Foundation, CC BY।',
    copyright: '© ২০২৬ সংসদ সদস্যের কার্যালয়, নদীপুর-৩',
    social: [
      { kind: 'facebook', label: 'ফেসবুক পেজ', url: 'https://www.facebook.com/' },
      { kind: 'youtube', label: 'ইউটিউব চ্যানেল', url: 'https://www.youtube.com/' },
      { kind: 'email', label: 'ইমেইল', url: 'mailto:office@tahmina-noor.example' },
      { kind: 'phone', label: 'হটলাইন', url: 'tel:+8801700000002' },
    ],
  });

  const sec = (kicker: string, title: string, intro = '') => ({ kicker, title, intro });
  await page('home', {
    hero: { kicker: M.title, note: M.roleLine },
    stats: S.stats.map((x: any) => ({ n: String(x.n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]!), unit: x.unit, label: x.label })),
    statsTitle: 'ছয় মাসের কাজের হিসাব', statsNote: S.statsNote,
    sections: {
      about: sec('পরিচিতি', A.headline, A.intro),
      office: sec('দায়িত্ব', 'সংসদে চরাঞ্চলের কণ্ঠস্বর', 'স্বাস্থ্য ও পরিবার কল্যাণ মন্ত্রণালয় সম্পর্কিত স্থায়ী কমিটিতে চরাঞ্চলের মা ও শিশুর স্বাস্থ্যের কথা নিয়মিত তুলে ধরছেন।'),
      activities: sec('কার্যক্রম', 'সাম্প্রতিক কাজ', 'মাঠে, সংসদে আর মানুষের পাশে: প্রতিটি কাজের ছবি ও বিবরণ।'),
      promises: sec('উন্নয়ন ও প্রতিশ্রুতি', 'নির্বাচনী প্রতিশ্রুতির হিসাব', 'প্রতিটি প্রতিশ্রুতির বাজেট, অগ্রগতি আর দেরি হলে তার কারণ।'),
      area: sec('নির্বাচনী এলাকা', `${M.seat} আসন`, '৩টি উপজেলা · ১৮টি ইউনিয়ন ও ১টি পৌরসভা'),
      gallery: sec('গ্যালারি', 'ছবিতে কাজের খবর', 'সাম্প্রতিক কর্মসূচির বাছাই করা ছবি।'),
      videos: sec('ভিডিও', 'বক্তব্য, গণশুনানি ও সাক্ষাৎকার', 'সংসদের বক্তব্য থেকে মাঠের কর্মসূচি, সব ভিডিও এক জায়গায়।'),
      events: sec('দেখা করুন', 'আসন্ন কর্মসূচি', 'যেকোনো কর্মসূচিতে এসে সরাসরি কথা বলতে পারেন।'),
    },
    complaintCta: { title: 'আপনার সমস্যা সরাসরি জানান', text: 'প্রতিটি অভিযোগ ট্র্যাকিং আইডিসহ নথিভুক্ত হয়। আপনার নাম, নম্বর, জন্মতারিখ ও NID শুধু দায়িত্বপ্রাপ্ত কর্মকর্তা দেখতে পান।', button: 'অভিযোগ করুন' },
  });

  await page('profile', {
    headline: A.headline, intro: A.intro, roleLine: M.roleLine,
    portrait: { url: mpPhoto, credit: mpPhoto ? HERO_CREDIT : '' },
    story: A.story,
    milestones: A.milestones.map((m: any) => ({ yr: m.yr, title: m.title, note: m.note ?? '', ...(m.now ? { now: true } : {}) })),
    committees: A.roles.map((r: string[]) => ({ title: r[0], note: r[1] })),
    personal: A.personal.map((r: string[]) => ({ label: r[0], value: r[1] })),
    education: A.education.map(tl), profession: A.profession.map(tl), politics: A.politics.map(tl),
    awards: A.awards.map((x: any) => ({ year: x.yr, title: x.title, by: x.by })),
    works: A.works.map((x: any) => ({ year: x.yr, title: x.title, type: x.type })),
    parliament: A.parliament.map((x: any) => ({ n: x.n, label: x.label })),
    parliamentNote: 'দ্বাদশ অধিবেশন পর্যন্ত · মার্চ–সেপ্টেম্বর ২০২৬',
    priorities: A.priorities.map((x: string[]) => ({ title: x[0], text: x[1] })),
  });

  await page('heroes', {
    about: sec('পরিচিতি', M.name, `${M.title}। ${A.headline}।`),
    biography: sec('পরিচিতি', 'জীবনপঞ্জি', `${M.name}-এর শিক্ষা, পেশা ও রাজনৈতিক জীবনের পূর্ণ বিবরণ, বছর ধরে ধরে।`),
    activities: sec('কার্যক্রম', 'মাঠে, সংসদে, মানুষের পাশে', `${M.seat} আসনের সব কার্যক্রমের নিয়মিত হালনাগাদ। বিষয়, উপজেলা বা মাস বেছে নিয়ে খুঁজুন।`),
    promises: sec('উন্নয়ন ও প্রতিশ্রুতি', 'নির্বাচনী প্রতিশ্রুতির হিসাব', 'নির্বাচনের আগে দেওয়া প্রতিটি প্রতিশ্রুতির বাজেট, অগ্রগতি আর সর্বশেষ হালনাগাদ।'),
    area: sec('নির্বাচনী এলাকা', `${M.seat}: তিন উপজেলার আসন`, 'চরকান্দি, শালবাগান ও নতুনহাট উপজেলার জনসংখ্যা, ভোটার, শিক্ষা ও স্বাস্থ্যসেবার তথ্য।'),
    gallery: sec('গ্যালারি', 'ছবিতে কাজের খবর', 'প্রতিটি কার্যক্রমের ছবি, অ্যালবাম ধরে সাজানো। বড় করে দেখতে ছবিতে চাপুন।'),
    videos: sec('ভিডিও', 'বক্তব্য, গণশুনানি ও সাক্ষাৎকার', 'সংসদের বক্তব্য, গণশুনানির পূর্ণ ভিডিও আর মাঠের কর্মসূচি।'),
    complaint: sec('অভিযোগ ও পরামর্শ বক্স', 'আপনার সমস্যা সরাসরি জানান', 'প্রতিটি অভিযোগ ট্র্যাকিং আইডিসহ নথিভুক্ত হয়, আর সমাধান পর্যন্ত প্রতিটি ধাপ আপনি দেখতে পাবেন।'),
    contact: sec('যোগাযোগ', 'দেখা করুন, কথা বলুন', 'এলাকা অফিস, সাব-অফিস আর ঢাকা অফিসের ঠিকানা ও সময়, সঙ্গে আসন্ন কর্মসূচি।'),
  });

  const U = S.area.upz;
  await page('area', {
    intro: 'নদীপুর-৩ আসন চরকান্দি, শালবাগান ও নতুনহাট উপজেলা নিয়ে গঠিত। আসনের বড় অংশ চরাঞ্চল, বর্ষায় অনেক গ্রামে নৌকাই একমাত্র যোগাযোগ।',
    totals: S.area.totals.map((x: string[]) => ({ value: x[0], label: x[1] })),
    voters: S.area.voters.map((x: string[]) => ({ label: x[0], value: x[1] })),
    extra: S.area.extra.map((x: string[]) => ({ value: x[0], label: x[1] })),
    upazilas: Object.values(U).map((u: any) => ({ name: u.name, short: u.short, pop: u.pop, voters: u.voters, size: u.size, lit: u.lit, households: u.hh, schools: u.schools, clinics: u.clinics, projects: u.proj, complaints: u.cmp, unions: u.unions, note: `${u.about} ${u.office}`.slice(0, 500) })),
    note: 'উৎস: উপজেলা পরিসংখ্যান কার্যালয় ও নির্বাচন কমিশনের ভোটার তালিকা (ডেমো সংখ্যা)।',
  });

  await page('contact', {
    intro: 'অফিসে সরাসরি আসুন, ফোন করুন বা ইমেইল করুন। জরুরি সমস্যার জন্য অভিযোগ বক্স ব্যবহার করুন, তাতে ট্র্যাকিং আইডি পাবেন।',
    offices: S.offices.map((o: any) => ({ name: o.name, rows: o.rows.map((r: string[]) => ({ label: r[0], value: r[1] })) })),
    channels: [
      { label: 'ফেসবুক পেজ', note: 'নিয়মিত কার্যক্রমের ছবি ও লাইভ', url: 'https://www.facebook.com/' },
      { label: 'ইউটিউব চ্যানেল', note: 'সংসদের বক্তব্য ও গণশুনানির পূর্ণ ভিডিও', url: 'https://www.youtube.com/' },
      { label: 'ইমেইল', note: 'office@tahmina-noor.example', url: 'mailto:office@tahmina-noor.example' },
    ],
    hotline: { number: '০১৭০০-০০০০০২ (ডেমো নম্বর)', hours: 'শনি–বৃহস্পতি, সকাল ৯টা–রাত ৮টা' },
  });

  await page('complaint', {
    intro: 'রাস্তা, বিদ্যুৎ, পানি, স্বাস্থ্যসেবা, শিক্ষা বা কোনো দপ্তরে হয়রানি: যেকোনো সমস্যা বা পরামর্শ এখানে জানান।',
    steps: [
      { title: 'অভিযোগ দিন', text: 'ফর্মে সমস্যা, এলাকা আর আপনার নাম, মোবাইল নম্বর, জন্মতারিখ ও NID নম্বর লিখুন।' },
      { title: 'ট্র্যাকিং আইডি পান', text: 'সঙ্গে সঙ্গে একটি আইডি পাবেন, আপনার নম্বরে SMS-ও যাবে।' },
      { title: '২৪ ঘণ্টায় যাচাই', text: 'এলাকা অফিস যাচাই করে দায়িত্বপ্রাপ্ত কর্মকর্তাকে পাঠায়।' },
      { title: 'সমাধান পর্যন্ত খবর', text: 'প্রতিটি ধাপ আইডি দিয়ে এই পাতায় দেখতে পাবেন।' },
    ],
    privacyNote: 'আপনার নাম, মোবাইল নম্বর, জন্মতারিখ ও NID নম্বর এনক্রিপ্ট করে রাখা হয়। শুধু যে কর্মকর্তাকে অভিযোগটি দেওয়া হয়েছে তিনিই দেখতে পারেন, আর প্রতিবার দেখার কারণ লগে থাকে। সংসদ সদস্য নিজেও আপনার পরিচয় দেখেন না।',
    // the demo FAQ predates adr/0009 (no anonymous complaints; DOB and NID required): two answers change
    faq: S.complaintFaq.map((f: string[]) => {
      if (f[0].startsWith('আমার নাম আর নম্বর')) return { q: 'আমার নাম, নম্বর, জন্মতারিখ আর NID কে দেখতে পাবে?', a: 'শুধু যে কর্মকর্তাকে অভিযোগটি দেওয়া হয়েছে, তিনি। এই চারটি তথ্য এনক্রিপ্ট করে রাখা হয়। আপনার আলাদা সম্মতি ছাড়া এগুলো প্রচারণা বা অন্য কোনো কাজে ব্যবহার করা হয় না।' };
      if (f[0].startsWith('বেনামে')) return { q: 'কেন নাম, জন্মতারিখ আর NID দিতে হয়?', a: 'অভিযোগ যাচাই করে সঠিক ব্যক্তির সঙ্গে যোগাযোগের জন্য নাম, মোবাইল নম্বর, জন্মতারিখ ও জাতীয় পরিচয়পত্র (NID) নম্বর দিতে হয়। বেনামে অভিযোগ নেওয়া হয় না।' };
      return { q: f[0], a: f[1] };
    }),
  });

  /* ---- events (Dhaka dates in October 2026, published) ---- */
  for (const e of S.events) {
    await s.events.create({ title: e.title, date: monthDate(e.d, e.m).toISOString(), time: e.where.split('·')[0]!.trim(), place: (e.where.split('·')[1] ?? '').trim(), note: e.note ?? '' }, owner, true);
  }

  /* ---- gallery: every licensed photo, grouped into albums ---- */
  const albums: Record<string, string> = { hero: 'এলাকা', river: 'এলাকা', road: 'উন্নয়ন', bridge: 'উন্নয়ন', tubewell: 'উন্নয়ন', health: 'স্বাস্থ্য', hearing: 'গণশুনানি', school: 'শিক্ষা', football: 'যুব ও খেলাধুলা', agri: 'কৃষি ও ত্রাণ', relief: 'কৃষি ও ত্রাণ', women: 'নারী ও কর্মসংস্থান', tree: 'এলাকা', parliament: 'সংসদ' };
  const captions: Record<string, string> = { hero: 'ব্রহ্মপুত্রের চরে সূর্যাস্ত', river: 'বর্ষায় চরের গ্রামে নৌকাই যোগাযোগ', road: 'চরকান্দি–নতুনহাট সংযোগ সড়ক', bridge: 'কাজলা খালের সেতু প্রকল্প এলাকা', tubewell: 'আর্সেনিকমুক্ত গভীর নলকূপ স্থাপন', health: 'উপজেলা স্বাস্থ্য কমপ্লেক্স', hearing: 'নদীর পাড়ে গণশুনানিতে গ্রামবাসী', school: 'বিদ্যালয়ে নতুন বিজ্ঞানাগার', football: 'আন্তঃইউনিয়ন যুব ফুটবল টুর্নামেন্ট', agri: 'আমন ধান কাটার মৌসুম', relief: 'বন্যার সময় নৌকায় ত্রাণ বিতরণ', women: 'নারী উদ্যোক্তা প্রশিক্ষণ', tree: 'গাছের সারি দেওয়া গ্রামের পথ', parliament: 'জাতীয় সংসদ ভবন' };
  const featured = new Set(['road', 'hearing', 'health', 'relief', 'school', 'parliament']);
  let order = 0;
  for (const [url, caption] of [[mpPhoto, 'জাতীয় সংসদ ভবন প্রাঙ্গণে'], [mpOpen, 'কমিউনিটি খাদ্য কেন্দ্র উদ্বোধন'], [mpFood, 'খাদ্য সহায়তা কর্মসূচিতে খাবার বিতরণ']] as const) {
    if (url) await s.gallery.create({ url, caption, credit: AI, album: 'কার্যক্রম', order: order++, featured: true }, owner, true);
  }
  for (const k of Object.keys(captions)) {
    if (!img(k)) continue;
    await s.gallery.create({ url: img(k), caption: captions[k], credit: credit(k), album: albums[k] ?? '', order: order++, featured: featured.has(k) }, owner, true);
  }
  // one draft photo so the editor's approval flow has something to show
  await s.gallery.create({ url: img('football'), caption: 'খসড়া: যুব ফুটবলের পুরস্কার বিতরণ (অনুমোদনের অপেক্ষায়)', credit: credit('football'), album: 'যুব ও খেলাধুলা', order: order++ }, editor, false);

  /* ---- videos: YouTube samples + uploaded clips ---- */
  const note = 'নমুনা ভিডিও: আসল কার্যালয়ের ভিডিওর জায়গায় Blender Foundation-এর উন্মুক্ত লাইসেন্সের (CC BY) চলচ্চিত্র ব্যবহার করা হয়েছে।';
  const yt: Array<[string, string, string, string, boolean]> = [
    ['aqz-KE-bpKQ', 'সংসদে বক্তব্য: চরাঞ্চলের কমিউনিটি ক্লিনিকে চিকিৎসক সংকট', '১৭ সেপ্টেম্বর', '১০:৩৪', true],
    ['eRsGyueVLvQ', 'সাক্ষাৎকার: চরাঞ্চলের স্বাস্থ্য নিয়ে পরিকল্পনা', '৫ সেপ্টেম্বর', '১৪:৪৮', false],
    ['R6MlUcmOul8', 'চরকান্দি–নতুনহাট সংযোগ সড়ক উদ্বোধন', '২৭ সেপ্টেম্বর', '১২:১৪', true],
    ['WhWc3b3KhnY', 'মেয়েদের বিজ্ঞান ক্লাব: এক বছরের গল্প', '১২ আগস্ট', '৭:৪৪', false],
  ];
  let vOrder = 0;
  const dateOf = (s2: string) => { const [d, m] = s2.split(' '); return monthDate(d!, m!).toISOString(); };
  // uploaded clips first (they play inline without YouTube)
  const clips: Array<[string, string, string, string]> = [
    ['demo-hearing.webm', 'নতুনহাট গণশুনানি: সরাসরি নাগরিকদের কথা', '২১ সেপ্টেম্বর', '০:০৯'],
    ['demo-boat-clinic.webm', 'ভাসমান ক্লিনিক: চরের গ্রামে চিকিৎসা', '৩ সেপ্টেম্বর', '০:০৯'],
  ];
  for (const [file, title, date, dur] of clips) {
    const f = path.join(assetsDir, file);
    if (!fs.existsSync(f)) continue;
    const buf = fs.readFileSync(f);
    const up = await s.media.uploadVideo(Readable.from([buf]), 'video/webm', buf.length, { name: file, credit: 'জনপ্রতিনিধি ডেমো' }, people.editor);
    await s.videos.create({ title, description: 'কার্যালয় থেকে আপলোড করা ভিডিও (ডেমো টাইটেল কার্ড)।', date: dateOf(date), kind: 'upload', mediaId: up.id, duration: dur, order: vOrder++, featured: vOrder === 1 }, owner, true);
  }
  for (const [id, title, date, dur, feat] of yt) {
    await s.videos.create({ title, description: note, date: dateOf(date), kind: 'youtube', youtube: `https://www.youtube.com/watch?v=${id}`, duration: dur, order: vOrder++, featured: feat }, owner, true);
  }
  // an editor's draft video waiting for approval
  await s.videos.create({ title: 'খসড়া: শালবাগান স্বাস্থ্য কমপ্লেক্স পরিদর্শন', description: note, kind: 'youtube', youtube: 'https://youtu.be/aqz-KE-bpKQ', duration: '৩:১০', order: vOrder++ }, editor, false);
  void UPZ;
}
