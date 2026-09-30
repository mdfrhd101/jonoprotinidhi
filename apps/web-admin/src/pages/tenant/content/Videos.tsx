import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseYouTubeId, videoInputSchema, videoPatchSchema, VIDEO_UPLOAD_TYPES } from '@jonoshetu/shared';
import { ApiFail } from '../../../api';
import { useTenant, publicPageUrl } from '../../../tenant';
import { Badge, Button, Chips, Dialog, EmptyState, Field, Icon, PageHead, PillOf, SearchInput, Skeleton, Switch, Tabs, TabPanel, useToast } from '../../../components';
import { bnDate, toBn } from '../../../format';
import { CONTENT_STATUS, CharCount, Confirm, SingleImage, UploadBar, bnBytes, dayToIso, errText, fetchAll, isoDay, issuesToErrors, useReorder } from './common';
import { SliderDialog, type Slide } from './Slider';

/* Videos manager: YouTube links (instant preview) and own uploads (MP4/WebM, real progress), ordering, publishing and a
   preview slider that shows each video with its title the way the public site does. */

export type VItem = { id: string; title: string; description: string; date: string | null; kind: 'youtube' | 'upload'; youtubeId: string | null; mediaId: string | null; fileUrl: string | null; posterUrl: string; embedUrl: string | null; duration: string; order: number; featured: boolean; status: 'draft' | 'published'; updatedAt: string };
export const MAX_VIDEO_MB = 150;
export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const ytEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`;
const KIND_LABEL = { youtube: 'YouTube', upload: 'আপলোড' } as const;

/** Client-side check of a video file (the server checks again, including the real container type). */
export function checkVideoFile(f: File): string | null {
  const type = f.type || (/\.webm$/i.test(f.name) ? 'video/webm' : /\.mp4$/i.test(f.name) ? 'video/mp4' : '');
  if (!(VIDEO_UPLOAD_TYPES as readonly string[]).includes(type)) return 'শুধু MP4 বা WebM ভিডিও দেওয়া যায়';
  if (f.size > MAX_VIDEO_MB * 1024 * 1024) return `ভিডিও সর্বোচ্চ ${toBn(MAX_VIDEO_MB)} মেগাবাইট হতে পারে। বড় ভিডিও YouTube-এ তুলে লিংক দিন`;
  if (!f.size) return 'ফাইলটি খালি';
  return null;
}
const fmtDuration = (sec: number) => { if (!Number.isFinite(sec) || sec <= 0) return ''; const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return toBn(h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`); };

