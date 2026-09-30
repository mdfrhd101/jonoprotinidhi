'use client';
import { useEffect, useRef, useState } from 'react';
import Turnstile from './Turnstile';
import { IconCheck } from './icons';
import { isValidBdMobile, normalizeBdPhone, toBn, toEn } from '@jonoshetu/shared/src/bangla.js';
import { COMPLAINT_STATUS, bnDateSafe, joinParts } from '@/lib/format';
import type { TrackResult, Upazila } from '@/lib/types';

type Props = { categories: string[]; upazilas: Upazila[]; otpRequired: boolean; enabled: boolean; privacyNote: string; turnstileSiteKey: string };
type Errs = Partial<Record<'category' | 'upazila' | 'union' | 'description' | 'phone' | 'name' | 'place' | 'otp', string>>;
type ApiErr = { error?: { code?: string; message?: string; details?: { fieldErrors?: Record<string, string[]>; retryAfterSec?: number } } };

const FIELD_MSG: Record<string, string> = {
  category: 'বিষয় বেছে নিন।', upazila: 'উপজেলা বেছে নিন।', union: 'ইউনিয়ন বা পৌরসভা বেছে নিন।',
  description: 'সমস্যাটা অন্তত ২০ অক্ষরে লিখুন (সর্বোচ্চ ১০০০)।', phone: 'সঠিক মোবাইল নম্বর দিন, ১১ সংখ্যার, ০১ দিয়ে শুরু।',
  name: 'নাম সর্বোচ্চ ৮০ অক্ষর।', place: 'ঠিকানা সর্বোচ্চ ১০০ অক্ষর।',
};

async function call<T>(path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; err: ApiErr }> {
  try {
    const res = await fetch(`/api/public/${path}`, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: j as T } : { ok: false, status: res.status, err: j as ApiErr };
  } catch {
    return { ok: false, status: 0, err: { error: { message: 'ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।' } } };
  }
}
const errMsg = (r: { status: number; err: ApiErr }) =>
  r.status === 429 ? 'অনেক বেশি চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' : r.err.error?.message || 'কিছু একটা ভুল হয়েছে, আবার চেষ্টা করুন।';

