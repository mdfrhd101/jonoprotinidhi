import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inviteSchema } from '@jonoshetu/shared';
import { ApiFail } from '../../api';
import { useTenant } from '../../tenant';
import { Avatar, Button, DataTable, Dialog, EmptyState, ErrorBox, Field, Icon, Loading, PageHead, Pager, Pill, RowActions, useToast, fieldMessages, type Column } from '../../components';
import { ROLE_LABEL, bnDateTime } from '../../format';

export function Team() {
  const { api, id } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const q = useQuery({ queryKey: ['tenant', id, 'team'], queryFn: () => api.get<any[]>('/team') });
  const remove = useMutation({ mutationFn: (mid: string) => api.del(`/team/${mid}`), onSuccess: () => { toast('সদস্য সরানো হয়েছে', 'ok'); qc.invalidateQueries({ queryKey: ['tenant', id, 'team'] }); }, onError: (e) => toast(e instanceof ApiFail ? e.message : 'কিছু ভুল হয়েছে', 'bad') });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  const cols: Array<Column<any>> = [
    { key: 'n', header: 'নাম', primary: true, cell: (m) => <div className="cell-main"><Avatar name={m.name} size={40} /><div><b>{m.name}</b><small className="num">{m.phone}</small></div></div> },
    { key: 'r', header: 'ভূমিকা', cell: (m) => <span>{ROLE_LABEL[m.role]}{m.role === 'officer' && <small>{m.scope.join(', ')}</small>}</span> },
    { key: 'm', header: '২-ধাপ যাচাই', cell: (m) => (m.status === 'invited' ? <Pill label={m.invitedExpired ? 'আমন্ত্রণের মেয়াদ শেষ' : 'আমন্ত্রণ পাঠানো'} tone="warn" /> : m.mfaEnrolled ? <Pill label="চালু" tone="ok" /> : <Pill label="বাকি" tone="warn" />) },
    { key: 'a', header: <span className="sr">কাজ</span>, mobileLabel: 'কাজ', align: 'right', cell: (m) => <RowActions><button className="btn btn-d btn-s" aria-label={`${m.name} কে সরান`} onClick={() => window.confirm(`${m.name} কে সরিয়ে দেবেন? তাঁর প্যানেলে ঢোকা সঙ্গে সঙ্গে বন্ধ হবে।`) && remove.mutate(m.id)}>সরান</button></RowActions> },
  ];
  return (
    <>
      <PageHead kicker="অফিস" icon="team" title="টিম ও ভূমিকা" sub="প্রত্যেকে শুধু নিজের কাজের অংশ দেখেন। অভিযোগ কর্মকর্তা শুধু নিজের উপজেলার অভিযোগ দেখেন। সবার ২-ধাপ যাচাই বাধ্যতামূলক।" actions={<button className="btn btn-b" onClick={() => setInviting(true)}><Icon name="plus" />সদস্য যোগ করুন</button>} />
      <DataTable caption="টিমের সদস্য" columns={cols} rows={q.data!} rowKey={(m) => m.id}
        empty={<div className="card"><EmptyState icon="team" title="এখনো কোনো সদস্য নেই" text="PR বা অভিযোগ কর্মকর্তাকে আমন্ত্রণ জানান।" action={<Button variant="accent" icon="plus" onClick={() => setInviting(true)}>সদস্য যোগ করুন</Button>} /></div>} />
      {inviting && <Invite onClose={() => setInviting(false)} />}
    </>
  );
}

function Invite({ onClose }: { onClose: () => void }) {
  const { api, id } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ name: '', phone: '', role: 'editor', upazilas: '' }); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const save = async () => {
    setErrs({});
    const body = { name: f.name, phone: f.phone, role: f.role, upazilas: f.role === 'officer' ? f.upazilas.split(',').map((s) => s.trim()).filter(Boolean) : [] };
    const v = inviteSchema.safeParse(body);
    if (!v.success) { const m: Record<string, string> = {}; for (const i of v.error.issues) m[String(i.path[0])] ??= i.message; setErrs(m); return; }
    setBusy(true);
    try { await api.post('/team/invites', v.data); toast('আমন্ত্রণ SMS পাঠানো হয়েছে। প্রথম লগইনে ২-ধাপ যাচাই চালু করতে হবে।', 'ok'); await qc.invalidateQueries({ queryKey: ['tenant', id, 'team'] }); onClose(); }
    catch (e) { setErrs(fieldMessages(e)); toast(e instanceof ApiFail ? e.message : 'কিছু ভুল হয়েছে', 'bad'); } finally { setBusy(false); }
  };
  return (
    <Dialog title="নতুন সদস্য" open onClose={onClose} footer={<><button className="btn btn-g" onClick={onClose}>বাতিল</button><button className="btn btn-p" disabled={busy} onClick={save}>আমন্ত্রণ পাঠান</button></>}>
      <div className="form">
        <Field label="নাম" required error={errs.name}>{(p) => <input {...p} maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Field label="মোবাইল নম্বর" required error={errs.phone}>{(p) => <input {...p} type="tel" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="০১XXXXXXXXX" />}</Field>
        <Field label="ভূমিকা">{(p) => <select {...p} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="editor">{ROLE_LABEL.editor}</option><option value="officer">{ROLE_LABEL.officer}</option></select>}</Field>
        {f.role === 'officer' && <Field label="দায়িত্বের উপজেলা (কমা দিয়ে)" required error={errs.upazilas}>{(p) => <input {...p} value={f.upazilas} onChange={(e) => setF({ ...f, upazilas: e.target.value })} placeholder="চরকান্দি, শালবাগান" />}</Field>}
      </div>
    </Dialog>
  );
}

export function Audit() {
  const { api, id } = useTenant();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['tenant', id, 'audit', page], queryFn: () => api.get<{ items: any[]; totalPages: number }>(`/audit?page=${page}&limit=25`) });
  return (
    <>
      <PageHead kicker="অফিস" icon="audit" title="অডিট লগ" sub="এই সাইটে কে, কখন, কী বদলেছেন। প্ল্যাটফর্ম টিম কিছু ঠিক করলে সেটাও এখানে দেখা যায়। এই লগ বদলানো বা মোছা যায় না।" />
      {q.isError ? <ErrorBox error={q.error} /> : (
        <DataTable caption="অডিট লগ" loading={q.isLoading} rows={q.data?.items ?? []} rowKey={(a) => a._id}
          columns={[
            { key: 't', header: 'সময়', nowrap: true, primary: true, cell: (a: any) => bnDateTime(a.at) },
            { key: 'w', header: 'কে', cell: (a: any) => <span><b>{a.actor?.name ?? 'সিস্টেম'}</b><small>{a.actor?.viaSuperAdmin ? 'Super Admin' : ROLE_LABEL[a.actor?.role] ?? a.actor?.role}</small></span> },
            { key: 'a', header: 'কী করেছেন', cell: (a: any) => <span><code style={{ fontSize: 13 }}>{a.action}</code><small>{a.entity?.label ?? ''}{a.reason ? ` · ${a.reason}` : ''}</small></span> },
          ] as Array<Column<any>>} />
      )}
      {q.data && <Pager page={page} totalPages={q.data.totalPages} onPage={setPage} />}
    </>
  );
}
