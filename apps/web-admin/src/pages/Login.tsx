import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { useEffect } from 'react';
import { loginSchema, passwordSchema } from '@jonoprotinidhi/shared';
import { api, ApiFail } from '../api';
import { useSession, type LoginStep } from '../session';
import { Field } from '../components/ui';
import { Icon } from '../components/Icon';
import { BrandMark } from '../components/primitives';

/* Login: password -> (first time: enrol an authenticator app) -> 6-digit code or a recovery code. */

function Frame({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="auth-logo"><BrandMark /><div><small>জনপ্রতিনিধি</small><b>অ্যাডমিন প্যানেল</b></div></div>
        <div>
          <h2>জনগণের সাথে <em>সেতু</em> গড়ার কাজ, এক জায়গায়</h2>
          <p className="lead">পোস্ট, প্রতিশ্রুতি আর নাগরিকের অভিযোগ, সবকিছু নিরাপদে সামলান।</p>
        </div>
        <ul className="auth-points">
          <li><span className="chip-ico"><Icon name="shield" size={19} /></span><span><b>২-ধাপ যাচাই</b><small>প্রতিটি অ্যাকাউন্টে বাধ্যতামূলক, তাই পাসওয়ার্ড ফাঁস হলেও সাইট নিরাপদ।</small></span></li>
          <li><span className="chip-ico"><Icon name="lock" size={19} /></span><span><b>নাগরিকের তথ্য এনক্রিপ্ট করা</b><small>নাম-নম্বর শুধু দায়িত্বপ্রাপ্ত কর্মকর্তা দেখতে পারেন, প্রতিবার লগ হয়।</small></span></li>
          <li><span className="chip-ico"><Icon name="checkCircle" size={19} /></span><span><b>অনুমোদন ছাড়া প্রকাশ নয়</b><small>PR টিম লেখে, MP অনুমোদন দিলে তবেই সাইটে যায়।</small></span></li>
        </ul>
        <p className="auth-foot">Octagram Limited · জনপ্রতিনিধি</p>
      </aside>
      <main className="auth-form">
        <div className="auth-card">
          <p className="kick">জনপ্রতিনিধি · অ্যাডমিন</p>
          <h1>{title}</h1>
          {sub && <p className="lead">{sub}</p>}
          <div className="panel">{children}</div>
        </div>
      </main>
    </div>
  );
}

function EnrollStep({ mfaToken, onDone }: { mfaToken: string; onDone: (code: string) => Promise<void> }) {
  const [info, setInfo] = useState<{ secret: string; otpauthUri: string; recoveryCodes: string[] } | null>(null);
  const [qr, setQr] = useState(''); const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let live = true;
    api('POST', '/auth/mfa/enroll/totp', { mfaToken }, { auth: 'none' }).then(async (r) => { if (!live) return; setInfo(r); setQr(await QRCode.toDataURL(r.otpauthUri, { margin: 1, width: 180 })); }).catch((e) => setErr(e.message));
    return () => { live = false; };
  }, [mfaToken]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { setErr('৬ অক্ষরের কোডটি লিখুন'); return; }
    if (!saved) { setErr('রিকভারি কোডগুলো সংরক্ষণ করেছেন, এটি টিক দিন'); return; }
    setBusy(true); setErr('');
    try { await onDone(code); } catch (x) { setErr(x instanceof ApiFail ? x.message : 'কিছু ভুল হয়েছে'); } finally { setBusy(false); }
  };
  if (!info) return <p role="status">{err || 'প্রস্তুত হচ্ছে…'}</p>;
  return (
    <form className="form" onSubmit={submit} noValidate>
      <p style={{ margin: 0 }}><b>২-ধাপ যাচাই চালু করুন।</b> Google Authenticator, Microsoft Authenticator বা অন্য কোনো authenticator অ্যাপে এই QR স্ক্যান করুন।</p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {qr && <img src={qr} alt="২-ধাপ যাচাইয়ের QR কোড" width={180} height={180} />}
        <div><p className="hint" style={{ margin: 0 }}>স্ক্যান না হলে এই কী নিজে লিখুন:</p><code style={{ wordBreak: 'break-all', fontSize: 15 }}>{info.secret}</code></div>
      </div>
      <div className="note"><b>রিকভারি কোড (একবারই দেখানো হয়)।</b> ফোন হারালে এগুলো দিয়ে ঢুকতে পারবেন। প্রতিটি একবার কাজ করে।
        <div style={{ columns: 2, marginTop: 8, fontFamily: 'monospace' }}>{info.recoveryCodes.map((c) => <div key={c}>{c}</div>)}</div></div>
      <label className="check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /><span>কোডগুলো নিরাপদ জায়গায় সংরক্ষণ করেছি</span></label>
      <Field label="অ্যাপে দেখানো ৬ অক্ষরের কোড" required error={err}>{(p) => <input {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />}</Field>
      <button className="btn btn-p" disabled={busy}>চালু করে ঢুকুন</button>
    </form>
  );
}

