import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../session';
import { toBn } from '../format';
import { Icon, type IconName } from './Icon';
import { Avatar, BrandMark } from './primitives';
import { DropdownMenu, type MenuItem } from './navigation';

/* Sidebar + top bar for the tenant and Super Admin layouts. Below 980px the sidebar is an off-canvas drawer; on desktop it can
   collapse to an icon rail (remembered per browser). The nav is a plain array (see tenant.tsx for the tenant one). */

export type NavItem =
  | { to: string; label: string; icon?: IconName; end?: boolean; badge?: number; /** page not built yet: shown greyed with "শীঘ্রই" */ soon?: boolean }
  | { group: string };
export type ShellNotification = { key: string; label: string; count: number; to: string; icon?: IconName; hint?: string };

const LS_KEY = 'jn.sidebar';
const readCollapsed = () => { try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; } };
const writeCollapsed = (v: boolean) => { try { localStorage.setItem(LS_KEY, v ? '1' : '0'); } catch { /* private mode */ } };

/** Which nav item (and group) the current path belongs to: the longest matching `to`. */
export function currentNav(nav: NavItem[], pathname: string): { group?: string; label?: string } {
  let group: string | undefined, best: { group?: string; label: string; len: number } | null = null;
  for (const n of nav) {
    if ('group' in n) { group = n.group; continue; }
    const hit = n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + '/');
    if (hit && (!best || n.to.length > best.len)) best = { group, label: n.label, len: n.to.length };
  }
  return best ? { group: best.group, label: best.label } : {};
}

export function Shell({ brand, nav, banner, roleLabel, children, siteUrl, notifications, cta }: {
  brand: { small: string; title: string; sub?: string; live?: boolean }; nav: NavItem[]; banner?: ReactNode; roleLabel: string; children: ReactNode;
  /** public site of this tenant (top bar shows "সাইট দেখুন") */ siteUrl?: string;
  /** things waiting for the user (bell menu + count) */ notifications?: ShellNotification[];
  /** prominent button at the top of the sidebar, e.g. "নতুন পোস্ট" */ cta?: { label: string; to: string; icon?: IconName };
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { me, logout } = useSession();
  const nav2 = useNavigate();
  const loc = useLocation();
  const cur = useMemo(() => currentNav(nav, loc.pathname), [nav, loc.pathname]);
  const name = me?.user.name ?? '';
  const total = (notifications ?? []).reduce((a, n) => a + n.count, 0);
  const staffOrMany = !!me?.user.platformRole || (me?.memberships.length ?? 0) > 1;

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    document.title = `${cur.label ? `${cur.label} · ` : ''}${brand.title} · জনপ্রতিনিধি`;
  }, [cur.label, brand.title]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);

  const toggleCollapsed = () => setCollapsed((c) => { writeCollapsed(!c); return !c; });
  const bell: MenuItem[] = total
    ? [{ heading: 'আপনার করণীয়' }, ...(notifications ?? []).filter((n) => n.count > 0).map((n) => ({ label: n.label, icon: n.icon ?? ('bell' as IconName), to: n.to, badge: n.count, hint: n.hint }))]
    : [{ heading: 'এখন কিছু বাকি নেই' }];
  const userMenu: MenuItem[] = [
    { heading: <span className="um-head"><b>{name}</b><small>{roleLabel}</small></span> },
    ...(staffOrMany ? [{ label: 'প্যানেল বদলান', icon: 'layers' as IconName, to: '/switch' }] : []),
    ...(siteUrl ? [{ label: 'সাইট দেখুন', icon: 'external' as IconName, href: siteUrl }] : []),
    { separator: true as const },
    { label: 'লগআউট', icon: 'logout' as IconName, onSelect: async () => { await logout(); nav2('/login'); } },
  ];

  return (
    <div className={`shell${collapsed ? ' collapsed' : ''}`}>
      <a className="skip" href="#view">মূল অংশে যান</a>
      <aside className={`side${open ? ' open' : ''}`} aria-label="মেনু">
        <div className="side-brand">
          <BrandMark />
          <div className="sb-t"><small>{brand.small}</small><b>{brand.title}</b>{brand.sub && <span className={brand.live ? 'live' : undefined}>{brand.live !== undefined && <i />}{brand.sub}</span>}</div>
          <button type="button" className="side-x" aria-label="মেনু বন্ধ করুন" onClick={() => setOpen(false)}><Icon name="close" size={20} /></button>
        </div>
        {cta && <Link className="side-cta" to={cta.to} title={cta.label}><Icon name={cta.icon ?? 'plus'} size={18} strokeWidth={2.4} /><span>{cta.label}</span></Link>}
        <nav aria-label="প্রধান মেনু">
          {nav.map((n, i) => {
            if ('group' in n) return <div className="grp" key={`g${i}`}>{n.group}</div>;
            const inner = <><Icon name={n.icon ?? 'circle'} size={20} /><span className="nl">{n.label}</span>{n.badge ? <span className="cnt">{toBn(n.badge)}</span> : null}{n.soon && <span className="soon">শীঘ্রই</span>}</>;
            if (n.soon) return <span key={n.to} className="navi disabled" aria-disabled="true" title={`${n.label} (শীঘ্রই আসছে)`}>{inner}</span>;
            return <NavLink key={n.to} to={n.to} end={n.end} className="navi" title={n.label} onClick={() => setOpen(false)}>{inner}</NavLink>;
          })}
        </nav>
        <div className="side-foot">
          <button type="button" className="side-collapse" aria-pressed={collapsed} aria-label={collapsed ? 'মেনু বড় করুন' : 'মেনু ছোট করুন'} onClick={toggleCollapsed}><Icon name={collapsed ? 'expand' : 'collapse'} size={19} /><span>মেনু ছোট করুন</span></button>
          <div className="side-by">জনপ্রতিনিধি · Octagram Limited</div>
        </div>
      </aside>
      <div className={`scrim${open ? ' open' : ''}`} onClick={() => setOpen(false)} aria-hidden />
      <div className="main">
        {banner}
        <header className="top">
          <button id="menuBtn" type="button" className="icon-btn" aria-label="মেনু" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Icon name="menu" size={22} /></button>
          <nav className="crumbs" aria-label="আপনি আছেন">
            <ol>
              <li className="c-brand">{brand.title}</li>
              {cur.group && cur.group !== brand.title && <li className="c-grp">{cur.group}</li>}
              <li aria-current="page">{cur.label ?? roleLabel}</li>
            </ol>
          </nav>
          <span className="sp" />
          {siteUrl && <a className="btn btn-g btn-s top-site" href={siteUrl} target="_blank" rel="noopener noreferrer" aria-label="সাইট দেখুন (নতুন ট্যাবে খুলবে)">সাইট দেখুন<Icon name="external" size={15} /></a>}
          {notifications && (
            <DropdownMenu label={total ? `নোটিফিকেশন: ${toBn(total)}টি করণীয়` : 'নোটিফিকেশন: কিছু বাকি নেই'} triggerClassName="icon-btn bell" chevron={false} items={bell}
              trigger={<><Icon name="bell" size={21} />{total > 0 && <span className="bell-n" aria-hidden>{toBn(total > 99 ? 99 : total)}</span>}</>} />
          )}
          <DropdownMenu label={`${name || 'ব্যবহারকারী'}, অ্যাকাউন্ট মেনু`} triggerClassName="who" items={userMenu}
            trigger={<><Avatar name={name || '?'} size={36} /><span className="who-t"><b>{name}</b><small>{roleLabel}</small></span></>} />
        </header>
        <main className="content" id="view" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}