export default function ComplaintBox({ categories, upazilas, otpRequired, enabled, privacyNote, turnstileSiteKey }: Props) {
  const [tab, setTab] = useState<'new' | 'track'>('new');
  const [f, setF] = useState({ category: '', upazila: '', union: '', place: '', description: '', anonymous: false, name: '', phone: '' });
  const [errs, setErrs] = useState<Errs>({});
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [tsKey, setTsKey] = useState(0);
  const [otp, setOtp] = useState({ sent: false, code: '', ticket: '', busy: false, msg: '', phone: '' });
  const [done, setDone] = useState<{ id: string; anonymous: boolean; phone: string } | null>(null);
  const [trackId, setTrackId] = useState('');
  const [track, setTrack] = useState<{ busy: boolean; res: TrackResult | null; err: string }>({ busy: false, res: null, err: '' });
  const formRef = useRef<HTMLFormElement>(null);
  const ticketRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (window.location.hash === '#track') setTab('track'); }, []);
  useEffect(() => { if (done) ticketRef.current?.focus(); }, [done]);

  const upz = upazilas.find((u) => (u.short || u.name) === f.upazila);
  const unions = upz?.unions ?? [];
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v, ...(k === 'upazila' ? { union: '' } : {}) })); setErrs((e) => ({ ...e, [k]: undefined })); };
  const needOtp = otpRequired && !f.anonymous;
  const phoneN = normalizeBdPhone(f.phone);
  // the number changed after it was verified: it has to be verified again
  useEffect(() => { if (otp.phone && otp.phone !== phoneN) setOtp({ sent: false, code: '', ticket: '', busy: false, msg: '', phone: '' }); }, [phoneN, otp.phone]);

  function validate(): Errs {
    const e: Errs = {};
    if (!f.category) e.category = FIELD_MSG.category;
    if (f.upazila.trim().length < 2) e.upazila = FIELD_MSG.upazila;
    if (f.union.trim().length < 2) e.union = FIELD_MSG.union;
    const d = f.description.trim().length;
    if (d < 20 || d > 1000) e.description = FIELD_MSG.description;
    if (!f.anonymous && !isValidBdMobile(f.phone)) e.phone = FIELD_MSG.phone;
    if (f.name.length > 80) e.name = FIELD_MSG.name;
    if (needOtp && !otp.ticket) e.otp = 'মোবাইল নম্বরটি কোড দিয়ে যাচাই করুন।';
    return e;
  }

  async function sendOtp() {
    if (!isValidBdMobile(f.phone)) { setErrs((e) => ({ ...e, phone: FIELD_MSG.phone })); return; }
    setOtp((o) => ({ ...o, busy: true, msg: '' }));
    const r = await call<{ ok: boolean }>('otp/send', { phone: phoneN, turnstileToken: token || undefined });
    setTsKey((k) => k + 1); // a Turnstile token is single-use: get a fresh one for the submission
    setOtp((o) => ({ ...o, busy: false, sent: r.ok, phone: phoneN, msg: r.ok ? `${toBn(phoneN.slice(0, 3))}•••••${toBn(phoneN.slice(-3))} নম্বরে ৬ সংখ্যার কোড পাঠানো হয়েছে।` : errMsg(r) }));
  }
  async function verifyOtp() {
    const code = toEn(otp.code).replace(/\D/g, '');
    if (!/^\d{6}$/.test(code)) { setOtp((o) => ({ ...o, msg: '৬ সংখ্যার কোডটি লিখুন।' })); return; }
    setOtp((o) => ({ ...o, busy: true, msg: '' }));
    const r = await call<{ otpTicket: string }>('otp/verify', { phone: phoneN, code });
    setOtp((o) => ({ ...o, busy: false, ticket: r.ok ? r.data.otpTicket : '', msg: r.ok ? 'নম্বর যাচাই হয়েছে।' : errMsg(r) }));
    if (r.ok) setErrs((e) => ({ ...e, otp: undefined }));
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setAlert('');
    const e = validate();
    setErrs(e);
    const firstBad = (Object.keys(e) as Array<keyof Errs>)[0];
    if (firstBad) { formRef.current?.querySelector<HTMLElement>(`[data-f="${firstBad}"]`)?.focus(); return; }
    if (!token) { setAlert('স্প্যাম যাচাই এখনো শেষ হয়নি, কয়েক সেকেন্ড পর আবার চাপুন।'); return; }
    setBusy(true);
    const body = {
      category: f.category, upazila: f.upazila.trim(), union: f.union.trim(), place: f.place.trim(), description: f.description.trim(),
      anonymous: f.anonymous, name: f.anonymous ? '' : f.name.trim(), phone: f.anonymous ? '' : phoneN,
      ...(needOtp && otp.ticket ? { otpTicket: otp.ticket } : {}), turnstileToken: token,
    };
    const r = await call<{ trackingId: string }>('complaints', body);
    setBusy(false);
    setTsKey((k) => k + 1);
    if (r.ok) { setDone({ id: r.data.trackingId, anonymous: f.anonymous, phone: phoneN }); return; }
    const fe = r.err.error?.details?.fieldErrors;
    if (fe && Object.keys(fe).length) {
      const mapped: Errs = {};
      for (const k of Object.keys(fe)) if (k in FIELD_MSG) mapped[k as keyof Errs] = FIELD_MSG[k];
      setErrs(mapped);
    }
    if (r.err.error?.code === 'OTP_REQUIRED') setOtp({ sent: false, code: '', ticket: '', busy: false, msg: '', phone: '' });
    setAlert(errMsg(r));
  }

  async function doTrack(raw: string) {
    const id = toEn(raw).trim().toUpperCase().replace(/\s+/g, '');
    if (!id) { setTrack({ busy: false, res: null, err: 'ট্র্যাকিং আইডি লিখুন।' }); return; }
    if (!/^[A-Z0-9-]{3,40}$/.test(id)) { setTrack({ busy: false, res: null, err: 'আইডিটি সঠিক নয়। যেমন: NDP3-2026-00012' }); return; }
    setTrack({ busy: true, res: null, err: '' });
    const r = await call<TrackResult>(`complaints/${encodeURIComponent(id)}`);
    setTrack({ busy: false, res: r.ok ? r.data : null, err: r.ok ? '' : r.status === 404 ? `${id} আইডিতে কোনো অভিযোগ পাওয়া যায়নি। আইডিটি আবার দেখে লিখুন।` : errMsg(r) });
  }

  const reset = () => { setF({ category: '', upazila: '', union: '', place: '', description: '', anonymous: false, name: '', phone: '' }); setErrs({}); setAlert(''); setOtp({ sent: false, code: '', ticket: '', busy: false, msg: '', phone: '' }); setDone(null); };
  const E = ({ k }: { k: keyof Errs }) => (errs[k] ? <p className="err" id={`e-${k}`}>{errs[k]}</p> : null);
  const inv = (k: keyof Errs) => ({ 'aria-invalid': errs[k] ? true : undefined, 'aria-describedby': errs[k] ? `e-${k}` : undefined, 'data-f': k });

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="অভিযোগ">
        <button className="tab" role="tab" type="button" id="tab-new" aria-selected={tab === 'new'} aria-controls="pane-new" onClick={() => setTab('new')}>নতুন অভিযোগ</button>
        <button className="tab" role="tab" type="button" id="tab-track" aria-selected={tab === 'track'} aria-controls="pane-track" onClick={() => setTab('track')}>অভিযোগের অবস্থা দেখুন</button>
      </div>

      <div id="pane-new" role="tabpanel" aria-labelledby="tab-new" hidden={tab !== 'new'}>
        {!enabled ? <p className="alert">অভিযোগ বক্স এখন বন্ধ আছে। জরুরি প্রয়োজনে যোগাযোগ পাতার নম্বরে ফোন করুন।</p> : done ? (
          <div className="ticket" ref={ticketRef} tabIndex={-1} aria-live="polite">
            <p className="kicker">অভিযোগ জমা হয়েছে</p>
            <p className="hint" style={{ marginTop: 10 }}>আপনার ট্র্যাকিং আইডি</p>
            <p className="tid" data-testid="tracking-id">{done.id}</p>
            <p style={{ margin: 0 }}>{done.anonymous
              ? 'বেনামী অভিযোগে SMS যায় না। আইডিটি লিখে রাখুন, এটা দিয়েই অবস্থা দেখতে পারবেন।'
              : `আইডিসহ একটি SMS যাবে ${toBn(done.phone.slice(0, 3))}•••••${toBn(done.phone.slice(-3))} নম্বরে।`}</p>
            <div className="acts">
              <CopyId id={done.id} />
              <button type="button" className="btn btn-brass" onClick={() => { setTrackId(done.id); setTab('track'); void doTrack(done.id); }}>অবস্থা দেখুন</button>
              <button type="button" className="linkbtn" onClick={reset}>আরেকটি অভিযোগ করুন</button>
            </div>
          </div>
        ) : (
          <form className="cmp" ref={formRef} noValidate onSubmit={submit}>
            <div className="frow">
              <div className="field">
                <label htmlFor="fCat">বিষয় <span className="req">*</span></label>
                <select id="fCat" value={f.category} onChange={(e) => set('category', e.target.value)} {...inv('category')}>
                  <option value="">বেছে নিন</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select><E k="category" />
              </div>
              <div className="field">
                <label htmlFor="fUpz">উপজেলা <span className="req">*</span></label>
                {upazilas.length ? (
                  <select id="fUpz" value={f.upazila} onChange={(e) => set('upazila', e.target.value)} {...inv('upazila')}>
                    <option value="">বেছে নিন</option>
                    {upazilas.map((u) => <option key={u.name} value={u.short || u.name}>{u.short || u.name}</option>)}
                  </select>
                ) : <input type="text" id="fUpz" maxLength={60} value={f.upazila} onChange={(e) => set('upazila', e.target.value)} {...inv('upazila')} />}
                <E k="upazila" />
              </div>
            </div>
            <div className="frow">
              <div className="field">
                <label htmlFor="fUnion">ইউনিয়ন / পৌরসভা <span className="req">*</span></label>
                {upazilas.length && (unions.length || !f.upazila) ? (
                  <select id="fUnion" value={f.union} disabled={!f.upazila} onChange={(e) => set('union', e.target.value)} {...inv('union')}>
                    <option value="">{f.upazila ? 'বেছে নিন' : 'আগে উপজেলা বেছে নিন'}</option>
                    {unions.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                ) : <input type="text" id="fUnion" maxLength={60} value={f.union} onChange={(e) => set('union', e.target.value)} {...inv('union')} />}
                <E k="union" />
              </div>
              <div className="field">
                <label htmlFor="fPlace">গ্রাম / মহল্লা / ওয়ার্ড</label>
                <input type="text" id="fPlace" maxLength={100} value={f.place} onChange={(e) => set('place', e.target.value)} placeholder="যেমন: ৪ নম্বর ওয়ার্ড" {...inv('place')} /><E k="place" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="fText">সমস্যার বিবরণ <span className="req">*</span></label>
              <textarea id="fText" maxLength={1000} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="কী সমস্যা, কবে থেকে, কতজন ভুক্তভোগী" {...inv('description')} />
              <div className="split"><E k="description" /><span className="hint" style={{ marginLeft: 'auto' }} aria-live="polite">{toBn(f.description.length)}/১০০০</span></div>
            </div>
            <label className="check" htmlFor="fAnon">
              <input type="checkbox" id="fAnon" checked={f.anonymous} onChange={(e) => set('anonymous', e.target.checked)} />
              <span>বেনামে অভিযোগ করতে চাই<small className="hint">নাম ও নম্বর জমা হবে না। তখন SMS যাবে না, ট্র্যাকিং আইডি লিখে রাখতে হবে।</small></span>
            </label>
            {!f.anonymous && (
              <div className="frow">
                <div className="field">
                  <label htmlFor="fName">আপনার নাম (ঐচ্ছিক)</label>
                  <input type="text" id="fName" maxLength={80} autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} {...inv('name')} /><E k="name" />
                </div>
                <div className="field">
                  <label htmlFor="fPhone">মোবাইল নম্বর <span className="req">*</span></label>
                  <input type="tel" id="fPhone" inputMode="numeric" maxLength={16} placeholder="০১XXXXXXXXX" autoComplete="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} {...inv('phone')} /><E k="phone" />
                </div>
              </div>
            )}
            {needOtp && (
              <div className="otp" data-f="otp" tabIndex={-1}>
                <p className="hint" style={{ margin: 0 }}>এই অভিযোগ বক্সে মোবাইল নম্বর যাচাই করা বাধ্যতামূলক।</p>
                {otp.ticket ? <p className="okmsg">নম্বর যাচাই হয়েছে।</p> : <>
                  <div className="otp-row">
                    <button type="button" className="btn btn-line btn-sm" disabled={otp.busy} onClick={sendOtp}>{otp.sent ? 'আবার কোড পাঠান' : 'যাচাই কোড পাঠান'}</button>
                  </div>
                  {otp.sent && (
                    <div className="otp-row">
                      <div className="field"><label htmlFor="fOtp">৬ সংখ্যার কোড</label>
                        <input type="text" id="fOtp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp.code} onChange={(e) => setOtp((o) => ({ ...o, code: e.target.value }))} /></div>
                      <button type="button" className="btn btn-brass btn-sm" disabled={otp.busy} onClick={verifyOtp}>যাচাই করুন</button>
                    </div>
                  )}
                </>}
                {otp.msg && !otp.ticket && <p className="hint" aria-live="polite">{otp.msg}</p>}
                <E k="otp" />
              </div>
            )}
            <Turnstile siteKey={turnstileSiteKey} onToken={setToken} resetKey={tsKey} />
            {privacyNote && <p className="privacy">{privacyNote}</p>}
            {alert && <p className="alert" role="alert">{alert}</p>}
            <div><button className="btn btn-brass" type="submit" disabled={busy}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? 'জমা হচ্ছে…' : 'অভিযোগ জমা দিন'}</button></div>
          </form>
        )}
      </div>

      <div id="pane-track" role="tabpanel" aria-labelledby="tab-track" hidden={tab !== 'track'}>
        <form className="track-form" noValidate onSubmit={(e) => { e.preventDefault(); void doTrack(trackId); }}>
          <label className="sr" htmlFor="trackId">ট্র্যাকিং আইডি</label>
          <input type="text" id="trackId" autoComplete="off" spellCheck={false} placeholder="যেমন: NDP3-2026-00012" value={trackId} onChange={(e) => setTrackId(e.target.value)} />
          <button className="btn btn-brass" type="submit" disabled={track.busy}>অবস্থা দেখুন</button>
        </form>
        <div aria-live="polite">
          {track.err && <p className="err" style={{ marginTop: 14 }}>{track.err}</p>}
          {track.res && <TrackCard t={track.res} />}
        </div>
      </div>
    </div>
  );
}

