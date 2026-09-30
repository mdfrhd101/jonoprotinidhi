/* Demo platform data. Every MP, seat, person, phone number and domain here is fictional.
   Only tenant "ndp3" (ড. তাহমিনা নূর) has a full public site in this demo (../demo-mp/). */
window.PLATFORM = {
  root: 'jonoprotinidhi.example',
  tenants: [
    {id:'ndp3', name:'ড. তাহমিনা নূর', seat:'নদীপুর-৩', role:'সংসদ সদস্য', sub:'ndp3', custom:'tahmina-noor.example', status:'live', plan:'পূর্ণ', since:'১ মার্চ ২০২৬', lastPost:2, posts:12, cmpMonth:112, visitors:42310, admins:5, demo:true},
    {id:'sbp1', name:'মো. রফিকুল আলম', seat:'সবুজপুর-১', role:'মন্ত্রী, কাল্পনিক মন্ত্রণালয়', sub:'sbp1', custom:'', status:'live', plan:'পূর্ণ', since:'১৫ মার্চ ২০২৬', lastPost:1, posts:31, cmpMonth:208, visitors:88940, admins:7},
    {id:'mgp2', name:'অ্যাডভোকেট শামীমা আক্তার', seat:'মেঘনাপাড়-২', role:'সংসদ সদস্য', sub:'mgp2', custom:'shamima-akter.example', status:'live', plan:'মৌলিক', since:'২ এপ্রিল ২০২৬', lastPost:19, posts:8, cmpMonth:64, visitors:15220, admins:3},
    {id:'phl4', name:'প্রকৌশলী জাহিদ হাসান', seat:'পাহাড়তলী-৪', role:'সংসদ সদস্য', sub:'phl4', custom:'', status:'live', plan:'পূর্ণ', since:'২০ এপ্রিল ২০২৬', lastPost:4, posts:17, cmpMonth:91, visitors:30480, admins:4},
    {id:'tcr2', name:'ডা. আনোয়ার কবির', seat:'তিস্তাচর-২', role:'সংসদ সদস্য', sub:'tcr2', custom:'', status:'setup', plan:'পূর্ণ', since:'২২ সেপ্টেম্বর ২০২৬', lastPost:null, posts:0, cmpMonth:0, visitors:0, admins:2},
    {id:'ksb5', name:'মাহমুদা বেগম', seat:'কাশবন-৫', role:'সংসদ সদস্য', sub:'ksb5', custom:'', status:'suspended', plan:'মৌলিক', since:'১০ মে ২০২৬', lastPost:48, posts:5, cmpMonth:0, visitors:1210, admins:2, note:'চুক্তি নবায়ন বাকি। পাবলিক সাইটে "সাময়িকভাবে বন্ধ" পেজ দেখাচ্ছে, ডেটা সংরক্ষিত।'}
  ],
  domains: [
    {host:'ndp3.jonoprotinidhi.example', tenant:'ndp3', type:'sub', dns:'ok', ssl:'ok', sslExp:'২৮ ডিসেম্বর ২০২৬'},
    {host:'tahmina-noor.example', tenant:'ndp3', type:'custom', dns:'ok', ssl:'ok', sslExp:'১৪ ডিসেম্বর ২০২৬', primary:true},
    {host:'sbp1.jonoprotinidhi.example', tenant:'sbp1', type:'sub', dns:'ok', ssl:'ok', sslExp:'২ জানুয়ারি ২০২৭', primary:true},
    {host:'mgp2.jonoprotinidhi.example', tenant:'mgp2', type:'sub', dns:'ok', ssl:'ok', sslExp:'৯ ডিসেম্বর ২০২৬'},
    {host:'shamima-akter.example', tenant:'mgp2', type:'custom', dns:'ok', ssl:'warn', sslExp:'১২ অক্টোবর ২০২৬', primary:true},
    {host:'phl4.jonoprotinidhi.example', tenant:'phl4', type:'sub', dns:'ok', ssl:'ok', sslExp:'১৮ ডিসেম্বর ২০২৬', primary:true},
    {host:'tcr2.jonoprotinidhi.example', tenant:'tcr2', type:'sub', dns:'ok', ssl:'ok', sslExp:'২১ ডিসেম্বর ২০২৬', primary:true},
    {host:'anwar-kabir.example', tenant:'tcr2', type:'custom', dns:'pending', ssl:'none', sslExp:'—', token:'jonoprotinidhi-verify=7f3a9c21'},
    {host:'ksb5.jonoprotinidhi.example', tenant:'ksb5', type:'sub', dns:'ok', ssl:'ok', sslExp:'৩ জানুয়ারি ২০২৭', primary:true}
  ],
  staff: [
    {name:'নাফিসা রহমান', email:'nafisa@octagram.example', role:'Super Admin', tfa:'Authenticator app', last:'আজ, সকাল ১০:১২'},
    {name:'তানভীর হোসেন', email:'tanvir@octagram.example', role:'Super Admin', tfa:'Security key', last:'গতকাল, রাত ৯:৪০'},
    {name:'সাবরিনা ইসলাম', email:'sabrina@octagram.example', role:'সাপোর্ট (শুধু দেখা)', tfa:'Authenticator app', last:'আজ, দুপুর ১২:০৫'},
    {name:'রাশেদ করিম', email:'rashed@octagram.example', role:'কনটেন্ট সহায়তা', tfa:'Authenticator app', last:'২৬ সেপ্টেম্বর'}
  ],
  backups: [
    {when:'৩০ সেপ্টেম্বর ২০২৬, রাত ২:০০', size:'৪.২ GB', kind:'স্বয়ংক্রিয় দৈনিক', ok:true},
    {when:'২৯ সেপ্টেম্বর ২০২৬, রাত ২:০০', size:'৪.২ GB', kind:'স্বয়ংক্রিয় দৈনিক', ok:true},
    {when:'২৮ সেপ্টেম্বর ২০২৬, রাত ২:০০', size:'৪.১ GB', kind:'স্বয়ংক্রিয় দৈনিক', ok:true},
    {when:'২৭ সেপ্টেম্বর ২০২৬, বিকেল ৪:১৫', size:'৪.১ GB', kind:'হাতে নেওয়া (হালনাগাদের আগে)', ok:true},
    {when:'২৭ সেপ্টেম্বর ২০২৬, রাত ২:০০', size:'৪.১ GB', kind:'স্বয়ংক্রিয় দৈনিক', ok:true}
  ],
  /* ndp3 office team (MP admin panel) */
  team: [
    {name:'ড. তাহমিনা নূর', role:'owner', roleT:'MP (মালিক)', phone:'০১৭০০-০০০০১০', tfa:true, last:'আজ, সকাল ৮:৩০'},
    {name:'সাদিয়া আফরিন', role:'pr', roleT:'PR / কনটেন্ট এডিটর', phone:'০১৭০০-০০০০১১', tfa:true, last:'আজ, সকাল ১১:০২'},
    {name:'মো. কামরুল হাসান', role:'officer', roleT:'অভিযোগ কর্মকর্তা · নতুনহাট', upz:'notunhat', phone:'০১৭০০-০০০০১২', tfa:true, last:'আজ, সকাল ৯:৫০'},
    {name:'রুবিনা ইয়াসমিন', role:'officer', roleT:'অভিযোগ কর্মকর্তা · চরকান্দি', upz:'charkandi', phone:'০১৭০০-০০০০১৩', tfa:true, last:'গতকাল, বিকেল ৫:১০'},
    {name:'আবু সাঈদ', role:'officer', roleT:'অভিযোগ কর্মকর্তা · শালবাগান', upz:'shalbagan', phone:'০১৭০০-০০০০১৪', tfa:false, last:'২৭ সেপ্টেম্বর'}
  ],
  /* Last 30 days of public-site visitors for ndp3 (fictional). */
  visitors: [1120,1180,1240,1090,1310,1650,1720,1260,1290,1330,1210,1380,1840,1910,1420,1390,1460,1350,1510,2120,2240,1580,1610,1490,1560,1700,2860,3140,1980,1830],
  topPages: [['চরকান্দি–নতুনহাট সংযোগ সড়কের ৬.২ কিমি অংশ চালু',6240],['নির্বাচনী প্রতিশ্রুতির হিসাব',5110],['অভিযোগ বক্স',4380],['বিনামূল্যে চক্ষু শিবিরে ৬১০ জনের চিকিৎসা',2960],['নতুনহাটে গণশুনানি',2410]],
  /* Seed audit (older entries; new actions are prepended live). */
  seedAudit: [
    {tenant:'ndp3', actor:'সাদিয়া আফরিন', actorRole:'PR এডিটর', action:'পোস্ট অনুমোদনের জন্য পাঠিয়েছেন', target:'চরকান্দি–নতুনহাট সংযোগ সড়কের ৬.২ কিমি অংশ চালু', when:'২৭ সেপ্টেম্বর ২০২৬, দুপুর ১:১০'},
    {tenant:'ndp3', actor:'ড. তাহমিনা নূর', actorRole:'MP', action:'পোস্ট প্রকাশ করেছেন', target:'চরকান্দি–নতুনহাট সংযোগ সড়কের ৬.২ কিমি অংশ চালু', when:'২৭ সেপ্টেম্বর ২০২৬, দুপুর ২:৪৫'},
    {tenant:'ndp3', actor:'নাফিসা রহমান', actorRole:'Super Admin', sa:true, action:'ব্যানারের ছবি ঠিক করেছেন (ভাঙা লিংক)', target:'হোমপেজ ব্যানার ২', when:'২৬ সেপ্টেম্বর ২০২৬, রাত ১০:২০'},
    {tenant:'mgp2', actor:'তানভীর হোসেন', actorRole:'Super Admin', sa:true, action:'কাস্টম ডোমেইন যোগ করেছেন', target:'shamima-akter.example', when:'২৫ সেপ্টেম্বর ২০২৬, বিকেল ৪:০৫'},
    {tenant:'tcr2', actor:'নাফিসা রহমান', actorRole:'Super Admin', sa:true, action:'নতুন MP অ্যাকাউন্ট তৈরি করেছেন', target:'ডা. আনোয়ার কবির · তিস্তাচর-২', when:'২২ সেপ্টেম্বর ২০২৬, সকাল ১১:৩০'},
    {tenant:'ndp3', actor:'মো. কামরুল হাসান', actorRole:'অভিযোগ কর্মকর্তা', action:'অভিযোগ সমাধান হিসেবে চিহ্নিত করেছেন', target:'NDP3-2026-00873', when:'২৩ সেপ্টেম্বর ২০২৬, বিকেল ৩:৪০'},
    {tenant:'ksb5', actor:'তানভীর হোসেন', actorRole:'Super Admin', sa:true, action:'সাইট সাময়িকভাবে স্থগিত করেছেন', target:'কাশবন-৫ (চুক্তি নবায়ন বাকি)', when:'২০ সেপ্টেম্বর ২০২৬, সকাল ১০:০০'}
  ],
  /* Complaint seed for ndp3. PII lives only in `pii` and is shown only to the assigned officer. */
  complaintTitles: [
    ['রাস্তা-ঘাট ও সেতু','বাজারের সামনের রাস্তায় বড় গর্ত, রিকশা উল্টে যাচ্ছে'],
    ['বিদ্যুৎ','তিন দিন ধরে ট্রান্সফরমার নষ্ট, পুরো পাড়া অন্ধকার'],
    ['সামাজিক নিরাপত্তা ভাতা','বয়স্ক ভাতার কার্ড হয়েছে, কিন্তু টাকা আসছে না'],
    ['স্বাস্থ্যসেবা','কমিউনিটি ক্লিনিকে ডায়াবেটিসের ওষুধ নেই'],
    ['শিক্ষা','বিদ্যালয়ের টয়লেট ব্যবহারের অযোগ্য, মেয়েরা সমস্যায়'],
    ['পানি ও পয়ঃনিষ্কাশন','নলকূপের পানিতে আয়রন, খাওয়া যায় না'],
    ['রাস্তা-ঘাট ও সেতু','খেয়াঘাটে লাইফ জ্যাকেট নেই'],
    ['হয়রানি বা দুর্নীতি','জমির নামজারিতে অতিরিক্ত টাকা চাওয়া হচ্ছে'],
    ['বিদ্যুৎ','নতুন সংযোগের আবেদন দুই মাস পড়ে আছে'],
    ['আইনশৃঙ্খলা','সন্ধ্যার পর বাজারে মাদক বিক্রি হয়'],
    ['রাস্তা-ঘাট ও সেতু','কালভার্টের মুখ বন্ধ, মাঠে পানি জমে থাকে'],
    ['স্বাস্থ্যসেবা','স্বাস্থ্য কমপ্লেক্সে রাতে চিকিৎসক থাকেন না'],
    ['শিক্ষা','উপবৃত্তির তালিকায় নাম বাদ পড়েছে'],
    ['সামাজিক নিরাপত্তা ভাতা','বিধবা ভাতার আবেদন জমা নিচ্ছে না'],
    ['অন্যান্য','হাটের ইজারাদার অতিরিক্ত খাজনা নিচ্ছে'],
    ['পানি ও পয়ঃনিষ্কাশন','পৌরসভার ড্রেন উপচে রাস্তায় ময়লা পানি'],
    ['রাস্তা-ঘাট ও সেতু','বাঁশের সাঁকো ভেঙে গেছে, শিশুরা স্কুলে যেতে পারছে না'],
    ['বিদ্যুৎ','বিলে অস্বাভাবিক বেশি টাকা এসেছে'],
    ['স্বাস্থ্যসেবা','অ্যাম্বুলেন্স ডাকলে আসে না'],
    ['শিক্ষা','প্রাথমিক বিদ্যালয়ে শিক্ষক সংকট'],
    ['অন্যান্য','সরকারি খাস পুকুর দখল হয়ে গেছে'],
    ['রাস্তা-ঘাট ও সেতু','নদীভাঙনে রাস্তার অর্ধেক চলে গেছে'],
    ['সামাজিক নিরাপত্তা ভাতা','প্রতিবন্ধী ভাতার জন্য বারবার ঘোরানো হচ্ছে'],
    ['পানি ও পয়ঃনিষ্কাশন','গভীর নলকূপ বসানোর পর থেকে অকেজো']
  ],
  fakeNames: ['আব্দুর রহিম','সালমা খাতুন','জসিম উদ্দিন','নাসরিন আক্তার','মো. হাবিবুর','রোকসানা পারভীন','শহিদুল ইসলাম','মরিয়ম বেগম','আলমগীর হোসেন','ফাতেমা জোহরা','বেনামী','কামাল পাশা']
};
