import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiFail } from '../../api';
import { useTenant } from '../../tenant';
import { routeExists, EDITOR_ROUTE } from '../../routes';
import {
  AreaChart, BarList, Button, Card, Donut, EmptyState, ErrorBox, Icon, PillOf, ProgressBar, ProgressRing, ReasonDialog, Skeleton, SkeletonText, StatCard, Timeline, useToast,
  type BarRow, type DonutSlice, type IconName, type StatCardProps,
} from '../../components';
import { COMPLAINT_STATUS_LABEL, POST_STATUS_LABEL, PROMISE_STATUS_LABEL, ROLE_LABEL, bnAgo, bnDate, bnGreeting, bnUntil, bnWeekday, toBn, formatBn } from '../../format';

/* Tenant dashboard. The API sends only the sections this role may see (BUG-2026-011), so every block here renders only when
   its data is present. Contract: docs/09-BUILD-BRIEF.md §2. */

type Series = { date: string; received: number; solved: number };
export type Dash = {
  generatedAt: string;
  posts?: { total: number; byStatus: Record<string, number>; last30d: number; recent: Array<{ id: string; title: string; status: string; eventDate: string | null; updatedAt: string; thumb?: string }> };
  promises?: { total: number; byStatus: Record<string, number>; avgPct: number; late: Array<{ id: string; name: string; pct: number }> };
  approvals?: { total: number; items: Array<{ id: string; title: string; authorName: string; submittedAt: string }> };
  complaints?: {
    total: number; open: number; byStatus: Record<string, number>; slaPct: number | null; resolvedLast30d: number; overdue: number; avgResolutionDays: number;
    series: Series[]; byCategory: Array<{ name: string; count: number }>; byUpazila: Array<{ name: string; count: number; open: number }>;
    latest: Array<{ id: string; trackingId: string; category: string; upazila: string; status: string; createdAt: string }>;
  };
  events?: { upcoming: Array<{ id: string; title: string; date: string; place: string }> };
  content?: { gallery: number; videos: number; events: number; readinessPct: number; pages: Array<{ key: string; label: string; ready: boolean }> };
  activity?: { items: Array<{ action: string; label: string; actorName: string; at: string }> };
};

const STATUS_TONE: Record<string, DonutSlice['tone']> = { new: 'blue', verify: 'amber', progress: 'brass', solved: 'green', closed: 'gray', spam: 'red' };
const COMPLAINT_ORDER = ['new', 'verify', 'progress', 'solved', 'closed', 'spam'];
const POST_TONE: Record<string, DonutSlice['tone']> = { published: 'green', review: 'amber', draft: 'gray', scheduled: 'blue', rejected: 'red', archived: 'violet' };
const ACTION_ICON: Array<[RegExp, IconName, 'ok' | 'warn' | 'bad' | 'info' | 'brass' | 'plain']> = [
  [/approve|publish/, 'checkCircle', 'ok'], [/reject|delete|remove|pii_purge/, 'alert', 'bad'], [/submit|withdraw/, 'send', 'warn'], [/^complaint\./, 'complaints', 'info'],
  [/^post\./, 'posts', 'brass'], [/^promise\./, 'promises', 'brass'], [/^media\.|^gallery|^video/, 'image', 'brass'], [/^team\./, 'team', 'info'], [/^settings|^site|^profile|^page/, 'settings', 'plain'],
];
const iconFor = (action: string) => { const m = ACTION_ICON.find(([r]) => r.test(action)); return { icon: m?.[1] ?? ('activity' as IconName), tone: m?.[2] ?? ('plain' as const) }; };

