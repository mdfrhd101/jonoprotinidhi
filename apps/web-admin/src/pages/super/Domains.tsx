import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiFail, papi } from '../../api';
import { Badge, Button, Card, Chips, DataTable, Dialog, EmptyState, ErrorBox, PageHead, PillOf, SearchInput, useToast, type Column } from '../../components';
import { bnDate, toBn } from '../../format';
import { DnsInstructions } from './TenantDetail';
import { DNS_LABEL, useIsSuper } from './shared';

/* Every domain on the platform (/super/domains), FR-SA-04: platform subdomains and custom domains with DNS/SSL state.
   Custom domains are added from a tenant's page (a domain always belongs to one tenant). */

type DomainItem = {
  id: string; host: string; type: 'platform' | 'custom'; primary: boolean; dnsStatus: 'pending' | 'active' | 'error'; sslStatus: string; sslExpiresAt: string | null; verifiedAt: string | null;
  txtName: string | null; txtValue: string | null; tenantId: string; mpName: string; seatName: string; seatNumber: number; slug: string; tenantStatus: string | null;
};
type F = '' | 'pending' | 'active' | 'custom' | 'platform';
const SOON = 14 * 86400_000;

export function SuperDomains() {
  const q = useQuery({ queryKey: ['super', 'domains'], queryFn: () => papi.get<{ items: DomainItem[]; dnsTarget: string }>('/super/domains') });
  const su = useIsSuper(); const toast = useToast(); const qc = useQueryClient();
  const [sp] = useSearchParams();
  const [f, setF] = useState<F>(() => (['pending', 'active', 'custom', 'platform'].includes(sp.get('f') ?? '') ? sp.get('f') as F : '')); const [s, setS] = useState('');
  const [instr, setInstr] = useState<DomainItem | null>(null);
  const verify = useMutation({
    mutationFn: (id: string) => papi.post(`/super/domains/${id}/verify`, {}),
    onSuccess: () => toast('ডোমেইন যাচাই হয়েছে, SSL চালু', 'ok'),
    onError: (e) => toast(e instanceof ApiFail ? e.message : 'কিছু ভুল হয়েছে', 'bad'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['super'] }),
  });
  const all = q.data?.items ?? [];
  const match = (d: DomainItem, v: F) => !v || (v === 'pending' ? d.type === 'custom' && d.dnsStatus !== 'active' : v === 'active' ? d.dnsStatus === 'active' : d.type === v);
  const rows = useMemo(() => all.filter((d) => match(d, f) && (!s.trim() || `${d.host} ${d.mpName} ${d.slug}`.toLowerCase().includes(s.trim().toLowerCase()))), [all, f, s]);
  const now = Date.now();

  const columns: Array<Column<DomainItem>> = [
    { key: 'h', header: 'ডোমেইন', primary: true, cell: (d) => <div className="sa-cellstack"><b className="sa-host">{d.host}</b><small className="muted">{d.type === 'custom' ? 'কাস্টম ডোমেইন' : 'প্ল্যাটফর্ম সাবডোমেইন'}{d.primary ? ' · প্রধান' : ''}</small></div> },
    { key: 't', header: 'সাইট', cell: (d) => <Link to={`/super/tenants/${d.tenantId}`}>{d.mpName}</Link> },
    { key: 'dns', header: 'DNS', nowrap: true, cell: (d) => <PillOf map={DNS_LABEL} k={d.dnsStatus} /> },
    { key: 'ssl', header: 'SSL', nowrap: true, cell: (d) => d.sslStatus !== 'active' ? <span className="muted">চালু হয়নি</span>
      : d.sslExpiresAt ? <span className={new Date(d.sslExpiresAt).getTime() < now + SOON ? 'sa-bad' : undefined}>চালু · মেয়াদ {bnDate(d.sslExpiresAt)}</span> : <span>চালু</span> },
    { key: 'a', header: <span className="sr">কাজ</span>, mobileLabel: 'কাজ', align: 'right', nowrap: true, cell: (d) => d.type === 'custom' && d.dnsStatus !== 'active' ? (
      <div className="acts row-acts">
        <Button size="sm" variant="ghost" icon="info" onClick={() => setInstr(d)} aria-label={`DNS নির্দেশনা: ${d.host}`}>DNS নির্দেশনা</Button>
        {su && <Button size="sm" variant="primary" icon="refresh" loading={verify.isPending && verify.variables === d.id} onClick={() => verify.mutate(d.id)} aria-label={`যাচাই করুন: ${d.host}`}>যাচাই করুন</Button>}
      </div>) : d.verifiedAt ? <small className="muted">যাচাই {bnDate(d.verifiedAt)}</small> : null },
  ];
  const cnt = (v: F) => all.filter((d) => match(d, v)).length;

  return (
    <>
      <PageHead kicker="ডোমেইন" icon="globe" title="সব ডোমেইন" sub="প্রতিটি সাইটের প্ল্যাটফর্ম সাবডোমেইন আপনা থেকে তৈরি হয়। কাস্টম ডোমেইন DNS TXT রেকর্ড দিয়ে মালিকানা প্রমাণের পরই চালু হয়।"
        meta={q.data ? <Badge tone="plain" icon="link">CNAME লক্ষ্য: {q.data.dnsTarget}</Badge> : undefined} />
      {q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : (
        <>
          <div className="bar"><SearchInput value={s} onChange={setS} label="ডোমেইন খুঁজুন" placeholder="ডোমেইন বা MP-র নাম" /></div>
          <div className="bar"><Chips<F> label="ধরন" value={f} onChange={setF} options={[{ value: '', label: 'সব', count: q.data ? all.length : undefined }, { value: 'pending', label: 'যাচাই বাকি', count: q.data ? cnt('pending') : undefined }, { value: 'active', label: 'চালু', count: q.data ? cnt('active') : undefined }, { value: 'custom', label: 'কাস্টম', count: q.data ? cnt('custom') : undefined }, { value: 'platform', label: 'প্ল্যাটফর্ম', count: q.data ? cnt('platform') : undefined }]} /></div>
          <DataTable caption="ডোমেইনের তালিকা" rows={rows} rowKey={(d) => d.id} loading={q.isLoading} columns={columns}
            empty={<Card><EmptyState icon="globe" title={all.length ? 'এই ফিল্টারে কোনো ডোমেইন নেই' : 'এখনো কোনো ডোমেইন নেই'} text={all.length ? undefined : 'নতুন MP যোগ করলে তার সাবডোমেইন এখানে দেখা যাবে।'}
              action={all.length ? <Button icon="close" onClick={() => { setF(''); setS(''); }}>ফিল্টার মুছুন</Button> : undefined} /></Card>} />
          {q.data && <p className="muted sa-note">কাস্টম ডোমেইন যোগ করতে সংশ্লিষ্ট MP-র পেজে যান। মোট {toBn(all.length)}টি ডোমেইন।</p>}
        </>
      )}
      <Dialog title="DNS নির্দেশনা" open={!!instr} onClose={() => setInstr(null)} footer={<Button variant="primary" onClick={() => setInstr(null)}>বুঝেছি</Button>}>
        {instr && <DnsInstructions host={instr.host} target={q.data?.dnsTarget ?? ''} txtName={instr.txtName ?? undefined} txtValue={instr.txtValue ?? undefined} />}
      </Dialog>
    </>
  );
}
