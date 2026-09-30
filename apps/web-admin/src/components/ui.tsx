import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiFail } from '../api';
import { toBn } from '../format';
import { Icon, type IconName } from './Icon';

/* Core building blocks on top of base.css / ds.css. Every export here predates the redesign and keeps its props
   (so existing pages and tests compile); new optional props only add. The rest of the kit lives in ./kit and is
   re-exported from ./index (import { StatCard, AreaChart, ... } from '../components'). */

export const Pill = ({ label, tone = 'plain' }: { label: string; tone?: string }) => <span className={`pill ${tone}`}>{label}</span>;
export const PillOf = ({ map, k }: { map: Record<string, [string, string]>; k: string }) => <Pill label={(map[k] ?? [k, 'plain'])[0]} tone={(map[k] ?? [k, 'plain'])[1]} />;

export function PageHead({ kicker, title, sub, actions, back, meta, icon }: { kicker?: string; title: string; sub?: ReactNode; actions?: ReactNode; /** small "back" link above the kicker */ back?: { to: string; label: string }; /** chips/pills row under the subtitle */ meta?: ReactNode; icon?: IconName }) {
  return (
    <div className="ph">
      <div>
        {back && <Link className="ph-back" to={back.to} relative="path"><Icon name="chevronLeft" size={16} />{back.label}</Link>}
        {kicker && <p className="kick">{icon && <Icon name={icon} size={15} />}{kicker}</p>}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
        {meta && <div className="ph-meta">{meta}</div>}
      </div>
      {actions && <div className="acts">{actions}</div>}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="card empty"><Icon name="inbox" size={26} className="empty-ico" /><p>{children}</p></div>;
export const Loading = () => <div className="card empty loading" role="status" aria-live="polite"><span className="spinner" aria-hidden />লোড হচ্ছে…</div>;

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof ApiFail ? error.message : 'কিছু ভুল হয়েছে';
  return (
    <div className="note bad" role="alert" style={{ margin: '0 0 16px' }}>
      <Icon name="alert" />
      <span>{msg} {retry && <button type="button" className="link" onClick={retry}>আবার চেষ্টা করুন</button>}</span>
    </div>
  );
}

/* ---------- toast ---------- */
export type ToastTone = 'ok' | 'bad' | 'info';
type ToastFn = (msg: string, tone?: ToastTone) => void;
const ToastCtx = createContext<ToastFn>(() => {});
/** `toast('সংরক্ষণ হয়েছে')`, `toast(err.message, 'bad')`. Tone only changes the icon colour. */
export const useToast = () => useContext(ToastCtx);
const TOAST_ICON: Record<ToastTone, IconName> = { ok: 'checkCircle', bad: 'alert', info: 'info' };
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Array<{ id: number; msg: string; tone: ToastTone }>>([]);
  const drop = useCallback((id: number) => setItems((x) => x.filter((i) => i.id !== id)), []);
  const push = useCallback<ToastFn>((msg, tone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { id, msg, tone }]);
    setTimeout(() => drop(id), tone === 'bad' ? 7000 : 4200);
  }, [drop]);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`toast ${i.tone}`}>
            <Icon name={TOAST_ICON[i.tone]} />
            <span className="tx">{i.msg}</span>
            <button type="button" className="tclose" aria-label="বার্তা বন্ধ করুন" onClick={() => drop(i.id)}><Icon name="close" size={16} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- form field with an error slot wired for screen readers ---------- */
export function Field({ label, error, hint, required, children }: { label: string; error?: string; hint?: string; required?: boolean; children: (p: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode }) {
  const id = useId();
  const eid = `${id}-e`, hid = `${id}-h`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <span className="req"> *</span>}</label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? eid : hint ? hid : undefined })}
      {hint && !error && <p className="hint" id={hid}>{hint}</p>}
      {error && <p className="err" id={eid} role="alert">{error}</p>}
    </div>
  );
}

/* ---------- modal dialog (native <dialog>: focus trap, Esc, backdrop) ---------- */
export function Dialog({ title, open, onClose, children, footer, wide, size }: { title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; /** 'sm' 440px, 'md' 580px (default), 'wide' 880px */ size?: 'sm' | 'md' | 'wide' }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  if (!open) return null;
  const cls = wide || size === 'wide' ? 'wide' : size === 'sm' ? 'sm' : undefined;
  return (
    <dialog ref={ref} className={cls} onClose={onClose} onCancel={onClose} aria-label={title} open={typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal ? true : undefined}>
      <div className="dlg-h"><h2>{title}</h2><button type="button" className="x" aria-label="বন্ধ করুন" onClick={onClose}><Icon name="close" size={16} /></button></div>
      <div className="dlg-b">{children}</div>
      {footer && <div className="dlg-f">{footer}</div>}
    </dialog>
  );
}

/** Confirmation dialog with an optional required reason (used for destructive/audited actions). */
export function ReasonDialog({ title, open, onClose, onConfirm, label = 'কারণ', min = 5, confirmLabel = 'নিশ্চিত করুন', danger, children }: { title: string; open: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<void> | void; label?: string; min?: number; confirmLabel?: string; danger?: boolean; children?: ReactNode }) {
  const [reason, setReason] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setReason(''); setErr(''); } }, [open]);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (reason.trim().length < min) { setErr(`কমপক্ষে ${toBn(min)} অক্ষরে লিখুন`); return; }
    setBusy(true);
    try { await onConfirm(reason.trim()); onClose(); } catch (x) { setErr(x instanceof ApiFail ? x.message : 'কিছু ভুল হয়েছে'); } finally { setBusy(false); }
  };
  return (
    <Dialog title={title} open={open} onClose={onClose} footer={<><button type="button" className="btn btn-g" onClick={onClose}>বাতিল</button><button type="submit" form="reason-form" className={`btn ${danger ? 'btn-d' : 'btn-p'}`} disabled={busy}>{confirmLabel}</button></>}>
      <form id="reason-form" className="form" onSubmit={submit} noValidate>
        {children}
        <Field label={label} required error={err}>{(p) => <textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} style={{ minHeight: 96 }} />}</Field>
      </form>
    </Dialog>
  );
}

export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="acts pager" aria-label="পাতা">
      <button type="button" className="btn btn-g btn-s" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon name="chevronLeft" size={16} />আগের</button>
      <span className="muted" aria-current="page">{toBn(page)} / {toBn(totalPages)}</span>
      <button type="button" className="btn btn-g btn-s" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>পরের<Icon name="chevronRight" size={16} /></button>
    </nav>
  );
}

/** Turn an API validation failure into per-field messages for a form. */
export function fieldMessages(e: unknown): Record<string, string> {
  if (!(e instanceof ApiFail)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(e.fieldErrors)) out[k] = v[0] ?? '';
  return out;
}

/** Simple horizontal bar list (single series, one hue; the title names the series so no legend is needed).
    For a richer list (tones, links, hints) use BarList. */
export function Bars({ rows, max }: { rows: Array<[string, number]>; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="hbars" role="list">
      {rows.map(([label, n]) => (
        <div className="hbar" role="listitem" key={label}>
          <span>{label}</span>
          <span className="t"><i style={{ width: `${(n / m) * 100}%` }} /></span>
          <span className="n">{toBn(n)}</span>
        </div>
      ))}
    </div>
  );
}