export default function Videos() {
  const { api, id, can, info } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['tenant', id, 'videos', 'all'], queryFn: () => fetchAll<VItem>(api, '/videos') });
  const items = q.data?.items ?? [];
  const canPublish = can('content.publish');
  const [status, setStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [search, setSearch] = useState('');
  const [dlg, setDlg] = useState<null | { item?: VItem }>(null);
  const [preview, setPreview] = useState<null | { start: number; drafts: boolean }>(null);
  const [del, setDel] = useState<VItem | null>(null);
  const [busy, setBusy] = useState('');
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const r = useReorder(items.map((i) => i.id));
  const ordered = r.order.map((x) => byId.get(x)).filter((x): x is VItem => !!x);
  const s = search.trim().toLowerCase();
  const filtering = status !== 'all' || !!s;
  const shown = ordered.filter((v) => (status === 'all' || v.status === status) && (!s || `${v.title} ${v.description}`.toLowerCase().includes(s)));
  const counts = { all: items.length, published: items.filter((i) => i.status === 'published').length, draft: items.filter((i) => i.status === 'draft').length };

  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['tenant', id, 'videos'] }); void qc.invalidateQueries({ queryKey: ['tenant', id, 'media'] }); void qc.invalidateQueries({ queryKey: ['tenant', id, 'dashboard'] }); };
  const act = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label);
    try { await fn(); await refresh(); toast(ok, 'ok'); return true; } catch (e) { toast(errText(e), 'bad'); return false; } finally { setBusy(''); }
  };

  const slidesFor = (drafts: boolean): Slide[] => ordered.filter((v) => drafts || v.status === 'published').map((v) => ({
    key: v.id, title: v.title, thumb: v.posterUrl || (v.youtubeId ? ytThumb(v.youtubeId) : null),
    sub: <>{[v.date && bnDate(v.date), v.duration && `দৈর্ঘ্য ${v.duration}`].filter(Boolean).join(' · ')}{v.description && <p className="ct-slide-desc">{v.description}</p>}</>,
    badge: <span className="row">{v.status === 'draft' && <PillOf map={CONTENT_STATUS} k="draft" />}<Badge tone={v.kind === 'youtube' ? 'bad' : 'info'} icon={v.kind === 'youtube' ? 'play' : 'upload'}>{KIND_LABEL[v.kind]}</Badge></span>,
    stage: <VideoStage v={v} />,
  }));

  return (
    <>
      <PageHead kicker="কনটেন্ট" icon="video" title="ভিডিও" sub="YouTube লিংক দিন বা নিজের ভিডিও আপলোড করুন। প্রকাশিত ভিডিও পাবলিক সাইটের ভিডিও পাতা আর হোমপেজের স্লাইডারে দেখায়।"
        actions={<>
          <Button icon="play" disabled={!counts.published} onClick={() => setPreview({ start: 0, drafts: false })}>স্লাইডার প্রিভিউ</Button>
          <Button variant="accent" icon="plus" onClick={() => setDlg({})}>নতুন ভিডিও</Button>
        </>} />
      <div className="bar">
        <Chips label="অবস্থা" value={status} onChange={setStatus} options={[{ value: 'all', label: 'সব', count: counts.all }, { value: 'published', label: 'প্রকাশিত', count: counts.published }, { value: 'draft', label: 'খসড়া', count: counts.draft }]} />
        <SearchInput value={search} onChange={setSearch} label="ভিডিও খুঁজুন" placeholder="শিরোনাম বা বিবরণ" />
      </div>
      {r.dirty && (
        <div className="savebar dirty ct-orderbar" role="region" aria-label="ক্রম">
          <span className="savebar-s"><i className="dotp" />ভিডিওর নতুন ক্রম এখনো সংরক্ষণ হয়নি</span>
          <span className="savebar-a"><Button onClick={r.reset}>আগের ক্রমে ফিরুন</Button><Button variant="accent" icon="save" loading={busy === 'order'} onClick={() => void act('order', () => api.post('/videos/reorder', { ids: r.order }), 'নতুন ক্রম সংরক্ষণ হয়েছে')}>ক্রম সংরক্ষণ</Button></span>
        </div>
      )}
      {q.isLoading ? (
        <ul className="ct-vgrid" aria-label="লোড হচ্ছে">{Array.from({ length: 6 }, (_, i) => <li className="card ct-vcard" key={i}><Skeleton h={180} r={0} /><div style={{ padding: 14 }}><Skeleton w="80%" /><div style={{ height: 8 }} /><Skeleton w="40%" h={12} /></div></li>)}</ul>
      ) : q.isError ? (
        <div className="card"><EmptyState icon="alert" title="ভিডিও লোড হয়নি" text={errText(q.error)} action={<Button icon="refresh" onClick={() => q.refetch()}>আবার চেষ্টা করুন</Button>} /></div>
      ) : !items.length ? (
        <div className="card"><EmptyState icon="video" title="এখনো কোনো ভিডিও নেই" text="সংসদের বক্তব্য, গণশুনানি বা উদ্বোধনের ভিডিও: YouTube লিংক দিন বা ফাইল আপলোড করুন।" action={<Button variant="accent" icon="plus" onClick={() => setDlg({})}>প্রথম ভিডিও যোগ করুন</Button>} /></div>
      ) : !shown.length ? (
        <div className="card"><EmptyState compact icon="search" title="এই ফিল্টারে কোনো ভিডিও নেই" action={<Button onClick={() => { setStatus('all'); setSearch(''); }}>ফিল্টার সরান</Button>} /></div>
      ) : (
        <>
          <p className="muted ct-small ct-hint">{filtering ? <><Icon name="info" size={15} /> ক্রম বদলাতে ফিল্টার ও খোঁজ সরান।</> : <><Icon name="grip" size={15} /> টেনে এনে বা তীর বোতাম দিয়ে ক্রম বদলান। প্রথমটি সাইটে আগে দেখায়।</>}</p>
          <ul className="ct-vgrid" aria-label="ভিডিওর তালিকা">
            {shown.map((v) => {
              const idx = r.order.indexOf(v.id);
              const poster = v.posterUrl || (v.youtubeId ? ytThumb(v.youtubeId) : '');
              const lockedDelete = v.status === 'published' && !canPublish;
              return (
                <li key={v.id} className="card ct-vcard" {...(!filtering ? r.dnd(v.id) : {})}>
                  <button type="button" className="ct-vposter" aria-label={`প্রিভিউ: ${v.title}`} onClick={() => setPreview({ start: Math.max(0, ordered.filter((x) => x.status === 'published' || v.status === 'draft').findIndex((x) => x.id === v.id)), drafts: v.status === 'draft' })}>
                    {poster ? <img src={poster} alt="" loading="lazy" /> : v.fileUrl ? <video src={`${v.fileUrl}#t=0.5`} preload="metadata" muted playsInline aria-hidden /> : <span className="ct-vph"><Icon name="video" size={28} /></span>}
                    <span className="ct-vplay" aria-hidden><Icon name="play" size={22} /></span>
                    {v.duration && <span className="ct-vdur num">{v.duration}</span>}
                    <span className="ct-vkind"><Badge tone={v.kind === 'youtube' ? 'bad' : 'info'} icon={v.kind === 'youtube' ? 'play' : 'upload'}>{KIND_LABEL[v.kind]}</Badge></span>
                  </button>
                  <div className="ct-vbody">
                    <div className="row" style={{ gap: 8 }}><PillOf map={CONTENT_STATUS} k={v.status} />{v.featured && <Badge tone="brass" icon="star">বাছাই করা</Badge>}</div>
                    <b className="ct-vtitle">{v.title}</b>
                    <small className="muted">{v.date ? bnDate(v.date) : 'তারিখ নেই'}</small>
                  </div>
                  <div className="ct-gact">
                    {!filtering && <>
                      <span className="ct-grip" aria-hidden title="টেনে সরান"><Icon name="grip" size={16} /></span>
                      <button type="button" className="icon-btn" aria-label={`আগে আনুন: ${v.title}`} disabled={idx <= 0} onClick={() => r.move(v.id, -1)}><Icon name="chevronLeft" size={16} /></button>
                      <button type="button" className="icon-btn" aria-label={`পরে নিন: ${v.title}`} disabled={idx >= r.order.length - 1} onClick={() => r.move(v.id, 1)}><Icon name="chevronRight" size={16} /></button>
                    </>}
                    <span className="grow" />
                    {canPublish && (v.status === 'draft'
                      ? <Button size="sm" variant="accent" icon="rocket" loading={busy === `p-${v.id}`} onClick={() => void act(`p-${v.id}`, () => api.post(`/videos/${v.id}/publish`), 'ভিডিও প্রকাশ হয়েছে')} aria-label={`প্রকাশ করুন: ${v.title}`}>প্রকাশ</Button>
                      : <Button size="sm" variant="quiet" icon="eyeOff" loading={busy === `u-${v.id}`} onClick={() => void act(`u-${v.id}`, () => api.post(`/videos/${v.id}/unpublish`), 'ভিডিও অপ্রকাশিত করা হয়েছে')} aria-label={`অপ্রকাশ করুন: ${v.title}`}>অপ্রকাশ</Button>)}
                    <Button size="sm" variant="quiet" icon="edit" onClick={() => setDlg({ item: v })} aria-label={`সম্পাদনা করুন: ${v.title}`}>সম্পাদনা</Button>
                    <button type="button" className="icon-btn ct-del" aria-label={`মুছুন: ${v.title}`} disabled={lockedDelete} title={lockedDelete ? 'প্রকাশিত ভিডিও মুছতে MP-র অনুমতি লাগে' : 'মুছুন'} onClick={() => setDel(v)}><Icon name="trash" size={16} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
          {!canPublish && counts.published > 0 && <p className="muted ct-small"><Icon name="lock" size={15} /> প্রকাশিত ভিডিও মুছতে বা অপ্রকাশ করতে MP-র অনুমতি লাগে। প্রকাশিত ভিডিও বদলালে সেটি আবার খসড়া হয়।</p>}
        </>
      )}
      {dlg && <VideoDialog item={dlg.item} nextOrder={items.reduce((m, i) => Math.max(m, i.order), -1) + 1} onClose={() => setDlg(null)} onSaved={refresh} />}
      <Confirm open={!!del} title="ভিডিওটি মুছবেন?" danger confirmLabel="মুছে ফেলুন" busy={busy === 'del'} onClose={() => setDel(null)}
        onConfirm={async () => { const v = del!; const ok = await act('del', () => api.del(`/videos/${v.id}`), 'ভিডিও মুছে ফেলা হয়েছে'); if (ok) setDel(null); }}>
        <p>"{del?.title}" ভিডিও তালিকা{del?.status === 'published' ? ' ও পাবলিক সাইট' : ''} থেকে সরে যাবে।{del?.kind === 'upload' ? ' আপলোড করা ফাইলটি মিডিয়া লাইব্রেরিতে থেকে যাবে, চাইলে সেখান থেকে মুছতে পারবেন।' : ''}</p>
      </Confirm>
      <SliderDialog open={!!preview} onClose={() => setPreview(null)} title="ভিডিও: পাবলিক সাইটে যেমন দেখাবে" slides={slidesFor(!!preview?.drafts)} start={preview?.start}
        note={<span className="ct-prev-note"><Switch checked={!!preview?.drafts} onChange={(v) => setPreview({ start: 0, drafts: v })} label="খসড়া ভিডিওও দেখান" /> খসড়া ভিডিওও দেখান · <a href={publicPageUrl(info.tenant.slug, '/videos')} target="_blank" rel="noopener noreferrer">লাইভ ভিডিও পাতা ↗</a></span>} />
    </>
  );
}

/** What plays in the preview: the YouTube player (privacy-enhanced domain) or the uploaded file. */
export function VideoStage({ v }: { v: Pick<VItem, 'kind' | 'youtubeId' | 'fileUrl' | 'posterUrl' | 'title'> }) {
  if (v.kind === 'youtube' && v.youtubeId) return <iframe className="ct-frame" src={ytEmbed(v.youtubeId)} title={v.title} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />;
  if (v.fileUrl) return <video className="ct-frame" src={v.fileUrl} poster={v.posterUrl || undefined} controls preload="metadata" playsInline aria-label={v.title} />;
  return <span className="ct-vph"><Icon name="video" size={36} /></span>;
}

/* ---------- new / edit dialog ---------- */
type Uploaded = { mediaId: string; url: string; name: string; bytes?: number; fresh: boolean };

export function VideoDialog({ item, nextOrder = 0, onClose, onSaved }: { item?: VItem; nextOrder?: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const { api, can } = useTenant();
  const toast = useToast();
  const canPublish = can('content.publish');
  const [kind, setKind] = useState<'youtube' | 'upload'>(item?.kind ?? 'youtube');
  const [yt, setYt] = useState(item?.youtubeId ? `https://www.youtube.com/watch?v=${item.youtubeId}` : '');
  const [up, setUp] = useState<Uploaded | null>(item?.kind === 'upload' && item.mediaId && item.fileUrl ? { mediaId: item.mediaId, url: item.fileUrl, name: '', fresh: false } : null);
  const [prog, setProg] = useState<null | { name: string; p: number; bad?: string }>(null);
  const abort = useRef<AbortController | null>(null);
  const init = { title: item?.title ?? '', description: item?.description ?? '', date: isoDay(item?.date), duration: item?.duration ?? '', featured: item?.featured ?? false, posterUrl: item?.kind === 'upload' || (item?.posterUrl && !item.posterUrl.includes('i.ytimg.com')) ? item?.posterUrl ?? '' : '' };
  const [f, setF] = useState(init);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const saved = useRef(false);
  const ytId = yt.trim() ? parseYouTubeId(yt) : null;
  const ytBad = !!yt.trim() && !ytId;

  // leaving without saving: a file uploaded in this dialog would be an orphan in the media library, remove it
  const cleanup = async (u: Uploaded | null) => { if (u?.fresh && !saved.current) { try { await api.del(`/media/${u.mediaId}`); } catch { /* still listed in the library */ } } };
  const close = () => { abort.current?.abort(); void cleanup(up); onClose(); };
  useEffect(() => () => abort.current?.abort(), []);

  const upload = async (file: File) => {
    const bad = checkVideoFile(file);
    if (bad) { setErrs((e) => ({ ...e, mediaId: bad })); toast(bad, 'bad'); return; }
    setErrs((e) => { const n = { ...e }; delete n.mediaId; return n; });
    const prev = up;
    abort.current = new AbortController();
    setProg({ name: file.name, p: 0 });
    try {
      const m = await api.uploadProgress<{ id: string; url: string; name: string; bytes: number }>(`/media/video?name=${encodeURIComponent(file.name.slice(0, 100))}`, file, (l, t) => setProg({ name: file.name, p: t ? l / t : 0 }), abort.current.signal);
      setUp({ mediaId: m.id, url: m.url, name: m.name || file.name, bytes: m.bytes, fresh: true });
      setProg(null);
      if (!f.title.trim()) setF((x) => ({ ...x, title: file.name.replace(/\.(mp4|webm)$/i, '').replace(/[-_]+/g, ' ').slice(0, 160) }));
      void cleanup(prev);
    } catch (e) {
      if (e instanceof ApiFail && e.code === 'ABORTED') { setProg(null); toast('আপলোড বাতিল হয়েছে', 'info'); return; }
      setProg({ name: file.name, p: 0, bad: errText(e) });
      toast(errText(e), 'bad');
    }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const file = e.dataTransfer.files?.[0]; if (file) void upload(file); };

  const save = async (publish: boolean) => {
    const common = { title: f.title, description: f.description, duration: f.duration, featured: f.featured, posterUrl: f.posterUrl, ...(f.date ? { date: dayToIso(f.date) } : {}) };
    const src = kind === 'youtube' ? { kind, youtube: yt.trim() } : { kind, ...(up ? { mediaId: up.mediaId } : {}) };
    let body: Record<string, unknown>;
    if (!item) {
      body = { ...common, ...src, order: nextOrder };
      const v = videoInputSchema.safeParse(body);
      if (!v.success) { setErrs(issuesToErrors(v.error.issues as never)); return; }
    } else {
      const changedSrc = kind !== item.kind || (kind === 'youtube' ? ytId !== item.youtubeId : up?.mediaId !== item.mediaId);
      body = { ...common, ...(changedSrc ? src : {}) };
      if (kind === 'youtube' && !ytId) { setErrs({ youtube: 'সঠিক YouTube লিংক দিন' }); return; }
      if (kind === 'upload' && !up) { setErrs({ mediaId: 'ভিডিও ফাইল আপলোড করুন' }); return; }
      const v = videoPatchSchema.safeParse(body);
      if (!v.success) { setErrs(issuesToErrors(v.error.issues as never)); return; }
    }
    setErrs({}); setBusy(publish ? 'pub' : 'save');
    try {
      const qs = publish ? '?publish=1' : '';
      if (item) await api.patch(`/videos/${item.id}${qs}`, body); else await api.post(`/videos${qs}`, body);
      saved.current = true;
      await onSaved();
      toast(publish ? 'ভিডিও সংরক্ষণ ও প্রকাশ হয়েছে' : item?.status === 'published' && !canPublish ? 'সংরক্ষণ হয়েছে; ভিডিওটি আবার খসড়া হলো, MP প্রকাশ করলে সাইটে ফিরবে' : item ? 'সংরক্ষণ হয়েছে' : `ভিডিও যোগ হয়েছে (খসড়া)${canPublish ? '' : '। MP প্রকাশ করলে সাইটে দেখাবে'}`, 'ok');
      onClose();
    } catch (e) {
      if (e instanceof ApiFail) setErrs(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, m]) => [k, m[0] ?? ''])));
      toast(errText(e), 'bad');
    } finally { setBusy(''); }
  };
  const setv = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const uploading = !!prog && !prog.bad;

  return (
    <Dialog title={item ? 'ভিডিও সম্পাদনা' : 'নতুন ভিডিও'} open onClose={close} size="wide"
      footer={<>
        <Button onClick={close}>বাতিল</Button>
        <Button variant={canPublish ? 'ghost' : 'accent'} icon="save" loading={busy === 'save'} disabled={!!busy || uploading} onClick={() => void save(false)}>{item ? 'সংরক্ষণ' : 'খসড়া হিসেবে রাখুন'}</Button>
        {canPublish && <Button variant="accent" icon="rocket" loading={busy === 'pub'} disabled={!!busy || uploading} onClick={() => void save(true)}>{item ? 'সংরক্ষণ ও প্রকাশ' : 'যোগ ও প্রকাশ'}</Button>}
      </>}>
      <div className="ct-vdlg">
        <Tabs base="vkind" label="ভিডিওর উৎস" value={kind} onChange={(k) => { setKind(k); setErrs({}); }} variant="pill"
          tabs={[{ key: 'youtube', label: 'YouTube লিংক', icon: 'link' }, { key: 'upload', label: 'ফাইল আপলোড', icon: 'upload' }]} />
        <TabPanel base="vkind" tab="youtube" value={kind}>
          <div className="form">
            <Field label="YouTube লিংক" required error={errs.youtube ?? (ytBad ? 'এটি সঠিক YouTube লিংক নয়। ভিডিওর পাতার ঠিকানা বা শেয়ার লিংক দিন' : undefined)} hint="youtube.com/watch?v=…, youtu.be/…, shorts বা live লিংক, সবই চলে">
              {(p) => <input {...p} type="url" inputMode="url" value={yt} maxLength={300} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => setYt(e.target.value)} onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t) { e.preventDefault(); setYt(t.trim()); } }} />}
            </Field>
            {ytId ? (
              <div className="ct-ytprev">
                <div className="ct-ytframe"><iframe src={ytEmbed(ytId)} title="YouTube প্রিভিউ" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div>
                <div className="ct-ytmeta"><img src={ytThumb(ytId)} alt="YouTube থাম্বনেইল" /><div><Badge tone="ok" icon="checkCircle">লিংক ঠিক আছে</Badge><small className="muted">ভিডিও আইডি: <code>{ytId}</code></small><small className="muted">পোস্টার না দিলে এই থাম্বনেইলটি দেখাবে।</small></div></div>
              </div>
            ) : !ytBad && <div className="ct-ytempty"><Icon name="play" size={28} /><span>লিংক দিলে এখানে ভিডিওটি দেখা যাবে</span></div>}
          </div>
        </TabPanel>
        <TabPanel base="vkind" tab="upload" value={kind}>
          <div className="form">
            {up && !uploading ? (
              <div className="ct-upprev">
                <video src={up.url} controls preload="metadata" playsInline aria-label="আপলোড করা ভিডিওর প্রিভিউ" onLoadedMetadata={(e) => { const d = fmtDuration(e.currentTarget.duration); if (d && !f.duration) setF((x) => ({ ...x, duration: d })); }} />
                <div className="row"><Badge tone="ok" icon="checkCircle">{up.fresh ? 'আপলোড সম্পন্ন' : 'বর্তমান ফাইল'}</Badge><span className="muted ct-small">{[up.name, up.bytes ? bnBytes(up.bytes) : ''].filter(Boolean).join(' · ')}</span><span className="grow" /><Button size="sm" icon="refresh" onClick={() => fileInput.current?.click()}>অন্য ফাইল দিন</Button></div>
              </div>
            ) : prog ? (
              <UploadBar label={prog.bad ? `${prog.name}: ${prog.bad}` : prog.name} value={prog.p} state={prog.bad ? 'bad' : 'up'} onCancel={() => abort.current?.abort()} />
            ) : null}
            {(!up || prog?.bad) && !uploading && (
              <div className={`drop${over ? ' over' : ''}`} role="button" tabIndex={0} aria-label="ভিডিও ফাইল আপলোড করুন" onClick={() => fileInput.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click(); } }}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
                <Icon name="video" size={26} />
                <strong>MP4 বা WebM ভিডিও এখানে টেনে আনুন, বা ক্লিক করে বাছুন</strong>
                <small>সর্বোচ্চ {toBn(MAX_VIDEO_MB)} মেগাবাইট · বড় ভিডিও YouTube-এ তুলে লিংক দেওয়াই ভালো</small>
              </div>
            )}
            {errs.mediaId && <p className="err" role="alert">{errs.mediaId}</p>}
            <input ref={fileInput} type="file" hidden accept="video/mp4,video/webm,.mp4,.webm" aria-label="ভিডিও ফাইল" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file); }} />
          </div>
        </TabPanel>

        <div className="form ct-vfields">
          <Field label="শিরোনাম" required error={errs.title}>{(p) => <><input {...p} maxLength={160} value={f.title} onChange={setv('title')} placeholder="যেমন: সংসদে বক্তব্য: চরাঞ্চলের স্বাস্থ্যসেবা" /><div className="ct-meta"><span /><CharCount n={f.title.length} max={160} /></div></>}</Field>
          <Field label="বিবরণ" error={errs.description}>{(p) => <><textarea {...p} className="short" rows={3} maxLength={600} value={f.description} onChange={setv('description')} /><div className="ct-meta"><span /><CharCount n={f.description.length} max={600} /></div></>}</Field>
          <div className="frow three">
            <Field label="তারিখ" error={errs.date}>{(p) => <input {...p} type="date" value={f.date} onChange={setv('date')} />}</Field>
            <Field label="দৈর্ঘ্য" error={errs.duration} hint="যেমন ১২:৩৪">{(p) => <input {...p} maxLength={20} value={f.duration} onChange={setv('duration')} />}</Field>
            <div className="ct-bool ct-bool-pad"><Switch checked={f.featured} onChange={(v) => setF((x) => ({ ...x, featured: v }))} label="বাছাই করা ভিডিও" /><div><b>বাছাই করা</b><small className="muted">হোমপেজে দেখায়</small></div></div>
          </div>
          <div className="field"><span className="lab">পোস্টার ছবি (ঐচ্ছিক)</span>
            <p className="hint">{kind === 'youtube' ? 'না দিলে YouTube-এর থাম্বনেইল দেখাবে।' : 'ভিডিও চালুর আগে যে ছবি দেখাবে।'}</p>
            <SingleImage url={f.posterUrl} label="পোস্টার" error={errs.posterUrl} onChange={(u) => setF((x) => ({ ...x, posterUrl: u }))} />
          </div>
          {item?.status === 'published' && !canPublish && <p className="note info ct-small"><Icon name="info" />প্রকাশিত ভিডিও বদলালে এটি আবার খসড়া হবে এবং MP আবার প্রকাশ না করা পর্যন্ত সাইটে দেখাবে না।</p>}
        </div>
      </div>
    </Dialog>
  );
}