export default function Login() {
  const { startLogin, completeLogin } = useSession();
  const nav = useNavigate();
  const [step, setStep] = useState<LoginStep>({ kind: 'password' });
  const [identifier, setIdentifier] = useState(''); const [password, setPassword] = useState('');
  const [code, setCode] = useState(''); const [recovery, setRecovery] = useState(false);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const finish = async (mfaToken: string, input: { code?: string; recoveryCode?: string }) => { await completeLogin(mfaToken, input); nav('/switch', { replace: true }); };
  const fail = (x: unknown) => setErr(x instanceof ApiFail ? x.message : 'কিছু ভুল হয়েছে');

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    const p = loginSchema.safeParse({ identifier, password });
    if (!p.success) { setErr('মোবাইল নম্বর (বা ইমেইল) আর পাসওয়ার্ড দিন'); return; }
    setBusy(true);
    try { const s = await startLogin(identifier, password); if (s.kind === 'done') { nav('/switch', { replace: true }); return; } setStep(s); } catch (x) { fail(x); } finally { setBusy(false); }
  };
  const submitCode = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (step.kind !== 'code') return;
    const v = code.trim();
    if (recovery ? v.length < 8 : !/^\d{6}$/.test(v)) { setErr(recovery ? 'রিকভারি কোডটি পুরো লিখুন' : '৬ অক্ষরের কোডটি লিখুন'); return; }
    setBusy(true);
    try { await finish(step.mfaToken, recovery ? { recoveryCode: v } : { code: v }); } catch (x) { fail(x); } finally { setBusy(false); }
  };

  if (step.kind === 'enroll') return <Frame title="২-ধাপ যাচাই" sub="নিরাপত্তার জন্য প্রতিটি অ্যাডমিন অ্যাকাউন্টে এটি বাধ্যতামূলক।"><EnrollStep mfaToken={step.mfaToken} onDone={(c) => finish(step.mfaToken, { code: c })} /></Frame>;
  if (step.kind === 'code') return (
    <Frame title="যাচাই কোড দিন" sub={recovery ? 'রিকভারি কোড দিন। এটি একবারই কাজ করবে।' : 'আপনার authenticator অ্যাপের ৬ অক্ষরের কোড দিন।'}>
      <form className="form" onSubmit={submitCode} noValidate>
        <Field label={recovery ? 'রিকভারি কোড' : 'কোড'} required error={err}>{(p) => <input {...p} autoFocus inputMode={recovery ? 'text' : 'numeric'} autoComplete="one-time-code" maxLength={recovery ? 40 : 6} value={code} onChange={(e) => setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, ''))} />}</Field>
        <button className="btn btn-p" disabled={busy}>যাচাই করুন</button>
        <button type="button" className="link" onClick={() => { setRecovery(!recovery); setCode(''); setErr(''); }}>{recovery ? 'অ্যাপের কোড দিয়ে ঢুকি' : 'ফোন নেই? রিকভারি কোড ব্যবহার করুন'}</button>
      </form>
    </Frame>
  );
  return (
    <Frame title="লগইন" sub="MP অফিসের কর্মী ও প্ল্যাটফর্ম টিমের জন্য।">
      <form className="form" onSubmit={submitPassword} noValidate>
        <Field label="মোবাইল নম্বর বা ইমেইল" required>{(p) => <input {...p} autoFocus autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />}</Field>
        <Field label="পাসওয়ার্ড" required error={err}>{(p) => <input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <button className="btn btn-p" disabled={busy}>এগিয়ে যান</button>
      </form>
    </Frame>
  );
}

/** Invitation link: choose a password, then the normal 2FA enrolment. */
export function AcceptInvite() {
  const { token = '' } = useParams();
  const { completeLogin } = useSession();
  const nav = useNavigate();
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    const v = passwordSchema.safeParse(pw);
    if (!v.success) { setErr(v.error.issues[0]?.message ?? 'পাসওয়ার্ড সঠিক নয়'); return; }
    if (pw !== pw2) { setErr('দুটি পাসওয়ার্ড মিলছে না'); return; }
    setBusy(true);
    try { const r = await api<{ mfaToken: string }>('POST', `/auth/invites/${encodeURIComponent(token)}/accept`, { password: pw }, { auth: 'none' }); setMfaToken(r.mfaToken); }
    catch (x) { setErr(x instanceof ApiFail ? x.message : 'কিছু ভুল হয়েছে'); } finally { setBusy(false); }
  };
  if (mfaToken) return <Frame title="২-ধাপ যাচাই" sub="পাসওয়ার্ড সেট হয়েছে। এবার দ্বিতীয় ধাপ চালু করুন।"><EnrollStep mfaToken={mfaToken} onDone={async (c) => { await completeLogin(mfaToken, { code: c }); nav('/switch', { replace: true }); }} /></Frame>;
  return (
    <Frame title="অ্যাকাউন্ট চালু করুন" sub="আমন্ত্রণ পেয়েছেন। একটি শক্ত পাসওয়ার্ড দিন (কমপক্ষে ১০ অক্ষর, অক্ষর ও সংখ্যা মিলিয়ে)।">
      <form className="form" onSubmit={submit} noValidate>
        <Field label="নতুন পাসওয়ার্ড" required>{(p) => <input {...p} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
        <Field label="আবার লিখুন" required error={err}>{(p) => <input {...p} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}</Field>
        <button className="btn btn-p" disabled={busy}>এগিয়ে যান</button>
      </form>
    </Frame>
  );
}
