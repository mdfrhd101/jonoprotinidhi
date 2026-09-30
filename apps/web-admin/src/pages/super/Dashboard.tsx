import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { papi } from '../../api';
import { useSession } from '../../session';
import {
  AreaChart, BarList, Button, Card, Donut, EmptyState, ErrorBox, Icon, ProgressBar, Skeleton, SkeletonText, StatCard, Timeline,
  type IconName, type StatCardProps,
} from '../../components';
import { bnAgo, bnDate, bnGreeting, bnWeekday, formatBn, toBn } from '../../format';
import { actionLabel, actionTone, formatBytes, seatOf, useIsSuper, type Attention, type SuperDash } from './shared';

/* Platform dashboard (/super). Everything here is a count: the API never sends complaint text or a complainant's identity,
   and this screen does not ask for it. */

export function SuperDashboard() {
  const q = useQuery({ queryKey: ['super', 'dash'], queryFn: () => papi.get<SuperDash>('/super/dashboard') });
  if (q.isLoading) return <DashSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  return <DashBody d={q.data!} refresh={() => q.refetch()} refreshing={q.isFetching} />;
}

function DashSkeleton() {
  return (
    <div className="dash-sk" role="status" aria-live="polite" aria-label="লোড হচ্ছে">
      <Skeleton h={190} r={20} />
      <div className="kpis">{[0, 1, 2, 3].map((i) => <div className="card stat-sk" key={i}><Skeleton w={120} h={16} /><Skeleton w={90} h={38} r={10} /><Skeleton w={150} h={12} /></div>)}</div>
      <div className="dash-row"><div className="card c8"><Skeleton w={180} h={20} /><div style={{ height: 14 }} /><Skeleton h={220} r={14} /></div><div className="card c4"><Skeleton w={140} h={20} /><div style={{ height: 14 }} /><SkeletonText lines={5} /></div></div>
      <span className="sr">লোড হচ্ছে…</span>
    </div>
  );
}

const ATTN_ICON: Record<Attention['kind'], IconName> = { suspended: 'lock', domain: 'globe', sla: 'clock', stale: 'hourglass', unpublished: 'file', setup: 'rocket' };
const ATTN_TAG: Record<Attention['kind'], string> = { suspended: 'স্থগিত', domain: 'ডোমেইন', sla: 'SLA', stale: 'হালনাগাদ নেই', unpublished: 'পেজ বাকি', setup: 'সেটআপ' };

/** One Bangla sentence per "needs attention" reason. */
export function attentionText(a: Attention): string {
  switch (a.kind) {
    case 'suspended': return `সাইট স্থগিত আছে${a.since ? ` (${bnDate(a.since)} থেকে)` : ''}; পাবলিকে "সাময়িকভাবে বন্ধ" দেখাচ্ছে`;
    case 'domain': return [a.hosts?.length ? `ডোমেইন যাচাই বাকি: ${a.hosts.join(', ')}` : '', a.sslExpiring?.length ? `SSL-এর মেয়াদ শেষের পথে: ${a.sslExpiring.join(', ')}` : ''].filter(Boolean).join(' · ');
    case 'sla': return [a.slaPct != null ? `সময়মতো নিষ্পত্তি ${toBn(a.slaPct)}% (লক্ষ্য ${toBn(a.target ?? 80)}%)` : '', a.overdue ? `${toBn(a.overdue)}টি খোলা অভিযোগের সময় পেরিয়েছে` : ''].filter(Boolean).join(' · ');
    case 'stale': return a.daysSinceLastPost == null ? 'লাইভ সাইটে এখনো কোনো পোস্ট প্রকাশ হয়নি' : `${toBn(a.daysSinceLastPost)} দিন ধরে নতুন পোস্ট নেই`;
    case 'unpublished': return a.profilePublished ? `${toBn(a.pagesReady ?? 0)}/${toBn(a.pagesTotal ?? 7)}টি পেজ প্রকাশিত` : 'প্রোফাইল পেজ এখনো প্রকাশিত হয়নি';
    case 'setup': return a.ownerActive ? `সেটআপ চলছে: ${toBn(a.pagesReady ?? 0)}/${toBn(a.pagesTotal ?? 7)}টি পেজ প্রস্তুত, লাইভ করার অপেক্ষায়` : 'MP এখনো আমন্ত্রণ গ্রহণ করে অ্যাকাউন্ট চালু করেননি';
  }
}

