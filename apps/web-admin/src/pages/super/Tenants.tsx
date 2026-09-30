import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { papi } from '../../api';
import { Avatar, Badge, Button, Card, Chips, DataTable, EmptyState, ErrorBox, PageHead, PillOf, SearchInput, type Column } from '../../components';
import { TENANT_STATUS_LABEL, bnAgo, formatBn, toBn } from '../../format';
import { ActAsDialog } from './ActAs';
import { DNS_LABEL, MP_ROLE_LABEL, seatOf, useIsSuper, type TenantRow } from './shared';

/* All tenants (/super/tenants): search, status filter (kept in the URL so the dashboard can link to it), sort, and a table
   that becomes cards below 720 px. Counts only; the complaint numbers never carry identities. */

type Status = '' | 'live' | 'setup' | 'suspended' | 'attention';
type Sort = 'new' | 'open' | 'activity' | 'name';
const SORTS: Array<{ value: Sort; label: string }> = [{ value: 'new', label: 'নতুন আগে' }, { value: 'open', label: 'খোলা অভিযোগ বেশি' }, { value: 'activity', label: 'সাম্প্রতিক কার্যক্রম' }, { value: 'name', label: 'নাম অনুযায়ী' }];
const needsAttention = (t: TenantRow) => t.status === 'suspended' || t.stale || t.overdue > 0 || (t.slaPct != null && t.slaPct < 80) || t.domains.some((d) => d.type === 'custom' && d.dnsStatus !== 'active');

/** Pure filter + sort, exported for tests. `q` matches name, seat (Bangla or Latin digits), slug and domain hosts. */
export function filterTenants(rows: TenantRow[], q: string, status: Status, sort: Sort): TenantRow[] {
  const needle = q.trim().toLowerCase();
  const out = rows.filter((t) => {
    if (status === 'attention' ? !needsAttention(t) : status && t.status !== status) return false;
    if (!needle) return true;
    const hay = [t.mpName, t.seat, seatOf(t), t.slug, t.ministry, ...t.domains.map((d) => d.host)].join(' ').toLowerCase();
    return hay.includes(needle);
  });
  const time = (s: string | null) => (s ? new Date(s).getTime() : 0);
  if (sort === 'open') out.sort((a, b) => b.openComplaints - a.openComplaints || b.overdue - a.overdue);
  else if (sort === 'activity') out.sort((a, b) => time(b.lastActivityAt) - time(a.lastActivityAt));
  else if (sort === 'name') out.sort((a, b) => a.mpName.localeCompare(b.mpName, 'bn'));
  return out;
}

