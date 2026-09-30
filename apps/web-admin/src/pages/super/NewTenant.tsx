import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { slugSchema, tenantCreateSchema, toEn } from '@jonoshetu/shared';
import { ApiFail, papi } from '../../api';
import { Badge, Button, Card, EmptyState, Field, Icon, PageHead, Stepper, useToast, useUnsavedGuard } from '../../components';
import { CopyButton } from '../../components/CopyButton';
import { toBn } from '../../format';
import { MP_ROLE_LABEL, PLAN_LABEL, useIsSuper } from './shared';

/* New tenant wizard (/super/tenants/new), FR-SA-02: MP -> seat & subdomain -> owner -> written consent -> review -> create.
   The same zod schema as the API validates every step; the consent step cannot be skipped (MIS-07: no real MP's site without
   the office's written consent). The one-time invite link is shown once, with a copy button. */

export type WizardForm = { mpName: string; mpTitle: string; mpRole: string; ministry: string; plan: string; seatName: string; seatNumber: string; slug: string; ownerPhone: string; ownerName: string; confirmed: boolean; documentRef: string };
export const EMPTY_FORM: WizardForm = { mpName: '', mpTitle: '', mpRole: 'mp', ministry: '', plan: 'full', seatName: '', seatNumber: '', slug: '', ownerPhone: '', ownerName: '', confirmed: false, documentRef: '' };
type StepKey = 'mp' | 'seat' | 'owner' | 'consent' | 'review';
const STEPS: Array<{ key: StepKey; label: string; sub: string }> = [
  { key: 'mp', label: 'MP-র তথ্য', sub: 'নাম ও পদ' }, { key: 'seat', label: 'আসন ও ঠিকানা', sub: 'সাবডোমেইন' }, { key: 'owner', label: 'মালিক', sub: 'মোবাইল' },
  { key: 'consent', label: 'লিখিত সম্মতি', sub: 'বাধ্যতামূলক' }, { key: 'review', label: 'যাচাই', sub: 'তৈরি করুন' },
];
const FIELDS: Record<StepKey, Array<keyof WizardForm>> = { mp: ['mpName', 'mpTitle', 'mpRole', 'ministry', 'plan'], seat: ['seatName', 'seatNumber', 'slug'], owner: ['ownerPhone', 'ownerName'], consent: ['confirmed', 'documentRef'], review: [] };
const MSG: Partial<Record<keyof WizardForm, string>> = {
  mpName: 'পুরো নাম লিখুন (৩ থেকে ৮০ অক্ষর)', mpTitle: '৮০ অক্ষরের মধ্যে লিখুন', ministry: '৮০ অক্ষরের মধ্যে লিখুন', seatName: 'আসনের নাম লিখুন (২ থেকে ৪০ অক্ষর)',
  seatNumber: 'আসন নম্বর ১ থেকে ২০-এর মধ্যে একটি সংখ্যা', ownerName: 'নাম ৩ থেকে ৮০ অক্ষরের মধ্যে', confirmed: 'MP অফিসের লিখিত সম্মতি নিশ্চিত করুন', documentRef: 'সম্মতিপত্রের রেফারেন্স লিখুন (৩ থেকে ১২০ অক্ষর)',
};

/** Form -> API body (exactly what POST /super/tenants accepts). */
export function toBody(f: WizardForm) {
  const n = Number(toEn(f.seatNumber.trim()));
  return {
    mpName: f.mpName, mpTitle: f.mpTitle, mpRole: f.mpRole, ministry: f.mpRole === 'mp' ? '' : f.ministry, seatName: f.seatName, seatNumber: f.seatNumber.trim() === '' ? Number.NaN : n,
    slug: f.slug.trim(), ownerPhone: f.ownerPhone, ...(f.ownerName.trim() ? { ownerName: f.ownerName } : {}), plan: f.plan,
    consent: { confirmed: f.confirmed ? true : undefined, documentRef: f.documentRef },
  };
}

