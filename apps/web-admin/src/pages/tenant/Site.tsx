import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { siteConfigSchema, tenantSettingsSchema } from '@jonoprotinidhi/shared';
import { ApiFail } from '../../api';
import { useTenant, publicPageUrl } from '../../tenant';
import { Button, EmptyState, ErrorBox, Field, FormSection, Icon, Loading, PageHead, SaveBar, Switch, useToast } from '../../components';
import { toBn } from '../../format';
import { CharCount, SingleImage, errText, issuesToErrors, useLeaveGuard, useReorder } from './content/common';

/* "ব্যানার ও হোমপেজ সাজানো": hero banners (image + text + call to action), slogan, accent colour and the order/visibility of the
   homepage sections. Site config has no draft: saving publishes (owner only, `site.edit`).
   The profile text moved to its own editor (site-pages/profile). BUG-2026-021: the old profile card here saved only three
   fields through PUT /profile and wiped the rest of the profile draft. */

export const SECTION_LABEL: Record<string, string> = { stats: 'সংখ্যায় কাজ', about: 'পরিচিতি', activities: 'সাম্প্রতিক কাজ', office: 'সংসদে / দায়িত্ব', promises: 'প্রতিশ্রুতির হিসাব', area: 'নির্বাচনী এলাকা', gallery: 'গ্যালারি', videos: 'ভিডিও', events: 'আসন্ন কর্মসূচি', cta: 'অভিযোগ বক্সের আহ্বান' };
const SECTION_KEYS = ['stats', 'about', 'activities', 'office', 'promises', 'area', 'gallery', 'videos', 'events', 'cta'] as const;
const ACCENTS: Array<[string, string, string]> = [['brass', 'পিতল (ডিফল্ট)', '#C7A35A'], ['river', 'নদী-নীল', '#2F6DA3'], ['maroon', 'মেরুন', '#8A2A2B']];
const MAX_BANNERS = 6;

type Banner = { url: string; caption: string; title?: string; subtitle?: string; ctaLabel?: string; ctaHref?: string };
type Cfg = { slogan: string; accent: string; banners: Banner[]; sections: Array<{ key: string; on: boolean }> };

const normalise = (d: any): Cfg => {
  const sections: Cfg['sections'] = (d?.sections ?? []).filter((s: { key: string }) => (SECTION_KEYS as readonly string[]).includes(s.key)).map((s: { key: string; on: boolean }) => ({ key: s.key, on: !!s.on }));
  for (const k of SECTION_KEYS) if (!sections.some((s) => s.key === k)) sections.push({ key: k, on: false });
  return { slogan: d?.slogan ?? '', accent: d?.accent ?? 'brass', banners: (d?.banners ?? []).map((b: Banner) => ({ url: b.url ?? '', caption: b.caption ?? '', title: b.title ?? '', subtitle: b.subtitle ?? '', ctaLabel: b.ctaLabel ?? '', ctaHref: b.ctaHref ?? '' })), sections };
};

export default function Site() {
  const { can } = useTenant();
  if (!can('site.edit')) return <><PageHead title="ব্যানার ও হোমপেজ সাজানো" /><div className="card"><EmptyState icon="lock" title="এই পাতাটি শুধু MP (মালিক) সম্পাদনা করতে পারেন" /></div></>;
  return <SiteConfigEditor />;
}

