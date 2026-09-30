import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MONTHS_BN, eventInputSchema } from '@jonoprotinidhi/shared';
import { useTenant, publicPageUrl } from '../../../tenant';
import { Button, Dialog, EmptyState, Field, Icon, PageHead, PillOf, SearchInput, Skeleton, Tabs, useToast } from '../../../components';
import { bnWeekday, toBn } from '../../../format';
import { CONTENT_STATUS, CharCount, Confirm, dayToIso, dhakaToday, errText, fetchAll, isoDay, issuesToErrors } from './common';

/* Events (upcoming programmes): upcoming vs past, grouped by month with Bangla dates; create/edit, publish, delete. */

export type EItem = { id: string; title: string; date: string; time: string; place: string; note: string; status: 'draft' | 'published'; updatedAt: string };

export default function Events() {
  const { api, id, can, info } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['tenant', id, 'events', 'all'], queryFn: () => fetchAll<EItem>(api, '/events') });
  const canPublish = can('content.publish');
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [search, setSearch] = useState('');
  const [dlg, setDlg] = useState<null | { item?: EItem }>(null);
  const [del, setDel] = useState<EItem | null>(null);
  const [busy, setBusy] = useState('');
  const today = dhakaToday();
  const all = q.data?.items ?? [];
  const upcoming = all.filter((e) => isoDay(e.date) >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = all.filter((e) => isoDay(e.date) < today).sort((a, b) => b.date.localeCompare(a.date));
  const s = search.trim().toLowerCase();
  const list = (tab === 'upcoming' ? upcoming : past).filter((e) => !s || `${e.title} ${e.place} ${e.note}`.toLowerCase().includes(s));
  const groups = useMemo(() => {
    const m = new Map<string, EItem[]>();
    for (const e of list) { const k = isoDay(e.date).slice(0, 7); m.set(k, [...(m.get(k) ?? []), e]); }
    return [...m.entries()];
  }, [list]);

  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['tenant', id, 'events'] }); void qc.invalidateQueries({ queryKey: ['tenant', id, 'dashboard'] }); };
  const act = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label);
    try { await fn(); await refresh(); toast(ok, 'ok'); return true; } catch (e) { toast(errText(e), 'bad'); return false; } finally { setBusy(''); }
  };

  return (
    <>
      <PageHead kicker="কনটেন্ট" icon="events" title="কর্মসূচি" sub="গণশুনানি, সভা, উদ্বোধন: আসন্ন অনুষ্ঠানের তারিখ ও স্থান। প্রকাশিত আসন্ন কর্মসূচি হোমপেজে দেখায়, তারিখ পার হলে নিজে থেকেই সরে যায়।"
        actions={<><Button href={publicPageUrl(info.tenant.slug, '/')} icon="external">সাইটে দেখুন ↗</Button><Button variant="accent" icon="plus" onClick={() => setDlg({})}>নতুন কর্মসূচি</Button></>} />
      <div className="bar">
        <Tabs base="ev" label="কর্মসূচির সময়" value={tab} onChange={setTab} variant="pill"
          tabs={[{ key: 'upcoming', label: 'আসন্ন', icon: 'calendarClock', badge: upcoming.length }, { key: 'past', label: 'অতীত', icon: 'clock', badge: past.length }]} />
        <SearchInput value={search} onChange={setSearch} label="কর্মসূচি খুঁজুন" placeholder="শিরোনাম বা স্থান" />
      </div>
      <div role="tabpanel" id={`ev-panel-${tab}`} aria-labelledby={`ev-tab-${tab}`}>
        {q.isLoading ? (
          <div className="card">{Array.from({ length: 4 }, (_, i) => <div className="ct-ev" key={i}><Skeleton w={64} h={64} r={12} /><div className="grow"><Skeleton w="60%" /><div style={{ height: 8 }} /><Skeleton w="40%" h={12} /></div></div>)}</div>
        ) : q.isError ? (
          <div className="card"><EmptyState icon="alert" title="কর্মসূচি লোড হয়নি" text={errText(q.error)} action={<Button icon="refresh" onClick={() => q.refetch()}>আবার চেষ্টা করুন</Button>} /></div>
        ) : !list.length ? (
          <div className="card"><EmptyState icon="events" title={s ? 'কিছু পাওয়া যায়নি' : tab === 'upcoming' ? 'আসন্ন কোনো কর্মসূচি নেই' : 'অতীতের কোনো কর্মসূচি নেই'}
            text={tab === 'upcoming' && !s ? 'গণশুনানি বা সভার তারিখ যোগ করলে পাবলিক সাইটে দেখাবে।' : undefined}
            action={tab === 'upcoming' && !s ? <Button variant="accent" icon="plus" onClick={() => setDlg({})}>কর্মসূচি যোগ করুন</Button> : undefined} /></div>
        ) : groups.map(([ym, evs]) => {
          const [y, m] = ym.split('-').map(Number);
          return (
            <section key={ym} className="card pad-0 ct-evgroup" aria-label={`${MONTHS_BN[(m ?? 1) - 1]} ${toBn(y ?? 0)}`}>
              <header className="card-h pad"><h2 className="h2">{MONTHS_BN[(m ?? 1) - 1]} {toBn(y ?? 0)}</h2><span className="muted ct-small">{toBn(evs.length)}টি কর্মসূচি</span></header>
              <ul className="ct-evs">
                {evs.map((e) => {
                  const d = isoDay(e.date);
                  const lockedDelete = e.status === 'published' && !canPublish;
                  return (
                    <li key={e.id} className="ct-ev">
                      <div className={`ct-evdate${d === today ? ' today' : ''}`} aria-hidden><b>{toBn(Number(d.slice(8, 10)))}</b><small>{bnWeekday(`${d}T06:00:00Z`)}</small></div>
                      <div className="grow ct-evbody">
                        <div className="row" style={{ gap: 8 }}><b className="ct-evtitle">{e.title}</b><PillOf map={CONTENT_STATUS} k={e.status} />{d === today && <span className="pill info plain">আজ</span>}</div>
                        <small className="muted">{[`${toBn(Number(d.slice(8, 10)))} ${MONTHS_BN[Number(d.slice(5, 7)) - 1]}`, e.time, e.place].filter(Boolean).join(' · ')}</small>
                        {e.note && <p className="ct-evnote">{e.note}</p>}
                      </div>
                      <div className="acts ct-evact">
                        {canPublish && (e.status === 'draft'
                          ? <Button size="sm" variant="accent" icon="rocket" loading={busy === `p-${e.id}`} onClick={() => void act(`p-${e.id}`, () => api.post(`/events/${e.id}/publish`), 'কর্মসূচি প্রকাশ হয়েছে')} aria-label={`প্রকাশ করুন: ${e.title}`}>প্রকাশ</Button>
                          : <Button size="sm" variant="quiet" icon="eyeOff" loading={busy === `u-${e.id}`} onClick={() => void act(`u-${e.id}`, () => api.post(`/events/${e.id}/unpublish`), 'কর্মসূচি অপ্রকাশিত করা হয়েছে')} aria-label={`অপ্রকাশ করুন: ${e.title}`}>অপ্রকাশ</Button>)}
                        <Button size="sm" variant="quiet" icon="edit" onClick={() => setDlg({ item: e })} aria-label={`সম্পাদনা করুন: ${e.title}`}>সম্পাদনা</Button>
                        <button type="button" className="icon-btn ct-del" disabled={lockedDelete} title={lockedDelete ? 'প্রকাশিত কর্মসূচি মুছতে MP-র অনুমতি লাগে' : 'মুছুন'} aria-label={`মুছুন: ${e.title}`} onClick={() => setDel(e)}><Icon name="trash" size={16} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {dlg && <EventDialog item={dlg.item} onClose={() => setDlg(null)} onSaved={refresh} />}
      <Confirm open={!!del} title="কর্মসূচিটি মুছবেন?" danger confirmLabel="মুছে ফেলুন" busy={busy === 'del'} onClose={() => setDel(null)}
        onConfirm={async () => { const e = del!; if (await act('del', () => api.del(`/events/${e.id}`), 'কর্মসূচি মুছে ফেলা হয়েছে')) setDel(null); }}>
        <p>"{del?.title}" তালিকা{del?.status === 'published' ? ' ও পাবলিক সাইট' : ''} থেকে সরে যাবে।</p>
      </Confirm>
    </>
  );
}

export function EventDialog({ item, onClose, onSaved }: { item?: EItem; onClose: () => void; onSaved: () => Promise<void> }) {
  const { api, can } = useTenant();
  const toast = useToast();
  const canPublish = can('content.publish');
  const [f, setF] = useState({ title: item?.title ?? '', date: isoDay(item?.date) || '', time: item?.time ?? '', place: item?.place ?? '', note: item?.note ?? '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async (publish: boolean) => {
    const body = { ...f, date: dayToIso(f.date) };
    const v = eventInputSchema.safeParse(body);
    if (!v.success || !f.date) { setErrs({ ...(v.success ? {} : issuesToErrors(v.error.issues as never)), ...(!f.date ? { date: 'তারিখ দিন' } : {}) }); return; }
    setErrs({}); setBusy(publish ? 'pub' : 'save');
    try {
      const qs = publish ? '?publish=1' : '';
      if (item) await api.patch(`/events/${item.id}${qs}`, body); else await api.post(`/events${qs}`, body);
      await onSaved();
      toast(publish ? 'কর্মসূচি সংরক্ষণ ও প্রকাশ হয়েছে' : item?.status === 'published' && !canPublish ? 'সংরক্ষণ হয়েছে; কর্মসূচিটি আবার খসড়া হলো, MP প্রকাশ করলে সাইটে ফিরবে' : `সংরক্ষণ হয়েছে (খসড়া)${canPublish ? '' : '। MP প্রকাশ করলে সাইটে দেখাবে'}`, 'ok');
      onClose();
    } catch (e) { toast(errText(e), 'bad'); } finally { setBusy(''); }
  };
  return (
    <Dialog title={item ? 'কর্মসূচি সম্পাদনা' : 'নতুন কর্মসূচি'} open onClose={onClose}
      footer={<>
        <Button onClick={onClose}>বাতিল</Button>
        <Button variant={canPublish ? 'ghost' : 'accent'} icon="save" loading={busy === 'save'} disabled={!!busy} onClick={() => void save(false)}>{item ? 'সংরক্ষণ' : 'খসড়া হিসেবে রাখুন'}</Button>
        {canPublish && <Button variant="accent" icon="rocket" loading={busy === 'pub'} disabled={!!busy} onClick={() => void save(true)}>সংরক্ষণ ও প্রকাশ</Button>}
      </>}>
      <form className="form" noValidate onSubmit={(e) => { e.preventDefault(); void save(false); }}>
        <Field label="শিরোনাম" required error={errs.title}>{(p) => <><input {...p} maxLength={140} value={f.title} onChange={set('title')} placeholder="যেমন: চরকান্দিতে গণশুনানি" /><div className="ct-meta"><span /><CharCount n={f.title.length} max={140} /></div></>}</Field>
        <div className="frow">
          <Field label="তারিখ" required error={errs.date}>{(p) => <input {...p} type="date" value={f.date} onChange={set('date')} />}</Field>
          <Field label="সময়" error={errs.time} hint="যেমন: সকাল ১০টা">{(p) => <input {...p} maxLength={60} value={f.time} onChange={set('time')} />}</Field>
        </div>
        <Field label="স্থান" error={errs.place}>{(p) => <input {...p} maxLength={160} value={f.place} onChange={set('place')} placeholder="যেমন: চরকান্দি ইউনিয়ন পরিষদ মাঠ" />}</Field>
        <Field label="টীকা" error={errs.note}>{(p) => <><textarea {...p} className="short" rows={3} maxLength={400} value={f.note} onChange={set('note')} /><div className="ct-meta"><span /><CharCount n={f.note.length} max={400} /></div></>}</Field>
        {item?.status === 'published' && !canPublish && <p className="note info ct-small"><Icon name="info" />প্রকাশিত কর্মসূচি বদলালে এটি আবার খসড়া হবে এবং MP আবার প্রকাশ না করা পর্যন্ত সাইটে দেখাবে না।</p>}
      </form>
    </Dialog>
  );
}