function DashBody({ d, refresh, refreshing }: { d: SuperDash; refresh: () => void; refreshing: boolean }) {
  const { me } = useSession();
  const su = useIsSuper();
  const [allAttn, setAllAttn] = useState(false);
  const k = d.kpis;
  const media = k.media.imageBytes + k.media.videoBytes;
  const smsPct = k.sms.dailyCapacity ? Math.round((k.sms.today / k.sms.dailyCapacity) * 100) : 0;
  const tenantsWithIssues = new Set(d.attention.filter((a) => a.kind !== 'setup').map((a) => a.tenantId)).size;

  if (k.tenants.total === 0) {
    return (
      <div className="dash">
        <Hero name={me?.user.name ?? ''} summary={<>প্ল্যাটফর্মে এখনো কোনো MP-র সাইট নেই।</>} su={su} refresh={refresh} refreshing={refreshing} k={k} />
        <Card><EmptyState icon="tenants" title="প্রথম MP যোগ করুন" text="MP অফিসের লিখিত সম্মতি পাওয়ার পর এখান থেকে সাইট তৈরি করুন। তৈরির পর সাইট 'সেটআপ' অবস্থায় থাকে, পাবলিকে দেখা যায় না।"
          action={su ? <Button variant="accent" icon="plus" to="/super/tenants/new">নতুন MP যোগ করুন</Button> : undefined} /></Card>
      </div>
    );
  }

  const summary: ReactNode = <>
    প্ল্যাটফর্মে <b>{toBn(k.tenants.total)}টি সাইট</b>, তার মধ্যে <b>{toBn(k.tenants.live)}টি লাইভ</b>।{' '}
    {tenantsWithIssues ? <><b>{toBn(tenantsWithIssues)}টি সাইটে</b> নজর দেওয়া দরকার</> : <>কোনো লাইভ সাইটে জরুরি সমস্যা নেই</>}
    {k.domains.pending ? <>; <b>{toBn(k.domains.pending)}টি ডোমেইন</b> যাচাইয়ের অপেক্ষায়</> : null}।
  </>;

  const delta = (now: number, prev: number) => (now || prev ? { value: now - prev, suffix: 'টি', label: 'আগের ৩০ দিনের চেয়ে', good: 'none' as const } : undefined);
  const row1: StatCardProps[] = [
    { label: 'মোট MP / মন্ত্রী', value: k.tenants.total, icon: 'tenants', tone: 'ink', dark: true, to: '/super/tenants', hint: `লাইভ ${toBn(k.tenants.live)} · সেটআপ ${toBn(k.tenants.setup)} · স্থগিত ${toBn(k.tenants.suspended)}` },
    { label: 'অভিযোগ, গত ৩০ দিন (সব সাইট)', value: k.complaints.last30d, icon: 'complaints', tone: 'blue', delta: delta(k.complaints.last30d, k.complaints.prev30d), spark: d.series.map((s) => s.received), sparkLabel: 'গত ৩০ দিনে প্রতিদিনের নতুন অভিযোগ', hint: 'শুধু সংখ্যা · পরিচয় দেখা যায় না' },
    { label: 'খোলা অভিযোগ', value: k.complaints.open, icon: 'inbox', tone: k.complaints.overdue ? 'red' : 'amber', hint: k.complaints.overdue ? `${toBn(k.complaints.overdue)}টির সময় পেরিয়েছে` : 'কোনোটির সময় পেরোয়নি' },
    { label: 'প্রকাশিত পোস্ট, গত ৩০ দিন', value: k.posts.publishedLast30d, icon: 'posts', tone: 'brass', delta: delta(k.posts.publishedLast30d, k.posts.prev30d), hint: k.posts.publishedLast30d || k.posts.prev30d ? undefined : `মোট ${formatBn(k.posts.publishedTotal)}টি প্রকাশিত` },
  ];
  const row2: StatCardProps[] = [
    { label: 'সময়মতো নিষ্পত্তি (SLA)', value: k.complaints.slaPct, unit: k.complaints.slaPct == null ? undefined : '%', icon: 'clock', tone: k.complaints.slaPct != null && k.complaints.slaPct < k.complaints.slaTarget ? 'red' : 'green', hint: k.complaints.resolvedLast30d ? `লক্ষ্য ${toBn(k.complaints.slaTarget)}% · ৩০ দিনে ${formatBn(k.complaints.resolvedLast30d)}টি নিষ্পত্তি` : 'গত ৩০ দিনে কোনো নিষ্পত্তি নেই' },
    { label: 'মিডিয়া স্টোরেজ', value: formatBytes(media), icon: 'media', tone: 'blue', hint: `ছবি ${formatBytes(k.media.imageBytes)} · ভিডিও ${formatBytes(k.media.videoBytes)}` },
    { label: 'আজ পাঠানো SMS', value: k.sms.today, icon: 'send', tone: smsPct >= 80 ? 'red' : 'green', hint: `দৈনিক সীমা ${formatBn(k.sms.dailyCapacity)} · এ মাসে ${formatBn(k.sms.month)}${k.sms.failedToday ? ` · ব্যর্থ ${toBn(k.sms.failedToday)}` : ''}` },
    { label: 'ডোমেইন যাচাই বাকি', value: k.domains.pending, icon: 'globe', tone: k.domains.pending ? 'amber' : 'green', to: '/super/domains', hint: k.domains.custom ? `কাস্টম ডোমেইন ${toBn(k.domains.custom)}টি${k.domains.sslExpiringSoon ? ` · SSL মেয়াদ শেষের পথে ${toBn(k.domains.sslExpiringSoon)}` : ''}` : 'এখনো কোনো কাস্টম ডোমেইন নেই' },
  ];
  const attn = allAttn ? d.attention : d.attention.slice(0, 6);

  return (
    <div className="dash sa-dash">
      <Hero name={me?.user.name ?? ''} summary={summary} su={su} refresh={refresh} refreshing={refreshing} k={k} />

      <h2 className="sr">মূল সংখ্যা</h2>
      <div className="kpis">{row1.map((x) => <StatCard key={x.label} {...x} />)}</div>
      <div className="kpis">{row2.map((x) => <StatCard key={x.label} {...x} />)}</div>

      <div className="dash-row">
        <Card className="c8" title="অভিযোগ: প্রাপ্ত ও নিষ্পত্তি (সব সাইট)" sub="গত ৩০ দিনের প্রতিদিনের হিসাব · শুধু সংখ্যা" icon="activity">
          <AreaChart data={d.series} series={[{ key: 'received', label: 'প্রাপ্ত', tone: 'blue' }, { key: 'solved', label: 'নিষ্পত্তি', tone: 'green', fill: true }]} ariaLabel="গত ৩০ দিনে সব সাইটে প্রতিদিন কতটি অভিযোগ এসেছে আর কতটি নিষ্পত্তি হয়েছে" emptyText="গত ৩০ দিনে কোনো সাইটে অভিযোগ আসেনি" />
        </Card>
        <Card className="c4" title="সাইটের অবস্থা" sub={k.tenants.ministers ? `মন্ত্রী ${toBn(k.tenants.ministers)} জন` : `গত ৩০ দিনে নতুন ${toBn(k.tenants.newLast30d)}টি`} icon="layers">
          <Donut data={[{ key: 'live', label: 'লাইভ', value: k.tenants.live, tone: 'green' }, { key: 'setup', label: 'সেটআপ চলছে', value: k.tenants.setup, tone: 'blue' }, { key: 'suspended', label: 'স্থগিত', value: k.tenants.suspended, tone: 'red' }]}
            ariaLabel="অবস্থা অনুযায়ী সাইট" centerLabel="মোট সাইট" emptyText="এখনো কোনো সাইট নেই" />
        </Card>
      </div>

      <div className="dash-row">
        <Card className="c7" title="নজর দেওয়া দরকার" sub={d.attention.length ? `${toBn(d.attention.length)}টি বিষয়, জরুরিগুলো আগে` : undefined} icon="alert" pad="none"
          footer={d.attention.length > 6 ? <button type="button" className="link" onClick={() => setAllAttn((v) => !v)} aria-expanded={allAttn}>{allAttn ? 'কম দেখান' : `আরও ${toBn(d.attention.length - 6)}টি দেখুন`}</button> : undefined}>
          {d.attention.length === 0
            ? <EmptyState compact tone="ok" icon="checkAll" title="সব সাইট ঠিকঠাক চলছে" text="কোনো সাইট স্থগিত নেই, সময় পেরোনো অভিযোগ নেই, সব ডোমেইন যাচাই হয়েছে।" />
            : <ul className="rl sa-attn">{attn.map((a, i) => (
              <li key={`${a.tenantId}-${a.kind}-${i}`} className={`sa-t-${a.tone}`}>
                <span className={`chip-ico sm sa-ico-${a.tone}`}><Icon name={ATTN_ICON[a.kind]} size={16} /></span>
                <div className="rl-b"><Link className="rl-t" to={`/super/tenants/${a.tenantId}`}>{a.mpName} <span className="muted">· {seatOf(a)}</span></Link><div className="rl-m"><span>{attentionText(a)}</span></div></div>
                <div className="rl-a"><span className={`pill ${a.tone}`}>{ATTN_TAG[a.kind]}</span></div>
              </li>))}
            </ul>}
        </Card>
        <Card className="c5" title="খোলা অভিযোগ: কোন সাইটে বেশি" sub="নতুন, যাচাই ও প্রক্রিয়াধীন মিলিয়ে" icon="inbox">
          <BarList rows={d.openByTenant.map((r) => ({ key: r.id, label: `${r.mpName} (${seatOf(r)})`, value: r.open, hint: r.overdue ? `${toBn(r.overdue)}টির সময় পেরিয়েছে` : 'সময়ের মধ্যে আছে', tone: r.overdue ? 'red' as const : 'blue' as const, to: `/super/tenants/${r.id}` }))}
            ariaLabel="সাইট অনুযায়ী খোলা অভিযোগ" emptyText="কোনো সাইটে খোলা অভিযোগ নেই" />
        </Card>
      </div>

      <div className="dash-row">
        <Card className="c7" title="প্ল্যাটফর্মের সাম্প্রতিক কাজ" sub="Super Admin ও সাপোর্ট টিমের কাজ, সাইট ও ডোমেইনের পরিবর্তন" icon="audit" actions={<Link className="sec-link" to="/super/audit">অডিট লগ<Icon name="arrowRight" size={15} /></Link>}>
          {d.activity.length === 0
            ? <EmptyState compact icon="activity" title="এখনো কোনো কাজ হয়নি" text="নতুন সাইট, অবস্থা বদল বা act-as হলে এখানে দেখা যাবে।" />
            : <Timeline label="প্ল্যাটফর্মের সাম্প্রতিক কাজ" items={d.activity.map((a) => {
              const t = actionTone(a.action);
              return { id: a.id, icon: t.icon, tone: t.tone, title: <><b>{a.actorName ?? 'সিস্টেম'}</b> · {actionLabel(a.action)}{a.label && a.label !== a.tenantName ? <span className="muted">: {a.label}</span> : null}</>, meta: <>{a.tenantName && a.tenantId ? <Link to={`/super/tenants/${a.tenantId}`}>{a.tenantName}</Link> : 'প্ল্যাটফর্ম'} · {bnAgo(a.at)}</> };
            })} />}
        </Card>
        <Card className="c5" title="ব্যবহার ও খরচ" sub="স্টোরেজ আর SMS, সব সাইট মিলিয়ে" icon="layers">
          <div className="stack sa-usage">
            <div>
              <div className="sa-u-h"><span>মিডিয়া স্টোরেজ</span><b className="num">{formatBytes(media)}</b></div>
              <div className="sa-split" role="img" aria-label={`ছবি ${formatBytes(k.media.imageBytes)}, ভিডিও ${formatBytes(k.media.videoBytes)}`}>
                <i className="sa-split-a" style={{ width: `${media ? (k.media.imageBytes / media) * 100 : 0}%` }} /><i className="sa-split-b" style={{ width: `${media ? (k.media.videoBytes / media) * 100 : 0}%` }} />
              </div>
              <div className="sa-legend"><span><i className="sa-split-a" />ছবি {formatBytes(k.media.imageBytes)} ({toBn(k.media.imageFiles)}টি)</span><span><i className="sa-split-b" />ভিডিও {formatBytes(k.media.videoBytes)} ({toBn(k.media.videoFiles)}টি)</span></div>
            </div>
            <div>
              <div className="sa-u-h"><span>আজকের SMS</span><b className="num">{formatBn(k.sms.today)} / {formatBn(k.sms.dailyCapacity)}</b></div>
              <ProgressBar value={Math.min(100, smsPct)} label="আজকের SMS, দৈনিক সীমার তুলনায়" tone={smsPct >= 80 ? 'red' : 'green'} showValue={false} />
              <p className="muted sa-note">প্রতি সাইটে দৈনিক সীমা {formatBn(k.sms.capPerTenant)}টি (সাইট চাইলে কমাতে পারে, বাড়াতে পারে না)। এ মাসে মোট {formatBn(k.sms.month)}টি।
                {k.sms.busiest ? <> সবচেয়ে বেশি: <Link to={`/super/tenants/${k.sms.busiest.tenantId}`}>{k.sms.busiest.mpName}</Link> ({toBn(k.sms.busiest.used)}/{toBn(k.sms.busiest.cap)})</> : null}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card title="দ্রুত কাজ" icon="sparkles">
        <div className="qa">
          {su && <Link to="/super/tenants/new" className="qa-i"><span className="chip-ico"><Icon name="plus" size={20} /></span><span><b>নতুন MP যোগ করুন</b><small>লিখিত সম্মতি লাগবে</small></span><Icon name="arrowRight" size={16} className="go" /></Link>}
          <Link to="/super/tenants" className="qa-i"><span className="chip-ico"><Icon name="tenants" size={20} /></span><span><b>সব MP ও সাইট</b><small>খুঁজুন, অবস্থা দেখুন</small></span><Icon name="arrowRight" size={16} className="go" /></Link>
          <Link to="/super/domains" className="qa-i"><span className="chip-ico"><Icon name="globe" size={20} /></span><span><b>ডোমেইন</b><small>যাচাই ও SSL</small></span><Icon name="arrowRight" size={16} className="go" /></Link>
          <Link to="/super/audit" className="qa-i"><span className="chip-ico"><Icon name="audit" size={20} /></span><span><b>অডিট লগ</b><small>কে, কখন, কী বদলাল</small></span><Icon name="arrowRight" size={16} className="go" /></Link>
        </div>
      </Card>
      <p className="muted" style={{ fontSize: 13, textAlign: 'right' }}>সর্বশেষ হালনাগাদ: {bnAgo(d.generatedAt)}</p>
    </div>
  );
}