export function TenantsList() {
  const q = useQuery({ queryKey: ['super', 'tenants'], queryFn: () => papi.get<TenantRow[]>('/super/tenants') });
  const [sp, setSp] = useSearchParams();
  const su = useIsSuper();
  const status = (sp.get('status') ?? '') as Status;
  const [s, setS] = useState(sp.get('q') ?? '');
  const [sort, setSort] = useState<Sort>('new');
  const [acting, setActing] = useState<TenantRow | null>(null);
  const all = q.data ?? [];
  const rows = useMemo(() => filterTenants(all, s, status, sort), [all, s, status, sort]);
  const setStatus = (v: Status) => { const n = new URLSearchParams(sp); if (v) n.set('status', v); else n.delete('status'); setSp(n, { replace: true }); };
  const count = (st: Status) => filterTenants(all, '', st, 'new').length;

  const columns: Array<Column<TenantRow>> = [
    { key: 'mp', header: 'MP · আসন', primary: true, cell: (t) => (
      <div className="sa-mp">
        <Avatar name={t.mpName} size={40} />
        <div><Link to={t.id} className="cell-t"><b>{t.mpName}</b></Link><small>{seatOf(t)} · {MP_ROLE_LABEL[t.role] ?? t.role}{t.ministry ? `, ${t.ministry}` : ''}</small></div>
      </div>) },
    { key: 'st', header: 'অবস্থা', nowrap: true, cell: (t) => <div className="sa-cellstack"><PillOf map={TENANT_STATUS_LABEL} k={t.status} />{t.status === 'setup' && !t.ownerActive && <small className="muted">MP-র অ্যাকাউন্ট চালু হয়নি</small>}</div> },
    { key: 'dom', header: 'ডোমেইন', cell: (t) => (
      <ul className="sa-doms">{t.domains.length === 0 ? <li className="muted">—</li> : t.domains.map((d) => (
        <li key={d.id}><span className="sa-host">{d.host}</span>{d.primary && <Badge tone="brass">প্রধান</Badge>}{d.type === 'custom' && <PillOf map={DNS_LABEL} k={d.dnsStatus} />}</li>))}
      </ul>) },
    { key: 'posts', header: 'পোস্ট', align: 'right', nowrap: true, cell: (t) => <div className="sa-num"><b className="num">{formatBn(t.publishedPosts)}</b><small className={t.stale ? 'sa-bad' : 'muted'}>{t.daysSinceLastPost == null ? 'এখনো পোস্ট নেই' : t.daysSinceLastPost === 0 ? 'শেষ পোস্ট: আজ' : `শেষ: ${toBn(t.daysSinceLastPost)} দিন আগে`}</small></div> },
    { key: 'cmp', header: 'অভিযোগ (৩০ দিন)', align: 'right', nowrap: true, cell: (t) => <div className="sa-num"><b className="num">{formatBn(t.complaintsLast30d)}</b><small className="muted">খোলা {formatBn(t.openComplaints)}{t.overdue ? <span className="sa-bad"> · সময় পেরোনো {toBn(t.overdue)}</span> : null}</small></div> },
    { key: 'act', header: 'শেষ কার্যক্রম', nowrap: true, hideOnMobile: true, cell: (t) => <span className="muted">{t.lastActivityAt ? bnAgo(t.lastActivityAt) : 'এখনো নেই'}</span> },
    { key: 'a', header: <span className="sr">কাজ</span>, mobileLabel: 'কাজ', align: 'right', nowrap: true, cell: (t) => (
      <div className="acts row-acts">
        <Link className="btn btn-g btn-s" to={t.id} aria-label={`বিস্তারিত: ${t.mpName}`}>বিস্তারিত</Link>
        <Button size="sm" variant="quiet" icon="eye" onClick={() => setActing(t)} aria-label={`অ্যাডমিনে ঢুকুন: ${t.mpName}`}>ঢুকুন</Button>
      </div>) },
  ];

  return (
    <>
      <PageHead kicker="MP ও সাইট" icon="tenants" title="সব MP-র সাইট" sub="প্রতিটি MP একটি আলাদা tenant। এক MP-র ডেটা আরেকজনের প্যানেলে কখনো দেখা যায় না। অভিযোগের শুধু সংখ্যা দেখানো হয়।"
        actions={su ? <Button variant="accent" icon="plus" to="new">নতুন MP যোগ করুন</Button> : undefined} />
      {q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : (
        <>
          <div className="bar sa-bar">
            <SearchInput value={s} onChange={setS} label="খুঁজুন" placeholder="নাম, আসন, সাবডোমেইন বা ডোমেইন দিয়ে খুঁজুন" />
            <label className="sa-sort"><span className="sr">সাজানো</span>
              <select aria-label="সাজানো" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>{SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            </label>
          </div>
          <div className="bar"><Chips<Status> label="অবস্থা" value={status} onChange={setStatus} options={[
            { value: '', label: 'সব', count: q.data ? all.length : undefined }, { value: 'live', label: 'লাইভ', count: q.data ? count('live') : undefined },
            { value: 'setup', label: 'সেটআপ', count: q.data ? count('setup') : undefined }, { value: 'suspended', label: 'স্থগিত', count: q.data ? count('suspended') : undefined },
            { value: 'attention', label: 'নজর দরকার', count: q.data ? count('attention') : undefined }]} /></div>
          {q.data && <p className="muted sa-count" role="status" aria-live="polite">{toBn(rows.length)}টি সাইট দেখানো হচ্ছে</p>}
          <DataTable caption="MP ও সাইটের তালিকা" rows={rows} rowKey={(t) => t.id} loading={q.isLoading} columns={columns}
            empty={all.length === 0
              ? <Card><EmptyState icon="tenants" title="এখনো কোনো MP যোগ করা হয়নি" text="MP অফিসের লিখিত সম্মতি পেলে প্রথম সাইটটি তৈরি করুন।" action={su ? <Button variant="accent" icon="plus" to="new">নতুন MP যোগ করুন</Button> : undefined} /></Card>
              : <Card><EmptyState icon="search" title="কিছু পাওয়া যায়নি" text="অন্য নাম বা আসন দিয়ে খুঁজুন, অথবা ফিল্টার মুছে দিন।" action={<Button variant="ghost" icon="close" onClick={() => { setS(''); setStatus(''); }}>ফিল্টার মুছুন</Button>} /></Card>} />
        </>
      )}
      <ActAsDialog tenant={acting} open={!!acting} onClose={() => setActing(null)} />
    </>
  );
}
