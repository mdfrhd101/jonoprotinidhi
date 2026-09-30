import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { papi } from '../../api';
import { Badge, Button, Card, Chips, DataTable, Drawer, EmptyState, ErrorBox, Icon, PageHead, Pager, SearchInput, type Column } from '../../components';
import { ROLE_LABEL, bnDateTime, toBn } from '../../format';
import { ACTION_FILTERS, actionLabel, actionTone, type TenantRow } from './shared';

/* Platform audit log (/super/audit), FR-SA-06. Append-only on the server. Filters live in the URL (the tenant page links here
   with ?tenantId=). The API already strips citizen IPs, user agents and identity-view reasons (BUG-2026-018); diffs were
   redacted when they were written. */

export type AuditItem = {
  _id: string; tenantId: string | null; tenantName: string | null; action: string; at: string; reason: string | null; ip: string | null;
  actor: { name: string | null; role: string | null; viaSuperAdmin: boolean } | null;
  entity: { type?: string; id?: string; label?: string } | null; diff: { before?: unknown; after?: unknown } | null;
};
type Page = { items: AuditItem[]; page: number; total: number; totalPages: number };
const ACTOR_TYPES = [{ value: '', label: 'সবাই' }, { value: 'super', label: 'Super Admin / সাপোর্ট' }, { value: 'office', label: 'MP অফিস ও নাগরিক' }] as const;
/** Who did it when the row has no signed-in actor: a public complaint submission comes from a citizen, the rest is the system. */
const whoFallback = (action: string) => (action === 'complaint.create' ? 'নাগরিক (পাবলিক সাইট)' : 'সিস্টেম');
const FILTER_KEYS = ['tenantId', 'action', 'actorType', 'actor', 'from', 'to'] as const;

