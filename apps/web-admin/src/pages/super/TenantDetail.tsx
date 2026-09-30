import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { domainAddSchema } from '@jonoprotinidhi/shared';
import { ApiFail, papi } from '../../api';
import {
  Badge, Button, Card, Dialog, EmptyState, ErrorBox, Field, Icon, PageHead, PillOf, ProgressBar, ProgressRing, ReasonDialog, Skeleton, SkeletonText, StatCard, Timeline, useToast,
} from '../../components';
import { CopyButton } from '../../components/CopyButton';
import { TENANT_STATUS_LABEL, bnAgo, bnDate, bnDateTime, formatBn, toBn } from '../../format';
import { publicSiteUrl } from '../../tenant';
import { ActAsDialog } from './ActAs';
import { DNS_LABEL, Facts, MP_ROLE_LABEL, PLAN_LABEL, actionLabel, actionTone, formatBytes, seatOf, useIsSuper, type AuditLine, type TenantRow } from './shared';

/* One tenant (/super/tenants/:id): overview, status control, domains, team, content readiness, usage, recent audit and act-as.
   Stable labels used by e2e/smoke.py: button "সাইটের অ্যাডমিনে ঢুকুন" (and the act-as dialog, see ActAs.tsx). */

type Domain = { _id: string; host: string; type: 'platform' | 'custom'; primary: boolean; dnsStatus: 'pending' | 'active' | 'error'; sslStatus: string; sslExpiresAt?: string; verification?: { txtName?: string; txtValue?: string; verifiedAt?: string } };
type Detail = {
  tenant: { id: string; slug: string; status: 'live' | 'setup' | 'suspended'; plan: string; createdAt: string; mp: { name: string; title?: string; role: string; ministry?: string; seatName: string; seatNumber: number };
    settings: { slaDays: number; otpRequired: boolean; complaintBoxEnabled: boolean; dailySmsCap: number }; consent: { documentRef: string; receivedAt: string }; statusHistory: Array<{ from: string; to: string; reason: string; at: string }> };
  summary: TenantRow; domains: Domain[]; dnsTarget: string;
  team: { owner: { name: string; status: string } | null; byRole: Record<'owner' | 'editor' | 'officer', { active: number; invited: number }> };
  content: { pages: Array<{ key: string; label: string; ready: boolean }>; gallery: number; videos: number; events: number; publishedPosts: number; promises: number; readinessPct: number };
  usage: { imageBytes: number; videoBytes: number; imageFiles: number; videoFiles: number; smsToday: number; smsMonth: number; smsDailyCap: number };
  complaints: { last30d: number; open: number; overdue: number; resolvedLast30d: number; slaPct: number | null };
  audit: AuditLine[];
};
type Target = 'live' | 'suspended' | 'setup';
const FLOW: Record<string, Target[]> = { setup: ['live'], live: ['suspended'], suspended: ['live', 'setup'] };
const STATUS_WORD: Record<string, string> = { live: 'লাইভ', setup: 'সেটআপ', suspended: 'স্থগিত' };
const ROLE_ROWS: Array<['owner' | 'editor' | 'officer', string]> = [['owner', 'MP (মালিক)'], ['editor', 'PR / কনটেন্ট এডিটর'], ['officer', 'অভিযোগ কর্মকর্তা']];

export function TenantDetail() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['super', 'tenant', id], queryFn: () => papi.get<Detail>(`/super/tenants/${id}`) });
  if (q.isLoading) return <DetailSkeleton />;
  if (q.isError) return <><PageHead back={{ to: '..', label: 'সব সাইট' }} title="সাইট" /><ErrorBox error={q.error} retry={() => q.refetch()} /></>;
  return <DetailBody d={q.data!} />;
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="লোড হচ্ছে" className="stack">
      <Skeleton w={260} h={34} /><Skeleton w={180} h={16} />
      <div className="kpis">{[0, 1, 2, 3].map((i) => <div className="card stat-sk" key={i}><Skeleton w={120} h={16} /><Skeleton w={90} h={38} r={10} /></div>)}</div>
      <div className="dash-row"><div className="card c8"><SkeletonText lines={6} /></div><div className="card c4"><SkeletonText lines={4} /></div></div>
      <span className="sr">লোড হচ্ছে…</span>
    </div>
  );
}

