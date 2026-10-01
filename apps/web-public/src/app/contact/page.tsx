import type { Metadata } from 'next';
import Link from 'next/link';
import { EventsList, Offices, PageHero } from '@/components/blocks';
import { getEvents, getPage, getSite, soft, pageImage } from '@/lib/api';
import { PAGE_NAME } from '@/lib/nav';
import { isExternalHref, safeHref } from '@/lib/links';
import { toEn } from '@/lib/format';

export const metadata: Metadata = { title: PAGE_NAME.contact };

export default async function Contact() {
  const site = await getSite();
  const [heroes, c, home, events] = await Promise.all([soft(getPage('heroes'), null), getPage('contact'), soft(getPage('home'), null), soft(getEvents(12), [])]);
  const img = (await pageImage(site, 'contact'));
  const channels = c.channels.map((ch) => ({ ...ch, href: safeHref(ch.url) }));
  const tel = c.hotline.number ? toEn(c.hotline.number).replace(/[^\d+]/g, '') : '';
  const cta = home?.complaintCta;
  return (
    <>
      <PageHero hero={{ ...heroes?.contact, intro: heroes?.contact.intro || c.intro }} fallbackTitle={PAGE_NAME.contact} image={img?.url} credit={img?.caption} crumbs={[{ label: PAGE_NAME.contact }]} />
      {heroes?.contact.intro && c.intro && heroes.contact.intro !== c.intro && (
        <section className="sec light" style={{ paddingBottom: 0 }}><div className="wrap"><p className="lead reveal" style={{ margin: 0, maxWidth: '70ch' }}>{c.intro}</p></div></section>
      )}
      {(events.length > 0 || c.offices.length > 0) && (
        <section className="sec light"><div className="wrap"><div className="meet-grid">
          {events.length > 0 && <div className="reveal"><p className="kicker">আসন্ন কর্মসূচি</p><h2 className="h3" style={{ margin: '10px 0 24px' }}>দেখা করুন</h2><EventsList items={events} /></div>}
          {c.offices.length > 0 && <div className="reveal"><p className="kicker">অফিস</p><h2 className="h3" style={{ margin: '10px 0 24px' }}>ঠিকানা ও সময়</h2><Offices contact={c} /></div>}
        </div></div></section>
      )}
      <section className="sec dark"><div className="wrap two-col">
        {(channels.length > 0 || c.hotline.number) ? (
          <div className="reveal">
            <p className="kicker">অনলাইনে</p><h2 className="h2">সামাজিক মাধ্যম ও হটলাইন</h2>
            {channels.length > 0 && (
              <ul className="social">
                {channels.map((ch, i) => (
                  <li key={i}>
                    {ch.href ? <a href={ch.href} {...(isExternalHref(ch.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{ch.label}</a> : <b>{ch.label}</b>}
                    {ch.note && <span>{ch.note}</span>}
                  </li>
                ))}
              </ul>
            )}
            {c.hotline.number && (
              <div className="hotline">
                <span>হটলাইন</span>
                {tel ? <a href={`tel:${tel}`}><b>{c.hotline.number}</b></a> : <b>{c.hotline.number}</b>}
                {c.hotline.hours && <span>{c.hotline.hours}</span>}
              </div>
            )}
          </div>
        ) : <div />}
        {site.complaintBoxEnabled && (
          <div className="reveal">
            <p className="kicker">অভিযোগ বা পরামর্শ</p>
            <h2 className="h2">{cta?.title || 'লিখিতভাবে জানাতে চান?'}</h2>
            {cta?.text && <p className="lead">{cta.text}</p>}
            <p style={{ marginTop: 28 }}><Link className="btn btn-brass" href="/complaint">{cta?.button || 'অভিযোগ বক্সে যান'}</Link></p>
          </div>
        )}
      </div></section>
    </>
  );
}
