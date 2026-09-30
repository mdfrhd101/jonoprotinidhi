'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import SafeImg from './SafeImg';
import { IconLeft, IconRight } from './icons';
import { counterLabel, stepIndex, swipeDirection, wrapIndex } from '@/lib/slider';
import { safeHref } from '@/lib/links';
import { toBn } from '@/lib/format';
import type { Banner } from '@/lib/types';

type Props = {
  banners: Banner[]; kicker: string; name: string; slogan: string; note: string;
  next: { title: string; when: string; place: string } | null; complaintOn: boolean;
};

/** Owner's choice: each banner stays about 3 seconds, the slideshow always runs (no pause button). */
const DELAY = 3000;

function Cta({ href, label, cls }: { href: string; label: string; cls: string }) {
  const h = safeHref(href);
  if (!h || !label) return null;
  return h.startsWith('/') ? <Link className={cls} href={h}>{label}</Link> : <a className={cls} href={h} target={/^https?:/.test(h) ? '_blank' : undefined} rel="noopener noreferrer">{label}</a>;
}

/** Home hero: full-bleed banner slideshow. Each banner carries its own title/subtitle/button (all from the CMS). */
export default function HeroSlider({ banners, kicker, name, slogan, note, next, complaintOn }: Props) {
  const list = banners.filter((b) => b.url);
  const n = list.length;
  const [cur, setCur] = useState(0);
  // keyboard focus inside the hero holds the current slide (so a keyboard user can read it); mouse hover does not,
  // because the hero fills the screen and would otherwise never move
  const [hold, setHold] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const x0 = useRef<{ x: number; y: number } | null>(null);
  const sec = useRef<HTMLElement>(null);

  const [seen, setSeen] = useState<Set<number>>(() => new Set([0, 1]));
  useEffect(() => { setReduce(window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, []);
  // keep every photo that was shown (the outgoing slide cross-fades) and preload the next one
  useEffect(() => { setSeen((s) => (s.has(cur) && s.has(wrapIndex(cur + 1, n)) ? s : new Set([...s, cur, wrapIndex(cur + 1, n)]))); }, [cur, n]);
  const go = useCallback((i: number, user = true) => { setCur(wrapIndex(i, n)); if (user) setAnnounce(true); }, [n]);

  useEffect(() => {
    if (n < 2 || hold || reduce) return;
    const t = window.setTimeout(() => { if (!document.hidden) setCur((c) => stepIndex(c, 1, n)); }, DELAY);
    return () => window.clearTimeout(t);
  }, [cur, n, hold, reduce]);

  const b = list[cur];
  const title = b?.title || name;
  const sub = b?.subtitle || note;
  const tag = slogan && slogan !== sub ? slogan : '';
  const primary = b?.ctaLabel && b?.ctaHref ? { href: b.ctaHref, label: b.ctaLabel } : null;
  const secondary = complaintOn && primary?.href !== '/complaint' ? { href: '/complaint', label: 'অভিযোগ জানান' } : { href: '/promises', label: 'প্রতিশ্রুতির হিসাব দেখুন' };

  return (
    <section ref={sec} className="hero" aria-roledescription="carousel" aria-label="প্রধান ব্যানার"
      onFocus={(e) => { if (e.target instanceof HTMLElement && e.target.matches(':focus-visible')) setHold(true); }} onBlur={(e) => { if (!sec.current?.contains(e.relatedTarget as Node)) setHold(false); }}
      onPointerDown={(e) => { if (e.pointerType !== 'mouse') x0.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        if (!x0.current || n < 2) return;
        const d = swipeDirection(e.clientX - x0.current.x, e.clientY - x0.current.y, sec.current?.clientWidth ?? 400);
        x0.current = null;
        if (d) go(cur + d);
      }}>
      <div className="hero-bg" data-px=".3">
        {n ? list.map((s, i) => (
          <div key={i} className={`hs hs-framed${i === cur ? ' on' : ''}`} aria-hidden={i !== cur}>
            {seen.has(i) && <>
              <div className="hs-blur"><SafeImg src={s.url} alt="" eager={i === 0} /></div>
              <figure className="hs-frame"><SafeImg src={s.url} alt={s.caption || ''} eager={i === 0} /></figure>
            </>}
          </div>
        )) : <div className="hs on"><span className="noimg" /></div>}
      </div>
      <div className="hero-shade" />
      <div className="hero-content">
        <div className="hero-text" key={cur} aria-live={announce ? 'polite' : 'off'}>
          {kicker && <p className="kicker">{kicker}</p>}
          <h1 className={title.length > 22 ? 'long' : undefined}>{title}</h1>
          <div className="rule" />
          {sub && <p className="roles">{sub}</p>}
          {tag && <p className="tag">{tag}</p>}
          <div className="acts">
            {primary && <Cta href={primary.href} label={primary.label} cls="btn btn-brass" />}
            <Cta href={secondary.href} label={secondary.label} cls={primary ? 'btn btn-line' : 'btn btn-brass'} />
          </div>
        </div>
        {next && (
          <p className="notice"><b>পরবর্তী কর্মসূচি: {next.title}</b><span>{[next.when, next.place].filter(Boolean).join(' · ')}</span></p>
        )}
      </div>
      {n > 0 && (
        <div className="hero-cap">
          <p>{b?.caption}</p>
          {n > 1 && (
            <div className="hero-ctl">
              <button type="button" className="hbtn" aria-label="আগের ব্যানার" onClick={() => go(cur - 1)}><IconLeft /></button>
              <span className="hcount" aria-hidden="true">{counterLabel(cur, n)}</span>
              <button type="button" className="hbtn" aria-label="পরের ব্যানার" onClick={() => go(cur + 1)}><IconRight /></button>
            </div>
          )}
          {n > 1 && (
            <div className="hdots">
              {list.map((_, i) => <button key={i} type="button" className={`hdot${i === cur ? ' on' : ''}`} aria-label={`ব্যানার ${toBn(i + 1)}`} aria-current={i === cur ? 'true' : undefined} onClick={() => go(i)} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
