import type { Metadata } from 'next';
import AreaWidget from '@/components/AreaWidget';
import { PageHero, SecHead } from '@/components/blocks';
import { getPage, getSite, soft, pageImage } from '@/lib/api';
import { PAGE_NAME } from '@/lib/nav';
import { bnText, parseNumber, toBn } from '@/lib/format';

export const metadata: Metadata = { title: PAGE_NAME.area };

export default async function Area({ searchParams }: { searchParams: { upz?: string } }) {
  const site = await getSite();
  const [heroes, a] = await Promise.all([soft(getPage('heroes'), null), getPage('area')]);
  const img = (await pageImage(site, 'area'));
  const vs = a.voters.map((v) => parseNumber(v.value) ?? 0);
  const vmax = Math.max(1, ...vs);
  const uv = a.upazilas.map((u) => parseNumber(u.voters) ?? 0);
  const umax = Math.max(1, ...uv);
  const hasTable = a.upazilas.length > 0;
  const empty = !a.intro && !a.totals.length && !a.upazilas.length && !a.extra.length;
  return (
    <>
      <PageHero hero={heroes?.area} fallbackTitle={bnText(site.mp.seat) || PAGE_NAME.area} image={img?.url} credit={img?.caption} crumbs={[{ label: PAGE_NAME.area }]} />
      {a.totals.length > 0 && (
        <section className="stats" aria-label="আসনের মোট হিসাব"><div className="wrap"><div className="stats-grid">
          {a.totals.slice(0, 4).map((t, i) => <div className="stat reveal" key={i}><b>{t.value}</b><span>{t.label}</span></div>)}
        </div>
        {a.totals.length > 4 && <div className="stats-grid" style={{ marginTop: 34 }}>{a.totals.slice(4).map((t, i) => <div className="stat reveal" key={i}><b>{t.value}</b><span>{t.label}</span></div>)}</div>}
        </div></section>
      )}
      {(a.upazilas.length > 0 || a.intro) && (
        <section className="sec light-2"><div className="wrap">
          <SecHead h={{ kicker: 'উপজেলা', title: 'আসনের উপজেলাগুলো' }} />
          {a.intro && <p className="lead reveal" style={{ margin: '-20px 0 44px', maxWidth: '70ch' }}>{a.intro}</p>}
          <AreaWidget upazilas={a.upazilas} full initial={typeof searchParams.upz === 'string' ? searchParams.upz : undefined} />
        </div></section>
      )}
      {(a.extra.length > 0 || a.voters.length > 0 || hasTable) && (
        <section className="sec light"><div className="wrap">
          {a.extra.length > 0 && <>
            <SecHead h={{ kicker: 'এক নজরে', title: 'আসনের পরিসংখ্যান' }} />
            <div className="xgrid reveal">{a.extra.map((x, i) => <div key={i}><b>{x.value}</b><span>{x.label}</span></div>)}</div>
          </>}
          {(a.voters.length > 0 || uv.some((x) => x > 0)) && (
            <div className="two-col" style={{ marginTop: a.extra.length ? 72 : 0 }}>
              {a.voters.length > 0 && <div className="reveal"><h3 className="h3">ভোটার</h3>
                <div className="hbars vbars" style={{ marginTop: 22 }}>{a.voters.map((v, i) => <div className="hbar" key={i}><span>{v.label}</span><span className="t"><i style={{ width: `${Math.max(0.6, (vs[i]! / vmax) * 100).toFixed(1)}%` }} /></span><span className="n">{v.value}</span></div>)}</div></div>}
              {uv.some((x) => x > 0) && <div className="reveal"><h3 className="h3">উপজেলাভিত্তিক ভোটার</h3>
                <div className="hbars vbars" style={{ marginTop: 22 }}>{a.upazilas.map((u, i) => <div className="hbar" key={i}><span>{u.short || u.name}</span><span className="t"><i style={{ width: `${Math.max(0.6, (uv[i]! / umax) * 100).toFixed(1)}%` }} /></span><span className="n">{u.voters}</span></div>)}</div></div>}
            </div>
          )}
          {hasTable && <>
            <h3 className="h3 reveal" style={{ marginTop: 80 }}>উপজেলাভিত্তিক তুলনা</h3>
            <div className="tbl-wrap reveal" tabIndex={0} role="region" aria-label="উপজেলাভিত্তিক তুলনার টেবিল">
              <table className="t">
                <thead><tr><th scope="col">উপজেলা</th><th scope="col" className="n">জনসংখ্যা</th><th scope="col" className="n">ভোটার</th><th scope="col" className="n">আয়তন (বর্গকিমি)</th><th scope="col" className="n">সাক্ষরতা</th><th scope="col" className="n">ইউনিয়ন/পৌরসভা</th><th scope="col" className="n">মাধ্যমিক বিদ্যালয়</th><th scope="col" className="n">কমিউনিটি ক্লিনিক</th></tr></thead>
                <tbody>{a.upazilas.map((u, i) => (
                  <tr key={i}><th scope="row">{u.short || u.name}</th><td className="n">{u.pop || '–'}</td><td className="n">{u.voters || '–'}</td><td className="n">{u.size || '–'}</td><td className="n">{u.lit || '–'}</td><td className="n">{toBn(u.unions.length)}</td><td className="n">{u.schools || '–'}</td><td className="n">{u.clinics || '–'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </>}
          {a.note && <p className="hint" style={{ color: 'var(--muted-dark)', marginTop: 14 }}>{a.note}</p>}
        </div></section>
      )}
      {empty && <section className="sec light"><div className="wrap"><p className="empty" style={{ color: 'var(--muted-dark)' }}>এলাকার তথ্য শিগগিরই যোগ করা হবে।</p></div></section>}
    </>
  );
}
