import type { PageKey } from '@jonoprotinidhi/shared';
import type { FieldCfg, SectionCfg } from './fields';

/* Hand-written form layouts for every site page. Field keys and limits mirror the zod schemas in
   packages/shared/src/content.ts (the schema is still what validates; these only decide how the form looks). */

const T = (k: string, label: string, max: number, o: Partial<Extract<FieldCfg, { t: 'text' }>> = {}): FieldCfg => ({ t: 'text', k, label, max, ...o });
const A = (k: string, label: string, max: number, o: Partial<Extract<FieldCfg, { t: 'area' }>> = {}): FieldCfg => ({ t: 'area', k, label, max, ...o });
const U = (k: string, label: string, o: Partial<Extract<FieldCfg, { t: 'url' }>> = {}): FieldCfg => ({ t: 'url', k, label, ph: 'https://', ...o });
const R = (...fields: FieldCfg[]): FieldCfg => ({ t: 'row', fields });
const R3 = (...fields: FieldCfg[]): FieldCfg => ({ t: 'row', fields, three: true });
const G = (k: string, ...fields: FieldCfg[]): FieldCfg => ({ t: 'group', k, fields });
const H = (k: string, label: string, hint?: string): FieldCfg => ({ t: 'hero', k, label, hint });
type ListOpts = { summary?: (it: any) => string; hint?: string; add?: string; scalar?: boolean };
const L = (k: string, label: string, item: string, max: number, fields: FieldCfg[], o: ListOpts = {}): FieldCfg => ({ t: 'list', k, label, item, max, fields, ...o });
const join = (...xs: Array<string | undefined>) => xs.map((x) => (x ?? '').trim()).filter(Boolean).join(' · ');