function Hero({ name, summary, su, refresh, refreshing, k }: { name: string; summary: ReactNode; su: boolean; refresh: () => void; refreshing: boolean; k: SuperDash['kpis'] }) {
  return (
    <section className="dash-hero" aria-label="স্বাগতম">
      <div>
        <p className="dh-date"><Icon name="calendarClock" size={16} />{bnWeekday()}, {bnDate(new Date())}</p>
        <h1>{bnGreeting()}{name ? `, ${name}` : ''}</h1>
        <p className="dh-sum">{summary}</p>
        <div className="dh-acts">
          {su && <Button variant="accent" icon="plus" to="/super/tenants/new">নতুন MP যোগ করুন</Button>}
          <Button variant="ghost" icon="tenants" to="/super/tenants">সব সাইট</Button>
          <Button variant="ghost" icon="audit" to="/super/audit">অডিট লগ</Button>
          <Button variant="quiet" icon="refresh" loading={refreshing} onClick={refresh} className="dh-refresh" aria-label="নতুন করে লোড করুন">রিফ্রেশ</Button>
        </div>
      </div>
      <div className="dh-side">
        <Link className="dh-pill" to="/super/tenants"><b>{toBn(k.tenants.live)}</b><span>লাইভ<br />সাইট</span></Link>
        <div className="dh-pill"><b>{formatBn(k.complaints.open)}</b><span>খোলা<br />অভিযোগ</span></div>
        <Link className="dh-pill" to="/super/domains"><b>{toBn(k.domains.pending)}</b><span>ডোমেইন<br />যাচাই বাকি</span></Link>
      </div>
    </section>
  );
}