export default function Dashboard() {
  const { api, id } = useTenant();
  const q = useQuery({ queryKey: ['tenant', id, 'dashboard'], queryFn: () => api.get<Dash>('/dashboard') });
  if (q.isLoading) return <DashSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  return <DashBody d={q.data!} onRefresh={() => q.refetch()} refreshing={q.isFetching} />;
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

function DashBody({ d, onRefresh, refreshing }: { d: Dash; onRefresh: () => void; refreshing: boolean }) {
  const { api, can, info, id } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const [rej, setRej] = useState<string | null>(null);
  const base = `/t/${id}`;
  const go = (p: string) => `${base}/${p}`.replace(/\/$/, '');
  const c = d.complaints, p = d.posts, pr = d.promises, ap = d.approvals, ct = d.content;
  const slaDays = info.tenant.settings.slaDays;

  const approve = useMutation({
    mutationFn: (postId: string) => api.post(`/posts/${postId}/approve`, {}),
    onSuccess: async () => { toast('প্রকাশ হয়েছে, পাবলিক সাইটে দেখা যাচ্ছে', 'ok'); await qc.invalidateQueries({ queryKey: ['tenant', id] }); },
    onError: (e) => toast(e instanceof ApiFail ? e.message : 'কিছু ভুল হয়েছে', 'bad'),
  });

  /* ----- hero ----- */
  const name = info.role === 'owner' ? info.tenant.mpName : ROLE_LABEL[info.role] ?? '';
  const parts: ReactNode[] = [];
  if (ap && ap.total > 0) parts.push(<><b>{toBn(ap.total)}টি পোস্ট</b> আপনার অনুমোদনের অপেক্ষায় আছে</>);
  if (c) parts.push(c.open > 0 ? <><b>{toBn(c.open)}টি অভিযোগ</b> খোলা{c.overdue > 0 ? <>, তার মধ্যে <b>{toBn(c.overdue)}টির</b> সময় পেরিয়েছে</> : ''}</> : <>কোনো খোলা অভিযোগ নেই</>);
  if (!ap && p) { const wait = (p.byStatus.draft ?? 0) + (p.byStatus.review ?? 0) + (p.byStatus.rejected ?? 0); if (wait > 0) parts.push(<><b>{toBn(wait)}টি পোস্ট</b> খসড়া বা অপেক্ষায় আছে</>); }
  const summary = parts.length ? parts.map((x, i) => <span key={i}>{i ? '; ' : ''}{x}</span>) : <>সব ঠিকঠাক চলছে, নতুন কিছু অপেক্ষায় নেই</>;

  /* ----- KPI cards (max 4, in priority order) ----- */
  const cards: StatCardProps[] = [];
  const spark = c?.series.map((s) => s.received);
  if (c) {
    cards.push({ label: 'খোলা অভিযোগ', value: c.open, icon: 'inbox', tone: 'ink', dark: true, hint: `নতুন ${toBn(c.byStatus.new ?? 0)} · প্রক্রিয়াধীন ${toBn(c.byStatus.progress ?? 0)}`, spark, sparkLabel: 'গত ৩০ দিনে প্রতিদিনের নতুন অভিযোগ', to: go('complaints') });
    cards.push({ label: 'সময়মতো নিষ্পত্তি (SLA)', value: c.slaPct, unit: c.slaPct == null ? undefined : '%', icon: 'clock', tone: c.slaPct != null && c.slaPct < 60 ? 'red' : 'green', hint: c.resolvedLast30d ? `গত ৩০ দিনে ${toBn(c.resolvedLast30d)}টি নিষ্পত্তি · লক্ষ্য ${toBn(slaDays)} দিন` : `লক্ষ্য: ${toBn(slaDays)} দিনের মধ্যে` });
  }
  if (p) cards.push({ label: 'প্রকাশিত পোস্ট', value: p.byStatus.published ?? 0, icon: 'posts', tone: 'brass', delta: p.last30d ? { value: p.last30d, suffix: 'টি', label: 'গত ৩০ দিনে নতুন' } : undefined, hint: p.last30d ? undefined : `মোট ${toBn(p.total)}টি`, to: go('posts') });
  if (ap) cards.push({ label: 'অনুমোদনের অপেক্ষায়', value: ap.total, icon: 'approvals', tone: 'amber', hint: ap.total ? 'দেখে অনুমোদন দিন' : 'সব দেখা হয়ে গেছে', to: go('approvals') });
  if (!c && p) cards.push({ label: 'খসড়া ও অপেক্ষায়', value: (p.byStatus.draft ?? 0) + (p.byStatus.review ?? 0) + (p.byStatus.rejected ?? 0), icon: 'file', tone: 'blue', hint: 'এডিট করে জমা দিন', to: go('posts') });
  if (c && !p) {
    cards.push({ label: 'সময় পেরোনো অভিযোগ', value: c.overdue, icon: 'alert', tone: c.overdue ? 'red' : 'green', hint: c.overdue ? 'আগে এগুলো দেখুন' : 'কোনোটির সময় পেরোয়নি' });
    cards.push({ label: 'গত ৩০ দিনে নিষ্পত্তি', value: c.resolvedLast30d, icon: 'checkCircle', tone: 'green', hint: c.resolvedLast30d ? `গড়ে ${toBn(c.avgResolutionDays)} দিনে` : undefined });
  }
  if (pr) cards.push({ label: 'প্রতিশ্রুতির গড় অগ্রগতি', value: pr.avgPct, unit: '%', icon: 'promises', tone: 'green', hint: `${toBn(pr.byStatus.done ?? 0)}টি সম্পন্ন · মোট ${toBn(pr.total)}টি`, to: can('promises.edit') ? go('promises') : undefined });
  if (ct) cards.push({ label: 'সাইট প্রস্তুতি', value: ct.readinessPct, unit: '%', icon: 'rocket', tone: 'blue', hint: `${toBn(ct.pages.filter((x) => x.ready).length)}/${toBn(ct.pages.length)} পেজ প্রকাশিত` });
  const kpis = cards.slice(0, 4);

  /* ----- quick actions ----- */
  type QA = { label: string; sub: string; icon: IconName; path: string; show: boolean };
  const qas: QA[] = ([
    { label: 'নতুন পোস্ট', sub: 'কার্যক্রমের খবর লিখুন', icon: 'plus', path: 'posts/new', show: can('posts.create') },
    { label: 'অভিযোগ দেখুন', sub: 'ইনবক্স খুলুন', icon: 'complaints', path: 'complaints', show: !!c },
    { label: 'প্রতিশ্রুতি হালনাগাদ', sub: 'অগ্রগতি জানান', icon: 'promises', path: 'promises', show: can('promises.edit') },
    { label: 'ছবি যোগ করুন', sub: 'গ্যালারিতে ছবি', icon: 'gallery', path: EDITOR_ROUTE.gallery!, show: can('content.edit') },
    { label: 'কর্মসূচি যোগ করুন', sub: 'আসন্ন অনুষ্ঠান', icon: 'events', path: EDITOR_ROUTE.events!, show: can('content.edit') },
    { label: 'ভিডিও যোগ করুন', sub: 'ইউটিউব বা আপলোড', icon: 'video', path: EDITOR_ROUTE.videos!, show: can('content.edit') },
    { label: 'ব্যানার ও সেটিংস', sub: 'হোমপেজের সাজ', icon: 'banners', path: 'site', show: can('site.edit') },
  ] as QA[]).filter((x) => x.show);

  const statusSlices: DonutSlice[] = c ? COMPLAINT_ORDER.map((k) => ({ key: k, label: COMPLAINT_STATUS_LABEL[k]?.[0] ?? k, value: c.byStatus[k] ?? 0, tone: STATUS_TONE[k] })) : [];
  const postSlices: DonutSlice[] = p ? Object.entries(p.byStatus).map(([k, v]) => ({ key: k, label: POST_STATUS_LABEL[k]?.[0] ?? k, value: v, tone: POST_TONE[k] ?? 'gray' })) : [];
  const catRows: BarRow[] = (c?.byCategory ?? []).map((r) => ({ label: r.name, value: r.count }));
  const upzRows: BarRow[] = (c?.byUpazila ?? []).map((r) => ({ label: r.name, value: r.count, hint: r.open ? `${toBn(r.open)}টি খোলা` : 'সব নিষ্পত্তি', tone: r.open ? 'blue' : 'green' }));

  const lists = {
    approvals: ap && (
      <Card key="ap" title="অনুমোদনের অপেক্ষায়" sub={ap.total ? `${toBn(ap.total)}টি পোস্ট` : undefined} icon="approvals" pad="none" className="c6"
        actions={ap.total > 5 ? <Link className="sec-link" to={go('approvals')}>সবগুলো<Icon name="arrowRight" size={15} /></Link> : undefined}>
        {ap.items.length === 0
          ? <EmptyState compact tone="ok" icon="checkAll" title="সব পোস্ট দেখা হয়ে গেছে" text="PR টিম নতুন পোস্ট পাঠালে এখানে দেখাবে।" />
          : <ul className="rl">{ap.items.map((x) => (
            <li key={x.id}>
              <div className="rl-b"><Link className="rl-t" to={go(`posts/${x.id}`)}>{x.title}</Link><div className="rl-m"><span>{x.authorName}</span><span>{bnAgo(x.submittedAt)}</span></div></div>
              <div className="rl-a">
                <Button variant="accent" size="sm" icon="check" loading={approve.isPending && approve.variables === x.id} onClick={() => approve.mutate(x.id)} aria-label={`অনুমোদন: ${x.title}`}>অনুমোদন</Button>
                <Button variant="danger" size="sm" onClick={() => setRej(x.id)} aria-label={`ফেরত পাঠান: ${x.title}`}>ফেরত</Button>
              </div>
            </li>))}
          </ul>}
      </Card>
    ),
    latest: c && (
      <Card key="lc" title="সাম্প্রতিক অভিযোগ" sub="নাগরিকের নাম-নম্বর এখানে আসে না" icon="complaints" pad="none" className="c6" actions={<Link className="sec-link" to={go('complaints')}>ইনবক্স<Icon name="arrowRight" size={15} /></Link>}>
        {c.latest.length === 0
          ? <EmptyState compact icon="inbox" title="এখনো কোনো অভিযোগ আসেনি" text="নাগরিকরা পাবলিক সাইট থেকে অভিযোগ জানালে এখানে দেখা যাবে।" />
          : <ul className="rl">{c.latest.map((x) => (
            <li key={x.id}>
              <div className="rl-b"><Link className="rl-t" to={go(`complaints/${x.id}`)}>{x.category}</Link><div className="rl-m"><span className="num">{x.trackingId}</span><span>{x.upazila}</span><span>{bnAgo(x.createdAt)}</span></div></div>
              <div className="rl-a"><PillOf map={COMPLAINT_STATUS_LABEL} k={x.status} /></div>
            </li>))}
          </ul>}
      </Card>
    ),
    events: d.events && (
      <Card key="ev" title="আসন্ন কর্মসূচি" icon="events" pad="none" className={c ? 'c6' : 'c12'} actions={routeExists(EDITOR_ROUTE.events!) ? <Link className="sec-link" to={go(EDITOR_ROUTE.events!)}>সব দেখুন<Icon name="arrowRight" size={15} /></Link> : undefined}>
        {d.events.upcoming.length === 0
          ? <EmptyState compact icon="events" title="আসন্ন কোনো কর্মসূচি নেই" text="গণশুনানি বা সভার তারিখ যোগ করলে পাবলিক সাইটে দেখাবে।" action={routeExists(EDITOR_ROUTE.events!) ? <Button variant="accent" size="sm" icon="plus" to={go(EDITOR_ROUTE.events!)}>কর্মসূচি যোগ করুন</Button> : undefined} />
          : <ul className="rl">{d.events.upcoming.map((e) => {
            const dt = bnDate(e.date).split(' ');
            return (
              <li key={e.id}>
                <span className="datebox" aria-hidden><b>{dt[0]}</b><small>{dt[1]}</small></span>
                <div className="rl-b"><span className="rl-t">{e.title}</span><div className="rl-m"><span>{bnDate(e.date)}</span>{e.place && <span>{e.place}</span>}</div></div>
                <div className="rl-a"><span className="pill brass plain">{bnUntil(e.date)}</span></div>
              </li>);
          })}</ul>}
      </Card>
    ),
    recent: (cls: string) => p && (
      <Card key="rp" title="সাম্প্রতিক পোস্ট" icon="posts" pad="none" className={cls} actions={<Link className="sec-link" to={go('posts')}>সব পোস্ট<Icon name="arrowRight" size={15} /></Link>}>
        {p.recent.length === 0
          ? <EmptyState compact icon="posts" title="এখনো কোনো পোস্ট নেই" text="প্রথম কার্যক্রমের খবরটি লিখুন, MP-র অনুমোদনের পর সাইটে যাবে।" action={can('posts.create') ? <Button variant="accent" size="sm" icon="plus" to={go('posts/new')}>নতুন পোস্ট</Button> : undefined} />
          : <ul className="rl">{p.recent.map((x) => (
            <li key={x.id}>
              {x.thumb ? <img className="rl-thumb" src={x.thumb} alt="" loading="lazy" /> : <span className="rl-thumb ph" aria-hidden><Icon name="image" size={18} /></span>}
              <div className="rl-b"><Link className="rl-t" to={go(`posts/${x.id}`)}>{x.title}</Link><div className="rl-m"><span>{bnAgo(x.updatedAt)}</span></div></div>
              <div className="rl-a"><PillOf map={POST_STATUS_LABEL} k={x.status} /></div>
            </li>))}
          </ul>}
      </Card>
    ),
  };

  return (
    <div className="dash">
      <section className="dash-hero" aria-label="স্বাগতম">
        <div>
          <p className="dh-date"><Icon name="calendarClock" size={16} />{bnWeekday()}, {bnDate(new Date())}</p>
          <h1>{bnGreeting()}, {name}</h1>
          <p className="dh-sum">স্বাগতম। আজ {summary}।</p>
          <div className="dh-acts">
            {can('posts.create') && <Button variant="accent" icon="plus" to={go('posts/new')}>নতুন পোস্ট</Button>}
            {ap && ap.total > 0 && <Button variant="ghost" icon="approvals" to={go('approvals')}>অনুমোদন দিন</Button>}
            {c && <Button variant="ghost" icon="complaints" to={go('complaints')}>অভিযোগ দেখুন</Button>}
            <Button variant="quiet" icon="refresh" loading={refreshing} onClick={onRefresh} className="dh-refresh" aria-label="নতুন করে লোড করুন">রিফ্রেশ</Button>
          </div>
        </div>
        <div className="dh-side">
          {ap && <Link className="dh-pill" to={go('approvals')}><b>{toBn(ap.total)}</b><span>অনুমোদনের<br />অপেক্ষায়</span></Link>}
          {c && <Link className="dh-pill" to={go('complaints')}><b>{toBn(c.open)}</b><span>খোলা<br />অভিযোগ</span></Link>}
          {!ap && !c && p && <div className="dh-pill"><b>{toBn(p.byStatus.published ?? 0)}</b><span>প্রকাশিত<br />পোস্ট</span></div>}
        </div>
      </section>

      {kpis.length > 0 && <div className="kpis">{kpis.map((k) => <StatCard key={k.label} {...k} />)}</div>}

      {c ? (
        <div className="dash-row">
          <Card className="c8" title="অভিযোগ: প্রাপ্ত ও নিষ্পত্তি" sub="গত ৩০ দিনের প্রতিদিনের হিসাব" icon="activity">
            <AreaChart data={c.series} series={[{ key: 'received', label: 'প্রাপ্ত', tone: 'blue' }, { key: 'solved', label: 'নিষ্পত্তি', tone: 'green', fill: true }]} ariaLabel="গত ৩০ দিনে প্রতিদিন কতটি অভিযোগ এসেছে আর কতটি নিষ্পত্তি হয়েছে" emptyText="গত ৩০ দিনে কোনো অভিযোগ আসেনি" />
          </Card>
          <Card className="c4" title="অভিযোগের অবস্থা" sub={`মোট ${formatBn(c.total)}টি`} icon="layers">
            <Donut data={statusSlices} ariaLabel="অবস্থা অনুযায়ী অভিযোগ" centerLabel="মোট অভিযোগ" emptyText="এখনো কোনো অভিযোগ নেই" />
          </Card>
        </div>
      ) : p && (
        <div className="dash-row">
          {lists.recent('c8')}
          <Card className="c4" title="পোস্টের অবস্থা" icon="layers">
            <Donut data={postSlices} ariaLabel="অবস্থা অনুযায়ী পোস্ট" centerLabel="মোট পোস্ট" emptyText="এখনো কোনো পোস্ট নেই" />
          </Card>
        </div>
      )}

      {c && (
        <div className="dash-row keep6">
          <Card className="c6" title="বিষয় অনুযায়ী অভিযোগ" sub="কোন সমস্যা বেশি" icon="list"><BarList rows={catRows} ariaLabel="বিষয় অনুযায়ী অভিযোগ" emptyText="এখনো কোনো অভিযোগ আসেনি" /></Card>
          <Card className="c6" title="উপজেলা অনুযায়ী অভিযোগ" sub="কোথায় বেশি চাপ" icon="pin"><BarList rows={upzRows} ariaLabel="উপজেলা অনুযায়ী অভিযোগ" emptyText="এখনো কোনো অভিযোগ আসেনি" tone="blue" /></Card>
        </div>
      )}

      <div className="dash-row keep6">
        {lists.approvals}{lists.latest}{c ? lists.recent('c6') : null}{lists.events}
      </div>

      {(pr || ct || d.activity) && (
        <div className="dash-row">
          {pr && (
            <Card className="c5" title="প্রতিশ্রুতির অবস্থা" sub={pr.total ? `মোট ${toBn(pr.total)}টি প্রতিশ্রুতি` : undefined} icon="promises" actions={can('promises.edit') ? <Link className="sec-link" to={go('promises')}>হালনাগাদ<Icon name="arrowRight" size={15} /></Link> : undefined}>
              {pr.total === 0
                ? <EmptyState compact icon="promises" title="প্রতিশ্রুতি যোগ করা হয়নি" text="নির্বাচনী প্রতিশ্রুতি যোগ করে অগ্রগতি জানালে নাগরিকরা সাইটে দেখতে পাবেন।" action={can('promises.edit') ? <Button variant="accent" size="sm" icon="plus" to={go('promises')}>প্রতিশ্রুতি যোগ করুন</Button> : undefined} />
                : <div className="stack">
                  <ProgressBar value={pr.avgPct} label="প্রতিশ্রুতির গড় অগ্রগতি" tone="green" />
                  <div className="two-stats">{(['done', 'ongoing', 'late'] as const).map((k) => <div className="mini" key={k}><b>{toBn(pr.byStatus[k] ?? 0)}</b><span>{PROMISE_STATUS_LABEL[k]?.[0]}</span></div>)}</div>
                  {pr.late.length > 0 && <div><p className="muted" style={{ fontSize: 13.5, marginBottom: 6 }}>বিলম্বিত, আগে দেখুন</p><BarList rows={pr.late.map((x) => ({ key: x.id, label: x.name, value: x.pct, tone: 'red' as const }))} max={100} format={(n) => `${toBn(n)}%`} ariaLabel="বিলম্বিত প্রতিশ্রুতির অগ্রগতি" /></div>}
                </div>}
            </Card>
          )}
          {ct && (
            <Card className={pr ? 'c7' : 'c12'} title="সাইট প্রস্তুতি" sub="পাবলিক সাইট পূর্ণাঙ্গ করতে যা বাকি" icon="rocket">
              <Readiness ct={ct} posts={p?.byStatus.published ?? 0} promises={pr?.total ?? 0} go={go} />
            </Card>
          )}
          {d.activity && (
            <Card className="c12" title="সাম্প্রতিক কার্যক্রম" sub="অফিসের কে কী করছেন" icon="activity" actions={can('audit.view') ? <Link className="sec-link" to={go('audit')}>অডিট লগ<Icon name="arrowRight" size={15} /></Link> : undefined}>
              {d.activity.items.length === 0
                ? <EmptyState compact icon="activity" title="এখনো কোনো কার্যক্রম নেই" text="পোস্ট, অনুমোদন বা অভিযোগে কাজ হলে এখানে দেখা যাবে।" />
                : <Timeline items={d.activity.items.map((a, i) => { const m = iconFor(a.action); return { id: `${a.action}${i}`, title: <><b>{a.actorName}</b> · {a.label}</>, meta: bnAgo(a.at), icon: m.icon, tone: m.tone }; })} />}
            </Card>
          )}
        </div>
      )}

      {qas.length > 0 && (
        <Card title="দ্রুত কাজ" icon="sparkles">
          <div className="qa">
            {qas.map((x) => routeExists(x.path)
              ? <Link key={x.label} to={go(x.path)} className="qa-i"><span className="chip-ico"><Icon name={x.icon} size={20} /></span><span><b>{x.label}</b><small>{x.sub}</small></span><Icon name="arrowRight" size={16} className="go" /></Link>
              : <div key={x.label} className="qa-i soon" aria-disabled="true"><span className="chip-ico"><Icon name={x.icon} size={20} /></span><span><b>{x.label}</b><small>শীঘ্রই আসছে</small></span></div>)}
          </div>
        </Card>
      )}
      <p className="muted" style={{ fontSize: 13, textAlign: 'right' }}>সর্বশেষ হালনাগাদ: {bnAgo(d.generatedAt)}</p>

      <ReasonDialog title="ফেরত পাঠানোর কারণ" open={!!rej} onClose={() => setRej(null)} danger confirmLabel="ফেরত পাঠান" label="কী ঠিক করতে হবে"
        onConfirm={async (reason) => { await api.post(`/posts/${rej}/reject`, { reason }); toast('সম্পাদকের কাছে ফেরত গেছে', 'ok'); await qc.invalidateQueries({ queryKey: ['tenant', id] }); }} />
    </div>
  );
}

/* Site readiness: pages that have a live copy + at least one item in each collection. Links go to the editors; an editor that
   does not exist yet (routes.ts) is shown as "শীঘ্রই". */
function Readiness({ ct, posts, promises, go }: { ct: NonNullable<Dash['content']>; posts: number; promises: number; go: (p: string) => string }) {
  const items: Array<{ key: string; label: string; done: boolean; path?: string }> = [
    ...ct.pages.map((x) => ({ key: x.key, label: x.label, done: x.ready, path: EDITOR_ROUTE[x.key] })),
    { key: 'posts', label: 'অন্তত একটি প্রকাশিত পোস্ট', done: posts > 0, path: EDITOR_ROUTE.posts },
    { key: 'promises', label: 'প্রতিশ্রুতি যোগ', done: promises > 0, path: EDITOR_ROUTE.promises },
    { key: 'gallery', label: 'গ্যালারিতে ছবি', done: ct.gallery > 0, path: EDITOR_ROUTE.gallery },
    { key: 'videos', label: 'ভিডিও', done: ct.videos > 0, path: EDITOR_ROUTE.videos },
    { key: 'events', label: 'আসন্ন কর্মসূচি', done: ct.events > 0, path: EDITOR_ROUTE.events },
  ];
  const done = items.filter((i) => i.done).length;
  return (
    <div className="ready">
      <div className="ready-ring">
        <ProgressRing value={ct.readinessPct} label="সাইট প্রস্তুতি" tone={ct.readinessPct >= 80 ? 'green' : 'brass'} sub="প্রস্তুত" />
        <p>{toBn(done)}/{toBn(items.length)} ধাপ সম্পন্ন</p>
      </div>
      <ul className="checklist">
        {items.map((i) => (
          <li key={i.key} className={i.done ? 'ck-ok' : 'ck-no'}>
            <Icon name={i.done ? 'checkCircle' : 'circle'} size={19} />
            <span className="ck-l">{i.label}</span>
            {!i.done && i.path && (routeExists(i.path) ? <Link to={go(i.path)}>যোগ করুন</Link> : <span className="ck-soon">শীঘ্রই</span>)}
          </li>
        ))}
      </ul>
    </div>
  );
}
