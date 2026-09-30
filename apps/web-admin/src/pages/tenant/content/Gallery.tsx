import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { galleryPatchSchema } from '@jonoprotinidhi/shared';
import { useTenant, publicPageUrl } from '../../../tenant';
import { Badge, Button, Chips, Dialog, Drawer, EmptyState, Field, Icon, PageHead, Pager, PillOf, SearchInput, Skeleton, Switch, useToast } from '../../../components';
import { bnDate, toBn } from '../../../format';
import { CONTENT_STATUS, CharCount, Confirm, UploadBar, dayToIso, errText, fetchAll, isoDay, issuesToErrors, useReorder } from './common';
import { SliderDialog, type Slide } from './Slider';

/* Gallery manager: photo cards, multi-upload with progress, pick from the media library, inline edit, drag & drop
   (or arrow buttons) ordering saved via POST /gallery/reorder, filters, bulk publish (owner), delete rules, preview slider. */

export type GItem = { id: string; url: string; caption: string; credit: string; album: string; takenAt: string | null; order: number; featured: boolean; status: 'draft' | 'published'; updatedAt: string };
type Up = { key: string; name: string; p: number; state: 'up' | 'ok' | 'bad'; msg?: string };
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB = 8;

export default function Gallery() {
  const { api, id, can, info } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const qk = ['tenant', id, 'gallery', 'all'];
  const q = useQuery({ queryKey: qk, queryFn: () => fetchAll<GItem>(api, '/gallery') });
  const items = q.data?.items ?? [];
  const canPublish = can('content.publish');
  const [status, setStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [album, setAlbum] = useState('');
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<GItem | null>(null);
  const [uploads, setUploads] = useState<Up[]>([]);
  const [lib, setLib] = useState(false);
  const [preview, setPreview] = useState<null | { drafts: boolean }>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const albums = useMemo(() => { const m = new Map<string, number>(); for (const i of items) if (i.album) m.set(i.album, (m.get(i.album) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [items]);
  const counts = { all: items.length, published: items.filter((i) => i.status === 'published').length, draft: items.filter((i) => i.status === 'draft').length };
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const r = useReorder(items.map((i) => i.id));
  const filtering = status !== 'all' || !!album || !!search.trim();
  const ordered = r.order.map((x) => byId.get(x)).filter((x): x is GItem => !!x);
  const s = search.trim().toLowerCase();
  const shown = ordered.filter((i) => (status === 'all' || i.status === status) && (!album || i.album === album) && (!s || `${i.caption} ${i.credit} ${i.album}`.toLowerCase().includes(s)));

  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['tenant', id, 'gallery'] }); void qc.invalidateQueries({ queryKey: ['tenant', id, 'dashboard'] }); };

  /* ----- uploads: each file -> POST /media (with progress) -> POST /gallery ----- */
  const addFiles = async (files: File[]) => {
    const ok: File[] = [];
    for (const f of files) {
      if (!TYPES.includes(f.type)) { toast(`"${f.name}": শুধু JPG, PNG বা WebP ছবি দেওয়া যায়`, 'bad'); continue; }
      if (f.size > MAX_MB * 1024 * 1024) { toast(`"${f.name}": ছবি সর্বোচ্চ ${toBn(MAX_MB)} মেগাবাইট হতে পারে`, 'bad'); continue; }
      ok.push(f);
    }
    if (!ok.length) return;
    const start = items.reduce((m, i) => Math.max(m, i.order), -1) + 1;
    const ups = ok.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, p: 0, state: 'up' as const }));
    setUploads((u) => [...u.filter((x) => x.state === 'up'), ...ups]);
    const patch = (k: string, v: Partial<Up>) => setUploads((u) => u.map((x) => (x.key === k ? { ...x, ...v } : x)));
    let added = 0;
    for (const [i, f] of ok.entries()) {
      const k = ups[i]!.key;
      try {
        const m = await api.uploadProgress<{ url: string; credit?: string }>(`/media?name=${encodeURIComponent(f.name.slice(0, 100))}`, f, (l, t) => patch(k, { p: t ? (l / t) * 0.92 : 0 }));
        await api.post('/gallery', { url: m.url, caption: '', credit: '', album: album || '', order: start + i, featured: false });
        patch(k, { p: 1, state: 'ok' }); added++;
      } catch (e) { patch(k, { state: 'bad', msg: errText(e) }); toast(`"${f.name}": ${errText(e)}`, 'bad'); }
    }
    if (added) { toast(`${toBn(added)}টি ছবি গ্যালারিতে যোগ হয়েছে (খসড়া)${canPublish ? '' : '। MP প্রকাশ করলে সাইটে দেখাবে'}`, 'ok'); await refresh(); }
    setTimeout(() => setUploads((u) => u.filter((x) => x.state !== 'ok')), 2500);
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const fs = Array.from(e.dataTransfer.files ?? []); if (fs.length) void addFiles(fs); };

  const act = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label);
    try { await fn(); await refresh(); toast(ok, 'ok'); return true; } catch (e) { toast(errText(e), 'bad'); return false; } finally { setBusy(''); }
  };
  const saveOrder = () => act('order', () => api.post('/gallery/reorder', { ids: r.order }), 'নতুন ক্রম সংরক্ষণ হয়েছে');
  const bulk = (to: 'publish' | 'unpublish') => act('bulk', async () => { for (const x of sel) await api.post(`/gallery/${x}/${to}`); setSel(new Set()); }, to === 'publish' ? `${toBn(sel.size)}টি ছবি প্রকাশ হয়েছে` : `${toBn(sel.size)}টি ছবি অপ্রকাশিত হয়েছে`);
  const toggleFeatured = (g: GItem) => act(`star-${g.id}`, () => api.patch(`/gallery/${g.id}`, { featured: !g.featured }),
    g.status === 'published' && !canPublish ? 'বদল হয়েছে; ছবিটি আবার খসড়া হলো, MP প্রকাশ করলে সাইটে ফিরবে' : g.featured ? 'বাছাই থেকে সরানো হয়েছে' : 'বাছাই করা ছবি হিসেবে চিহ্নিত হয়েছে');
  const toggleSel = (x: string) => setSel((o) => { const n = new Set(o); if (n.has(x)) n.delete(x); else n.add(x); return n; });

  const slides = (drafts: boolean): Slide[] => ordered.filter((i) => drafts || i.status === 'published').map((i) => ({
    key: i.id, thumb: i.url, title: i.caption || 'ক্যাপশন নেই',
    stage: <img className="ct-stage-img" src={i.url} alt={i.caption || 'গ্যালারির ছবি'} />,
    sub: [i.album, i.credit && `ছবি: ${i.credit}`].filter(Boolean).join(' · '),
    badge: i.status === 'draft' ? <PillOf map={CONTENT_STATUS} k="draft" /> : i.featured ? <Badge tone="brass" icon="star">বাছাই করা</Badge> : undefined,
  }));

  return (
    <>
      <PageHead kicker="কনটেন্ট" icon="gallery" title="গ্যালারি" sub="ছবি আপলোড করুন, ক্যাপশন ও অ্যালবাম দিন, ক্রম সাজান। প্রকাশিত ছবিই পাবলিক সাইটের গ্যালারি আর স্লাইডারে দেখায়।"
        actions={<>
          <Button icon="play" onClick={() => setPreview({ drafts: false })} disabled={!counts.published}>স্লাইডার প্রিভিউ</Button>
          <Button icon="media" onClick={() => setLib(true)}>লাইব্রেরি থেকে</Button>
          <Button variant="accent" icon="upload" onClick={() => fileInput.current?.click()}>ছবি আপলোড</Button>
        </>} />
      <input ref={fileInput} type="file" accept={TYPES.join(',')} multiple hidden aria-label="গ্যালারির জন্য ছবির ফাইল" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; void addFiles(fs); }} />

      <div className={`drop ct-gdrop${over ? ' over' : ''}`} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        role="button" tabIndex={0} aria-label="ছবি আপলোড করুন (একসঙ্গে অনেকগুলো)" onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click(); } }}>
        <Icon name="imageUp" size={26} />
        <strong>একসঙ্গে অনেক ছবি এখানে টেনে এনে ছাড়ুন, বা ক্লিক করে বাছুন</strong>
        <small>JPG, PNG বা WebP · প্রতিটি সর্বোচ্চ {toBn(MAX_MB)} মেগাবাইট · নতুন ছবি খসড়া হিসেবে যোগ হয়{album ? ` · অ্যালবাম: ${album}` : ''}</small>
      </div>
      {uploads.length > 0 && <div className="ct-ups" aria-live="polite">{uploads.map((u) => <UploadBar key={u.key} label={u.msg ? `${u.name}: ${u.msg}` : u.name} value={u.p} state={u.state} />)}</div>}

      <div className="bar ct-gbar">
        <Chips label="অবস্থা" value={status} onChange={setStatus} options={[{ value: 'all', label: 'সব', count: counts.all }, { value: 'published', label: 'প্রকাশিত', count: counts.published }, { value: 'draft', label: 'খসড়া', count: counts.draft }]} />
        {albums.length > 0 && (
          <select aria-label="অ্যালবাম" className="ct-select" value={album} onChange={(e) => setAlbum(e.target.value)}>
            <option value="">সব অ্যালবাম</option>{albums.map(([a, n]) => <option key={a} value={a}>{a} ({toBn(n)})</option>)}
          </select>
        )}
        <SearchInput value={search} onChange={setSearch} label="ছবি খুঁজুন" placeholder="ক্যাপশন, অ্যালবাম বা ক্রেডিট" />
      </div>

      {canPublish && items.length > 0 && (
        <div className={`ct-bulk${sel.size ? ' on' : ''}`} role="region" aria-label="একসঙ্গে কাজ">
          {sel.size ? <>
            <b>{toBn(sel.size)}টি নির্বাচিত</b>
            <Button size="sm" variant="accent" icon="rocket" loading={busy === 'bulk'} onClick={() => void bulk('publish')}>প্রকাশ করুন</Button>
            <Button size="sm" icon="eyeOff" disabled={busy === 'bulk'} onClick={() => void bulk('unpublish')}>অপ্রকাশ করুন</Button>
            <button type="button" className="link" onClick={() => setSel(new Set())}>নির্বাচন বাতিল</button>
          </> : <>
            <span className="muted">একসঙ্গে প্রকাশ করতে ছবির কোণের ঘরে টিক দিন।</span>
            {counts.draft > 0 && <button type="button" className="link" onClick={() => setSel(new Set(items.filter((i) => i.status === 'draft').map((i) => i.id)))}>সব খসড়া বাছুন ({toBn(counts.draft)})</button>}
          </>}
        </div>
      )}

      {r.dirty && (
        <div className="savebar dirty ct-orderbar" role="region" aria-label="ক্রম">
          <span className="savebar-s"><i className="dotp" />ছবির নতুন ক্রম এখনো সংরক্ষণ হয়নি</span>
          <span className="savebar-a"><Button onClick={r.reset}>আগের ক্রমে ফিরুন</Button><Button variant="accent" icon="save" loading={busy === 'order'} onClick={() => void saveOrder()}>ক্রম সংরক্ষণ</Button></span>
        </div>
      )}

      {q.isLoading ? (
        <ul className="ct-grid" aria-label="লোড হচ্ছে">{Array.from({ length: 8 }, (_, i) => <li className="card ct-gcard" key={i}><Skeleton h={170} r={0} /><div style={{ padding: 14 }}><Skeleton w="70%" /></div></li>)}</ul>
      ) : q.isError ? (
        <div className="card"><EmptyState icon="alert" title="গ্যালারি লোড হয়নি" text={errText(q.error)} action={<Button icon="refresh" onClick={() => q.refetch()}>আবার চেষ্টা করুন</Button>} /></div>
      ) : !items.length ? (
        <div className="card"><EmptyState icon="gallery" title="গ্যালারিতে এখনো কোনো ছবি নেই" text="এলাকার কাজ, গণশুনানি, উদ্বোধন: ছবি আপলোড করলে পাবলিক সাইটের গ্যালারিতে দেখাবে।" action={<Button variant="accent" icon="upload" onClick={() => fileInput.current?.click()}>প্রথম ছবি আপলোড করুন</Button>} /></div>
      ) : !shown.length ? (
        <div className="card"><EmptyState compact icon="search" title="এই ফিল্টারে কোনো ছবি নেই" action={<Button onClick={() => { setStatus('all'); setAlbum(''); setSearch(''); }}>ফিল্টার সরান</Button>} /></div>
      ) : (
        <>
          <p className="muted ct-small ct-hint">{filtering ? <><Icon name="info" size={15} /> ক্রম বদলাতে ফিল্টার ও খোঁজ সরান।</> : <><Icon name="grip" size={15} /> টেনে এনে বা তীর বোতাম দিয়ে ক্রম বদলান। ওপরেরটি সাইটে আগে দেখায়।</>}</p>
          <ul className="ct-grid" aria-label="গ্যালারির ছবি">
            {shown.map((g) => {
              const idx = r.order.indexOf(g.id);
              const name = g.caption || 'ক্যাপশন ছাড়া ছবি';
              return (
                <li key={g.id} className={`card ct-gcard${sel.has(g.id) ? ' sel' : ''}`} {...(!filtering ? r.dnd(g.id) : {})}>
                  <div className="ct-gthumb">
                    <button type="button" className="ct-gopen" onClick={() => setEditing(g)} aria-label={`সম্পাদনা: ${name}`}><img src={g.url} alt="" loading="lazy" /></button>
                    <span className="ct-gstatus"><PillOf map={CONTENT_STATUS} k={g.status} /></span>
                    {canPublish && <label className="ct-gsel"><input type="checkbox" checked={sel.has(g.id)} onChange={() => toggleSel(g.id)} aria-label={`নির্বাচন: ${name}`} /></label>}
                    <button type="button" className={`ct-star${g.featured ? ' on' : ''}`} aria-pressed={g.featured} aria-label={`বাছাই করা ছবি: ${name}`} title={g.featured ? 'বাছাই করা (হোমপেজে আগে দেখায়)' : 'বাছাই করা হিসেবে চিহ্নিত করুন'}
                      disabled={busy === `star-${g.id}`} onClick={() => void toggleFeatured(g)}><Icon name="star" size={17} /></button>
                  </div>
                  <div className="ct-gbody">
                    <b className={g.caption ? '' : 'muted'}>{g.caption || 'ক্যাপশন নেই'}</b>
                    <small className="muted">{[g.album || 'অ্যালবাম নেই', g.takenAt && bnDate(g.takenAt)].filter(Boolean).join(' · ')}</small>
                  </div>
                  <div className="ct-gact">
                    {!filtering && <span className="ct-grip" aria-hidden title="টেনে সরান"><Icon name="grip" size={16} /></span>}
                    {!filtering && <>
                      <button type="button" className="icon-btn" aria-label={`আগে আনুন: ${name}`} disabled={idx <= 0} onClick={() => r.move(g.id, -1)}><Icon name="chevronLeft" size={16} /></button>
                      <button type="button" className="icon-btn" aria-label={`পরে নিন: ${name}`} disabled={idx >= r.order.length - 1} onClick={() => r.move(g.id, 1)}><Icon name="chevronRight" size={16} /></button>
                    </>}
                    <span className="grow" />
                    <Button size="sm" variant="quiet" icon="edit" onClick={() => setEditing(g)} aria-label={`সম্পাদনা করুন: ${name}`}>সম্পাদনা</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {editing && <EditDrawer item={editing} albums={albums.map((a) => a[0])} onClose={() => setEditing(null)} onChanged={refresh} />}
      <LibraryPick open={lib} onClose={() => setLib(false)} inGallery={new Set(items.map((i) => i.url))}
        onPick={async (urls) => {
          const start = items.reduce((m, i) => Math.max(m, i.order), -1) + 1;
          const ok = await act('lib', async () => { for (const [i, u] of urls.entries()) await api.post('/gallery', { url: u.url, caption: '', credit: u.credit ?? '', album: album || '', order: start + i, featured: false }); }, `${toBn(urls.length)}টি ছবি গ্যালারিতে যোগ হয়েছে (খসড়া)`);
          if (ok) setLib(false);
        }} />
      <SliderDialog open={!!preview} onClose={() => setPreview(null)} title="গ্যালারি: পাবলিক সাইটে যেমন দেখাবে" slides={slides(!!preview?.drafts)}
        note={<span className="ct-prev-note"><Switch checked={!!preview?.drafts} onChange={(v) => setPreview({ drafts: v })} label="খসড়া ছবিও দেখান" /> খসড়া ছবিও দেখান · <a href={publicPageUrl(info.tenant.slug, '/gallery')} target="_blank" rel="noopener noreferrer">লাইভ গ্যালারি ↗</a></span>} />
    </>
  );
}

/* ---------- edit one photo ---------- */
function EditDrawer({ item, albums, onClose, onChanged }: { item: GItem; albums: string[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const { api, can } = useTenant();
  const toast = useToast();
  const canPublish = can('content.publish');
  const [f, setF] = useState({ caption: item.caption, credit: item.credit, album: item.album, takenAt: isoDay(item.takenAt), featured: item.featured });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [askDel, setAskDel] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify({ caption: item.caption, credit: item.credit, album: item.album, takenAt: isoDay(item.takenAt), featured: item.featured });
  const lockedDelete = item.status === 'published' && !canPublish;

  const save = async (publish: boolean) => {
    const body = { caption: f.caption, credit: f.credit, album: f.album, featured: f.featured, ...(f.takenAt ? { takenAt: dayToIso(f.takenAt) } : {}) };
    const v = galleryPatchSchema.safeParse(body);
    if (!v.success) { setErrs(issuesToErrors(v.error.issues as never)); return; }
    setBusy(publish ? 'pub' : 'save');
    try {
      if (dirty) await api.patch(`/gallery/${item.id}${publish ? '?publish=1' : ''}`, body);
      else if (publish) await api.post(`/gallery/${item.id}/publish`);
      await onChanged();
      toast(publish ? 'সংরক্ষণ ও প্রকাশ হয়েছে' : item.status === 'published' && !canPublish ? 'সংরক্ষণ হয়েছে; ছবিটি আবার খসড়া হলো, MP প্রকাশ করলে সাইটে ফিরবে' : 'সংরক্ষণ হয়েছে', 'ok');
      onClose();
    } catch (e) { toast(errText(e), 'bad'); } finally { setBusy(''); }
  };
  const status = async (to: 'publish' | 'unpublish') => {
    setBusy(to);
    try { await api.post(`/gallery/${item.id}/${to}`); await onChanged(); toast(to === 'publish' ? 'প্রকাশ হয়েছে' : 'অপ্রকাশিত করা হয়েছে', 'ok'); onClose(); } catch (e) { toast(errText(e), 'bad'); } finally { setBusy(''); }
  };
  const remove = async () => {
    setBusy('del');
    try { await api.del(`/gallery/${item.id}`); await onChanged(); toast('ছবিটি গ্যালারি থেকে মুছে ফেলা হয়েছে', 'ok'); onClose(); } catch (e) { toast(errText(e), 'bad'); setAskDel(false); } finally { setBusy(''); }
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Drawer open title="ছবির তথ্য" onClose={onClose} width={520}
      footer={<div className="ct-dfoot">
        <Button variant="danger" icon="trash" disabled={lockedDelete || !!busy} onClick={() => setAskDel(true)}>মুছুন</Button>
        <span className="grow" />
        {canPublish && item.status === 'published' && !dirty && <Button icon="eyeOff" loading={busy === 'unpublish'} onClick={() => void status('unpublish')}>অপ্রকাশ করুন</Button>}
        {canPublish && (item.status === 'draft' || dirty) && <Button variant="accent" icon="rocket" loading={busy === 'pub'} disabled={!!busy} onClick={() => void save(true)}>{dirty ? 'সংরক্ষণ ও প্রকাশ' : 'প্রকাশ করুন'}</Button>}
        <Button variant={canPublish ? 'ghost' : 'accent'} icon="save" loading={busy === 'save'} disabled={!dirty || !!busy} onClick={() => void save(false)}>সংরক্ষণ</Button>
      </div>}>
      <img className="ct-dimg" src={item.url} alt={item.caption || 'গ্যালারির ছবি'} />
      <div className="row" style={{ margin: '12px 0 4px' }}><PillOf map={CONTENT_STATUS} k={item.status} />{item.featured && <Badge tone="brass" icon="star">বাছাই করা</Badge>}</div>
      {item.status === 'published' && !canPublish && <p className="note info ct-small"><Icon name="info" />প্রকাশিত ছবি বদলালে এটি আবার খসড়া হবে এবং MP আবার প্রকাশ না করা পর্যন্ত সাইটে দেখাবে না।</p>}
      <div className="form">
        <Field label="ক্যাপশন" error={errs.caption} hint="ছবিতে কী, কোথায়। স্লাইডারে ছবির নিচে দেখায়।">{(p) => <><textarea {...p} className="short" rows={2} maxLength={200} value={f.caption} onChange={set('caption')} /><div className="ct-meta"><span /><CharCount n={f.caption.length} max={200} /></div></>}</Field>
        <Field label="ক্রেডিট" error={errs.credit} hint="কে তুলেছেন / কার অনুমতিতে">{(p) => <input {...p} maxLength={200} value={f.credit} onChange={set('credit')} />}</Field>
        <div className="frow">
          <Field label="অ্যালবাম" error={errs.album} hint="আগের অ্যালবাম থেকে বাছুন বা নতুন নাম লিখুন">{(p) => <><input {...p} list="ct-albums" maxLength={60} value={f.album} onChange={set('album')} /><datalist id="ct-albums">{albums.map((a) => <option key={a} value={a} />)}</datalist></>}</Field>
          <Field label="ছবি তোলার তারিখ" error={errs.takenAt}>{(p) => <input {...p} type="date" value={f.takenAt} onChange={set('takenAt')} />}</Field>
        </div>
        <div className="ct-bool"><Switch checked={f.featured} onChange={(v) => setF((x) => ({ ...x, featured: v }))} label="বাছাই করা ছবি" /><div><b>বাছাই করা ছবি</b><small className="muted">হোমপেজের গ্যালারি অংশে আগে দেখায়</small></div></div>
        {lockedDelete && <p className="muted ct-small"><Icon name="lock" size={15} /> প্রকাশিত ছবি মুছতে MP-র অনুমতি লাগে। MP আগে অপ্রকাশ করলে বা নিজে মুছতে পারবেন।</p>}
      </div>
      <Confirm open={askDel} title="ছবিটি মুছবেন?" danger confirmLabel="মুছে ফেলুন" busy={busy === 'del'} onClose={() => setAskDel(false)} onConfirm={() => void remove()}>
        <p>ছবিটি গ্যালারি থেকে সরে যাবে{item.status === 'published' ? ' এবং পাবলিক সাইট থেকেও' : ''}। মূল ফাইলটি মিডিয়া লাইব্রেরিতে থেকে যাবে।</p>
      </Confirm>
    </Drawer>
  );
}

/* ---------- pick existing images ---------- */
type Asset = { id: string; url: string; name: string; credit: string };
function LibraryPick({ open, onClose, onPick, inGallery }: { open: boolean; onClose: () => void; onPick: (a: Asset[]) => Promise<void>; inGallery: Set<string> }) {
  const { api, id } = useTenant();
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Map<string, Asset>>(new Map());
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['tenant', id, 'media', 'image', page], enabled: open, queryFn: () => api.get<{ items: Asset[]; totalPages: number }>(`/media?kind=image&page=${page}&limit=24`) });
  const close = () => { setPicked(new Map()); onClose(); };
  return (
    <Dialog title="মিডিয়া লাইব্রেরি থেকে ছবি বাছুন" open={open} onClose={close} size="wide"
      footer={<><Button onClick={close}>বাতিল</Button><Button variant="accent" icon="plus" disabled={!picked.size} loading={busy} onClick={async () => { setBusy(true); try { await onPick([...picked.values()]); setPicked(new Map()); } finally { setBusy(false); } }}>{picked.size ? `${toBn(picked.size)}টি যোগ করুন` : 'ছবি বাছুন'}</Button></>}>
      {q.isLoading ? <div className="lib">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} h={130} r={12} />)}</div>
        : q.isError ? <EmptyState compact icon="alert" title="লোড হয়নি" text={errText(q.error)} />
        : !q.data?.items.length ? <EmptyState compact icon="media" title="লাইব্রেরিতে কোনো ছবি নেই" text="আগে ছবি আপলোড করুন।" />
        : <>
          <div className="lib ct-lib">
            {q.data.items.map((a) => {
              const used = inGallery.has(a.url), on = picked.has(a.id);
              return (
                <button key={a.id} type="button" aria-pressed={on} disabled={used} className={on ? 'on' : ''} aria-label={`${used ? 'গ্যালারিতে আছে' : on ? 'বাছাই করা' : 'বাছুন'}${a.name ? `: ${a.name}` : ''}`}
                  onClick={() => setPicked((m) => { const n = new Map(m); if (n.has(a.id)) n.delete(a.id); else n.set(a.id, a); return n; })}>
                  <img src={a.url} alt="" loading="lazy" />{on && <span className="ct-lib-tick"><Icon name="check" size={16} /></span>}{used && <span className="ct-lib-used">গ্যালারিতে আছে</span>}
                </button>
              );
            })}
          </div>
          <Pager page={page} totalPages={q.data.totalPages} onPage={setPage} />
        </>}
    </Dialog>
  );
}
