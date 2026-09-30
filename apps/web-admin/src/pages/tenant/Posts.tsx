import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { postDraftSchema, postInputSchema, postPatchSchema, POST_CATEGORIES, availablePostActions, type PostStatus } from '@jonoprotinidhi/shared';
import { ApiFail } from '../../api';
import { useTenant } from '../../tenant';
import {
  Button, CellMain, Card, Chips, DataTable, EmptyState, ErrorBox, Field, FormSection, Icon, Loading, PageHead, Pager, PillOf, ReasonDialog, SearchInput, Stepper, Timeline, useToast, useUnsavedGuard, fieldMessages,
  type Column,
} from '../../components';
import { RichEditor } from '../../components/RichEditor';
import { RichText } from '../../components/RichText';
import { ImagePicker, type Pic } from '../../components/ImagePicker';
import { POST_CATEGORY_LABEL, POST_STATUS_LABEL, bnAgo, bnDate, bnDateTime, toBn } from '../../format';

const STEPS = [{ key: 'draft', label: 'খসড়া' }, { key: 'review', label: 'অনুমোদনের অপেক্ষা' }, { key: 'published', label: 'প্রকাশিত' }];
const stepOf = (s?: string) => (s === 'published' ? 'published' : s === 'review' ? 'review' : 'draft');