function SiteConfigEditor() {
  const { api, id, info } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['tenant', id, 'site-config'], queryFn: () => api.get('/site-config') });
  const [f, setF] = useState<Cfg | null>(null);
  const [snap, setSnap] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const up = (fn: (x: Cfg) => Cfg) => setF((x) => (x ? fn(x) : x));
  useEffect(() => { if (q.data && !f) { const n = normalise(q.data); setF(n); setSnap(JSON.stringify(n)); } }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!f && JSON.stringify(f) !== snap;
  const guard = useLeaveGuard(dirty);
  const sec = useReorder((f?.sections ?? []).map((s) => s.key));
  // keep the section order in the form in sync with the drag & drop order
  useEffect(() => {
    if (!f) return;
    const cur = f.sections.map((s) => s.key).join(',');
    if (sec.order.join(',') !== cur && sec.order.length === f.sections.length) up((f) => ({ ...f, sections: sec.order.map((k) => f.sections.find((s) => s.key === k)!) }));
  }, [sec.order]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading || (!f && !q.isError)) return <><PageHead kicker="সাইটের পাতা" icon="banners" title="ব্যানার ও হোমপেজ সাজানো" /><Loading /></>;
  if (q.isError || !f) return <><PageHead kicker="সাইটের পাতা" icon="banners" title="ব্যানার ও হোমপেজ সাজানো" /><ErrorBox error={q.error} retry={() => q.refetch()} /></>;

  const setB = (i: number, patch: Partial<Banner>) => up((f) => ({ ...f, banners: f.banners.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const moveB = (i: number, d: number) => up((f) => { const j = i + d; if (j < 0 || j >= f.banners.length) return f; const b = [...f.banners]; [b[i], b[j]] = [b[j]!, b[i]!]; return { ...f, banners: b }; });

  const save = async () => {
    const body = { ...f, banners: f.banners.map((b) => Object.fromEntries(Object.entries(b).filter(([k, v]) => k === 'url' || k === 'caption' || v !== ''))) };
    const pre: Record<string, string> = {};
    f.banners.forEach((b, i) => { if (!b.url) pre[`banners.${i}.url`] = 'ব্যানারের ছবি দিন'; });
    const v = siteConfigSchema.safeParse(body);
    const all = { ...(v.success ? {} : issuesToErrors(v.error.issues as never)), ...pre };
    if (Object.keys(all).length) { setErrs(all); toast('কিছু ঘরে ভুল আছে, লাল চিহ্নিত ঘরগুলো ঠিক করুন', 'bad'); return; }
    setErrs({}); setBusy(true);
    try {
      const saved = await api.put('/site-config', v.success ? v.data : body);
      const n = normalise(saved ?? body); setF(n); setSnap(JSON.stringify(n));
      qc.setQueryData(['tenant', id, 'site-config'], saved);
      toast('সংরক্ষণ হয়েছে, পাবলিক সাইটে এখন দেখা যাচ্ছে', 'ok');
    } catch (e) {
      if (e instanceof ApiFail) setErrs(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, m]) => [k, m[0] ?? ''])));
      toast(errText(e), 'bad');
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead kicker="সাইটের পাতা" icon="banners" title="ব্যানার ও হোমপেজ সাজানো" sub="হোমপেজের বড় স্লাইড, স্লোগান, রং আর কোন অংশ কোন ক্রমে দেখাবে। সংরক্ষণ করলেই পাবলিক সাইটে বদলায়।"
        actions={<Button href={publicPageUrl(info.tenant.slug, '/')} icon="external">হোমপেজ দেখুন ↗</Button>} />
      <FormSection title="ব্যানার" icon="banners" description={`হোমপেজের ওপরের বড় স্লাইড। প্রথমটি আগে দেখায়। সর্বোচ্চ ${toBn(MAX_BANNERS)}টি।`}>
        {!f.banners.length && <EmptyState compact icon="banners" title="কোনো ব্যানার নেই" text="ব্যানার না থাকলে হোমপেজে শুধু নাম আর স্লোগান দেখায়।" />}
        <div className="ct-banners">
          {f.banners.map((b, i) => (
            <div className={`ct-banner${Object.keys(errs).some((k) => k.startsWith(`banners.${i}.`)) ? ' bad' : ''}`} key={i} role="group" aria-label={`ব্যানার ${toBn(i + 1)}`}>
              <div className="ct-banner-h">
                <b>ব্যানার {toBn(i + 1)}</b>{i === 0 && <span className="pill brass plain">প্রথমে দেখায়</span>}
                <span className="grow" />
                <button type="button" className="icon-btn" aria-label={`ব্যানার ${toBn(i + 1)} ওপরে সরান`} disabled={i === 0} onClick={() => moveB(i, -1)}><Icon name="arrowUp" size={16} /></button>
                <button type="button" className="icon-btn" aria-label={`ব্যানার ${toBn(i + 1)} নিচে সরান`} disabled={i === f.banners.length - 1} onClick={() => moveB(i, 1)}><Icon name="arrowDown" size={16} /></button>
                <button type="button" className="icon-btn ct-del" aria-label={`ব্যানার ${toBn(i + 1)} মুছুন`} onClick={() => up((f) => ({ ...f, banners: f.banners.filter((_, j) => j !== i) }))}><Icon name="trash" size={16} /></button>
              </div>
              <div className="ct-banner-b">
                <div className="ct-banner-l">
                  <div className="ct-bprev" aria-label="প্রিভিউ" role="img" style={b.url ? { backgroundImage: `linear-gradient(90deg, rgba(12,17,23,.78), rgba(12,17,23,.15) 70%), url("${b.url.replace(/"/g, '%22')}")` } : undefined}>
                    {!b.url && <span className="ct-bprev-ph"><Icon name="image" size={24} />ছবি দিন</span>}
                    <div className="ct-bprev-t">
                      {b.title && <b>{b.title}</b>}
                      {b.subtitle && <span>{b.subtitle}</span>}
                      {b.ctaLabel && <i>{b.ctaLabel} →</i>}
                    </div>
                    {b.caption && <small>{b.caption}</small>}
                  </div>
                  <SingleImage noPreview url={b.url} label={`ব্যানার ${toBn(i + 1)} এর ছবি`} error={errs[`banners.${i}.url`]} onChange={(url, credit) => setB(i, { url, ...(credit && !b.caption ? { caption: credit.slice(0, 80) } : {}) })} />
                </div>
                <div className="form ct-banner-f">
                  <Field label="শিরোনাম" error={errs[`banners.${i}.title`]}>{(p) => <><input {...p} maxLength={120} value={b.title ?? ''} onChange={(e) => setB(i, { title: e.target.value })} /><div className="ct-meta"><span /><CharCount n={(b.title ?? '').length} max={120} /></div></>}</Field>
                  <Field label="উপশিরোনাম" error={errs[`banners.${i}.subtitle`]}>{(p) => <><textarea {...p} className="short" rows={2} maxLength={240} value={b.subtitle ?? ''} onChange={(e) => setB(i, { subtitle: e.target.value })} /><div className="ct-meta"><span /><CharCount n={(b.subtitle ?? '').length} max={240} /></div></>}</Field>
                  <div className="frow">
                    <Field label="বোতামের লেখা" error={errs[`banners.${i}.ctaLabel`]}>{(p) => <input {...p} maxLength={40} value={b.ctaLabel ?? ''} placeholder="যেমন: অভিযোগ জানান" onChange={(e) => setB(i, { ctaLabel: e.target.value })} />}</Field>
                    <Field label="বোতামের লিংক" error={errs[`banners.${i}.ctaHref`]} hint="যেমন /complaint বা /activities">{(p) => <input {...p} maxLength={300} value={b.ctaHref ?? ''} placeholder="/complaint" onChange={(e) => setB(i, { ctaHref: e.target.value })} />}</Field>
                  </div>
                  <Field label="ছবির ক্যাপশন / ক্রেডিট" error={errs[`banners.${i}.caption`]} hint="ছবির কোণে ছোট করে দেখায়">{(p) => <><input {...p} maxLength={80} value={b.caption} onChange={(e) => setB(i, { caption: e.target.value })} /><div className="ct-meta"><span /><CharCount n={b.caption.length} max={80} /></div></>}</Field>
                </div>
              </div>
            </div>
          ))}
        </div>
        {errs.banners && <p className="err" role="alert">{errs.banners}</p>}
        <div className="ct-list-f"><Button icon="plus" disabled={f.banners.length >= MAX_BANNERS} onClick={() => up((f) => ({ ...f, banners: [...f.banners, { url: '', caption: '', title: '', subtitle: '', ctaLabel: '', ctaHref: '' }] }))}>ব্যানার যোগ করুন</Button>
          {f.banners.length >= MAX_BANNERS && <small className="muted">সর্বোচ্চ {toBn(MAX_BANNERS)}টি</small>}</div>
      </FormSection>

      <FormSection title="স্লোগান ও রং" icon="sparkles" description="নামের নিচে স্লোগান; রং বোতাম আর লিংকে ব্যবহার হয়।">
        <Field label="স্লোগান" error={errs.slogan} hint="নামের নিচে দেখায়। ছোট আর সত্যি রাখুন।">{(p) => <><input {...p} maxLength={90} value={f.slogan} onChange={(e) => up((f) => ({ ...f, slogan: e.target.value }))} /><div className="ct-meta"><span /><CharCount n={f.slogan.length} max={90} /></div></>}</Field>
        <fieldset className="field ct-accents"><legend className="lab">রং</legend>
          <div className="ct-accent-row">{ACCENTS.map(([k, l, c]) => (
            <label key={k} className={`ct-accent${f.accent === k ? ' on' : ''}`}><input type="radio" name="accent" checked={f.accent === k} onChange={() => up((f) => ({ ...f, accent: k }))} /><i style={{ background: c }} aria-hidden />{l}</label>
          ))}</div>
        </fieldset>
      </FormSection>

      <FormSection title="হোমপেজের অংশ" icon="layers" description="কোন অংশ দেখাবে আর কোন ক্রমে। টেনে এনে বা তীর দিয়ে ক্রম বদলান। প্রতিটি অংশের লেখা বদলাতে 'হোম পেজ' সম্পাদকে যান।">
        <ol className="rows ct-secrows">
          {f.sections.map((s, i) => (
            <li className={`rowi${s.on ? '' : ' off'}`} key={s.key} {...sec.dnd(s.key)}>
              <span className="ct-grip" aria-hidden title="টেনে সরান"><Icon name="grip" size={16} /></span>
              <div className="grip">
                <button type="button" aria-label={`${SECTION_LABEL[s.key]} ওপরে সরান`} disabled={i === 0} onClick={() => sec.move(s.key, -1)}><Icon name="arrowUp" /></button>
                <button type="button" aria-label={`${SECTION_LABEL[s.key]} নিচে সরান`} disabled={i === f.sections.length - 1} onClick={() => sec.move(s.key, 1)}><Icon name="arrowDown" /></button>
              </div>
              <span className="num ct-secn">{toBn(i + 1)}</span>
              <span className="grow"><b>{SECTION_LABEL[s.key] ?? s.key}</b>{!s.on && <small className="muted"> · বন্ধ</small>}</span>
              <Link className="ct-small ct-seclink" to={`/t/${id}/site-pages/home`}>লেখা বদলান</Link>
              <Switch checked={s.on} label={`${SECTION_LABEL[s.key]} চালু`} onChange={(v) => up((f) => ({ ...f, sections: f.sections.map((x, j) => (j === i ? { ...x, on: v } : x)) }))} />
            </li>
          ))}
        </ol>
      </FormSection>

      <div className={`ct-sb${dirty ? ' active' : ''}`}>
      <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} saveLabel="সংরক্ষণ ও প্রকাশ" saveIcon="rocket"
        onDiscard={() => { const n = JSON.parse(snap) as Cfg; setF(n); setErrs({}); }}
        status={dirty ? undefined : <><Icon name="checkCircle" size={16} />পাবলিক সাইটে যা দেখাচ্ছে, এখানেও তা-ই</>} />
      </div>
      {guard}
    </>
  );
}