function DetailBody({ d }: { d: Detail }) {
  const { tenant: t, summary: s } = d;
  const qc = useQueryClient(); const toast = useToast();
  const su = useIsSuper();
  const [status, setStatus] = useState<Target | null>(null);
  const [checked, setChecked] = useState(false);
  const [acting, setActing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [host, setHost] = useState(''); const [hostErr, setHostErr] = useState(''); const [busy, setBusy] = useState(false);
  const [instr, setInstr] = useState<{ host: string; txtName?: string; txtValue?: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['super'] });
  const fail = (e: unknown) => toast(e instanceof ApiFail ? e.message : 'কিছু ভুল হয়েছে', 'bad');
  const verify = useMutation({ mutationFn: (did: string) => papi.post(`/super/domains/${did}/verify`, {}), onSuccess: () => { toast('ডোমেইন যাচাই হয়েছে, SSL চালু', 'ok'); refresh(); }, onError: (e) => { fail(e); refresh(); } });
  const primary = useMutation({ mutationFn: (did: string) => papi.post(`/super/domains/${did}/primary`, {}), onSuccess: () => { toast('প্রধান ডোমেইন ঠিক হয়েছে', 'ok'); refresh(); }, onError: fail });
  const seat = seatOf(t.mp);
  const siteUrl = publicSiteUrl(t.slug);

  const addDomain = async () => {
    const v = domainAddSchema.safeParse({ host: host.trim() });
    if (!v.success) { setHostErr('সঠিক ডোমেইন লিখুন, যেমন example.com (http:// বা / ছাড়া)'); return; }
    setBusy(true);
    try {
      const r = await papi.post<{ host: string; instructions: Array<{ type: string; name: string; value: string }> }>(`/super/tenants/${t.id}/domains`, v.data);
      const txt = r.instructions.find((x) => x.type === 'TXT');
      setInstr({ host: r.host, txtName: txt?.name, txtValue: txt?.value }); setAdding(false); setHost(''); setHostErr(''); refresh();
      toast('ডোমেইন যোগ হয়েছে, এখন DNS রেকর্ড দিতে হবে', 'ok');
    } catch (e) { setHostErr(e instanceof ApiFail ? e.message : 'কিছু ভুল হয়েছে'); } finally { setBusy(false); }
  };

  const slaTone = d.complaints.slaPct != null && d.complaints.slaPct < 80 ? 'red' : 'green';
  const media = d.usage.imageBytes + d.usage.videoBytes;
  const smsPct = d.usage.smsDailyCap ? Math.round((d.usage.smsToday / d.usage.smsDailyCap) * 100) : 0;
  const history = [...(t.statusHistory ?? [])].reverse();

  return (
    <>
      <PageHead back={{ to: '..', label: 'সব সাইট' }} kicker={seat} icon="tenants" title={t.mp.name}
        sub={<>{MP_ROLE_LABEL[t.mp.role] ?? t.mp.role}{t.mp.ministry ? `, ${t.mp.ministry}` : ''} · <span className="sa-host">{t.slug}</span></>}
        meta={<><PillOf map={TENANT_STATUS_LABEL} k={t.status} /><Badge tone="plain">{PLAN_LABEL[t.plan] ?? t.plan}</Badge><Badge tone="plain" icon="calendarClock">যোগ হয়েছে {bnDate(t.createdAt)}</Badge></>}
        actions={<>
          {t.status === 'live' && <Button variant="ghost" iconRight="external" href={siteUrl}>সাইট দেখুন</Button>}
          <Button variant="primary" icon="eye" onClick={() => setActing(true)}>সাইটের অ্যাডমিনে ঢুকুন</Button>
        </>} />

      <div className="dash sa-detail">
      <div className="kpis">
        <StatCard label="প্রকাশিত পোস্ট" value={s.publishedPosts} icon="posts" tone="brass" hint={s.daysSinceLastPost == null ? 'কখনো পোস্ট হয়নি' : s.daysSinceLastPost === 0 ? 'শেষ পোস্ট আজ' : `শেষ পোস্ট ${toBn(s.daysSinceLastPost)} দিন আগে`} />
        <StatCard label="অভিযোগ, গত ৩০ দিন" value={d.complaints.last30d} icon="complaints" tone="blue" hint={`খোলা ${formatBn(d.complaints.open)}${d.complaints.overdue ? ` · সময় পেরোনো ${toBn(d.complaints.overdue)}` : ''} · বিবরণ শুধু MP অফিস দেখে`} />
        <StatCard label="সময়মতো নিষ্পত্তি (SLA)" value={d.complaints.slaPct} unit={d.complaints.slaPct == null ? undefined : '%'} icon="clock" tone={slaTone} hint={d.complaints.resolvedLast30d ? `৩০ দিনে ${toBn(d.complaints.resolvedLast30d)}টি নিষ্পত্তি · লক্ষ্য ${toBn(t.settings.slaDays)} দিনে` : `লক্ষ্য: ${toBn(t.settings.slaDays)} দিনের মধ্যে`} />
        <StatCard label="সাইট প্রস্তুতি" value={d.content.readinessPct} unit="%" icon="rocket" tone={d.content.readinessPct >= 80 ? 'green' : 'amber'} hint={`${toBn(d.content.pages.filter((p) => p.ready).length)}/${toBn(d.content.pages.length)} পেজ প্রকাশিত`} />
      </div>

      <div className="dash-row">
        <Card className="c7" title="MP ও চুক্তির তথ্য" icon="profile">
          <Facts rows={[
            ['নাম', <b key="n">{t.mp.name}</b>], ['পদ', MP_ROLE_LABEL[t.mp.role] ?? t.mp.role], ...(t.mp.title ? [['পরিচয়', t.mp.title] as [string, string]] : []), ...(t.mp.ministry ? [['মন্ত্রণালয়', t.mp.ministry] as [string, string]] : []),
            ['আসন', seat], ['সাবডোমেইন', <span key="s" className="sa-host">{t.slug}</span>], ['প্যাকেজ', PLAN_LABEL[t.plan] ?? t.plan],
            ['সম্মতিপত্র', <span key="c" className="sa-ref"><Icon name="file" size={15} />{t.consent.documentRef}<small className="muted"> · শুধু রেফারেন্স; মূল কপি অফিসের ফাইলে</small></span>],
            ['সম্মতি গ্রহণ', bnDate(t.consent.receivedAt)],
            ['অভিযোগ বক্স', `${t.settings.complaintBoxEnabled === false ? 'বন্ধ' : 'চালু'} · OTP ${t.settings.otpRequired ? 'বাধ্যতামূলক' : 'ঐচ্ছিক'} · SLA ${toBn(t.settings.slaDays)} দিন`],
          ]} />
        </Card>
        <Card className="c5" title="সাইটের অবস্থা" icon="shield">
          <div className="sa-status">
            <PillOf map={TENANT_STATUS_LABEL} k={t.status} />
            <p className="muted">{t.status === 'live' ? 'পাবলিক সাইট সবার জন্য খোলা।' : t.status === 'setup' ? 'সেটআপ চলছে: পাবলিকে সাইট দেখা যায় না।' : 'স্থগিত: পাবলিক সাইটে "সাময়িকভাবে বন্ধ" দেখায়। কোনো ডেটা মোছা হয়নি, MP অফিস প্যানেলে কাজ করতে পারে।'}</p>
            {su ? (
              <div className="acts">
                {FLOW[t.status]?.map((to) => <Button key={to} variant={to === 'suspended' ? 'danger' : to === 'live' ? 'accent' : 'ghost'} icon={to === 'suspended' ? 'lock' : to === 'live' ? 'rocket' : 'undo'} onClick={() => { setChecked(false); setStatus(to); }}>
                  {to === 'live' ? 'লাইভ করুন' : to === 'suspended' ? 'সাইট স্থগিত করুন' : 'সেটআপে ফেরান'}</Button>)}
              </div>
            ) : <p className="muted sa-note">শুধু Super Admin অবস্থা বদলাতে পারেন।</p>}
            {t.status !== 'live' && !s.ownerActive && <div className="note info sa-note"><Icon name="info" /><span>MP এখনো আমন্ত্রণ গ্রহণ করে অ্যাকাউন্ট চালু করেননি, তাই লাইভ করা যাবে না।</span></div>}
          </div>
          <h3 className="sa-h3">ইতিহাস</h3>
          {history.length === 0 ? <p className="muted sa-note">এখনো অবস্থা বদলানো হয়নি।</p> : (
            <Timeline label="অবস্থা বদলের ইতিহাস" items={history.map((h, i) => ({ id: String(i), icon: h.to === 'suspended' ? 'lock' : h.to === 'live' ? 'rocket' : 'undo', tone: h.to === 'suspended' ? 'bad' : h.to === 'live' ? 'ok' : 'info',
              title: <><b>{STATUS_WORD[h.from] ?? h.from} → {STATUS_WORD[h.to] ?? h.to}</b>{h.reason ? <span className="muted">: {h.reason}</span> : null}</>, meta: bnDateTime(h.at) }))} />
          )}
        </Card>
      </div>

      <Card title="ডোমেইন" sub={`কাস্টম ডোমেইন যাচাই না হওয়া পর্যন্ত সেখানে সাইট দেখাবে না। CNAME লক্ষ্য: ${d.dnsTarget}`} icon="globe" pad="none"
        actions={su ? <Button size="sm" variant="accent" icon="plus" onClick={() => { setAdding(true); setHostErr(''); }}>কাস্টম ডোমেইন যোগ</Button> : undefined}>
        <ul className="rl sa-domains">
          {d.domains.map((dm) => (
            <li key={dm._id}>
              <span className={`chip-ico sm ${dm.dnsStatus === 'active' ? 'sa-ico-ok' : dm.dnsStatus === 'error' ? 'sa-ico-bad' : 'sa-ico-warn'}`}><Icon name="globe" size={16} /></span>
              <div className="rl-b">
                <span className="rl-t sa-host">{dm.host} {dm.primary && <Badge tone="brass">প্রধান</Badge>}</span>
                <div className="rl-m"><span>{dm.type === 'custom' ? 'কাস্টম ডোমেইন' : 'প্ল্যাটফর্ম সাবডোমেইন'}</span><span>SSL: {dm.sslStatus === 'active' ? 'চালু' : 'চালু হয়নি'}{dm.sslExpiresAt ? ` (মেয়াদ ${bnDate(dm.sslExpiresAt)})` : ''}</span></div>
              </div>
              <div className="rl-a">
                <PillOf map={DNS_LABEL} k={dm.dnsStatus} />
                {dm.type === 'custom' && dm.dnsStatus !== 'active' && <Button size="sm" variant="ghost" icon="info" onClick={() => setInstr({ host: dm.host, txtName: dm.verification?.txtName, txtValue: dm.verification?.txtValue })}>DNS নির্দেশনা</Button>}
                {su && dm.type === 'custom' && dm.dnsStatus !== 'active' && <Button size="sm" variant="primary" icon="refresh" loading={verify.isPending && verify.variables === dm._id} onClick={() => verify.mutate(dm._id)} aria-label={`যাচাই করুন: ${dm.host}`}>যাচাই করুন</Button>}
                {su && dm.dnsStatus === 'active' && !dm.primary && <Button size="sm" variant="ghost" loading={primary.isPending && primary.variables === dm._id} onClick={() => primary.mutate(dm._id)} aria-label={`প্রধান করুন: ${dm.host}`}>প্রধান করুন</Button>}
              </div>
            </li>))}
        </ul>
      </Card>

      <div className="dash-row">
        <Card className="c4" title="টিম" sub="নাম-নম্বর MP অফিসের প্যানেলে" icon="team">
          {d.team.owner ? <div className="sa-owner"><b>{d.team.owner.name}</b><Badge tone={d.team.owner.status === 'active' ? 'ok' : 'warn'} dot>{d.team.owner.status === 'active' ? 'অ্যাকাউন্ট চালু' : 'আমন্ত্রণ গ্রহণ বাকি'}</Badge></div> : <p className="muted">মালিক অ্যাকাউন্ট নেই</p>}
          <ul className="sa-team">{ROLE_ROWS.map(([k, label]) => (
            <li key={k}><span>{label}</span><b className="num">{toBn(d.team.byRole[k].active)}</b>{d.team.byRole[k].invited > 0 && <small className="muted">+{toBn(d.team.byRole[k].invited)} আমন্ত্রিত</small>}</li>))}
          </ul>
        </Card>
        <Card className="c8" title="কনটেন্টের প্রস্তুতি" sub="প্রকাশিত পেজ আর কনটেন্ট; ঠিক করতে হলে সাইটের অ্যাডমিনে ঢুকুন" icon="rocket">
          <div className="ready">
            <div className="ready-ring"><ProgressRing value={d.content.readinessPct} label="সাইট প্রস্তুতি" tone={d.content.readinessPct >= 80 ? 'green' : 'brass'} sub="প্রস্তুত" /></div>
            <div className="stack">
              <ul className="checklist">{d.content.pages.map((p) => <li key={p.key} className={p.ready ? 'ck-ok' : 'ck-no'}><Icon name={p.ready ? 'checkCircle' : 'circle'} size={19} /><span className="ck-l">{p.label}</span><span className="sr">{p.ready ? 'প্রকাশিত' : 'প্রকাশিত নয়'}</span></li>)}</ul>
              <div className="two-stats sa-counts">
                {([['পোস্ট', d.content.publishedPosts], ['প্রতিশ্রুতি', d.content.promises], ['গ্যালারির ছবি', d.content.gallery], ['ভিডিও', d.content.videos], ['কর্মসূচি', d.content.events]] as Array<[string, number]>).map(([l, n]) => <div className="mini" key={l}><b>{formatBn(n)}</b><span>{l}</span></div>)}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="dash-row">
        <Card className="c5" title="ব্যবহার" sub="স্টোরেজ ও SMS" icon="layers">
          <div className="stack sa-usage">
            <div>
              <div className="sa-u-h"><span>মিডিয়া স্টোরেজ</span><b className="num">{formatBytes(media)}</b></div>
              <div className="sa-legend"><span><i className="sa-split-a" />ছবি {formatBytes(d.usage.imageBytes)} ({toBn(d.usage.imageFiles)}টি)</span><span><i className="sa-split-b" />ভিডিও {formatBytes(d.usage.videoBytes)} ({toBn(d.usage.videoFiles)}টি)</span></div>
            </div>
            <div>
              <div className="sa-u-h"><span>আজকের SMS</span><b className="num">{toBn(d.usage.smsToday)} / {formatBn(d.usage.smsDailyCap)}</b></div>
              <ProgressBar value={Math.min(100, smsPct)} label="আজকের SMS, দৈনিক সীমার তুলনায়" tone={smsPct >= 80 ? 'red' : 'green'} showValue={false} />
              <p className="muted sa-note">এ মাসে {formatBn(d.usage.smsMonth)}টি SMS।</p>
            </div>
          </div>
        </Card>
        <Card className="c7" title="এই সাইটের সাম্প্রতিক অডিট" icon="audit" actions={<Link className="sec-link" to={`/super/audit?tenantId=${t.id}`}>পুরো লগ<Icon name="arrowRight" size={15} /></Link>}>
          {d.audit.length === 0 ? <EmptyState compact icon="activity" title="এখনো কোনো কাজ হয়নি" /> : (
            <Timeline label="এই সাইটের সাম্প্রতিক কাজ" items={d.audit.map((a) => { const m = actionTone(a.action); return { id: a.id, icon: m.icon, tone: m.tone, title: <><b>{a.viaSuperAdmin ? `${a.actorName ?? 'Super Admin'} (Super Admin)` : a.actorName ?? 'সিস্টেম/নাগরিক'}</b> · {actionLabel(a.action)}{a.label && a.label !== t.mp.name ? <span className="muted">: {a.label}</span> : null}</>, meta: bnAgo(a.at) }; })} />
          )}
        </Card>
      </div>
      </div>

      <ReasonDialog title={status === 'live' ? 'সাইট লাইভ করবেন?' : status === 'suspended' ? 'সাইট স্থগিত করবেন?' : 'সেটআপে ফেরাবেন?'} open={!!status} onClose={() => { setStatus(null); setChecked(false); }}
        danger={status === 'suspended'} confirmLabel={status === 'live' ? 'লাইভ করুন' : status === 'suspended' ? 'স্থগিত করুন' : 'সেটআপে ফেরান'} label="কারণ (অডিট লগে যাবে)"
        onConfirm={async (reason) => {
          if (status === 'live' && !checked) throw new ApiFail(422, 'CONTENT_NOT_CHECKED', 'লাইভ করার আগে কনটেন্ট ও সম্মতি যাচাই নিশ্চিত করুন');
          await papi.post(`/super/tenants/${t.id}/status`, { to: status, reason, contentChecked: status === 'live' ? true : undefined });
          toast(status === 'live' ? 'সাইট লাইভ হয়েছে' : status === 'suspended' ? 'সাইট স্থগিত হয়েছে' : 'সাইট সেটআপে ফিরেছে', 'ok'); setChecked(false); refresh();
        }}>
        <p className="muted" style={{ marginTop: 0 }}>{status === 'suspended' ? 'পাবলিক সাইটে "সাময়িকভাবে বন্ধ" দেখাবে। কোনো ডেটা মুছবে না, পরে আবার লাইভ করা যাবে।' : status === 'live' ? 'লাইভ হলেই সাইট সবার জন্য খুলে যাবে।' : 'সেটআপে ফেরালে পাবলিকে সাইট দেখা যাবে না।'}</p>
        {status === 'live' && <label className="check"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /><span>MP অফিসের লিখিত সম্মতি ও কনটেন্ট যাচাই করা হয়েছে</span></label>}
      </ReasonDialog>

      <ActAsDialog tenant={{ id: t.id, mpName: t.mp.name }} open={acting} onClose={() => setActing(false)} />

      <Dialog title="কাস্টম ডোমেইন যোগ করুন" open={adding} onClose={() => setAdding(false)} size="sm"
        footer={<><Button onClick={() => setAdding(false)}>বাতিল</Button><Button variant="primary" loading={busy} type="submit" form="dom-form">যোগ করুন</Button></>}>
        <form id="dom-form" className="form" noValidate onSubmit={(e) => { e.preventDefault(); addDomain(); }}>
          <Field label="ডোমেইন" required error={hostErr} hint="যেমন tahminanoor.com; MP-র নামে কেনা ডোমেইন">{(p) => <input {...p} value={host} onChange={(e) => setHost(e.target.value)} placeholder="example.com" autoCapitalize="none" spellCheck={false} inputMode="url" />}</Field>
        </form>
      </Dialog>

      <Dialog title="DNS নির্দেশনা" open={!!instr} onClose={() => setInstr(null)} footer={<Button variant="primary" onClick={() => setInstr(null)}>বুঝেছি</Button>}>
        {instr && <DnsInstructions host={instr.host} target={d.dnsTarget} txtName={instr.txtName} txtValue={instr.txtValue} />}
      </Dialog>
    </>
  );
}

