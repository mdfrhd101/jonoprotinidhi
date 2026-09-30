'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { NAV, activeNav } from '@/lib/nav';
import { IconMenu, IconX } from './icons';

type Props = { name: string; title: string; notice: { text: string; href: string } | null; complaintOn: boolean };

export default function Header({ name, title, notice, complaintOn }: Props) {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const cur = activeNav(pathname);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const aria = (href: string) => (cur === href ? { 'aria-current': 'page' as const } : {});
  const complaintCur = pathname.startsWith('/complaint') ? { 'aria-current': 'page' as const } : {};

  return (
    <header className={`site-head${solid || open ? ' solid' : ''}`} id="head">
      {notice && (
        <div className="noticebar" role="region" aria-label="ঘোষণা">
          <div className="in">
            <b>ঘোষণা</b>
            <span>{notice.text}</span>
            {notice.href && (notice.href.startsWith('/')
              ? <Link href={notice.href}>বিস্তারিত →</Link>
              : <a href={notice.href} rel="noopener noreferrer" target={/^https?:/.test(notice.href) ? '_blank' : undefined}>বিস্তারিত →</a>)}
          </div>
        </div>
      )}
      <div className="head-row">
        <Link className="logo" href="/">
          <span>{name && <b>{name}</b>}{title && <small>{title}</small>}</span>
        </Link>
        <nav id="nav" className={open ? 'open' : undefined} aria-label="প্রধান মেনু">
          {NAV.map(([href, label]) => <Link key={href} href={href} {...aria(href)}>{label}</Link>)}
          {complaintOn && <Link className="m-only" href="/complaint" {...complaintCur}>অভিযোগ বক্স</Link>}
        </nav>
        {complaintOn && <Link className="btn btn-brass head-cta" href="/complaint" {...complaintCur} style={{ padding: '11px 20px', fontSize: 15 }}>অভিযোগ বক্স</Link>}
        <button ref={btn} id="menuBtn" type="button" aria-label={open ? 'মেনু বন্ধ করুন' : 'মেনু'} aria-expanded={open} aria-controls="nav" onClick={() => setOpen((o) => !o)}>
          {open ? <IconX className="icon" /> : <IconMenu />}
        </button>
      </div>
    </header>
  );
}
