import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { complaintTransitions, type ComplaintStatus } from '@jonoprotinidhi/shared';
import { ApiFail } from '../../api';
import { useTenant } from '../../tenant';
import { Button, Chips, DataTable, EmptyState, ErrorBox, Field, Icon, Loading, PageHead, Pager, PillOf, ReasonDialog, SearchInput, Timeline, useToast, type Column } from '../../components';
import { COMPLAINT_STATUS_LABEL, bnDate, bnDateTime, toBn } from '../../format';

const STATUS_CHIPS: Array<[string, string]> = [['open', 'খোলা'], ['new', 'নতুন'], ['mine', 'আমার'], ['late', '৭ দিনের বেশি'], ['solved', 'সমাধান'], ['', 'সব']];

/* ---------- inbox: list on the left, detail on the right ---------- */
export default function Complaints() {
  const cid = useParams()['*'] || undefined; // route is complaints/* so the selected id never nests
  const nav = useNavigate();
  const { api, id, info, can } = useTenant();
  const [chip, setChip] = useState('open'); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const officer = info.role === 'officer';
  const qs = () => {
    const p = new URLSearchParams({ page: String(page), limit: '15' });
    if (chip === 'mine') p.set('mine', '1'); else if (chip === 'late') p.set('late', '1'); else if (chip) p.set('status', chip);
    if (q) p.set('q', q);
    return p.toString();
  };
  const list = useQuery({ queryKey: ['tenant', id, 'complaints', chip, q, page], queryFn: () => api.get<{ items: any[]; totalPages: number; total: number }>(`/complaints?${qs()}`) });
  const exportCsv = async () => {
    const b = await api.blob('/complaints/export.csv');
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'complaints-report.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const cols: Array<Column<any>> = [
    { key: 'c', header: 'অভিযোগ', primary: true, cell: (c) => <><b>{c.category}</b><small>{c.trackingId} · {bnDate(c.createdAt)}</small></> },
    { key: 'a', header: 'এলাকা', cell: (c) => <span>{c.union}<small>{c.upazila}</small></span> },
    { key: 's', header: 'অবস্থা', cell: (c) => <><PillOf map={COMPLAINT_STATUS_LABEL} k={c.status} />{c.overdue && <> <span className="pill bad plain">দেরি</span></>}</> },
  ];
  return (
    <>
      <PageHead kicker="অভিযোগ" icon="complaints" title="অভিযোগের ইনবক্স" sub={officer ? 'আপনার উপজেলার অভিযোগ।' : 'সব উপজেলার অভিযোগ।'} actions={can('complaints.export') && <button className="btn btn-g" onClick={exportCsv}><Icon name="download" />রিপোর্ট (CSV, নাম-নম্বর ছাড়া)</button>} />
      <p className="note info" style={{ margin: '0 0 20px' }}><Icon name="lock" />নাগরিকের নাম ও নম্বর শুধু দায়িত্বপ্রাপ্ত কর্মকর্তা দেখতে পারেন, আর দেখলে সেটা অডিট লগে যায়।</p>
      <div className="bar">
        <Chips label="ফিল্টার" value={chip} options={STATUS_CHIPS.filter(([k]) => officer || k !== 'mine').map(([value, label]) => ({ value, label }))} onChange={(v) => { setChip(v); setPage(1); }} />
        <SearchInput label="আইডি বা বিষয় দিয়ে খুঁজুন" value={q} onChange={(v) => { setQ(v); setPage(1); }} />
      </div>
      <div className="inbox">
        <div>
          {list.isError ? <ErrorBox error={list.error} retry={() => list.refetch()} /> : (
            <DataTable caption="অভিযোগের তালিকা" columns={cols} rows={list.data?.items ?? []} rowKey={(c) => c.id} loading={list.isLoading} selectedKey={cid ?? null} onRowClick={(c) => nav(`/t/${id}/complaints/${c.id}`)} rowLabel={(c) => `${c.category}, ${c.trackingId}`}
              empty={<div className="card"><EmptyState icon="inbox" title="এই ফিল্টারে কোনো অভিযোগ নেই" text="অন্য ফিল্টার বেছে দেখুন।" /></div>} />
          )}
          {list.data && <Pager page={page} totalPages={list.data.totalPages} onPage={setPage} />}
        </div>
        <div className="detail">{cid ? <Detail key={cid} cid={cid} /> : <div className="card"><EmptyState compact icon="complaints" title="বাঁ দিকের তালিকা থেকে একটা অভিযোগ বেছে নিন।" /></div>}</div>
      </div>
    </>
  );
}