/* ---------- list ---------- */
type Row = { _id: string; title: string; place?: string; category: string; eventDate: string; status: string; media?: Array<{ url: string }> };
export function PostsList() {
  const { api, id, can } = useTenant();
  const nav = useNavigate();
  const [status, setStatus] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['tenant', id, 'posts', status, q, page], queryFn: () => api.get<{ items: Row[]; total: number; totalPages: number }>(`/posts?page=${page}&limit=15${status ? `&status=${status}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`) });
  const chips = [{ value: '', label: 'সব' }, { value: 'draft', label: 'খসড়া' }, { value: 'review', label: 'অপেক্ষায়' }, { value: 'scheduled', label: 'নির্ধারিত' }, { value: 'published', label: 'প্রকাশিত' }, { value: 'rejected', label: 'ফেরত' }];
  const cols: Array<Column<Row>> = useMemo(() => [
    { key: 'title', header: 'শিরোনাম', primary: true, cell: (p) => <CellMain title={p.title} sub={p.place} to={p._id} thumb={p.media?.[0]?.url ?? null} icon="image" /> },
    { key: 'cat', header: 'বিষয়', cell: (p) => <span className="tag">{POST_CATEGORY_LABEL[p.category] ?? p.category}</span> },
    { key: 'date', header: 'তারিখ', nowrap: true, cell: (p) => bnDate(p.eventDate) },
    { key: 'status', header: 'অবস্থা', cell: (p) => <PillOf map={POST_STATUS_LABEL} k={p.status} /> },
  ], []);
  const filtered = !!(status || q);
  return (
    <>
      <PageHead kicker="পোস্ট ও কার্যক্রম" icon="posts" title="সব পোস্ট" sub="খসড়া → অনুমোদন → প্রকাশ। MP-র অনুমোদন ছাড়া কিছুই পাবলিক সাইটে যায় না।" actions={can('posts.create') && <Link className="btn btn-b" to="new"><Icon name="plus" />নতুন পোস্ট</Link>} />
      <div className="bar">
        <Chips label="অবস্থা" value={status} options={chips} onChange={(v) => { setStatus(v); setPage(1); }} />
        <SearchInput label="শিরোনামে খুঁজুন" value={q} onChange={(v) => { setQ(v); setPage(1); }} />
      </div>
      {query.isError ? <ErrorBox error={query.error} retry={() => query.refetch()} /> : (
        <DataTable caption="পোস্টের তালিকা" columns={cols} rows={query.data?.items ?? []} rowKey={(p) => p._id} loading={query.isLoading} onRowClick={(p) => nav(`/t/${id}/posts/${p._id}`)} rowLabel={(p) => p.title}
          empty={<div className="card"><EmptyState icon="posts" title={filtered ? 'এই ফিল্টারে কোনো পোস্ট নেই' : 'কোনো পোস্ট নেই'} text={filtered ? 'ফিল্টার বা খোঁজার শব্দ বদলে দেখুন।' : 'কার্যক্রমের প্রথম খবরটি লিখুন। MP অনুমোদন দিলে পাবলিক সাইটে যাবে।'} action={can('posts.create') && !filtered ? <Button variant="accent" icon="plus" to="new">নতুন পোস্ট লিখুন</Button> : undefined} /></div>} />
      )}
      {query.data && <Pager page={page} totalPages={query.data.totalPages} onPage={setPage} />}
    </>
  );
}

/* ---------- editor (create + edit) ---------- */
type Form = { title: string; summary: string; body: string; quote: string; category: string; upazila: string; place: string; eventDate: string; media: Pic[] };
const empty = (): Form => ({ title: '', summary: '', body: '', quote: '', category: 'dev', upazila: '', place: '', eventDate: new Date().toISOString().slice(0, 10), media: [] });

export function PostEditor() {
  const { postId } = useParams();
  const { api, id, can } = useTenant();
  const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast();
  const existing = useQuery({ queryKey: ['tenant', id, 'post', postId], enabled: !!postId, queryFn: () => api.get(`/posts/${postId}`) });
  const [f, setF] = useState<Form>(empty()); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState<number | undefined>();
  const [base, setBase] = useState(() => JSON.stringify(empty()));
  useEffect(() => {
    const p = existing.data; if (!p) return;
    setVersion(p.version);
    const next: Form = { title: p.title, summary: p.summary ?? '', body: p.body ?? '', quote: p.quote ?? '', category: p.category, upazila: p.upazila ?? '', place: p.place ?? '', eventDate: String(p.eventDate).slice(0, 10), media: (p.media ?? []).map((m: { url: string; credit?: string }) => ({ url: m.url, credit: m.credit ?? '' })) };
    setF(next); setBase(JSON.stringify(next));
  }, [existing.data]);
  const dirty = JSON.stringify(f) !== base;
  useUnsavedGuard(dirty && !busy);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  /** Untouched (empty) fields are omitted so a draft really needs only a title. When editing, body/quote/upazila/place
      may be cleared explicitly. (BUG-2026-013) */
  const payload = () => {
    const all: Record<string, unknown> = { title: f.title, summary: f.summary, body: f.body, quote: f.quote, category: f.category, upazila: f.upazila, place: f.place, eventDate: f.eventDate, media: f.media.map((m) => ({ url: m.url, caption: f.title.slice(0, 100), credit: m.credit })) };
    const clearable = postId ? ['body', 'quote', 'upazila', 'place'] : [];
    return Object.fromEntries(Object.entries(all).filter(([k, v]) => v !== '' || clearable.includes(k)));
  };

  const save = async (action: 'draft' | 'submit' | 'publish') => {
    setErrs({});
    const body = payload();
    // same schemas as the API: the form can only submit what the server will accept
    const v = (action === 'draft' ? (postId ? postPatchSchema : postDraftSchema) : postInputSchema).safeParse(body);
    if (!v.success) { const m: Record<string, string> = {}; for (const i of v.error.issues) m[String(i.path[0])] = m[String(i.path[0])] ?? i.message; setErrs(m); toast('ফর্মে কিছু ভুল আছে, লাল অংশ ঠিক করুন', 'bad'); return; }
    setBusy(true);
    try {
      let post = postId ? await api.patch(`/posts/${postId}`, { ...v.data, version }) : await api.post('/posts', v.data);
      if (action === 'submit') post = await api.post(`/posts/${post._id}/submit`);
      if (action === 'publish') post = await api.post(`/posts/${post._id}/approve`, { version: post.version });
      await qc.invalidateQueries({ queryKey: ['tenant', id] });
      setBase(JSON.stringify(f));
      toast(action === 'draft' ? 'খসড়া সংরক্ষণ হয়েছে' : action === 'submit' ? 'MP-র অনুমোদনের জন্য পাঠানো হয়েছে' : 'প্রকাশ হয়েছে', 'ok');
      nav(`../${post._id}`, { relative: 'path' });
    } catch (e) {
      setErrs(fieldMessages(e));
      toast(e instanceof ApiFail ? e.message : 'কিছু ভুল হয়েছে', 'bad');
    } finally { setBusy(false); }
  };

  if (postId && existing.isLoading) return <Loading />;
  if (postId && existing.isError) return <ErrorBox error={existing.error} />;
  const submitOnly = !can('posts.publish');
  const st = existing.data?.status as string | undefined;
  return (
    <>
      <PageHead kicker={postId ? 'এডিট' : 'নতুন পোস্ট'} title={postId ? 'পোস্ট এডিট করুন' : 'কার্যক্রমের খবর দিন'} sub={submitOnly ? 'পাঠালে MP অনুমোদন দিলে প্রকাশ হবে।' : 'আপনি সরাসরি প্রকাশ করতে পারবেন।'} back={{ to: postId ? `../${postId}` : '..', label: postId ? 'পোস্টে ফিরুন' : 'সব পোস্ট' }} />
      <form className="composer form" noValidate onSubmit={(e: FormEvent) => e.preventDefault()}>
        <div className="editor-grid">
          <div className="stack">
            <FormSection title="মূল তথ্য" description="শিরোনাম, বিষয় আর কোথায় কবে হয়েছে।" icon="file">
              <div className="field"><span className="lab">বিষয়</span>
                <div className="cat-pick" role="radiogroup" aria-label="বিষয়">
                  {POST_CATEGORIES.map((c) => <label key={c}><input type="radio" name="cat" value={c} checked={f.category === c} onChange={set('category')} /><span>{POST_CATEGORY_LABEL[c]}</span></label>)}
                </div>
              </div>
              <Field label="শিরোনাম" required error={errs.title}>{(p) => <input {...p} maxLength={120} value={f.title} onChange={set('title')} placeholder="যেমন: কাশবনে ১৫০ কৃষকের মাঝে বীজ বিতরণ" />}</Field>
              <div className="frow three">
                <Field label="তারিখ" error={errs.eventDate}>{(p) => <input {...p} type="date" value={f.eventDate} onChange={set('eventDate')} />}</Field>
                <Field label="উপজেলা">{(p) => <input {...p} maxLength={60} value={f.upazila} onChange={set('upazila')} placeholder="পুরো আসন হলে খালি রাখুন" />}</Field>
                <Field label="স্থান">{(p) => <input {...p} maxLength={80} value={f.place} onChange={set('place')} />}</Field>
              </div>
              <Field label="এক লাইনে সারাংশ" required error={errs.summary} hint={`কার্ডে আর হোমপেজে এটা দেখায় · ${toBn(f.summary.length)}/১৬০`}>{(p) => <textarea {...p} className="short" rows={3} maxLength={160} value={f.summary} onChange={set('summary')} />}</Field>
            </FormSection>
            <FormSection title="বিস্তারিত" description="পুরো খবর আর প্রয়োজনে একটি উক্তি।" icon="edit">
              <Field label="পুরো খবর" error={errs.body}>{(p) => <RichEditor id={p.id} describedBy={p['aria-describedby']} invalid={!!errs.body} value={f.body} onChange={(html) => setF((x) => ({ ...x, body: html }))} />}</Field>
              <Field label="উক্তি (ঐচ্ছিক)" error={errs.quote}>{(p) => <textarea {...p} className="short" rows={3} maxLength={300} value={f.quote} onChange={set('quote')} />}</Field>
            </FormSection>
            <FormSection title="ছবি" description="প্রথম ছবিটি প্রধান ছবি হিসেবে দেখায়। প্রতিটির ক্রেডিট লিখুন।" icon="image">
              <ImagePicker value={f.media} onChange={(m) => setF((x) => ({ ...x, media: m }))} error={errs.media} />
            </FormSection>
          </div>
          <aside className="editor-aside" aria-label="প্রকাশের অংশ">
            <Card className="publish" title="প্রকাশ" icon="send" sub={dirty ? 'অসংরক্ষিত পরিবর্তন আছে' : undefined}>
              {postId && <div className="status-steps"><Stepper vertical steps={STEPS} current={stepOf(st)} label="পোস্টের ধাপ" /></div>}
              <div className="acts">
                {submitOnly ? <button type="button" className="btn btn-b" disabled={busy} onClick={() => save('submit')}><Icon name="send" />অনুমোদনের জন্য পাঠান</button> : <button type="button" className="btn btn-b" disabled={busy} onClick={() => save('publish')}><Icon name="rocket" />প্রকাশ করুন</button>}
                <button type="button" className="btn btn-g" disabled={busy} onClick={() => save('draft')}><Icon name="save" />খসড়া রাখুন</button>
                <Link className="btn btn-q" to={postId ? `../${postId}` : '..'} relative="path">বাতিল</Link>
              </div>
            </Card>
            <Card title="লেখার পরামর্শ" icon="sparkles" flat>
              <ul className="tips"><li>শিরোনামে কী, কোথায়, কতজন: সংক্ষেপে লিখুন।</li><li>ছবির ক্রেডিট দিন, নইলে প্রকাশে আটকাতে পারে।</li><li>সারাংশ ১৬০ অক্ষরের মধ্যে, হোমপেজের কার্ডে সেটাই দেখায়।</li></ul>
            </Card>
          </aside>
        </div>
      </form>
    </>
  );
}

/* ---------- detail (workflow buttons come from the shared state machine) ---------- */
export function PostDetail() {
  const { postId = '' } = useParams();
  const { api, id, can } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const post = useQuery({ queryKey: ['tenant', id, 'post', postId], queryFn: () => api.get(`/posts/${postId}`) });
  const versions = useQuery({ queryKey: ['tenant', id, 'post', postId, 'versions'], queryFn: () => api.get<any[]>(`/posts/${postId}/versions`) });
  const run = useMutation({
    mutationFn: async (a: { path: string; body?: unknown; ok: string }) => { await api.post(`/posts/${postId}/${a.path}`, a.body); return a.ok; },
    onSuccess: async (ok) => { toast(ok, 'ok'); await qc.invalidateQueries({ queryKey: ['tenant', id] }); },
    onError: (e) => toast(e instanceof ApiFail ? e.message : 'কিছু ভুল হয়েছে', 'bad'),
  });
  if (post.isLoading) return <Loading />;
  if (post.isError) return <ErrorBox error={post.error} />;
  const p = post.data;
  const actions = availablePostActions(p.status as PostStatus);
  const publisher = can('posts.publish');
  return (
    <>
      <PageHead back={{ to: '..', label: 'সব পোস্ট' }} kicker={`${POST_CATEGORY_LABEL[p.category] ?? ''} · ${bnDate(p.eventDate)}`} title={p.title} sub={<><PillOf map={POST_STATUS_LABEL} k={p.status} /> &nbsp;{p.rejectReason ? `কারণ: ${p.rejectReason}` : ''}</>}
        actions={<>
          {(p.status === 'draft' || p.status === 'rejected' || p.status === 'review' || p.status === 'published') && can('posts.create') && <Link className="btn btn-g" to="edit"><Icon name="edit" />এডিট</Link>}
          {actions.includes('submit') && can('posts.create') && <button className="btn btn-b" onClick={() => run.mutate({ path: 'submit', ok: 'অনুমোদনের জন্য পাঠানো হয়েছে' })}>অনুমোদনের জন্য পাঠান</button>}
          {actions.includes('withdraw') && can('posts.create') && <button className="btn btn-g" onClick={() => run.mutate({ path: 'withdraw', ok: 'খসড়ায় ফেরানো হয়েছে' })}>ফিরিয়ে নিন</button>}
          {actions.includes('reject') && publisher && <button className="btn btn-d" onClick={() => setRejecting(true)}>ফেরত পাঠান</button>}
          {(actions.includes('approve')) && publisher && <button className="btn btn-b" onClick={() => run.mutate({ path: 'approve', body: { version: p.version }, ok: 'প্রকাশ হয়েছে, পাবলিক সাইটে দেখা যাচ্ছে' })}><Icon name="check" />অনুমোদন ও প্রকাশ</button>}
          {actions.includes('unpublish') && publisher && <button className="btn btn-d" onClick={() => run.mutate({ path: 'unpublish', ok: 'অপ্রকাশিত করা হয়েছে' })}>অপ্রকাশিত করুন</button>}
          {actions.includes('restore') && publisher && <button className="btn btn-g" onClick={() => run.mutate({ path: 'restore', ok: 'পুনরুদ্ধার হয়েছে, অনুমোদনের অপেক্ষায়' })}>পুনরুদ্ধার</button>}
        </>} />
      <div className="editor-grid">
        <div className="card prose">
          {p.media?.[0]?.url && <img className="post-hero" src={p.media[0].url} alt="" />}
          {p.media?.[0]?.credit && <p className="muted" style={{ fontSize: 13, margin: '6px 0 12px' }}>ছবি: {p.media[0].credit}</p>}
          <p style={{ fontSize: 18, fontWeight: 600, margin: '14px 0 14px', lineHeight: 1.7 }}>{p.summary}</p>
          {p.body && <RichText html={String(p.body)} />}
          {p.media?.length > 1 && <div className="pics" style={{ margin: '12px 0' }}>{p.media.slice(1).map((m: { url: string; credit?: string }, i: number) => <figure key={m.url + i} className="pic" style={{ margin: 0 }}><img src={m.url} alt="" loading="lazy" />{m.credit && <figcaption className="pic-b muted" style={{ fontSize: 13 }}>ছবি: {m.credit}</figcaption>}</figure>)}</div>}
          {p.quote && <blockquote className="pull"><p>{p.quote}</p></blockquote>}
        </div>
        <aside className="editor-aside">
          <Card title="ধাপ" icon="layers"><Stepper vertical steps={STEPS} current={stepOf(p.status)} label="পোস্টের ধাপ" /></Card>
          <Card title="সংস্করণের ইতিহাস" icon="clock">
            {versions.isLoading ? <p className="muted">লোড হচ্ছে…</p> : <Timeline label="সংস্করণের ইতিহাস" items={(versions.data ?? []).map((v) => ({ id: v._id, title: <b>{ACTION_LABEL[v.action] ?? v.action}</b>, meta: `${v.by?.name ?? ''}${v.by?.viaSuperAdmin ? ' (Super Admin)' : ''} · ${bnDateTime(v.at)}`, icon: 'check', tone: 'brass' as const }))} />}
          </Card>
        </aside>
      </div>
      <ReasonDialog title="ফেরত পাঠানোর কারণ" open={rejecting} onClose={() => setRejecting(false)} danger confirmLabel="ফেরত পাঠান" label="কী ঠিক করতে হবে"
        onConfirm={async (reason) => { await api.post(`/posts/${postId}/reject`, { reason }); toast('সম্পাদকের কাছে ফেরত গেছে', 'ok'); await qc.invalidateQueries({ queryKey: ['tenant', id] }); }} />
    </>
  );
}
const ACTION_LABEL: Record<string, string> = { create: 'খসড়া তৈরি', edit: 'এডিট', submit: 'অনুমোদনের জন্য পাঠানো', approve: 'অনুমোদন ও প্রকাশ', reject: 'ফেরত পাঠানো', schedule: 'সময় নির্ধারণ', unpublish: 'অপ্রকাশিত', restore: 'পুনরুদ্ধার', withdraw: 'ফিরিয়ে নেওয়া', publish: 'নির্ধারিত সময়ে প্রকাশ' };

/* ---------- approvals queue ---------- */
export function Approvals() {
  const { api, id } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const [rej, setRej] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['tenant', id, 'posts', 'review-queue'], queryFn: () => api.get<{ items: any[] }>('/posts?status=review&page=1&limit=50') });
  const approve = useMutation({
    mutationFn: (p: { _id: string; version: number }) => api.post(`/posts/${p._id}/approve`, { version: p.version }),
    onSuccess: async () => { toast('প্রকাশ হয়েছে', 'ok'); await qc.invalidateQueries({ queryKey: ['tenant', id] }); },
    onError: (e) => toast(e instanceof ApiFail ? e.message : 'কিছু ভুল হয়েছে', 'bad'),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} />;
  const items = q.data!.items;
  return (
    <>
      <PageHead kicker="অনুমোদন" icon="approvals" title={`অনুমোদনের অপেক্ষায় (${toBn(items.length)})`} sub="PR টিমের পাঠানো পোস্ট। অনুমোদন দিলেই পাবলিক সাইটে প্রকাশ হবে।" />
      {!items.length ? <div className="card"><EmptyState tone="ok" icon="checkAll" title="সব পোস্ট দেখা হয়ে গেছে" text="নতুন কিছু অপেক্ষায় নেই।" /></div> : (
        <div className="stack">
          {items.map((p) => (
            <article className="card" key={p._id}>
              <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                {p.media?.[0]?.url ? <img className="cell-thumb" style={{ width: 96, height: 72 }} src={p.media[0].url} alt="" /> : null}
                <div className="grow">
                  <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>{POST_CATEGORY_LABEL[p.category]} · {bnDate(p.eventDate)} · {bnAgo(p.updatedAt)}</p>
                  <h2 className="h2" style={{ marginTop: 2 }}>{p.title}</h2>
                  <p style={{ margin: '8px 0 16px', color: 'var(--muted)' }}>{p.summary}</p>
                  <div className="acts"><button className="btn btn-b" onClick={() => approve.mutate(p)}><Icon name="check" />অনুমোদন ও প্রকাশ</button><button className="btn btn-d" onClick={() => setRej(p._id)}>ফেরত পাঠান</button><Link className="btn btn-g" to={`../posts/${p._id}`}>পুরোটা পড়ুন</Link></div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <ReasonDialog title="ফেরত পাঠানোর কারণ" open={!!rej} onClose={() => setRej(null)} danger confirmLabel="ফেরত পাঠান" label="কী ঠিক করতে হবে"
        onConfirm={async (reason) => { await api.post(`/posts/${rej}/reject`, { reason }); toast('সম্পাদকের কাছে ফেরত গেছে', 'ok'); await qc.invalidateQueries({ queryKey: ['tenant', id] }); }} />
    </>
  );
}
