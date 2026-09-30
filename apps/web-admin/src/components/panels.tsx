import { useEffect, type ElementType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Skeleton } from './primitives';
import { Sparkline, type ChartTone } from './charts';
import { formatBn, toBn } from '../format';

/* Surfaces: Card/Panel, SectionHeader, StatCard, FormSection, SaveBar. */

/* ---------- Card / Panel ---------- */
export type CardProps = {
  title?: ReactNode; sub?: ReactNode; icon?: IconName; actions?: ReactNode; footer?: ReactNode;
  pad?: 'sm' | 'md' | 'lg' | 'none'; flat?: boolean; as?: ElementType; className?: string; id?: string; level?: 2 | 3; children?: ReactNode;
};
/** White surface with an optional header (icon chip + title + subtitle + actions) and footer.
    `pad="none"` is for full-bleed content such as tables and lists (rows then carry their own padding). */
export function Card({ title, sub, icon, actions, footer, pad = 'md', flat, as: As = 'section', className, id, level = 2, children }: CardProps) {
  const H = `h${level}` as ElementType;
  return (
    <As id={id} className={`card${pad === 'none' ? ' pad-0' : pad === 'sm' ? ' pad-sm' : pad === 'lg' ? ' pad-lg' : ''}${flat ? ' flat' : ''}${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <header className={`card-h${pad === 'none' ? ' pad' : ''}`}>
          <div className="card-t">
            {icon && <span className="chip-ico"><Icon name={icon} size={18} /></span>}
            <div><H className="h2">{title}</H>{sub && <p className="card-sub">{sub}</p>}</div>
          </div>
          {actions && <div className="card-a">{actions}</div>}
        </header>
      )}
      {children}
      {footer && <footer className={`card-f${pad === 'none' ? ' pad' : ''}`}>{footer}</footer>}
    </As>
  );
}
export const Panel = Card;

/* ---------- SectionHeader (a heading inside a page, above a group of cards) ---------- */
export function SectionHeader({ title, sub, icon, actions, level = 2, link }: { title: string; sub?: ReactNode; icon?: IconName; actions?: ReactNode; level?: 2 | 3; link?: { to: string; label: string } }) {
  const H = `h${level}` as ElementType;
  return (
    <div className="sec-h">
      <div className="sec-h-t">{icon && <span className="chip-ico sm"><Icon name={icon} size={16} /></span>}<div><H className="h2">{title}</H>{sub && <p>{sub}</p>}</div></div>
      {(actions || link) && <div className="acts">{actions}{link && <Link className="sec-link" to={link.to}>{link.label}<Icon name="arrowRight" size={15} /></Link>}</div>}
    </div>
  );
}

/* ---------- StatCard (KPI) ---------- */
export type StatTone = 'brass' | 'blue' | 'green' | 'amber' | 'red' | 'ink';
export type StatDelta = { value: number; /** appended to the number, e.g. '%' or 'টি' */ suffix?: string; label?: string; /** which direction is good (default 'up'); 'none' = neutral colour */ good?: 'up' | 'down' | 'none' };
const SPARK_TONE: Record<StatTone, ChartTone> = { brass: 'brass', blue: 'blue', green: 'green', amber: 'amber', red: 'red', ink: 'brass' };
export type StatCardProps = {
  label: string; value: number | string | null | undefined; unit?: string; icon?: IconName; tone?: StatTone; delta?: StatDelta; hint?: ReactNode; spark?: number[]; sparkLabel?: string;
  /** makes the whole card a link */ to?: string; /** dark variant for the hero KPI */ dark?: boolean; loading?: boolean; format?: (n: number) => string;
};
/** KPI card: icon chip, big number (Bangla digits, lakh/crore grouping), label, delta, hint and an optional sparkline.
    Keeps the `.kpi` class so e2e and older pages can count cards. `value` null/undefined shows an em dash. */
export function StatCard({ label, value, unit, icon, tone = 'brass', delta, hint, spark, sparkLabel, to, dark, loading, format = formatBn }: StatCardProps) {
  const Root: ElementType = to ? Link : 'div';
  const shown = value == null ? '—' : typeof value === 'number' ? format(value) : value;
  const good = delta ? (delta.good ?? 'up') : 'up';
  const dir = delta ? (delta.value > 0 ? 'up' : delta.value < 0 ? 'down' : 'flat') : 'flat';
  const dtone = !delta || dir === 'flat' || good === 'none' ? 'flat' : dir === good ? 'good' : 'bad';
  return (
    <Root className={`kpi stat tone-${tone}${dark ? ' dark' : ''}${to ? ' is-link' : ''}`} {...(to ? { to } : {})}>
      <div className="stat-top">
        {icon && <span className="chip-ico"><Icon name={icon} size={20} /></span>}
        <span className="stat-label">{label}</span>
        {to && <Icon name="arrowUpRight" size={16} className="stat-go" />}
      </div>
      {loading ? <Skeleton w={96} h={38} r={10} /> : <div className="stat-val">{shown}{value != null && unit && <small className="stat-unit">{unit}</small>}</div>}
      <div className="stat-foot">
        {delta && <span className={`delta ${dtone}`}><Icon name={dir === 'down' ? 'trendDown' : 'trendUp'} size={14} />{dir === 'up' ? '+' : dir === 'down' ? '−' : ''}{toBn(Math.abs(delta.value))}{delta.suffix ?? ''}{delta.label && <em>{delta.label}</em>}</span>}
        {hint && <span className="stat-hint">{hint}</span>}
      </div>
      {spark && spark.length > 1 && <div className="stat-spark"><Sparkline data={spark} tone={SPARK_TONE[tone]} label={sparkLabel} height={44} /></div>}
    </Root>
  );
}

/* ---------- FormSection (card with a title + description for long forms) ---------- */
/** `layout="split"` puts the title/description in a left column on wide screens (Stripe-style settings pages). */
export function FormSection({ title, description, icon, actions, layout = 'stack', id, children }: { title: string; description?: ReactNode; icon?: IconName; actions?: ReactNode; layout?: 'stack' | 'split'; id?: string; children: ReactNode }) {
  return (
    <section className={`card fsec ${layout}`} id={id}>
      <header className="fsec-h">
        <div className="fsec-t">{icon && <span className="chip-ico"><Icon name={icon} size={18} /></span>}<div><h2 className="h2">{title}</h2>{description && <p>{description}</p>}</div></div>
        {actions && <div className="card-a">{actions}</div>}
      </header>
      <div className="fsec-b form">{children}</div>
    </section>
  );
}

/* ---------- SaveBar (sticky bottom action bar for long forms) ---------- */
/** Put it at the end of a page/form. Shows "unsaved changes" while `dirty`; the save button is disabled when there is nothing
    to save. Use with `useUnsavedGuard(dirty)` to warn before closing the tab. `form` links the save button to a <form id>. */
export function SaveBar({ dirty, busy, onSave, onDiscard, saveLabel = 'সংরক্ষণ করুন', discardLabel = 'পরিবর্তন বাতিল', status, extra, form, saveIcon = 'save' }: {
  dirty: boolean; busy?: boolean; onSave?: () => void; onDiscard?: () => void; saveLabel?: string; discardLabel?: string; status?: ReactNode; extra?: ReactNode; form?: string; saveIcon?: IconName;
}) {
  return (
    <div className={`savebar${dirty ? ' dirty' : ''}`} role="region" aria-label="সংরক্ষণ">
      <span className="savebar-s" role="status" aria-live="polite">
        {status ?? (dirty ? <><i className="dotp" />অসংরক্ষিত পরিবর্তন আছে</> : <><Icon name="checkCircle" size={16} />সব পরিবর্তন সংরক্ষিত</>)}
      </span>
      <span className="savebar-a">
        {extra}
        {onDiscard && <button type="button" className="btn btn-g" disabled={!dirty || busy} onClick={onDiscard}>{discardLabel}</button>}
        <button type={form ? 'submit' : 'button'} form={form} className={`btn btn-b${busy ? ' is-busy' : ''}`} disabled={!dirty || busy} onClick={form ? undefined : onSave}><Icon name={saveIcon} />{saveLabel}</button>
      </span>
    </div>
  );
}

/** Warn before the tab is closed or reloaded while a form has unsaved edits. */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
}
