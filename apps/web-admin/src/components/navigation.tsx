import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { toBn } from '../format';

/* Interaction components: Tabs, DropdownMenu, Drawer, Stepper, Timeline. All keyboard accessible. */

/* ---------- Tabs (WAI-ARIA tabs pattern: arrow keys move + activate, Home/End jump) ---------- */
export type TabItem<T extends string = string> = { key: T; label: string; icon?: IconName; badge?: number; disabled?: boolean };
export const tabId = (base: string, key: string) => `${base}-tab-${key}`;
export const panelId = (base: string, key: string) => `${base}-panel-${key}`;

/** Controlled tabs. Render the content with <TabPanel base="x" value={v} tab="key">. `base` must be the same string in both. */
export function Tabs<T extends string>({ tabs, value, onChange, label, base, variant = 'underline' }: { tabs: Array<TabItem<T>>; value: T; onChange: (k: T) => void; label: string; base: string; variant?: 'underline' | 'pill' }) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = tabs.filter((t) => !t.disabled);
  const go = (k: T) => { onChange(k); requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-key="${k}"]`)?.focus()); };
  const onKey = (e: KeyboardEvent) => {
    const i = enabled.findIndex((t) => t.key === value);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = enabled.length - 1;
    if (n >= 0) { e.preventDefault(); go(enabled[n]!.key); }
  };
  return (
    <div className={`tabs ${variant}`} role="tablist" aria-label={label} ref={ref} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" id={tabId(base, t.key)} data-key={t.key} aria-selected={value === t.key} aria-controls={panelId(base, t.key)} tabIndex={value === t.key ? 0 : -1} disabled={t.disabled} onClick={() => onChange(t.key)}>
          {t.icon && <Icon name={t.icon} size={16} />}{t.label}{t.badge != null && t.badge > 0 && <span className="tab-n">{toBn(t.badge)}</span>}
        </button>
      ))}
    </div>
  );
}
export function TabPanel({ base, tab, value, children }: { base: string; tab: string; value: string; children: ReactNode }) {
  if (tab !== value) return null;
  return <div role="tabpanel" id={panelId(base, tab)} aria-labelledby={tabId(base, tab)} tabIndex={0} className="tabpanel">{children}</div>;
}

/* ---------- DropdownMenu (WAI-ARIA menu button) ---------- */
export type MenuItem =
  | { label: string; icon?: IconName; onSelect?: () => void; to?: string; href?: string; danger?: boolean; disabled?: boolean; hint?: ReactNode; badge?: number }
  | { separator: true }
  | { heading: ReactNode };

export function DropdownMenu({ trigger, label, items, align = 'end', triggerClassName = 'btn btn-g', chevron = true, onOpenChange }: {
  /** content of the trigger button */ trigger: ReactNode; /** accessible name of the trigger button */ label: string; items: MenuItem[]; align?: 'start' | 'end'; triggerClassName?: string; chevron?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const setOpen = useCallback((v: boolean) => { setOpenState(v); onOpenChange?.(v); }, [onOpenChange]);
  const enabled = () => Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
  const focusAt = (i: number) => { const l = enabled(); l[(i + l.length) % l.length]?.focus(); };
  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open, setOpen]);

  const openAndFocus = (last = false) => { setOpen(true); requestAnimationFrame(() => focusAt(last ? -1 : 0)); };
  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAndFocus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); openAndFocus(true); }
  };
  const onMenuKey = (e: KeyboardEvent) => {
    const l = enabled(), i = l.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusAt(0); }
    else if (e.key === 'End') { e.preventDefault(); focusAt(-1); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className="dd" ref={wrap}>
      <button ref={btn} type="button" className={triggerClassName} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={label}
        onClick={() => (open ? close(false) : setOpen(true))} onKeyDown={onTriggerKey}>
        {trigger}{chevron && <Icon name="chevronDown" size={15} className="dd-chev" />}
      </button>
      {open && (
        <div className={`dd-menu ${align}`} role="menu" id={id} aria-label={label} onKeyDown={onMenuKey}>
          {items.map((it, i) => {
            if ('separator' in it) return <div key={i} className="dd-sep" role="separator" />;
            if ('heading' in it) return <div key={i} className="dd-head">{it.heading}</div>;
            const inner = <>{it.icon && <Icon name={it.icon} size={17} />}<span className="dd-l">{it.label}{it.hint && <small>{it.hint}</small>}</span>{it.badge != null && it.badge > 0 && <b className="dd-n">{toBn(it.badge)}</b>}</>;
            const cls = `dd-item${it.danger ? ' danger' : ''}`;
            const common = { role: 'menuitem', tabIndex: -1, 'aria-disabled': it.disabled || undefined } as const;
            if (it.to && !it.disabled) return <Link key={i} className={cls} to={it.to} {...common} onClick={() => close(false)}>{inner}</Link>;
            if (it.href && !it.disabled) return <a key={i} className={cls} href={it.href} target="_blank" rel="noopener noreferrer" {...common} onClick={() => close(false)}>{inner}</a>;
            return <button key={i} type="button" className={cls} {...common} onClick={() => { if (it.disabled) return; close(); it.onSelect?.(); }}>{inner}</button>;
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Drawer (side sheet on native <dialog>: focus trap, Esc, backdrop click) ---------- */
export function Drawer({ open, onClose, title, children, footer, side = 'right', width = 480 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; side?: 'left' | 'right'; width?: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} className={`drawer ${side}`} style={{ width: `min(${width}px, 100vw)` }} aria-label={title} onClose={onClose} onCancel={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }} open={typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal ? true : undefined}>
      <div className="dlg-h"><h2>{title}</h2><button type="button" className="x" aria-label="বন্ধ করুন" onClick={onClose}><Icon name="close" size={16} /></button></div>
      <div className="dlg-b drawer-b">{children}</div>
      {footer && <div className="dlg-f">{footer}</div>}
    </dialog>
  );
}

/* ---------- Stepper (a linear flow: draft -> review -> published) ---------- */
export function Stepper({ steps, current, label = 'ধাপ', vertical }: { steps: Array<{ key: string; label: string; sub?: string }>; current: string; label?: string; vertical?: boolean }) {
  const ci = Math.max(0, steps.findIndex((s) => s.key === current));
  return (
    <ol className={`stepper${vertical ? ' v' : ''}`} aria-label={label}>
      {steps.map((s, i) => {
        const st = i < ci ? 'done' : i === ci ? 'current' : 'todo';
        return (
          <li key={s.key} data-state={st} aria-current={st === 'current' ? 'step' : undefined}>
            <span className="st-dot">{st === 'done' ? <Icon name="check" size={14} strokeWidth={3} /> : toBn(i + 1)}</span>
            <span className="st-t">{s.label}{s.sub && <small>{s.sub}</small>}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Timeline (activity feed) ---------- */
export type TimelineItem = { id?: string; title: ReactNode; meta?: ReactNode; icon?: IconName; tone?: 'ok' | 'warn' | 'bad' | 'info' | 'brass' | 'plain' };
export function Timeline({ items, label = 'কার্যক্রমের তালিকা' }: { items: TimelineItem[]; label?: string }) {
  return (
    <ol className="tl" aria-label={label}>
      {items.map((it, i) => (
        <li key={it.id ?? i} className={it.tone ?? 'plain'}>
          <span className="tl-dot"><Icon name={it.icon ?? 'circle'} size={14} /></span>
          <div className="tl-b"><div className="tl-t">{it.title}</div>{it.meta && <div className="tl-m">{it.meta}</div>}</div>
        </li>
      ))}
    </ol>
  );
}