export function SuperAudit() {
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) ?? ''])) as Record<(typeof FILTER_KEYS)[number], string>;
  const [actor, setActor] = useState(f.actor);
  const [open, setOpen] = useState<AuditItem | null>(null);
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }); };
  // debounce the free-text actor filter
  useEffect(() => { const h = setTimeout(() => { if (actor.trim() !== f.actor) setParam('actor', actor.trim()); }, 350); return () => clearTimeout(h); }, [actor]); // eslint-disable-line react-hooks/exhaustive-deps

  const qs = new URLSearchParams({ page: String(page), limit: '25' });
  for (const k of FILTER_KEYS) if (f[k]) qs.set(k, f[k]);
  const q = useQuery({ queryKey: ['super', 'audit', qs.toString()], queryFn: () => papi.get<Page>(`/super/audit?${qs}`), placeholderData: (prev) => prev });
  const tenants = useQuery({ queryKey: ['super', 'tenants'], queryFn: () => papi.get<TenantRow[]>('/super/tenants') });
  const active = FILTER_KEYS.filter((k) => f[k]).length;
  const tenantName = useMemo(() => tenants.data?.find((t) => t.id === f.tenantId)?.mpName, [tenants.data, f.tenantId]);

  const columns: Array<Column<AuditItem>> = [
    { key: 'at', header: 'সময়', nowrap: true, cell: (a) => <span className="num">{bnDateTime(a.at)}</span> },
    { key: 'what', header: 'কী হয়েছে', primary: true, cell: (a) => {
      const t = actionTone(a.action);
      return (
        <div className="sa-what">
          <span className={`sa-dot ${t.tone}`} aria-hidden><Icon name={t.icon} size={14} /></span>
          <div><b>{actionLabel(a.action)}</b>{a.entity?.label && a.entity.label !== a.tenantName ? <span className="muted">: {a.entity.label}</span> : null}
            <small className="sa-code">{a.action}{a.reason ? <> · কারণ: {a.reason}</> : null}</small></div>
        </div>);
    } },
    { key: 'who', header: 'কে', cell: (a) => <div className="sa-cellstack"><b>{a.actor?.name ?? whoFallback(a.action)}</b>{a.actor?.viaSuperAdmin ? <Badge tone="warn">Super Admin</Badge> : a.actor?.role ? <small className="muted">{ROLE_LABEL[a.actor.role] ?? a.actor.role}</small> : null}</div> },
    { key: 'site', header: 'সাইট', cell: (a) => a.tenantId ? <Link to={`/super/tenants/${a.tenantId}`}>{a.tenantName ?? 'সাইট'}</Link> : <span className="muted">প্ল্যাটফর্ম</span> },
    { key: 'd', header: <span className="sr">বিস্তারিত</span>, mobileLabel: 'বিস্তারিত', align: 'right', cell: (a) => <Button size="sm" variant="quiet" icon="eye" onClick={() => setOpen(a)} aria-label={`বিস্তারিত: ${actionLabel(a.action)}, ${bnDateTime(a.at)}`}>বিস্তারিত</Button> },
  ];

  return (
    <>
      <PageHead kicker="অডিট লগ" icon="audit" title="কে, কখন, কী বদলাল" sub="Super Admin কোনো MP-র সাইটে কিছু ঠিক করলেও এখানে রেকর্ড হয়। এই লগ মোছা বা বদলানো যায় না। নাগরিকের পরিচয় বা IP এখানে আসে না।" />
      <Card className="sa-filters" pad="sm">
        <div className="sa-frow">
          <label className="sa-f"><span>সাইট</span>
            <select value={f.tenantId} onChange={(e) => setParam('tenantId', e.target.value)} aria-label="সাইট">
              <option value="">সব সাইট ও প্ল্যাটফর্ম</option>
              {f.tenantId && !tenants.data?.some((t) => t.id === f.tenantId) && <option value={f.tenantId}>নির্বাচিত সাইট</option>}
              {(tenants.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.mpName} ({t.seatName}-{toBn(t.seatNumber)})</option>)}
            </select></label>
          <label className="sa-f"><span>কাজের ধরন</span>
            <select value={f.action} onChange={(e) => setParam('action', e.target.value)} aria-label="কাজের ধরন">{ACTION_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label className="sa-f"><span>তারিখ থেকে</span><input type="date" value={f.from} max={f.to || undefined} onChange={(e) => setParam('from', e.target.value)} aria-label="তারিখ থেকে" /></label>
          <label className="sa-f"><span>তারিখ পর্যন্ত</span><input type="date" value={f.to} min={f.from || undefined} onChange={(e) => setParam('to', e.target.value)} aria-label="তারিখ পর্যন্ত" /></label>
        </div>
        <div className="sa-frow">
          <SearchInput value={actor} onChange={setActor} label="কে করেছেন (নাম)" placeholder="কে করেছেন: নাম দিয়ে খুঁজুন" />
          <Chips label="কে" value={f.actorType} onChange={(v) => setParam('actorType', v)} options={ACTOR_TYPES.map((o) => ({ value: o.value as string, label: o.label }))} />
          {active > 0 && <Button size="sm" variant="quiet" icon="close" onClick={() => { setActor(''); setSp(new URLSearchParams(), { replace: true }); }}>সব ফিল্টার মুছুন ({toBn(active)})</Button>}
        </div>
      </Card>
      {q.data && <p className="muted sa-count" role="status" aria-live="polite">{tenantName ? <><b>{tenantName}</b> · </> : null}মোট {toBn(q.data.total)}টি রেকর্ড{q.isFetching ? ' · হালনাগাদ হচ্ছে…' : ''}</p>}
      {q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : (
        <DataTable caption="অডিট লগ" rows={q.data?.items ?? []} rowKey={(a) => a._id} loading={q.isLoading} columns={columns}
          rowLabel={(a) => actionLabel(a.action)}
          empty={<Card><EmptyState icon="audit" title={active ? 'এই ফিল্টারে কোনো রেকর্ড নেই' : 'এখনো কোনো রেকর্ড নেই'} text={active ? 'তারিখ বা ফিল্টার বদলে দেখুন।' : undefined}
            action={active ? <Button icon="close" onClick={() => { setActor(''); setSp(new URLSearchParams(), { replace: true }); }}>ফিল্টার মুছুন</Button> : undefined} /></Card>} />
      )}
      {q.data && <Pager page={page} totalPages={q.data.totalPages} onPage={(p) => setParam('page', String(p))} />}
      <Drawer open={!!open} onClose={() => setOpen(null)} title="অডিটের বিস্তারিত" width={560}>
        {open && <AuditDetail a={open} />}
      </Drawer>
    </>
  );
}

