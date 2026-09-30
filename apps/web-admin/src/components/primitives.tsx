import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { toBn } from '../format';

/* Small primitives: Button, Badge, Avatar, Skeleton, EmptyState, Chips, SearchInput, Switch. */

/* ---------- Button ---------- */
export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'danger' | 'quiet';
const VARIANT: Record<ButtonVariant, string> = { primary: 'btn-p', accent: 'btn-b', ghost: 'btn-g', danger: 'btn-d', quiet: 'btn-q' };
export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; icon?: IconName; iconRight?: IconName; loading?: boolean; block?: boolean;
  /** internal route (renders a router Link) */ to?: string;
  /** external URL (opens in a new tab) */ href?: string;
  type?: 'button' | 'submit' | 'reset';
};

/** `<Button variant="accent" icon="plus" to="posts/new">নতুন পোস্ট</Button>`. Defaults to type="button" (never submits by accident).
    With `to`/`href` it renders a link that looks the same. A disabled link renders a non-interactive span. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'ghost', size = 'md', icon, iconRight, loading, block, to, href, className, children, disabled, type = 'button', onClick, ...rest }, ref) {
  const cls = `btn ${VARIANT[variant]}${size === 'sm' ? ' btn-s' : size === 'lg' ? ' btn-l' : ''}${loading ? ' is-busy' : ''}${block ? ' btn-block' : ''}${className ? ` ${className}` : ''}`;
  const inner = <>{icon && <Icon name={icon} />}{children}{iconRight && <Icon name={iconRight} />}</>;
  if ((to || href) && disabled) return <span className={cls} aria-disabled="true" role="link" title={rest.title}>{inner}</span>;
  if (to) return <Link className={cls} to={to} onClick={onClick as unknown as (e: MouseEvent<HTMLAnchorElement>) => void} title={rest.title} aria-label={rest['aria-label']}>{inner}</Link>;
  if (href) return <a className={cls} href={href} target="_blank" rel="noopener noreferrer" title={rest.title} aria-label={rest['aria-label']}>{inner}</a>;
  return <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} onClick={onClick} {...rest}>{inner}</button>;
});

/* ---------- Badge (small label / count; use Pill for statuses with a dot) ---------- */
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'brass' | 'ink' | 'plain';
export function Badge({ tone = 'plain', icon, dot, count, children }: { tone?: Tone; icon?: IconName; dot?: boolean; count?: number; children?: ReactNode }) {
  return <span className={`pill ${tone}${dot ? '' : ' plain'}`}>{icon && <Icon name={icon} size={13} />}{children}{count != null && <b className="badge-n">{toBn(count)}</b>}</span>;
}

/* ---------- Avatar ---------- */
const HONORIFIC = /^(ড\.|ডা\.|মো\.|মোঃ|মোহাম্মদ|অধ্যাপক|প্রফেসর|জনাব|বেগম|Dr\.?|Mr\.?|Mrs\.?|Ms\.?)$/i;
const graphemes = (s: string): string[] => (typeof Intl !== 'undefined' && 'Segmenter' in Intl ? Array.from(new Intl.Segmenter('bn', { granularity: 'grapheme' }).segment(s), (x) => x.segment) : Array.from(s));
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const real = words.filter((w) => !HONORIFIC.test(w));
  const use = (real.length ? real : words).slice(0, 2);
  return use.map((w) => graphemes(w)[0] ?? '').join('') || '?';
}
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
/** Round avatar: photo when `src` is given, otherwise the initials of the name on a stable tint. */
export function Avatar({ name, src, size = 36 }: { name: string; src?: string; size?: number }) {
  return (
    <span className={`avatar av-${hash(name) % 6}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} role="img" aria-label={name}>
      {src ? <img src={src} alt="" /> : <span aria-hidden>{initialsOf(name)}</span>}
    </span>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ w = '100%', h = 14, r = 8, className }: { w?: number | string; h?: number | string; r?: number | string; className?: string }) {
  return <span className={`skel${className ? ` ${className}` : ''}`} style={{ width: w, height: h, borderRadius: r }} aria-hidden />;
}
export function SkeletonText({ lines = 3, last = '60%' }: { lines?: number; last?: string }) {
  return <span className="skel-text" aria-hidden>{Array.from({ length: lines }, (_, i) => <Skeleton key={i} h={13} w={i === lines - 1 ? last : '100%'} />)}</span>;
}

/* ---------- EmptyState ---------- */
export function EmptyState({ icon = 'inbox', title, text, action, compact, tone }: { icon?: IconName; title: string; text?: ReactNode; action?: ReactNode; compact?: boolean; tone?: 'brass' | 'ok' | 'info' }) {
  return (
    <div className={`empty-state${compact ? ' compact' : ''}${tone ? ` ${tone}` : ''}`}>
      <span className="es-ico"><Icon name={icon} size={compact ? 20 : 26} /></span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action && <div className="es-act">{action}</div>}
    </div>
  );
}

/* ---------- Chips (single-select filter, aria-pressed buttons) ---------- */
export function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; count?: number }>; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}{o.count != null && <span className="c">{toBn(o.count)}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- SearchInput ---------- */
export function SearchInput({ value, onChange, label, placeholder, className = 'grow' }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; className?: string }) {
  return (
    <div className={`search ${className}`}>
      <Icon name="search" />
      <input type="search" aria-label={label} placeholder={placeholder ?? label} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ---------- Switch (checkbox styled as a toggle; role stays "checkbox" so label queries keep working) ---------- */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <label className="switch"><input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span /></label>;
}

/* ---------- BrandMark (the bridge logo) ---------- */
export function BrandMark({ className = 'logo' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden focusable="false">
      <rect width="32" height="32" rx="9" fill="#C7A35A" />
      <path d="M4.5 22h23M7.5 22c0-6 3.9-9.5 8.5-9.5s8.5 3.5 8.5 9.5M11.5 22c0-3.2 2-5.2 4.5-5.2s4.5 2 4.5 5.2M16 12.5V8" fill="none" stroke="#0C1117" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
