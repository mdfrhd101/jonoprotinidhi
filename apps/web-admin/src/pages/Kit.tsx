import { useState } from 'react';
import {
  AreaChart, Avatar, Badge, BarList, Button, Card, Chips, DataTable, Dialog, Donut, DropdownMenu, Drawer, EmptyState, Field, FormSection, ICONS, Icon, Pill, ProgressBar, ProgressRing, SaveBar,
  SearchInput, SectionHeader, Skeleton, SkeletonText, Sparkline, StatCard, Stepper, Switch, TabPanel, Tabs, Timeline, useToast, PageHead, Pager, Bars, ErrorBox, type IconName,
} from '../components';
import { BrandMark } from '../components/primitives';

/* Living style guide, only routed when import.meta.env.DEV (see App.tsx): http://localhost:5173/_kit
   Every component of the kit with sample data. Keep it in sync when you add a component (see DESIGN.md). */

const days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, received: Math.round(3 + 2 * Math.sin(i / 3) + (i % 5 === 0 ? 3 : 0)), solved: Math.round(2 + 1.5 * Math.cos(i / 4) + (i % 7 === 0 ? 2 : 0)) }));

export default function Kit() {
  const toast = useToast();
  const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
  const [chip, setChip] = useState('all');
  const [q, setQ] = useState('');
  const [sw, setSw] = useState(true);
  const [dlg, setDlg] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [dirty, setDirty] = useState(true);
  const [page, setPage] = useState(2);
  return (
    <div className="kit" style={{ maxWidth: 1240, margin: '0 auto', padding: '32px 24px 96px' }}>
      <div className="row" style={{ marginBottom: 24 }}><BrandMark /><h1 style={{ fontFamily: 'var(--f-display)' }}>জনসেতু · কম্পোনেন্ট কিট</h1></div>
      <PageHead kicker="স্টাইল গাইড" title="PageHead: শিরোনাম" sub="সাবটাইটেল এখানে। DESIGN.md-তে প্রতিটি কম্পোনেন্টের props আছে।" actions={<><Button variant="ghost" icon="download">এক্সপোর্ট</Button><Button variant="accent" icon="plus">নতুন</Button></>} meta={<><Pill label="প্রকাশিত" tone="ok" /><Badge tone="brass" icon="star">বিশেষ</Badge></>} />

      <div className="stack">
        <Card title="আইকন" sub="Icon name=..." icon="sparkles">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 10 }}>
            {(Object.keys(ICONS) as IconName[]).map((n) => <div key={n} style={{ display: 'grid', justifyItems: 'center', gap: 4, padding: 8, border: '1px solid var(--line-2)', borderRadius: 10, fontSize: 12 }}><Icon name={n} size={22} />{n}</div>)}
          </div>
        </Card>

        <Card title="বাটন, ব্যাজ, পিল" icon="check">
          <div className="row" style={{ marginBottom: 14 }}>
            <Button variant="primary">Primary</Button><Button variant="accent" icon="plus">Accent</Button><Button variant="ghost">Ghost</Button><Button variant="danger" icon="trash">Danger</Button><Button variant="quiet">Quiet</Button>
            <Button variant="accent" size="sm">Small</Button><Button variant="primary" size="lg" iconRight="arrowRight">Large</Button><Button loading>Loading</Button><Button disabled>Disabled</Button><Button to="/switch" icon="external">Link</Button>
          </div>
          <div className="row">
            <Pill label="প্রকাশিত" tone="ok" /><Pill label="অপেক্ষায়" tone="warn" /><Pill label="ফেরত" tone="bad" /><Pill label="নির্ধারিত" tone="info" /><Pill label="খসড়া" /><Pill label="ব্র্যাস" tone="brass" />
            <Badge tone="ok" icon="check">সম্পন্ন</Badge><Badge tone="ink" count={12}>নতুন</Badge><Badge count={3}>বার্তা</Badge>
          </div>
        </Card>

        <SectionHeader title="StatCard" sub="KPI কার্ড: আইকন, সংখ্যা, ডেল্টা, স্পার্কলাইন" icon="activity" />
        <div className="kpis">
          <StatCard label="খোলা অভিযোগ" value={128} icon="inbox" tone="ink" dark hint="নতুন ২৪ · প্রক্রিয়াধীন ৩১" spark={days.map((d) => d.received)} to="/t/x" />
          <StatCard label="সময়মতো নিষ্পত্তি" value={86} unit="%" icon="clock" tone="green" delta={{ value: 4, suffix: '%', label: 'গত মাসের চেয়ে' }} />
          <StatCard label="সময় পেরোনো" value={12} icon="alert" tone="red" delta={{ value: 3, good: 'down', label: 'বেড়েছে' }} />
          <StatCard label="মোট বাজেট" value={743760} unit="টাকা" icon="posts" tone="brass" hint="লাখ-কোটি গ্রুপিং" />
          <StatCard label="লোডিং" value={0} loading icon="clock" tone="blue" />
          <StatCard label="মান নেই" value={null} icon="info" tone="amber" hint="এম ড্যাশ দেখায়" />
        </div>

        <div className="dash-row">
          <Card className="c8" title="AreaChart" sub="দুই সিরিজ, হোভার ও তীর চিহ্ন (←→) কাজ করে" icon="activity">
            <AreaChart data={days} series={[{ key: 'received', label: 'প্রাপ্ত', tone: 'blue' }, { key: 'solved', label: 'নিষ্পত্তি', tone: 'green', fill: true }]} ariaLabel="গত ৩০ দিনের অভিযোগ" />
          </Card>
          <Card className="c4" title="Donut" icon="layers">
            <Donut ariaLabel="অবস্থা" data={[{ key: 'n', label: 'নতুন', value: 12, tone: 'blue' }, { key: 'p', label: 'প্রক্রিয়াধীন', value: 7, tone: 'brass' }, { key: 's', label: 'সমাধান', value: 30, tone: 'green' }, { key: 'x', label: 'বন্ধ', value: 3, tone: 'gray' }]} />
          </Card>
        </div>
        <div className="dash-row keep6">
          <Card className="c6" title="BarList, ProgressBar, ProgressRing" icon="list">
            <BarList ariaLabel="বিষয়" rows={[{ label: 'রাস্তা-ঘাট', value: 42, hint: '১৩টি খোলা' }, { label: 'বিদ্যুৎ', value: 25, tone: 'amber' }, { label: 'পানি', value: 11, tone: 'blue', to: '/x' }]} />
            <div style={{ height: 18 }} /><ProgressBar value={64} label="অগ্রগতি" tone="green" />
            <div style={{ height: 18 }} className="row"><ProgressRing value={72} label="প্রস্তুতি" sub="প্রস্তুত" /><ProgressRing value={35} size={96} stroke={10} tone="blue" label="ছোট" /><div style={{ width: 140 }}><Sparkline data={[3, 5, 2, 8, 6, 9, 7]} tone="brass" label="প্রবণতা" /></div></div>
          </Card>
          <Card className="c6" title="Bars (পুরনো, সরল)" icon="list"><Bars rows={[['নতুন', 8], ['সমাধান', 3]]} /></Card>
        </div>

        <Card title="Tabs" icon="layers">
          <Tabs base="kit" label="নমুনা ট্যাব" value={tab} onChange={setTab} tabs={[{ key: 'a', label: 'সব', icon: 'list', badge: 4 }, { key: 'b', label: 'খসড়া' }, { key: 'c', label: 'বন্ধ', disabled: true }]} />
          <TabPanel base="kit" tab="a" value={tab}>প্রথম ট্যাবের কনটেন্ট (←→ দিয়ে ট্যাব বদলান)</TabPanel><TabPanel base="kit" tab="b" value={tab}>দ্বিতীয় ট্যাব</TabPanel>
          <div style={{ height: 16 }} /><Tabs base="kit2" label="পিল ট্যাব" variant="pill" value={tab} onChange={setTab} tabs={[{ key: 'a', label: 'পিল এক' }, { key: 'b', label: 'পিল দুই' }]} />
        </Card>

        <Card title="মেনু, ডায়ালগ, ড্রয়ার, টোস্ট" icon="menu">
          <div className="row">
            <DropdownMenu label="অ্যাকশন" trigger="অ্যাকশন" items={[{ heading: 'নির্বাচিত ১টি' }, { label: 'এডিট', icon: 'edit', onSelect: () => toast('এডিট', 'info') }, { label: 'লিংক খুলুন', icon: 'external', href: 'https://example.org' }, { separator: true }, { label: 'মুছুন', icon: 'trash', danger: true, onSelect: () => toast('মুছে ফেলা হয়েছে', 'bad') }]} />
            <Button onClick={() => setDlg(true)}>Dialog</Button><Button onClick={() => setDrawer(true)}>Drawer</Button>
            <Button onClick={() => toast('সংরক্ষণ হয়েছে', 'ok')}>Toast ok</Button><Button onClick={() => toast('কিছু ভুল হয়েছে', 'bad')}>Toast bad</Button><Button onClick={() => toast('তথ্য')}>Toast info</Button>
          </div>
          <Dialog title="ডায়ালগ" open={dlg} onClose={() => setDlg(false)} footer={<Button variant="primary" onClick={() => setDlg(false)}>ঠিক আছে</Button>}>ডায়ালগের ভেতরের লেখা।</Dialog>
          <Drawer title="ড্রয়ার" open={drawer} onClose={() => setDrawer(false)} footer={<Button variant="primary" onClick={() => setDrawer(false)}>বন্ধ</Button>}>পাশের ড্রয়ারের কনটেন্ট।</Drawer>
        </Card>

        <div className="dash-row keep6">
          <Card className="c6" title="Stepper, Timeline" icon="clock">
            <Stepper steps={[{ key: 'd', label: 'খসড়া' }, { key: 'r', label: 'অনুমোদনের অপেক্ষা' }, { key: 'p', label: 'প্রকাশিত' }]} current="r" />
            <div style={{ height: 20 }} />
            <Timeline items={[{ title: <><b>MP</b> · পোস্ট প্রকাশ</>, meta: '৫ মিনিট আগে', icon: 'checkCircle', tone: 'ok' }, { title: 'সম্পাদক পোস্ট পাঠিয়েছেন', meta: '২ ঘণ্টা আগে', icon: 'send', tone: 'warn' }, { title: 'অভিযোগ ফেরত', meta: 'গতকাল', icon: 'alert', tone: 'bad' }]} />
          </Card>
          <Card className="c6" title="Avatar, Skeleton, ErrorBox" icon="user">
            <div className="row"><Avatar name="ড. তাহমিনা নূর" /><Avatar name="সাদিয়া আফরিন" size={44} /><Avatar name="Md Rahim" size={28} /></div>
            <div style={{ height: 14 }} /><Skeleton w={180} h={20} /><div style={{ height: 10 }} /><SkeletonText lines={3} />
            <div style={{ height: 14 }} /><ErrorBox error={new Error('x')} retry={() => toast('আবার চেষ্টা')} />
          </Card>
        </div>

        <div className="dash-row keep6">
          <Card className="c6" pad="none" title="EmptyState" icon="inbox"><EmptyState icon="gallery" title="এখনো কোনো ছবি নেই" text="প্রথম ছবিটি যোগ করলে পাবলিক সাইটে দেখা যাবে।" action={<Button variant="accent" icon="plus">ছবি যোগ করুন</Button>} /></Card>
          <Card className="c6" pad="none" title="EmptyState (compact, ok)" icon="inbox"><EmptyState compact tone="ok" icon="checkAll" title="সব দেখা হয়ে গেছে" text="নতুন কিছু অপেক্ষায় নেই।" /></Card>
        </div>

        <Card title="DataTable (মোবাইলে কার্ড হয়ে যায়)" icon="list" pad="none">
          <DataTable caption="নমুনা তালিকা" rowKey={(r) => r.id} onRowClick={(r) => toast(r.t)} rowLabel={(r) => r.t}
            rows={[{ id: '1', t: 'কাশবনে বীজ বিতরণ', s: 'published' }, { id: '2', t: 'গণশুনানি', s: 'review' }]}
            columns={[{ key: 't', header: 'শিরোনাম', primary: true, cell: (r) => <b>{r.t}</b> }, { key: 's', header: 'অবস্থা', cell: (r) => <Pill label={r.s === 'published' ? 'প্রকাশিত' : 'অপেক্ষায়'} tone={r.s === 'published' ? 'ok' : 'warn'} /> }]} />
        </Card>
        <div className="row"><Chips label="ফিল্টার" value={chip} onChange={setChip} options={[{ value: 'all', label: 'সব', count: 12 }, { value: 'd', label: 'খসড়া' }]} /><SearchInput label="খুঁজুন" value={q} onChange={setQ} /><Switch label="চালু" checked={sw} onChange={setSw} /><Pager page={page} totalPages={5} onPage={setPage} /></div>

        <FormSection title="FormSection" description="লম্বা ফর্মের জন্য শিরোনাম ও বর্ণনাসহ কার্ড।" icon="settings" layout="split">
          <Field label="নাম" required hint="সাহায্যের লেখা">{(p) => <input {...p} onChange={() => setDirty(true)} />}</Field>
          <Field label="ভুলসহ" error="এটি ঠিক করুন">{(p) => <input {...p} />}</Field>
        </FormSection>
        <SaveBar dirty={dirty} onSave={() => { setDirty(false); toast('সংরক্ষণ হয়েছে', 'ok'); }} onDiscard={() => setDirty(false)} />
      </div>
    </div>
  );
}