/* ---------- complaint-box settings (office) ---------- */
export function Settings() {
  const { can } = useTenant();
  return (
    <>
      <PageHead kicker="অফিস" icon="settings" title="অভিযোগ বক্সের সেটিংস" sub="যাচাই, নিষ্পত্তির সময়সীমা আর অভিযোগের বিষয়ের তালিকা।" />
      {can('settings.edit') ? <SettingsCard /> : <div className="card"><EmptyState icon="lock" title="এই পাতাটি শুধু MP (মালিক) সম্পাদনা করতে পারেন" /></div>}
    </>
  );
}

function SettingsCard() {
  const { api, id } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['tenant', id, 'settings'], queryFn: () => api.get('/settings') });
  const [f, setF] = useState<any>(null); const [newCat, setNewCat] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: () => { const v = tenantSettingsSchema.safeParse(f); if (!v.success) { setErr(v.error.issues[0]?.message ?? 'ভুল'); throw new Error('invalid'); } setErr(''); return api.put('/settings', v.data); },
    onSuccess: () => { toast('সংরক্ষণ হয়েছে', 'ok'); qc.invalidateQueries({ queryKey: ['tenant', id] }); },
    onError: (e) => { if (e instanceof ApiFail) toast(e.message, 'bad'); },
  });
  if (!f) return q.isError ? <ErrorBox error={q.error} /> : <Loading />;
  return (
    <FormSection title="অভিযোগ বক্স" description="যাচাই, সময়সীমা আর অভিযোগের বিষয়ের তালিকা।" icon="complaints">
        <label className="check"><input type="checkbox" checked={f.otpRequired} onChange={(e) => setF({ ...f, otpRequired: e.target.checked })} /><span>মোবাইল নম্বর OTP দিয়ে যাচাই বাধ্যতামূলক<small className="muted" style={{ display: 'block' }}>বন্ধ থাকলে ঐচ্ছিক। বেনামী অভিযোগ সবসময় চলবে।</small></span></label>
        <Field label="লক্ষ্য: কত দিনে নিষ্পত্তি (১–৩০)">{(p) => <input {...p} type="number" min={1} max={30} value={f.slaDays} onChange={(e) => setF({ ...f, slaDays: Number(e.target.value) })} style={{ maxWidth: 160 }} />}</Field>
        <div className="field"><span className="lab">অভিযোগের বিষয়</span>
          <div className="rows">{f.complaintCategories.map((c: string, i: number) => <div className="rowi" key={c}><span className="grow">{c}</span><button type="button" className="x" aria-label={`${c} মুছুন`} onClick={() => f.complaintCategories.length > 2 && setF({ ...f, complaintCategories: f.complaintCategories.filter((_: string, j: number) => j !== i) })}>✕</button></div>)}</div>
          <div className="bar" style={{ margin: '8px 0 0' }}><input className="grow" aria-label="নতুন বিষয়" maxLength={40} value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="নতুন বিষয়" /><button type="button" className="btn btn-g" onClick={() => { const c = newCat.trim(); if (c.length >= 2 && !f.complaintCategories.includes(c)) { setF({ ...f, complaintCategories: [...f.complaintCategories, c] }); setNewCat(''); } }}>যোগ করুন</button></div>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="form-foot"><button className="btn btn-b" disabled={save.isPending} onClick={() => save.mutate()}><Icon name="save" />সংরক্ষণ করুন</button></div>
    </FormSection>
  );
}