function CopyId({ id }: { id: string }) {
  const [t, setT] = useState('আইডি কপি করুন');
  return <button type="button" className="btn btn-line" onClick={() => { try { navigator.clipboard.writeText(id).then(() => setT('কপি হয়েছে'), () => setT('আইডি নিজে লিখে রাখুন')); } catch { setT('আইডি নিজে লিখে রাখুন'); } }}>{t}</button>;
}

function TrackCard({ t }: { t: TrackResult }) {
  const s = COMPLAINT_STATUS[t.status] ?? COMPLAINT_STATUS.new!;
  const finished = t.status === 'solved' || t.status === 'closed';
  return (
    <div className="track-card" data-testid="track-card">
      <div className="tc-head">
        <div>
          <p className="tc-id">{t.trackingId}</p>
          <b>{t.category}</b>
          <p className="tc-meta">{joinParts([t.union, t.upazila])} · জমা: {bnDateSafe(t.submittedAt)}</p>
        </div>
        <span className="tpill" style={{ ['--c' as string]: s.c } as React.CSSProperties}>{s.t}</span>
      </div>
      <ol className="steps">
        {t.steps.map((st, i) => (
          <li key={i} className={i < t.steps.length - 1 || finished ? 'done' : 'now'}>
            <span className="dotc">{(i < t.steps.length - 1 || finished) && <IconCheck />}</span>
            <div><b>{st.label}</b><small>{joinParts([bnDateSafe(st.at), st.note])}</small></div>
          </li>
        ))}
        {!finished && <li><span className="dotc" /><div><b>সমাধান</b><small>অপেক্ষমাণ</small></div></li>}
      </ol>
    </div>
  );
}