function AuditDetail({ a }: { a: AuditItem }) {
  return (
    <div className="stack">
      <dl className="dl">
        <dt>কী</dt><dd><b>{actionLabel(a.action)}</b><br /><code className="sa-code">{a.action}</code></dd>
        <dt>কখন</dt><dd>{bnDateTime(a.at)}</dd>
        <dt>কে</dt><dd>{a.actor?.name ?? whoFallback(a.action)}{a.actor?.viaSuperAdmin ? ' (Super Admin)' : a.actor?.role ? ` (${ROLE_LABEL[a.actor.role] ?? a.actor.role})` : ''}</dd>
        <dt>সাইট</dt><dd>{a.tenantName ?? (a.tenantId ? 'সাইট' : 'প্ল্যাটফর্ম')}</dd>
        {a.entity?.label && <><dt>বিষয়</dt><dd>{a.entity.label}</dd></>}
        {a.reason && <><dt>কারণ</dt><dd>{a.reason}</dd></>}
        {a.ip && <><dt>IP</dt><dd className="num">{a.ip}</dd></>}
      </dl>
      <DiffView before={a.diff?.before} after={a.diff?.after} />
    </div>
  );
}

type Row = { key: string; before: string; after: string; changed: boolean };
const show = (v: unknown): string => {
  if (v === undefined) return '';
  if (v === null) return '—';
  if (v === '[redacted]') return '[গোপন, লুকানো]';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v, (_k, x) => (x === '[redacted]' ? '[গোপন, লুকানো]' : x), 1);
};
/** Top-level field-by-field comparison of a redacted before/after pair. Exported for tests. */
export function diffRows(before: unknown, after: unknown): Row[] {
  const b = before && typeof before === 'object' ? (before as Record<string, unknown>) : {};
  const a = after && typeof after === 'object' ? (after as Record<string, unknown>) : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return keys.map((k) => { const x = show(b[k]), y = show(a[k]); return { key: k, before: x, after: y, changed: x !== y }; });
}

export function DiffView({ before, after }: { before: unknown; after: unknown }) {
  const [all, setAll] = useState(false);
  const rows = diffRows(before, after);
  if (!rows.length) return <p className="muted" style={{ margin: 0 }}>এই কাজে আগে/পরের কোনো তুলনা রাখা হয়নি।</p>;
  const changed = rows.filter((r) => r.changed);
  const shown = all ? rows : changed.length ? changed : rows;
  return (
    <div className="sa-diff">
      <div className="sa-diff-h"><b>আগে ও পরে</b>{changed.length !== rows.length && <button type="button" className="link" onClick={() => setAll((v) => !v)} aria-pressed={all}>{all ? 'শুধু বদলানো ঘর' : `সব ঘর (${toBn(rows.length)})`}</button>}</div>
      <div className="tbl-wrap"><table className="tbl dense sa-diff-t">
        <caption className="sr">আগে ও পরের মান</caption>
        <thead><tr><th scope="col">ঘর</th><th scope="col">আগে</th><th scope="col">পরে</th></tr></thead>
        <tbody>{shown.map((r) => <tr key={r.key} className={r.changed ? 'chg' : undefined}><th scope="row"><code>{r.key}</code></th><td><span className="sa-old">{r.before || <span className="muted">—</span>}</span></td><td><span className="sa-new">{r.after || <span className="muted">—</span>}</span></td></tr>)}</tbody>
      </table></div>
      <p className="muted sa-note">পাসওয়ার্ড, ফোন, নাগরিকের তথ্যের মতো গোপন ঘর লেখার সময়ই মুছে "[গোপন, লুকানো]" রাখা হয়।</p>
    </div>
  );
}