/* ---------- detail ---------- */
function Detail({ cid }: { cid: string }) {
  const { api, id, can, info } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const [note, setNote] = useState(''); const [askPii, setAskPii] = useState(false);
  const [pii, setPii] = useState<{ name: string; phone: string } | null>(null);
  const c = useQuery({ queryKey: ['tenant', id, 'complaint', cid], queryFn: () => api.get(`/complaints/${cid}`) });
  const team = useQuery({ queryKey: ['tenant', id, 'team'], enabled: can('team.manage'), queryFn: () => api.get<any[]>('/team') });
  useEffect(() => () => setPii(null), [cid]); // identity is never kept when the officer moves on

  const refresh = () => qc.invalidateQueries({ queryKey: ['tenant', id] });
  const fail = (e: unknown) => toast(e instanceof ApiFail ? e.message : 'কিছু ভুল হয়েছে', 'bad');
  const patch = useMutation({ mutationFn: (b: object) => api.patch(`/complaints/${cid}`, b), onSuccess: () => { toast('সংরক্ষণ হয়েছে', 'ok'); refresh(); }, onError: fail });
  const addNote = useMutation({ mutationFn: () => api.post(`/complaints/${cid}/notes`, { text: note }), onSuccess: () => { setNote(''); toast('নোট যোগ হয়েছে', 'ok'); refresh(); }, onError: fail });
  const sms = useMutation({ mutationFn: (templateKey: string) => api.post(`/complaints/${cid}/sms`, { templateKey }), onSuccess: (r: any) => { toast(r.sent ? 'SMS পাঠানো হয়েছে' : 'SMS পাঠানো যায়নি', r.sent ? 'ok' : 'bad'); refresh(); }, onError: fail });

  if (c.isLoading) return <Loading />;
  if (c.isError) return <ErrorBox error={c.error} />;
  const d = c.data;
  const next = complaintTransitions[d.status as ComplaintStatus] ?? [];
  const canManage = can('complaints.manage');
  const officers = (team.data ?? []).filter((m) => m.role === 'officer' && m.status === 'active' && m.scope.includes(d.upazila));
  const canAct = canManage || info.role === 'officer';
  return (
    <div className="card">
      <div className="sec-t" style={{ marginBottom: 6 }}><span className="muted num" style={{ fontSize: 13.5 }}>{d.trackingId} · {channelLabel(d.channel)}</span><PillOf map={COMPLAINT_STATUS_LABEL} k={d.status} /></div>
      <h2 className="h2" style={{ fontSize: '1.2rem' }}>{d.category}</h2>
      <p style={{ margin: '8px 0', lineHeight: 1.8 }}>{d.description}</p>
      <dl className="dl" style={{ margin: '12px 0' }}>
        <dt>এলাকা</dt><dd>{d.place ? `${d.place}, ` : ''}{d.union}, {d.upazila}</dd>
        <dt>গৃহীত</dt><dd>{bnDateTime(d.createdAt)}</dd>
        <dt>সময়সীমা</dt><dd>{bnDate(d.slaDueAt)} {d.overdue && <span className="pill bad plain">সময় পেরিয়েছে</span>}</dd>
        <dt>নম্বর যাচাই</dt><dd>{d.anonymous ? 'বেনামী' : d.otpVerified ? 'OTP দিয়ে যাচাই হয়েছে' : 'যাচাই হয়নি'}</dd>
      </dl>

      <section aria-label="নাগরিকের পরিচয়">
        {d.anonymous ? <div className="pii"><span>বেনামী অভিযোগ: নাম ও নম্বর নেই, তাই SMS যাবে না।</span></div>
          : pii ? <div className="pii" role="status"><span><b>{pii.name || 'নাম দেননি'}</b> · <span className="num">{pii.phone}</span></span><button type="button" className="btn btn-g btn-s" style={{ marginLeft: 'auto' }} onClick={() => setPii(null)}>লুকান</button></div>
            : !d.pii.available ? <div className="pii"><span>নির্ধারিত সময় পেরোনোয় পরিচয় মুছে ফেলা হয়েছে।</span></div>
              : d.canViewPii ? <div className="pii"><span>নাম ও নম্বর এনক্রিপ্ট করা আছে।</span><button type="button" className="btn btn-g btn-s" style={{ marginLeft: 'auto' }} onClick={() => setAskPii(true)}>দেখুন (লগ হবে)</button></div>
                : <div className="pii"><span>নাম ও নম্বর শুধু দায়িত্বপ্রাপ্ত কর্মকর্তা দেখতে পারেন।{info.viaSuperAdmin ? ' Super Admin-ও দেখতে পারেন না।' : ''}</span></div>}
      </section>

      {canAct && (
        <div className="frow" style={{ marginTop: 16 }}>
          <Field label="অবস্থা">{(p) => <select {...p} value={d.status} onChange={(e) => e.target.value !== d.status && patch.mutate({ status: e.target.value, version: d.version })}>
            <option value={d.status}>{COMPLAINT_STATUS_LABEL[d.status]?.[0]}</option>{next.map((s) => <option key={s} value={s}>{COMPLAINT_STATUS_LABEL[s]?.[0]}</option>)}</select>}</Field>
          {canManage && <Field label="দায়িত্ব দিন">{(p) => <select {...p} value={d.assignedTo ?? ''} onChange={(e) => patch.mutate({ assignedTo: e.target.value || null, version: d.version })}>
            <option value="">— কেউ না —</option>{officers.map((o) => <option key={o.userId} value={o.userId}>{o.name}</option>)}</select>}</Field>}
        </div>
      )}
      {canAct && !d.anonymous && <div className="acts" style={{ marginTop: 8 }}>{(['received', 'verify', 'progress', 'solved'] as const).map((t) => <button key={t} type="button" className="btn btn-g btn-s" disabled={sms.isPending} onClick={() => sms.mutate(t)}>SMS: {SMS_LABEL[t]}</button>)}</div>}

      {(can('complaints.note') || canManage) && (
        <form onSubmit={(e) => { e.preventDefault(); if (note.trim().length >= 2) addNote.mutate(); }} style={{ marginTop: 16 }}>
          <Field label="ভেতরের নোট (নাগরিক দেখবেন না)">{(p) => <textarea {...p} maxLength={600} style={{ minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <button className="btn btn-p" style={{ marginTop: 8 }} disabled={note.trim().length < 2 || addNote.isPending}>নোট যোগ করুন</button>
        </form>
      )}
      <h3 className="h2" style={{ fontSize: '1.05rem', margin: '24px 0 14px' }}>কার্যক্রমের ইতিহাস</h3>
      <Timeline label="কার্যক্রমের ইতিহাস" items={d.events.map((e: any, i: number) => ({ id: String(i), title: <b>{eventLabel(e)}</b>, meta: `${e.by ?? 'সিস্টেম'} · ${bnDateTime(e.at)}`, icon: e.type === 'status' ? 'check' : e.type === 'note' ? 'edit' : e.type === 'sms' ? 'send' : e.type === 'pii_view' ? 'eye' : 'circle', tone: e.type === 'pii_view' ? 'warn' : 'brass' }))} />

      <ReasonDialog title="নাগরিকের পরিচয় দেখবেন?" open={askPii} onClose={() => setAskPii(false)} label="কী কারণে দেখছেন" min={5} confirmLabel="দেখুন"
        onConfirm={async (purpose) => { setPii(await api.post(`/complaints/${cid}/pii-view`, { purpose })); refresh(); }}>
        <p style={{ margin: 0 }}>শুধু অভিযোগের কাজে ব্যবহার করবেন। প্রচারণা বা অন্য কাজে ব্যবহার নিষেধ। আপনি যে দেখেছেন, সেটা কারণসহ অডিট লগে রেকর্ড হবে।</p>
      </ReasonDialog>
    </div>
  );
}

const SMS_LABEL = { received: 'গৃহীত', verify: 'যাচাই', progress: 'প্রক্রিয়াধীন', solved: 'সমাধান' } as const;
const channelLabel = (c: string) => (c === 'hearing' ? 'গণশুনানি' : c === 'phone' ? 'ফোন' : 'অনলাইন');
function eventLabel(e: { type: string; data?: any }): string {
  switch (e.type) {
    case 'created': return 'অভিযোগ গৃহীত';
    case 'status': return `অবস্থা: ${COMPLAINT_STATUS_LABEL[e.data?.to]?.[0] ?? e.data?.to}`;
    case 'assign': return e.data?.to ? 'দায়িত্ব দেওয়া হয়েছে' : 'দায়িত্ব সরানো হয়েছে';
    case 'note': return `নোট: ${e.data?.text ?? ''}`;
    case 'sms': return `SMS ${e.data?.sent ? 'পাঠানো হয়েছে' : 'পাঠানো যায়নি'}`;
    case 'pii_view': return `পরিচয় দেখা হয়েছে (${e.data?.purpose ?? ''})`;
    default: return e.type;
  }
}
void toBn;