const SOCIAL: Array<[string, string]> = [['facebook', 'Facebook'], ['youtube', 'YouTube'], ['x', 'X (Twitter)'], ['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['web', 'ওয়েবসাইট'], ['email', 'ইমেইল'], ['phone', 'ফোন']];

const dated = (item: string) => [
  R(T('year', 'সাল / সময়কাল', 40, { ph: 'যেমন ১৯৯৮ বা ২০০৪–২০১০' }), T('title', `${item}`, 140, { req: true })),
  T('place', 'প্রতিষ্ঠান / স্থান', 140),
  A('note', 'টীকা', 300),
];
const datedSummary = (it: any) => join(it.year, it.title, it.place);

export const PAGE_FORMS: Record<PageKey, SectionCfg[]> = {
  layout: [
    { id: 'notice', title: 'ঘোষণা বার', icon: 'megaphone', description: 'সাইটের একেবারে ওপরে একটি সরু বার: জরুরি খবর বা গণশুনানির তারিখ।', fields: [
      G('notice', { t: 'bool', k: 'on', label: 'ঘোষণা বার দেখান', hint: 'বন্ধ থাকলে লেখা থাকলেও দেখাবে না' }, T('text', 'ঘোষণার লেখা', 200), U('link', 'লিংক (ঐচ্ছিক)', { hint: 'যেমন /complaint বা https://…' })),
    ] },
    { id: 'header', title: 'হেডার', icon: 'header', description: 'নামের নিচে ছোট লেখা।', fields: [T('tagline', 'ট্যাগলাইন', 160, { hint: 'এক লাইনে পরিচয়, যেমন: সংসদ সদস্য, নদীপুর-৩' })] },
    { id: 'footer', title: 'ফুটার', icon: 'file', description: 'প্রতিটি পাতার নিচের অংশ।', fields: [
      A('footerAbout', 'ফুটারে পরিচিতি', 500), A('footerNote', 'ফুটারের টীকা', 500, { hint: 'যেমন: এই সাইট কার্যালয় পরিচালনা করে' }),
      A('photoCredit', 'ছবির কৃতজ্ঞতা', 400, { hint: 'ব্যবহৃত ছবির লাইসেন্স/আলোকচিত্রীর নাম' }), T('copyright', 'কপিরাইট লাইন', 160),
    ] },
    { id: 'social', title: 'সোশ্যাল মিডিয়া ও লিংক', icon: 'globe', description: 'ফুটার ও যোগাযোগ পাতায় আইকনসহ দেখায়।', fields: [
      L('social', 'লিংক', 'লিংক', 8, [R({ t: 'select', k: 'kind', label: 'ধরন', options: SOCIAL }, T('label', 'লেখা', 60, { req: true, ph: 'যেমন: ফেসবুক পেজ' })), U('url', 'ঠিকানা', { hint: 'https://, mailto: বা tel: দিয়ে শুরু' })],
        { summary: (it) => join(SOCIAL.find((s) => s[0] === it.kind)?.[1], it.label) }),
    ] },
  ],

  home: [
    { id: 'hero', title: 'হিরো অংশ', icon: 'home', description: 'হোমপেজের বড় ব্যানারের পাশের লেখা। ব্যানারের ছবি "ব্যানার ও হোমপেজ সাজানো" পাতায়।', fields: [
      G('hero', T('kicker', 'নামের ওপরের ছোট লেখা', 60, { ph: 'যেমন: সংসদ সদস্য, নদীপুর-৩' }), A('note', 'ছোট পরিচিতি', 200)),
    ] },
    { id: 'stats', title: 'সংখ্যায় কাজ', icon: 'activity', description: 'বড় সংখ্যায় কয়েকটি অর্জন। শুধু যাচাই করা তথ্য দিন।', fields: [
      R(T('statsTitle', 'অংশের শিরোনাম', 80), T('statsNote', 'নিচের টীকা', 300, { hint: 'তথ্যের উৎস বা সময়কাল' })),
      L('stats', 'সংখ্যাগুলো', 'সংখ্যা', 8, [R3(T('n', 'সংখ্যা', 20, { req: true, ph: '৪২' }), T('unit', 'একক', 20, { ph: 'কিমি' }), T('label', 'কী', 100, { req: true, ph: 'গ্রামীণ সড়ক সংস্কার' }))],
        { summary: (it) => `${join(`${it.n ?? ''} ${it.unit ?? ''}`)}${it.label ? ` — ${it.label}` : ''}` }),
    ] },
    { id: 'sections', title: 'হোমপেজের অংশগুলোর শিরোনাম', icon: 'titles', description: 'প্রতিটি অংশের ওপরের ছোট লেখা, শিরোনাম আর ভূমিকা। কোন অংশ দেখাবে আর কোন ক্রমে, তা "ব্যানার ও হোমপেজ সাজানো" পাতায়।', fields: [
      G('sections', H('about', 'পরিচিতি'), H('office', 'সংসদে / দায়িত্ব'), H('activities', 'সাম্প্রতিক কাজ'), H('promises', 'প্রতিশ্রুতির হিসাব'), H('area', 'নির্বাচনী এলাকা'), H('gallery', 'গ্যালারি'), H('videos', 'ভিডিও'), H('events', 'আসন্ন কর্মসূচি')),
    ] },
    { id: 'cta', title: 'অভিযোগ জানানোর আহ্বান', icon: 'complaints', description: 'হোমপেজের নিচে অভিযোগ বক্সে যাওয়ার বড় কার্ড।', fields: [
      G('complaintCta', T('title', 'শিরোনাম', 120), A('text', 'লেখা', 400), T('button', 'বোতামের লেখা', 40, { ph: 'অভিযোগ জানান' })),
    ] },
  ],

  profile: [
    { id: 'main', title: 'মূল পরিচিতি', icon: 'profile', description: 'পরিচিতি পাতার ওপরের অংশ।', fields: [
      T('headline', 'শিরোনাম', 140, { ph: 'যেমন: চরের চিকিৎসক থেকে সংসদে' }), A('roleLine', 'পদ ও দায়িত্বের লাইন', 400),
      A('intro', 'ভূমিকা', 2000, { rows: 6 }),
      { t: 'image', k: 'portrait', label: 'প্রতিকৃতি (ছবি)', hint: 'একটি ছবি। ছবির নিচে ক্রেডিট লিখুন (কে তুলেছেন)।' },
    ] },
    { id: 'story', title: 'জীবনের গল্প', icon: 'file', description: 'প্রতিটি অনুচ্ছেদ আলাদা ঘরে। ক্রম বদলাতে তীর চিহ্ন ব্যবহার করুন।', fields: [
      L('story', 'অনুচ্ছেদ', 'অনুচ্ছেদ', 10, [A('', 'অনুচ্ছেদ', 1500, { rows: 5 })], { scalar: true, add: 'অনুচ্ছেদ যোগ করুন' }),
    ] },
    { id: 'milestones', title: 'মাইলফলক', icon: 'calendarClock', description: 'জীবনপঞ্জির সময়রেখা।', fields: [
      L('milestones', 'মাইলফলক', 'মাইলফলক', 10, [R(T('yr', 'সাল', 20, { req: true }), T('title', 'কী হয়েছিল', 120, { req: true })), A('note', 'টীকা', 300), { t: 'bool', k: 'now', label: 'এখন চলছে', hint: 'সময়রেখায় "বর্তমান" হিসেবে চিহ্নিত হবে' }],
        { summary: (it) => join(it.yr, it.title) }),
    ] },
    { id: 'committees', title: 'কমিটি ও দায়িত্ব', icon: 'office', fields: [
      L('committees', 'কমিটি', 'কমিটি', 12, [T('title', 'কমিটি / দায়িত্ব', 140, { req: true }), A('note', 'টীকা', 300)], { summary: (it) => it.title }),
    ] },
    { id: 'personal', title: 'ব্যক্তিগত তথ্য', icon: 'user', description: 'জন্ম, পরিবার, ভাষা ইত্যাদি ছোট তথ্য।', fields: [
      L('personal', 'তথ্য', 'তথ্য', 24, [R(T('label', 'বিষয়', 80, { req: true, ph: 'যেমন: জন্ম' }), T('value', 'তথ্য', 300))], { summary: (it) => join(it.label, it.value) }),
    ] },
    { id: 'education', title: 'শিক্ষা', icon: 'list', fields: [L('education', 'শিক্ষা', 'ডিগ্রি', 20, dated('ডিগ্রি / পরীক্ষা'), { summary: datedSummary })] },
    { id: 'profession', title: 'পেশা', icon: 'office', fields: [L('profession', 'পেশা', 'পেশা', 20, dated('পদ / কাজ'), { summary: datedSummary })] },
    { id: 'politics', title: 'রাজনৈতিক জীবন', icon: 'tenants', fields: [L('politics', 'রাজনৈতিক জীবন', 'ধাপ', 20, dated('পদ / দায়িত্ব'), { summary: datedSummary })] },
    { id: 'awards', title: 'পুরস্কার ও সম্মাননা', icon: 'star', fields: [
      L('awards', 'সম্মাননা', 'সম্মাননা', 20, [R(T('year', 'সাল', 20), T('title', 'সম্মাননা', 140, { req: true })), T('by', 'প্রদানকারী', 140)], { summary: (it) => join(it.year, it.title, it.by) }),
    ] },
    { id: 'works', title: 'লেখা ও প্রকাশনা', icon: 'posts', fields: [
      L('works', 'প্রকাশনা', 'প্রকাশনা', 20, [R(T('year', 'সাল', 20), T('type', 'ধরন', 80, { ph: 'বই, প্রবন্ধ, গবেষণা' })), T('title', 'শিরোনাম', 160, { req: true })], { summary: (it) => join(it.year, it.title, it.type) }),
    ] },
    { id: 'parliament', title: 'সংসদে কাজ', icon: 'office', description: 'সংসদে প্রশ্ন, বক্তব্য, বিল ইত্যাদির সংখ্যা।', fields: [
      L('parliament', 'সংখ্যা', 'সংখ্যা', 8, [R(T('n', 'সংখ্যা', 20, { req: true }), T('label', 'কী', 80, { req: true }))], { summary: (it) => join(it.n, it.label) }),
      A('parliamentNote', 'টীকা', 600, { hint: 'তথ্যের উৎস (যেমন সংসদের কার্যবিবরণী)' }),
    ] },
    { id: 'priorities', title: 'অগ্রাধিকার', icon: 'promises', fields: [
      L('priorities', 'অগ্রাধিকার', 'অগ্রাধিকার', 10, [T('title', 'শিরোনাম', 80, { req: true }), A('text', 'বিবরণ', 300)], { summary: (it) => it.title }),
    ] },
  ],

  heroes: [
    { id: 'heroes', title: 'ভেতরের পাতাগুলোর শিরোনাম', icon: 'titles', description: 'প্রতিটি পাতার ওপরে যে ছোট লেখা, বড় শিরোনাম আর ভূমিকা দেখায়। খালি রাখলে সাধারণ শিরোনাম দেখাবে।', fields: [
      H('about', 'পরিচিতি'), H('biography', 'জীবনপঞ্জি'), H('activities', 'কার্যক্রম'), H('promises', 'প্রতিশ্রুতি'), H('area', 'নির্বাচনী এলাকা'),
      H('gallery', 'গ্যালারি'), H('videos', 'ভিডিও'), H('complaint', 'অভিযোগ বক্স'), H('contact', 'যোগাযোগ'),
    ] },
  ],

  area: [
    { id: 'intro', title: 'এলাকার পরিচিতি', icon: 'area', fields: [A('intro', 'ভূমিকা', 1200, { rows: 5 }), A('note', 'নিচের টীকা', 500, { hint: 'তথ্যের উৎস, যেমন: বিবিএস জনশুমারি ২০২২' })] },
    { id: 'totals', title: 'মোট হিসাব', icon: 'activity', description: 'আয়তন, জনসংখ্যা, ইউনিয়ন: বড় সংখ্যায় দেখায়।', fields: [
      L('totals', 'মোট হিসাব', 'হিসাব', 8, [R(T('value', 'সংখ্যা', 40, { req: true }), T('label', 'কী', 100, { req: true }))], { summary: (it) => join(it.value, it.label) }),
    ] },
    { id: 'voters', title: 'ভোটার', icon: 'team', fields: [
      L('voters', 'ভোটার', 'সারি', 6, [R(T('label', 'বিষয়', 60, { req: true, ph: 'যেমন: নারী ভোটার' }), T('value', 'সংখ্যা', 40, { req: true }))], { summary: (it) => join(it.label, it.value) }),
    ] },
    { id: 'extra', title: 'অন্যান্য তথ্য', icon: 'list', fields: [
      L('extra', 'অন্যান্য তথ্য', 'তথ্য', 16, [R(T('value', 'সংখ্যা/মান', 40, { req: true }), T('label', 'কী', 100, { req: true }))], { summary: (it) => join(it.value, it.label) }),
    ] },
    { id: 'upazilas', title: 'উপজেলা ও ইউনিয়ন', icon: 'pin', description: 'প্রতিটি উপজেলার কার্ড: সংখ্যা আর ইউনিয়নের তালিকা।', fields: [
      L('upazilas', 'উপজেলা', 'উপজেলা', 12, [
        R(T('name', 'উপজেলার নাম', 80, { req: true }), T('short', 'সংক্ষিপ্ত পরিচয়', 40)),
        R3(T('pop', 'জনসংখ্যা', 30), T('voters', 'ভোটার', 30), T('size', 'আয়তন', 30)),
        R3(T('lit', 'সাক্ষরতা', 20), T('households', 'খানা', 30), T('schools', 'বিদ্যালয়', 20)),
        R3(T('clinics', 'ক্লিনিক', 20), T('projects', 'প্রকল্প', 20), T('complaints', 'অভিযোগ', 20)),
        { t: 'chips', k: 'unions', label: 'ইউনিয়ন', item: 'ইউনিয়ন', max: 40, maxLen: 60 },
        A('note', 'টীকা', 500),
      ], { summary: (it) => join(it.name, it.unions?.length ? `${it.unions.length} ইউনিয়ন` : '') }),
    ] },
  ],

  contact: [
    { id: 'intro', title: 'ভূমিকা ও হটলাইন', icon: 'contact', fields: [
      A('intro', 'ভূমিকা', 700),
      G('hotline', R(T('number', 'হটলাইন নম্বর', 40, { ph: '০১৭০০-০০০০০০' }), T('hours', 'কখন খোলা', 120, { ph: 'শনি–বৃহস্পতি, সকাল ৯টা–বিকেল ৫টা' }))),
    ] },
    { id: 'offices', title: 'অফিস', icon: 'office', description: 'প্রতিটি অফিসের নাম আর ঠিকানা, সময়, ফোনের মতো সারি।', fields: [
      L('offices', 'অফিস', 'অফিস', 8, [
        T('name', 'অফিসের নাম', 100, { req: true }),
        L('rows', 'তথ্যের সারি', 'সারি', 8, [R(T('label', 'বিষয়', 80, { req: true, ph: 'ঠিকানা / সময় / ফোন' }), T('value', 'তথ্য', 300))], { summary: (it) => join(it.label, it.value) }),
      ], { summary: (it) => it.name }),
    ] },
    { id: 'channels', title: 'যোগাযোগের মাধ্যম', icon: 'link', description: 'ইমেইল, ফোন, মেসেঞ্জার ইত্যাদি।', fields: [
      L('channels', 'মাধ্যম', 'মাধ্যম', 8, [R(T('label', 'নাম', 60, { req: true }), U('url', 'লিংক', { hint: 'https://, mailto: বা tel:' })), T('note', 'টীকা', 200)], { summary: (it) => join(it.label, it.note) }),
    ] },
  ],

  complaint: [
    { id: 'intro', title: 'ভূমিকা ও গোপনীয়তা', icon: 'complaints', fields: [A('intro', 'ভূমিকা', 700), A('privacyNote', 'গোপনীয়তার কথা', 600, { hint: 'নাগরিকের তথ্য কীভাবে সুরক্ষিত থাকে' })] },
    { id: 'steps', title: 'কীভাবে কাজ করে', icon: 'list', description: 'অভিযোগ দেওয়া থেকে সমাধান পর্যন্ত ধাপগুলো।', fields: [
      L('steps', 'ধাপ', 'ধাপ', 8, [T('title', 'শিরোনাম', 80, { req: true }), A('text', 'বিবরণ', 300)], { summary: (it) => it.title }),
    ] },
    { id: 'faq', title: 'প্রশ্নোত্তর', icon: 'info', fields: [
      L('faq', 'প্রশ্ন', 'প্রশ্ন', 20, [T('q', 'প্রশ্ন', 200, { req: true }), A('a', 'উত্তর', 1200, { req: true })], { summary: (it) => it.q }),
    ] },
  ],
};

/** Where each hero card of the "heroes" page shows on the public site. */
export const HERO_PATH: Record<string, string> = {
  about: '/about', biography: '/biography', activities: '/activities', promises: '/promises', area: '/area', gallery: '/gallery', videos: '/videos', complaint: '/complaint', contact: '/contact',
};
