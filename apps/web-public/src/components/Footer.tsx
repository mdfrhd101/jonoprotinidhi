import Link from 'next/link';
import { NAV } from '@/lib/nav';
import { safeHref, isExternalHref } from '@/lib/links';
import type { ContactPage, LayoutPage } from '@/lib/types';

type Props = { name: string; title: string; layout: LayoutPage | null; contact: ContactPage | null; complaintOn: boolean; photoCredits?: string[] };

/** Footer: every text comes from the CMS "layout" page (and the first office of the "contact" page). */
export default function Footer({ name, title, layout, contact, complaintOn, photoCredits = [] }: Props) {
  const office = contact?.offices?.[0];
  const social = (layout?.social ?? []).map((s) => ({ ...s, href: safeHref(s.url) })).filter((s) => s.label);
  // licence attribution (CC BY / BY-SA) must stay available, but folded behind one line (owner request 30 Sep)
  const credits = [...new Set([layout?.photoCredit, ...photoCredits].filter((x): x is string => !!x && !!x.trim()))];
  return (
    <footer>
      <div className="wrap foot-grid v4">
        <div>
          <Link className="logo" href="/"><span>{name && <b>{name}</b>}{title && <small>{title}</small>}</span></Link>
          {layout?.footerAbout && <p style={{ marginTop: 16, maxWidth: '40ch' }}>{layout.footerAbout}</p>}
          {layout?.tagline && <p style={{ marginTop: 10, maxWidth: '40ch', color: 'var(--brass-2)' }}>{layout.tagline}</p>}
        </div>
        <div>
          <h4>সাইট</h4>
          <ul>
            {NAV.map(([href, label]) => <li key={href}><Link href={href}>{label}</Link></li>)}
            <li><Link href="/biography">জীবনপঞ্জি</Link></li>
            {complaintOn && <li><Link href="/complaint">অভিযোগ বক্স</Link></li>}
          </ul>
        </div>
        {office ? (
          <div>
            <h4>{office.name}</h4>
            <ul>{office.rows.filter((r) => r.value).map((r, i) => <li key={i}>{r.value}</li>)}</ul>
          </div>
        ) : <div />}
        {social.length > 0 ? (
          <div>
            <h4>অনলাইনে</h4>
            <ul className="soc">
              {social.map((s, i) => (
                <li key={i}>{s.href
                  ? <a href={s.href} {...(isExternalHref(s.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{s.label}</a>
                  : s.label}</li>
              ))}
            </ul>
          </div>
        ) : <div />}
        {(layout?.copyright || layout?.footerNote) && (
          <p className="foot-note">{[layout?.copyright, layout?.footerNote].filter(Boolean).join(' · ')}</p>
        )}
        {credits.length > 0 && (
          <details className="credits">
            <summary>ছবির কৃতজ্ঞতা ও লাইসেন্স</summary>
            <p>{credits.join(' · ')}</p>
          </details>
        )}
      </div>
    </footer>
  );
}