/** The two DNS records the MP's registrar needs, each value with a copy button. */
export function DnsInstructions({ host, target, txtName, txtValue }: { host: string; target: string; txtName?: string; txtValue?: string }) {
  const rows: Array<{ type: string; name: string; value: string; why: string }> = [
    { type: 'TXT', name: txtName ?? `_jonoprotinidhi.${host}`, value: txtValue ?? '—', why: 'ডোমেইনটি যে MP অফিসের, তা প্রমাণ করে' },
    { type: 'CNAME', name: host, value: target, why: 'ভিজিটরদের জনপ্রতিনিধির সার্ভারে পাঠায়' },
  ];
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>MP-র ডোমেইন যেখানে কেনা (রেজিস্ট্রার/DNS প্যানেল), সেখানে এই দুটি রেকর্ড যোগ করুন। তারপর এখানে "যাচাই করুন" চাপুন। DNS ছড়াতে কয়েক মিনিট থেকে কয়েক ঘণ্টা লাগতে পারে।</p>
      <ol className="sa-dns">
        {rows.map((r) => (
          <li key={r.type}>
            <div className="sa-dns-h"><Badge tone="ink">{r.type}</Badge><span className="muted">{r.why}</span></div>
            <div className="sa-dns-r"><span className="sa-dns-k">নাম</span><code>{r.name}</code><CopyButton value={r.name} label={`${r.type} রেকর্ডের নাম কপি করুন`} iconOnly /></div>
            <div className="sa-dns-r"><span className="sa-dns-k">মান</span><code>{r.value}</code><CopyButton value={r.value} label={`${r.type} রেকর্ডের মান কপি করুন`} iconOnly /></div>
          </li>))}
      </ol>
    </div>
  );
}
