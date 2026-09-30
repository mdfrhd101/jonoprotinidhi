import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { promiseInputSchema, PROMISE_SECTORS, PROMISE_STATUSES } from '@jonoshetu/shared';
import { ApiFail } from '../../api';
import { useTenant } from '../../tenant';
import { Button, Card, Dialog, EmptyState, ErrorBox, Field, Icon, Loading, PageHead, PillOf, ProgressBar, StatCard, useToast, fieldMessages } from '../../components';
import { PROMISE_STATUS_LABEL, SECTOR_LABEL, bnDate, toBn } from '../../format';

type P = { _id: string; sector: string; name: string; place: string; budgetLabel: string; targetLabel: string; pct: number; status: string; delayReason: string; updates: Array<{ date: string; text: string }> };
const blank = { sector: 'road', name: '', place: '', budgetLabel: '', targetLabel: '', pct: 0, status: 'plan', delayReason: '' };

/* Promise tracker. Rules mirror the API: "done" needs 100%, "late" needs a written reason (shown on the public site). */
export default function Promises() {
  const { api, id } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const [edit, setEdit] = useState<P | 'new' | null>(null);
  const q = useQuery({ queryKey: ['tenant', id, 'promises'], queryFn: () => api.get<P[]>('/promises') });
  const remove = useMutation({ mutationFn: (pid: string) => api.del(`/promises/${pid}`), onSuccess: () => { toast('মুছে ফেলা হয়েছে', 'ok'); qc.invalidateQueries({ queryKey: ['tenant', id, 'promises'] }); }, onError: (e) => toast(e instanceof ApiFail ? e.message : 'কিছু ভুল হয়েছে', 'bad') });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  const rows = q.data!;
  return (
    <>
      <PageHead kicker="প্রতিশ্রুতি" icon="promises" title="প্রতিশ্রুতির হালনাগাদ" sub="অগ্রগতি আর অবস্থা দিন। বিলম্বিত হলে কারণ লিখতে হয়, কারণ সেটা পাবলিক সাইটে দেখায়।" actions={<button className="btn btn-b" onClick={() => setEdit('new')}><Icon name="plus" />নতুন প্রতিশ্রুতি</button>} />
      {rows.length > 0 && (
        <div className="kpis" style={{ marginBottom: 24 }}>
          <StatCard label="মোট প্রতিশ্রুতি" value={rows.length} icon="promises" tone="brass" />
          <StatCard label="সম্পন্ন" value={rows.filter((r) => r.status === 'done').length} icon="checkCircle" tone="green" />
          <StatCard label="চলমান" value={rows.filter((r) => r.status === 'ongoing').length} icon="clock" tone="amber" />
          <StatCard label="বিলম্বিত" value={rows.filter((r) => r.status === 'late').length} icon="alert" tone="red" />
        </div>
      )}
      {!rows.length ? <div className="card"><EmptyState icon="promises" title="এখনো কোনো প্রতিশ্রুতি যোগ করা হয়নি" text="নির্বাচনী প্রতিশ্রুতি যোগ করে অগ্রগতি জানালে নাগরিকরা পাবলিক সাইটে দেখতে পাবেন।" action={<Button variant="accent" icon="plus" onClick={() => setEdit('new')}>প্রথম প্রতিশ্রুতি যোগ করুন</Button>} /></div> : PROMISE_SECTORS.map((sec) => {
        const list = rows.filter((r) => r.sector === sec); if (!list.length) return null;
        return (
          <Card key={sec} title={SECTOR_LABEL[sec]} sub={`${toBn(list.length)}টি প্রতিশ্রুতি`} pad="none" className="sector">
            <div className="tbl-wrap" style={{ border: 0, borderRadius: 0, boxShadow: 'none' }}><table className="tbl"><thead><tr><th>প্রকল্প</th><th style={{ width: 240 }}>অগ্রগতি</th><th style={{ width: 130 }}>অবস্থা</th><th style={{ width: 230 }} /></tr></thead>
              <tbody>{list.map((p) => (
                <tr key={p._id}><td data-label="প্রকল্প"><b>{p.name}</b><small>{p.budgetLabel} {p.targetLabel && `· ${p.targetLabel}`}{p.updates[0] ? ` · শেষ হালনাগাদ: ${bnDate(p.updates[0].date)}` : ''}</small>{p.status === 'late' && <small style={{ color: 'var(--late-d)' }}>দেরির কারণ: {p.delayReason}</small>}</td>
                  <td><ProgressBar value={p.pct} label={`${p.name} অগ্রগতি`} size="sm" tone={p.status === 'done' ? 'green' : p.status === 'late' ? 'red' : 'brass'} /></td>
                  <td><PillOf map={PROMISE_STATUS_LABEL} k={p.status} /></td>
                  <td><div className="acts" style={{ justifyContent: 'flex-end' }}><button className="btn btn-g btn-s" onClick={() => setEdit(p)}><Icon name="edit" size={15} />হালনাগাদ</button><button className="btn btn-d btn-s" aria-label={`${p.name} মুছুন`} onClick={() => window.confirm(`"${p.name}" মুছে ফেলবেন?`) && remove.mutate(p._id)}><Icon name="trash" size={15} />মুছুন</button></div></td></tr>))}</tbody></table></div></Card>);
      })}
      {edit && <Editor initial={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function Editor({ initial, onClose }: { initial: P | null; onClose: () => void }) {
  const { api, id } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState(initial ? { sector: initial.sector, name: initial.name, place: initial.place, budgetLabel: initial.budgetLabel, targetLabel: initial.targetLabel, pct: initial.pct, status: initial.status, delayReason: initial.delayReason } : blank);
  const [upd, setUpd] = useState(''); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | number) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setErrs({});
    const v = promiseInputSchema.safeParse(f);
    if (!v.success) { const m: Record<string, string> = {}; for (const i of v.error.issues) m[String(i.path[0])] ??= i.message; setErrs(m); return; }
    setBusy(true);
    try {
      const saved = initial ? await api.patch(`/promises/${initial._id}`, f) : await api.post('/promises', f);
      if (upd.trim().length >= 3) await api.post(`/promises/${saved._id}/updates`, { text: upd.trim() });
      toast('সংরক্ষণ হয়েছে, পাবলিক সাইটে দেখা যাচ্ছে', 'ok');
      await qc.invalidateQueries({ queryKey: ['tenant', id] });
      onClose();
    } catch (e) { setErrs(fieldMessages(e)); toast(e instanceof ApiFail ? e.message : 'কিছু ভুল হয়েছে', 'bad'); } finally { setBusy(false); }
  };
  return (
    <Dialog title={initial ? 'হালনাগাদ' : 'নতুন প্রতিশ্রুতি'} open onClose={onClose} footer={<><button className="btn btn-g" onClick={onClose}>বাতিল</button><button className="btn btn-p" disabled={busy} onClick={save}>সংরক্ষণ ও প্রকাশ</button></>}>
      <div className="form">
        <div className="frow">
          <Field label="খাত">{(p) => <select {...p} value={f.sector} onChange={(e) => set('sector', e.target.value)}>{PROMISE_SECTORS.map((s) => <option key={s} value={s}>{SECTOR_LABEL[s]}</option>)}</select>}</Field>
          <Field label="অবস্থা">{(p) => <select {...p} value={f.status} onChange={(e) => { set('status', e.target.value); if (e.target.value === 'done') set('pct', 100); }}>{PROMISE_STATUSES.map((s) => <option key={s} value={s}>{PROMISE_STATUS_LABEL[s]![0]}</option>)}</select>}</Field>
        </div>
        <Field label="প্রকল্পের নাম" required error={errs.name}>{(p) => <input {...p} maxLength={200} value={f.name} onChange={(e) => set('name', e.target.value)} />}</Field>
        <div className="frow"><Field label="এলাকা">{(p) => <input {...p} value={f.place} onChange={(e) => set('place', e.target.value)} />}</Field><Field label="বাজেট">{(p) => <input {...p} value={f.budgetLabel} onChange={(e) => set('budgetLabel', e.target.value)} placeholder="৳৩৮.৫ কোটি" />}</Field></div>
        <Field label="লক্ষ্য / সময়সীমা">{(p) => <input {...p} value={f.targetLabel} onChange={(e) => set('targetLabel', e.target.value)} placeholder="লক্ষ্য: জুন ২০২৭" />}</Field>
        <Field label={`অগ্রগতি: ${toBn(f.pct)}%`} error={errs.pct}>{(p) => <input {...p} type="range" min={0} max={100} value={f.pct} onChange={(e) => set('pct', Number(e.target.value))} />}</Field>
        {f.status === 'late' && <Field label="দেরির কারণ ও নতুন লক্ষ্য" required error={errs.delayReason}>{(p) => <textarea {...p} maxLength={300} style={{ minHeight: 80 }} value={f.delayReason} onChange={(e) => set('delayReason', e.target.value)} />}</Field>}
        <Field label="নতুন হালনাগাদ (পাবলিক সাইটে দেখাবে)">{(p) => <input {...p} maxLength={200} value={upd} onChange={(e) => setUpd(e.target.value)} placeholder="যেমন: ৮.৫ কিমি অংশের কার্পেটিং শেষ" />}</Field>
      </div>
    </Dialog>
  );
}
