import type { Metadata } from 'next';
import ComplaintBox from '@/components/ComplaintBox';
import { EventsList, PageHero } from '@/components/blocks';
import { getComplaintForm, getComplaintStats, getEvents, getPage, getSite, soft, pageImage } from '@/lib/api';
import { env } from '@/lib/env';
import { PAGE_NAME } from '@/lib/nav';
import { bnMonthLabel, bnNumber, toBn, toEn } from '@/lib/format';

export const metadata: Metadata = { title: PAGE_NAME.complaint };

export default async function Complaint() {
  const site = await getSite();
  const [heroes, page, area, contact, form, stats, events] = await Promise.all([
    soft(getPage('heroes'), null), getPage('complaint'), soft(getPage('area'), null), soft(getPage('contact'), null),
    soft(getComplaintForm(), { categories: [], otpRequired: false, enabled: site.complaintBoxEnabled }), soft(getComplaintStats(), null), soft(getEvents(3), []),
  ]);
  const img = (await pageImage(site, 'complaint'));
  const maxC = Math.max(1, ...(stats?.byCategory ?? []).map((c) => c.count));
  const hotline = contact?.hotline;
  const tel = hotline?.number ? toEn(hotline.number).replace(/[^\d+]/g, '') : '';
  return (
    <>
      <PageHero hero={{ ...heroes?.complaint, intro: heroes?.complaint.intro || page.intro }} fallbackTitle={PAGE_NAME.complaint} image={img?.url} credit={img?.caption} crumbs={[{ label: PAGE_NAME.complaint }]} />
      <section className="sec dark"><div className="wrap">
        {heroes?.complaint.intro && page.intro && heroes.complaint.intro !== page.intro && <p className="lead reveal" style={{ margin: '0 0 44px', maxWidth: '70ch' }}>{page.intro}</p>}
        <div className="cmp-grid" style={{ marginTop: 0 }}>
          <div>
            <ComplaintBox categories={form.categories} upazilas={area?.upazilas ?? []} otpRequired={form.otpRequired} enabled={form.enabled && site.complaintBoxEnabled}
              privacyNote={page.privacyNote} turnstileSiteKey={env.turnstileSiteKey} />
          </div>
          <aside aria-label="অভিযোগের পরিসংখ্যান">
            {stats && (
              <div className="side-box">
                <p className="kicker">{bnMonthLabel(stats.month)} মাসের হিসাব</p>
                <div className="big3">
                  <div><b>{bnNumber(stats.received)}</b><span>গৃহীত</span></div>
                  <div><b>{bnNumber(stats.resolved)}</b><span>নিষ্পত্তি</span></div>
                  <div><b>{toBn(stats.avgDays)}</b><span>দিন গড় সময়</span></div>
                </div>
                {stats.byCategory.length > 0 && <>
                  <p className="hint" style={{ fontWeight: 600 }}>বিষয় অনুযায়ী</p>
                  <div className="hbars">{stats.byCategory.map((c) => <div className="hbar" key={c.category}><span>{c.category}</span><span className="t"><i style={{ width: `${((c.count / maxC) * 100).toFixed(1)}%` }} /></span><span className="n">{toBn(c.count)}</span></div>)}</div>
                </>}
                <p className="hint">শুধু সংখ্যা প্রকাশ করা হয়। কোনো অভিযোগকারীর নাম বা অভিযোগের বিবরণ প্রকাশ হয় না।</p>
              </div>
            )}
            {page.steps.length > 0 && (
              <div className="side-box">
                <p className="kicker">যেভাবে কাজ করে</p>
                <ol className="how">{page.steps.map((s, i) => <li key={i}><span><b style={{ display: 'block', color: 'var(--text-light)', fontWeight: 600 }}>{s.title}</b>{s.text}</span></li>)}</ol>
              </div>
            )}
          </aside>
        </div>
      </div></section>
      {(page.faq.length > 0 || events.length > 0 || hotline?.number) && (
        <section className="sec light"><div className="wrap two-col wide-l">
          {page.faq.length > 0 ? (
            <div className="reveal"><p className="kicker">প্রশ্ন ও উত্তর</p><h2 className="h3" style={{ margin: '10px 0 24px' }}>প্রায়ই জিজ্ঞাসিত প্রশ্ন</h2>
              <div className="faq">{page.faq.map((q, i) => <details key={i} open={i === 0}><summary>{q.q}</summary><p>{q.a}</p></details>)}</div></div>
          ) : <div />}
          {(events.length > 0 || hotline?.number) && (
            <div className="reveal"><p className="kicker">অন্য উপায়ে জানান</p><h2 className="h3" style={{ margin: '10px 0 24px' }}>সরাসরি যোগাযোগ</h2>
              <EventsList items={events} />
              {hotline?.number && <div className="office"><h3>হটলাইন</h3><dl><dt>নম্বর</dt><dd>{tel ? <a href={`tel:${tel}`}>{hotline.number}</a> : hotline.number}</dd>{hotline.hours && <><dt>সময়</dt><dd>{hotline.hours}</dd></>}</dl></div>}
            </div>
          )}
        </div></section>
      )}
    </>
  );
}
