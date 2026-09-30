/* Server-rendered building blocks shared by several pages (markup and classes follow the approved demo). */
import Link from 'next/link';
import SafeImg from './SafeImg';
import { POST_CATEGORY_LABEL, PROMISE_STATUS, bnDateSafe, clampPct, dateParts, joinParts, toBn } from '@/lib/format';
import type { Banner, ContactPage, EventItem, Hero, Post, PromiseItem, Site } from '@/lib/types';

export function More({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link className="more" href={href}>{children}</Link>;
}

/** Section heading from a CMS hero block (kicker/title/intro). Renders nothing when all are empty and no `right`. */
export function SecHead({ h, fallbackTitle, right, introInHead = false }: { h?: Partial<Hero>; fallbackTitle?: string; right?: React.ReactNode; introInHead?: boolean }) {
  const title = h?.title || fallbackTitle || '';
  if (!h?.kicker && !title && !right) return null;
  return (
    <div className="sec-head reveal">
      <div>
        {h?.kicker && <p className="kicker">{h.kicker}</p>}
        {title && <h2>{title}</h2>}
        {introInHead && h?.intro && <p className="lead">{h.intro}</p>}
      </div>
      {right}
    </div>
  );
}

/** Which banner photo to use behind an inner-page hero (the CMS heroes have no photo of their own yet). */
export function heroImage(site: Site | null, key: string): Banner | null {
  const b = (site?.banners ?? []).filter((x) => x.url);
  if (!b.length) return null;
  const order = ['about', 'activities', 'promises', 'area', 'gallery', 'videos', 'complaint', 'contact', 'biography'];
  const i = Math.max(0, order.indexOf(key));
  return b[(i + 1) % b.length] ?? null;
}

type Crumb = { label: string; href?: string };
export function PageHero({ hero, fallbackTitle, image, crumbs, long, meta, credit }: {
  hero?: Partial<Hero>; fallbackTitle: string; image?: string | null; crumbs: Crumb[]; long?: boolean; meta?: React.ReactNode; credit?: string;
}) {
  const trail: Crumb[] = [{ label: 'হোম', href: '/' }, ...crumbs];
  const title = hero?.title || fallbackTitle;
  return (
    <section className={`phero dark${long ? ' long' : ''}`}>
      <div className="phero-bg" data-px=".25"><SafeImg src={image} eager /></div>
      <div className="hero-shade" />
      <div className="phero-content">
        <nav aria-label="অবস্থান">
          <ol className="crumbs">
            {trail.map((c, i) => i < trail.length - 1
              ? <li key={i}><Link href={c.href ?? '/'}>{c.label}</Link></li>
              : <li key={i}><span aria-current="page">{c.label}</span></li>)}
          </ol>
        </nav>
        {hero?.kicker && <p className="kicker">{hero.kicker}</p>}
        {meta}
        <h1>{title}</h1>
        {hero?.intro && <p className="lead">{hero.intro}</p>}
      </div>
      {credit && <span className="credit">ছবি: {credit}</span>}
    </section>
  );
}

export function NewsCard({ p, feat, eager }: { p: Post; feat?: boolean; eager?: boolean }) {
  const img = p.media?.[0];
  const n = p.media?.length ?? 0;
  return (
    <Link className={`ncard${feat ? ' feat' : ''}`} href={`/activities/${encodeURIComponent(p.slug)}`}>
      <div className="ph"><SafeImg src={img?.url} alt={img?.caption || ''} eager={eager} /></div>
      <div className="body">
        <p className="meta">
          <span className="cat">{POST_CATEGORY_LABEL[p.category] ?? p.category}</span>
          {bnDateSafe(p.eventDate) && <span>{bnDateSafe(p.eventDate)}</span>}
          {(p.place || p.upazila) && <span>{p.place || p.upazila}</span>}
        </p>
        <h3>{p.title}</h3>
        {p.summary && <p className="txt">{p.summary}</p>}
        <p className="foot">বিস্তারিত পড়ুন{n > 0 ? ` · ${toBn(n)}টি ছবি` : ''}</p>
      </div>
    </Link>
  );
}

export function PromiseRow({ p, withUpd }: { p: PromiseItem; withUpd?: boolean }) {
  const s = PROMISE_STATUS[p.status] ?? PROMISE_STATUS.plan!;
  const pct = clampPct(p.pct);
  const style = { ['--c' as string]: s.c, ['--cs' as string]: s.s } as React.CSSProperties;
  return (
    <div className="p-row" style={style}>
      <div className="p-name"><b>{p.name}</b>{p.place && <span>{p.place}</span>}</div>
      <div className="p-money">{p.budget}{p.target && <small>{p.target}</small>}</div>
      <div className="prog">
        <div className="track" role="progressbar" aria-label={`অগ্রগতি: ${p.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <i style={{ width: `${pct}%`, background: s.bar }} />
        </div>
        <div className="pct"><span>অগ্রগতি</span><span>{toBn(pct)}%</span></div>
      </div>
      <span className="pill">{s.t}</span>
      {p.delayReason && <p className="p-note">{p.delayReason}</p>}
      {withUpd && p.updates?.length > 0 && (
        <ul className="p-upd">{p.updates.slice(0, 4).map((u, i) => <li key={i}><b>{bnDateSafe(u.date)}:</b> {u.text}</li>)}</ul>
      )}
    </div>
  );
}

export function PromiseSummary({ summary }: { summary: Record<string, number> }) {
  const n = summary.total ?? 0;
  if (!n) return null;
  const c = { done: summary.done ?? 0, ongoing: summary.ongoing ?? 0, late: summary.late ?? 0, plan: summary.plan ?? 0 };
  const w = (k: keyof typeof c) => `${((c[k] / n) * 100).toFixed(2)}%`;
  return (
    <div className="p-summary reveal">
      <div className="p-total"><b>{toBn(n)}</b><span>নির্বাচনী প্রতিশ্রুতি</span></div>
      <div>
        <div className="stack" role="img" aria-label={`${toBn(n)}টির মধ্যে ${toBn(c.done)}টি সম্পন্ন, ${toBn(c.ongoing)}টি চলমান, ${toBn(c.late)}টি বিলম্বিত, ${toBn(c.plan)}টি শুরু হয়নি`}>
          <i style={{ width: w('done'), ['--c' as string]: 'var(--ok-d)' } as React.CSSProperties} />
          <i style={{ width: w('ongoing'), ['--c' as string]: 'var(--brass)' } as React.CSSProperties} />
          <i style={{ width: w('late'), ['--c' as string]: 'var(--late-d)' } as React.CSSProperties} />
          <i style={{ width: w('plan'), ['--c' as string]: 'var(--plan-s)' } as React.CSSProperties} />
        </div>
        <div className="legend">
          <span style={{ ['--c' as string]: 'var(--ok-d)' } as React.CSSProperties}>সম্পন্ন {toBn(c.done)}</span>
          <span style={{ ['--c' as string]: 'var(--brass)' } as React.CSSProperties}>চলমান {toBn(c.ongoing)}</span>
          <span style={{ ['--c' as string]: 'var(--late-d)' } as React.CSSProperties}>বিলম্বিত {toBn(c.late)}</span>
          <span style={{ ['--c' as string]: '#CFC6B5' } as React.CSSProperties}>শুরু হয়নি {toBn(c.plan)}</span>
        </div>
      </div>
    </div>
  );
}

export function EventsList({ items, className = '' }: { items: EventItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={`events ${className}`}>
      {items.map((e) => {
        const d = dateParts(e.date);
        return (
          <li key={e.id}>
            <div className="date">{d ? <><b>{d.day}</b><span>{d.month} · {d.weekday}</span></> : null}</div>
            <div>
              <h3>{e.title}</h3>
              <p>{joinParts([e.time, e.place])}{e.note ? `। ${e.note}` : ''}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Offices({ contact }: { contact: ContactPage }) {
  return (
    <>
      {contact.offices.map((o, i) => (
        <div className="office" key={i}>
          <h3>{o.name}</h3>
          {o.rows.length > 0 && <dl>{o.rows.filter((r) => r.value).map((r, j) => <Row key={j} label={r.label} value={r.value} />)}</dl>}
        </div>
      ))}
    </>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return <><dt>{label}</dt><dd>{value}</dd></>;
}

export function EmptyNote({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return <p className="empty" style={light ? { color: 'var(--muted-dark)' } : undefined}>{children}</p>;
}

export const bnDateOf = bnDateSafe;