/** Errors of the given step only (all steps for 'review'), Bangla messages. Uses the shared API schema. */
export function validateStep(step: StepKey, f: WizardForm): Partial<Record<keyof WizardForm, string>> {
  const r = tenantCreateSchema.safeParse(toBody(f));
  if (r.success) return {};
  const want = step === 'review' ? Object.values(FIELDS).flat() : FIELDS[step];
  const out: Partial<Record<keyof WizardForm, string>> = {};
  for (const i of r.error.issues) {
    const k = (i.path[0] === 'consent' ? (i.path[1] === 'documentRef' ? 'documentRef' : 'confirmed') : String(i.path[0])) as keyof WizardForm;
    if (!want.includes(k) || out[k]) continue;
    out[k] = k === 'slug' || k === 'ownerPhone' ? i.message : MSG[k] ?? i.message;
  }
  return out;
}
const stepOf = (k: keyof WizardForm): StepKey => (Object.keys(FIELDS) as StepKey[]).find((s) => FIELDS[s].includes(k)) ?? 'mp';

type SlugState = { state: 'idle' | 'checking' | 'free' | 'taken' | 'invalid' | 'error'; host?: string };

export function NewTenant() {
  const su = useIsSuper();
  const nav = useNavigate(); const toast = useToast(); const qc = useQueryClient();
  const [f, setF] = useState<WizardForm>(EMPTY_FORM);
  const [step, setStep] = useState<StepKey>('mp');
  const [errs, setErrs] = useState<Partial<Record<keyof WizardForm, string>>>({});
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState<SlugState>({ state: 'idle' });
  const [done, setDone] = useState<{ id: string; slug: string; inviteToken?: string } | null>(null);
  const head = useRef<HTMLHeadingElement>(null);
  const dirty = !done && JSON.stringify(f) !== JSON.stringify(EMPTY_FORM);
  useUnsavedGuard(dirty);

  // live subdomain check (debounced; the API still refuses duplicates on create)
  useEffect(() => {
    const s = f.slug.trim();
    if (!s) { setSlug({ state: 'idle' }); return; }
    if (!slugSchema.safeParse(s).success) { setSlug({ state: 'invalid' }); return; }
    setSlug({ state: 'checking' });
    let live = true;
    const h = setTimeout(async () => {
      try { const r = await papi.get<{ available: boolean; host: string }>(`/super/slug-available?slug=${encodeURIComponent(s)}`); if (live) setSlug({ state: r.available ? 'free' : 'taken', host: r.host }); }
      catch { if (live) setSlug({ state: 'error' }); }
    }, 400);
    return () => { live = false; clearTimeout(h); };
  }, [f.slug]);

  useEffect(() => { head.current?.focus(); }, [step, done]);

  if (!su) return <><PageHead kicker="নতুন MP" title="নতুন MP যোগ করুন" /><Card><EmptyState icon="lock" title="শুধু Super Admin নতুন MP যোগ করতে পারেন" text="সাপোর্ট টিম সাইটগুলো দেখতে পারে, কিন্তু তৈরি বা বদলাতে পারে না।" action={<Button to="/super/tenants">সব সাইট দেখুন</Button>} /></Card></>;

  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => { setF((x) => ({ ...x, [k]: v })); if (errs[k]) setErrs((e) => ({ ...e, [k]: undefined })); };
  const idx = STEPS.findIndex((s) => s.key === step);
  const next = () => {
    const e = validateStep(step, f);
    if (step === 'seat' && !e.slug && slug.state === 'taken') e.slug = 'এই সাবডোমেইন আগে থেকেই আছে, অন্য একটি দিন';
    setErrs(e);
    if (Object.values(e).some(Boolean)) return;
    setStep(STEPS[idx + 1]!.key);
  };
  const back = () => { setErrs({}); setStep(STEPS[Math.max(0, idx - 1)]!.key); };
  const create = async () => {
    const e = validateStep('review', f);
    if (Object.values(e).some(Boolean)) { setErrs(e); setStep(stepOf(Object.keys(e)[0] as keyof WizardForm)); return; }
    setBusy(true);
    try {
      const r = await papi.post<{ id: string; slug: string; inviteToken?: string }>('/super/tenants', tenantCreateSchema.parse(toBody(f)));
      await qc.invalidateQueries({ queryKey: ['super'] });
      setDone(r); toast('MP-র সাইট তৈরি হয়েছে', 'ok');
    } catch (x) {
      const fe = x instanceof ApiFail ? x.fieldErrors : {};
      const m: Partial<Record<keyof WizardForm, string>> = {};
      for (const [k, v] of Object.entries(fe)) m[(k === 'consent' ? 'documentRef' : k) as keyof WizardForm] = v[0];
      if (x instanceof ApiFail && x.code === 'SLUG_TAKEN') m.slug = x.message;
      setErrs(m);
      if (Object.keys(m).length) setStep(stepOf(Object.keys(m)[0] as keyof WizardForm));
      toast(x instanceof ApiFail ? x.message : 'কিছু ভুল হয়েছে', 'bad');
    } finally { setBusy(false); }
  };

  if (done) {
    const link = done.inviteToken ? `${window.location.origin}/invite/${done.inviteToken}` : null;
    return (
      <>
        <PageHead kicker="নতুন MP" icon="checkCircle" title="সাইট তৈরি হয়েছে" sub={<><b>{f.mpName}</b>-এর সাইট ({done.slug}) এখন "সেটআপ" অবস্থায় আছে, পাবলিকে দেখা যাবে না।</>} />
        <Card className="sa-done" title="এরপর কী হবে" icon="list">
          <ol className="sa-next">
            <li><b>আমন্ত্রণ SMS গেছে</b> মালিকের মোবাইলে ({toBn(f.ownerPhone)})। লিংক ৭২ ঘণ্টা কার্যকর, একবারই ব্যবহার করা যায়।</li>
            <li>MP পাসওয়ার্ড দিয়ে অ্যাকাউন্ট চালু করবেন, তারপর PR টিমকে যোগ করতে পারবেন।</li>
            <li>কনটেন্ট তৈরি ও যাচাই শেষে সাইটের পেজ থেকে "লাইভ করুন"।</li>
          </ol>
          {link && (
            <div className="note bad sa-once" role="alert">
              <Icon name="alert" />
              <div>
                <p style={{ margin: '0 0 8px' }}><b>এই আমন্ত্রণ লিংক শুধু এখন একবার দেখানো হচ্ছে।</b> পেজ ছাড়লে আর দেখা যাবে না (সার্ভারে শুধু এর hash থাকে)। SMS না পৌঁছালে নিরাপদ উপায়ে শুধু MP-কে দিন।</p>
                <div className="sa-invite"><code>{link}</code><CopyButton value={link} label="আমন্ত্রণ লিংক কপি করুন" /></div>
              </div>
            </div>
          )}
          <div className="acts" style={{ marginTop: 18 }}>
            <Button variant="primary" icon="arrowRight" onClick={() => nav(`/super/tenants/${done.id}`)}>বিস্তারিত দেখুন</Button>
            <Button icon="plus" onClick={() => { setDone(null); setF(EMPTY_FORM); setStep('mp'); setErrs({}); }}>আরেকটি MP যোগ করুন</Button>
          </div>
        </Card>
      </>
    );
  }

  const input = (k: keyof WizardForm, extra: Record<string, unknown> = {}) => (p: Record<string, unknown>) => <input {...p} {...extra} value={String(f[k])} onChange={(e) => set(k, e.target.value as never)} />;
  const slugHint = slug.state === 'checking' ? 'যাচাই হচ্ছে…' : slug.state === 'free' ? `খালি আছে: ${slug.host}` : slug.state === 'taken' ? undefined : 'ইংরেজি ছোট হাতের অক্ষর, সংখ্যা, হাইফেন (৩–৩০ অক্ষর)। পরে কাস্টম ডোমেইনও যোগ করা যায়।';

  return (
    <>
      <PageHead kicker="নতুন MP" icon="plus" back={{ to: '..', label: 'সব সাইট' }} title="নতুন MP / মন্ত্রী যোগ করুন" sub="MP অফিসের লিখিত সম্মতি ছাড়া কোনো সাইট তৈরি করা যায় না। তৈরির পর সাইট 'সেটআপ' অবস্থায় থাকে, পাবলিকে দেখা যায় না।" />
      <div className="sa-wizard">
        <Card className="sa-steps"><Stepper steps={STEPS} current={step} label="নতুন MP যোগ করার ধাপ" /></Card>
        <form className="card form sa-step" noValidate onSubmit={(e) => { e.preventDefault(); if (step === 'review') create(); else next(); }} aria-labelledby="wz-h">
          <p className="kick sa-stepno">ধাপ {toBn(idx + 1)}/{toBn(STEPS.length)}</p>
          <h2 id="wz-h" className="h2" tabIndex={-1} ref={head}>{STEPS[idx]!.label}</h2>

          {step === 'mp' && <>
            <Field label="পুরো নাম" required error={errs.mpName} hint="যেভাবে সাইটে দেখাবে, যেমন ড. তাহমিনা নূর">{input('mpName', { maxLength: 80, autoComplete: 'off' })}</Field>
            <div className="frow">
              <Field label="পদ" required>{(p) => <select {...p} value={f.mpRole} onChange={(e) => set('mpRole', e.target.value)}>{Object.entries(MP_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
              {f.mpRole !== 'mp'
                ? <Field label="মন্ত্রণালয়" error={errs.ministry}>{input('ministry', { maxLength: 80 })}</Field>
                : <Field label="উপাধি বা পরিচয় (ঐচ্ছিক)" error={errs.mpTitle} hint="যেমন: চিকিৎসক ও সমাজকর্মী">{input('mpTitle', { maxLength: 80 })}</Field>}
            </div>
            <fieldset className="sa-plan"><legend>প্যাকেজ</legend>
              {(['full', 'basic'] as const).map((p) => (
                <label key={p} className={`sa-radio${f.plan === p ? ' on' : ''}`}><input type="radio" name="plan" value={p} checked={f.plan === p} onChange={() => set('plan', p)} />
                  <span><b>{PLAN_LABEL[p]}</b><small>{p === 'full' ? 'পোর্টফোলিও, CMS, অভিযোগ বক্স, গ্যালারি-ভিডিও' : 'পোর্টফোলিও ও CMS, সীমিত ফিচার'}</small></span></label>))}
            </fieldset>
          </>}

          {step === 'seat' && <>
            <div className="frow">
              <Field label="আসনের নাম" required error={errs.seatName} hint="যেমন নদীপুর">{input('seatName', { maxLength: 40 })}</Field>
              <Field label="আসন নম্বর" required error={errs.seatNumber} hint="১ থেকে ২০">{input('seatNumber', { inputMode: 'numeric', maxLength: 2 })}</Field>
            </div>
            <Field label="সাবডোমেইন" required error={errs.slug ?? (slug.state === 'taken' ? 'এই সাবডোমেইন আগে থেকেই আছে, অন্য একটি দিন' : slug.state === 'invalid' && f.slug.length >= 3 ? '৩–৩০ অক্ষর: ইংরেজি ছোট হাতের অক্ষর, সংখ্যা, হাইফেন' : undefined)} hint={slugHint}>
              {(p) => <div className="sa-slug"><input {...p} value={f.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))} autoCapitalize="none" spellCheck={false} placeholder="ndp3" maxLength={30} />
                <span className={`sa-slug-s ${slug.state}`} aria-hidden>{slug.state === 'free' ? <Icon name="checkCircle" size={18} /> : slug.state === 'taken' ? <Icon name="alert" size={18} /> : slug.state === 'checking' ? <Icon name="spinner" size={18} className="spin" /> : null}</span></div>}
            </Field>
          </>}

          {step === 'owner' && <>
            <Field label="MP-র মোবাইল (মালিক অ্যাকাউন্ট)" required error={errs.ownerPhone} hint="এই নম্বরে আমন্ত্রণ SMS যাবে; লগইনও এই নম্বরে">{input('ownerPhone', { type: 'tel', inputMode: 'tel', autoComplete: 'off', placeholder: '01XXXXXXXXX' })}</Field>
            <Field label="অ্যাকাউন্টের নাম (MP নিজে না হলে)" error={errs.ownerName} hint="খালি রাখলে MP-র নামই থাকবে">{input('ownerName', { maxLength: 80 })}</Field>
            <div className="note info"><Icon name="shield" /><span>প্রথম লগইনে পাসওয়ার্ড দিতে হবে; নাগরিকের নাম-নম্বর MP বা Super Admin কেউই দেখেন না, শুধু দায়িত্বপ্রাপ্ত কর্মকর্তা।</span></div>
          </>}

          {step === 'consent' && <>
            <div className={`note sa-consent${errs.confirmed ? ' bad' : ''}`}>
              <label className="check"><input type="checkbox" checked={f.confirmed} onChange={(e) => set('confirmed', e.target.checked)} aria-invalid={errs.confirmed ? true : undefined} aria-describedby={errs.confirmed ? 'consent-err' : undefined} />
                <span><b>MP অফিসের লিখিত সম্মতি পাওয়া গেছে।</b> সম্মতি ছাড়া কোনো আসল MP-র নামে সাইট তৈরি বা কনটেন্ট প্রকাশ করা যাবে না।</span></label>
              {errs.confirmed && <p className="err" id="consent-err" role="alert">{errs.confirmed}</p>}
            </div>
            <Field label="সম্মতিপত্রের রেফারেন্স" required error={errs.documentRef} hint="অফিসের ফাইলে রাখা সম্মতিপত্রের নম্বর বা স্মারক; এখানে শুধু রেফারেন্স থাকে">{input('documentRef', { maxLength: 120, placeholder: 'যেমন: সম্মতিপত্র-২০২৬-০১১' })}</Field>
          </>}

          {step === 'review' && (
            <div className="stack">
              <p className="muted" style={{ margin: 0 }}>সব ঠিক আছে কিনা দেখে নিন। তৈরি করলে মালিকের মোবাইলে আমন্ত্রণ SMS যাবে এবং অডিট লগে থাকবে।</p>
              <dl className="sa-review">
                {([
                  ['mp', 'MP', <>{f.mpName} <Badge tone="plain">{MP_ROLE_LABEL[f.mpRole]}</Badge>{f.mpRole !== 'mp' && f.ministry ? <small>{f.ministry}</small> : f.mpTitle ? <small>{f.mpTitle}</small> : null}</>],
                  ['mp', 'প্যাকেজ', PLAN_LABEL[f.plan]],
                  ['seat', 'আসন', `${f.seatName}-${toBn(toEn(f.seatNumber))}`],
                  ['seat', 'সাবডোমেইন', <span className="sa-host" key="h">{slug.host ?? f.slug}</span>],
                  ['owner', 'মালিকের মোবাইল', toBn(f.ownerPhone)],
                  ['consent', 'লিখিত সম্মতি', f.confirmed ? <><Icon name="checkCircle" size={16} /> নিশ্চিত · {f.documentRef}</> : <span className="sa-bad">নিশ্চিত করা হয়নি</span>],
                ] as Array<[StepKey, string, ReactNode]>).map(([s, k, v]) => (
                  <div key={k} className="sa-rv"><dt>{k}</dt><dd>{v}</dd><button type="button" className="link" onClick={() => { setErrs({}); setStep(s); }} aria-label={`${k} বদলান`}>বদলান</button></div>))}
              </dl>
              {Object.values(errs).some(Boolean) && <p className="err" role="alert">কিছু তথ্য ঠিক নেই, সংশ্লিষ্ট ধাপে গিয়ে ঠিক করুন।</p>}
            </div>
          )}

          <div className="form-foot sa-foot">
            {idx > 0 ? <Button icon="chevronLeft" onClick={back}>আগের ধাপ</Button> : <Link className="btn btn-g" to="/super/tenants">বাতিল</Link>}
            <span className="grow" />
            {step === 'review'
              ? <Button type="submit" variant="accent" icon="check" loading={busy}>MP তৈরি করুন</Button>
              : <Button type="submit" variant="primary" iconRight="chevronRight">পরের ধাপ</Button>}
          </div>
        </form>
      </div>
    </>
  );
}
