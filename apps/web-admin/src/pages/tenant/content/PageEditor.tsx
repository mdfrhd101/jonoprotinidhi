import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PAGE_KEYS, PAGE_LABELS, PAGE_SCHEMAS, type PageKey } from '@jonoprotinidhi/shared';
import { ApiFail } from '../../../api';
import { useTenant, publicPageUrl } from '../../../tenant';
import { Badge, Button, Card, Dialog, EmptyState, Icon, PageHead, SaveBar, Skeleton, Switch, useToast } from '../../../components';
import { bnAgo, bnDateTime, toBn } from '../../../format';
import { Confirm, PAGE_META, errText, issuesToErrors, useLeaveGuard } from './common';
import { FormProvider, Section, setAt } from './fields';
import { PAGE_FORMS } from './pageConfigs';

/* Editor for one site page (layout, home, profile, heroes, area, contact, complaint).
   Loads { draft, live, version }, edits the draft with a hand-written form, validates with the shared zod schema,
   saves the DRAFT (PUT, optimistic locking by version) and lets the owner publish (POST /publish). */

export type PageDoc = { key: PageKey; label: string; draft: any; live: any | null; status: 'empty' | 'draft' | 'published'; hasUnpublishedChanges: boolean; version: number; updatedAt: string | null; publishedAt: string | null };
const isKey = (k: string): k is PageKey => (PAGE_KEYS as readonly string[]).includes(k);

export default function PageEditor() {
  const { key = '' } = useParams();
  if (!isKey(key)) return <><PageHead title="পাতা পাওয়া যায়নি" back={{ to: '..', label: 'সব পাতা' }} /><div className="card"><EmptyState icon="alert" title="এই নামে কোনো পাতা নেই" action={<Button to="..">সব পাতা দেখুন</Button>} /></div></>;
  return <Editor key={key} pageKey={key} />;
}

function Editor({ pageKey }: { pageKey: PageKey }) {
  const { api, id, can, info } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const qk = ['tenant', id, 'page', pageKey];
  const q = useQuery({ queryKey: qk, queryFn: () => api.get<PageDoc>(`/pages/${pageKey}`) });
  const [form, setForm] = useState<any>(null);
  const [snap, setSnap] = useState('');
  const [validated, setValidated] = useState(false);
  const [serverErrs, setServerErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<false | 'save' | 'publish' | 'discard'>(false);
  const [conflict, setConflict] = useState<null | { publish: boolean }>(null);
  const [askDiscard, setAskDiscard] = useState(false);
  const [showDiff, setShowDiff] = useState(true);
  const version = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);
  const canPublish = can('content.publish');
  const meta = PAGE_META[pageKey];
  const sections = PAGE_FORMS[pageKey];

  const adopt = (d: PageDoc) => { setForm(d.draft); setSnap(JSON.stringify(d.draft)); version.current = d.version; setServerErrs({}); setValidated(false); };
  useEffect(() => { if (q.data && form === null) adopt(q.data); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = form !== null && JSON.stringify(form) !== snap;
  const guard = useLeaveGuard(dirty);
  const parsed = useMemo(() => (form ? PAGE_SCHEMAS[pageKey].safeParse(form) : null), [form, pageKey]);
  const errors = useMemo(() => ({ ...serverErrs, ...(validated && parsed && !parsed.success ? issuesToErrors(parsed.error.issues as never) : {}) }), [validated, parsed, serverErrs]);
  const nErr = Object.keys(errors).length;

  if (q.isLoading || (!form && !q.isError)) return <EditorSkeleton title={PAGE_LABELS[pageKey]} />;
  if (q.isError) return <><PageHead kicker="সাইটের পাতা" title={PAGE_LABELS[pageKey]} back={{ to: '..', label: 'সব পাতা' }} /><div className="card"><EmptyState icon="alert" title="পাতাটি লোড করা যায়নি" text={errText(q.error)} action={<Button icon="refresh" onClick={() => q.refetch()}>আবার চেষ্টা করুন</Button>} /></div></>;
  const doc = q.data!;

  const set = (path: string, v: unknown) => { setForm((f: any) => setAt(f, path, v)); if (serverErrs[path.split('.')[0]!]) setServerErrs((s) => { const n = { ...s }; delete n[path.split('.')[0]!]; return n; }); };

  const focusFirstError = () => requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>('.ct-editor [aria-invalid="true"], .ct-editor .ct-item.bad .ct-item-tg, .ct-editor .err');
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); if (el && 'focus' in el) el.focus({ preventScroll: true });
  });

  const run = async (publish: boolean, overwrite = false) => {
    setValidated(true);
    const v = PAGE_SCHEMAS[pageKey].safeParse(form);
    if (!v.success) { toast('কিছু ঘরে ভুল আছে, লাল চিহ্নিত ঘরগুলো ঠিক করুন', 'bad'); focusFirstError(); return; }
    setBusy(publish && !dirty ? 'publish' : 'save');
    try {
      if (overwrite) version.current = (await api.get<PageDoc>(`/pages/${pageKey}`)).version;
      let d = doc;
      if (dirty || overwrite) d = await api.put<PageDoc>(`/pages/${pageKey}`, { ...v.data, version: version.current });
      if (publish) d = await api.post<PageDoc>(`/pages/${pageKey}/publish`);
      qc.setQueryData(qk, d);
      adopt(d);
      await qc.invalidateQueries({ queryKey: ['tenant', id, 'pages'] });
      void qc.invalidateQueries({ queryKey: ['tenant', id, 'dashboard'] });
      toast(publish ? 'প্রকাশ হয়েছে, পাবলিক সাইটে এখন নতুন লেখা দেখা যাচ্ছে' : canPublish ? 'খসড়া সংরক্ষণ হয়েছে। প্রকাশ না করা পর্যন্ত সাইটে বদলাবে না' : 'খসড়া সংরক্ষণ হয়েছে। MP প্রকাশ করলে সাইটে দেখা যাবে', 'ok');
    } catch (e) {
      if (e instanceof ApiFail && e.code === 'VERSION_CONFLICT') { setConflict({ publish }); return; }
      if (e instanceof ApiFail && Object.keys(e.fieldErrors).length) setServerErrs(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, m]) => [k, m[0] ?? 'সঠিক মান দিন'])));
      if (e instanceof ApiFail && e.code === 'MEDIA_HOST_NOT_ALLOWED') setServerErrs({ portrait: e.message });
      toast(errText(e), 'bad');
      focusFirstError();
    } finally { setBusy(false); }
  };

  const reloadLatest = async () => {
    setConflict(null);
    const r = await q.refetch();
    if (r.data) { adopt(r.data); toast('সর্বশেষ সংস্করণ লোড হয়েছে', 'info'); }
  };
  const discardServerDraft = async () => {
    setBusy('discard');
    try {
      const d = await api.post<PageDoc>(`/pages/${pageKey}/discard`);
      qc.setQueryData(qk, d); adopt(d); setAskDiscard(false);
      await qc.invalidateQueries({ queryKey: ['tenant', id, 'pages'] });
      toast('অপ্রকাশিত খসড়া বাতিল হয়েছে, এখন লাইভ লেখাই দেখাচ্ছে', 'ok');
    } catch (e) { toast(errText(e), 'bad'); } finally { setBusy(false); }
  };

  const liveUrl = publicPageUrl(info.tenant.slug, meta.path);
  const draftState = dirty ? { tone: 'warn' as const, text: 'অসংরক্ষিত পরিবর্তন আছে' }
    : doc.hasUnpublishedChanges ? { tone: 'info' as const, text: doc.status === 'empty' ? 'এখনো কিছু লেখা হয়নি' : 'সংরক্ষিত, প্রকাশের অপেক্ষায়' }
    : { tone: 'ok' as const, text: 'লাইভ লেখার সঙ্গে হুবহু মিল' };

  return (
    <div className="ct-editor" ref={topRef}>
      <PageHead back={{ to: '..', label: 'সব পাতা' }} kicker="সাইটের পাতা" icon={meta.icon} title={PAGE_LABELS[pageKey]} sub={meta.desc}
        actions={<Button href={liveUrl} icon="external">লাইভ সাইটে দেখুন ↗</Button>} />
      {nErr > 0 && (
        <div className="note bad" role="alert"><Icon name="alert" /><span>{toBn(nErr)}টি ঘরে ভুল আছে। লাল চিহ্নিত ঘরগুলো ঠিক করে আবার সংরক্ষণ করুন।</span></div>
      )}
      <form className="editor-grid" noValidate onSubmit={(e) => { e.preventDefault(); void run(false); }}>
        <div className="stack ct-sections">
          <FormProvider value={{ form, live: doc.live, errors, showDiff, set }}>
            {sections.map((s) => <Section key={s.id} s={s} />)}
          </FormProvider>
          <div className={`ct-sb${dirty || (doc.hasUnpublishedChanges && doc.status !== 'empty') ? ' active' : ''}`}>
          <SaveBar dirty={dirty} busy={!!busy}
            status={!dirty && doc.hasUnpublishedChanges && doc.status !== 'empty' ? <><Icon name="clock" size={16} />সংরক্ষিত, {canPublish ? 'এখনো প্রকাশ করা হয়নি' : 'MP-র প্রকাশের অপেক্ষায়'}</> : undefined}
            onDiscard={() => { setForm(JSON.parse(snap)); setServerErrs({}); setValidated(false); toast('অসংরক্ষিত পরিবর্তন বাতিল হয়েছে', 'info'); }}
            saveLabel={canPublish ? 'সংরক্ষণ ও প্রকাশ' : 'খসড়া সংরক্ষণ'} saveIcon={canPublish ? 'rocket' : 'save'}
            onSave={() => void run(canPublish)}
            extra={canPublish ? <>
              {!dirty && doc.hasUnpublishedChanges && doc.status !== 'empty' && <Button variant="accent" icon="rocket" loading={busy === 'publish'} disabled={!!busy} onClick={() => void run(true)}>প্রকাশ করুন</Button>}
              <Button icon="save" disabled={!dirty || !!busy} onClick={() => void run(false)}>খসড়া সংরক্ষণ</Button>
            </> : undefined} />
          </div>
        </div>
        <aside className="editor-aside" aria-label="পাতার অবস্থা">
          <Card title="অবস্থা" icon="eye" className="ct-status">
            <dl className="ct-state">
              <div><dt>পাবলিক সাইটে এখন</dt>
                <dd>{doc.live ? <><Badge tone="ok" dot>প্রকাশিত সংস্করণ</Badge><small>{doc.publishedAt ? `${bnAgo(doc.publishedAt)} প্রকাশিত` : ''}</small></> : <><Badge tone="plain" dot>প্রকাশ হয়নি</Badge><small>সাইটে সাধারণ লেখা দেখাচ্ছে</small></>}</dd></div>
              <div><dt>আপনার খসড়া</dt>
                <dd><Badge tone={draftState.tone} dot>{draftState.text}</Badge>{doc.updatedAt && <small title={bnDateTime(doc.updatedAt)}>শেষ সংরক্ষণ {bnAgo(doc.updatedAt)}</small>}</dd></div>
            </dl>
            <div className="ct-diff-toggle"><Switch checked={showDiff} onChange={setShowDiff} label="প্রকাশিত লেখা থেকে ভিন্ন ঘর চিহ্নিত করুন" /><span>প্রকাশিত লেখা থেকে ভিন্ন ঘর চিহ্নিত করুন</span></div>
            {!canPublish && <p className="ct-small muted"><Icon name="info" size={15} /> আপনি খসড়া সংরক্ষণ করতে পারেন; পাবলিক সাইটে যাবে MP প্রকাশ করলে।</p>}
            {doc.hasUnpublishedChanges && doc.live && !dirty && <button type="button" className="link ct-small" onClick={() => setAskDiscard(true)}>অপ্রকাশিত খসড়া বাতিল করে লাইভ লেখায় ফিরুন</button>}
          </Card>
          {sections.length > 1 && (
            <Card title="এই পাতায়" icon="list" pad="sm" className="ct-toc" flat>
              <nav aria-label="পাতার অংশ"><ol>{sections.map((s) => <li key={s.id}><a href={`#sec-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{s.title}</a></li>)}</ol></nav>
            </Card>
          )}
        </aside>
      </form>
      {guard}
      <Dialog title="পাতাটি এর মধ্যে বদলে গেছে" open={!!conflict} onClose={() => setConflict(null)} size="sm"
        footer={<><Button onClick={() => void reloadLatest()}>সর্বশেষটি লোড করুন</Button><Button variant="accent" onClick={() => { const p = conflict?.publish ?? false; setConflict(null); void run(p, true); }}>আমার লেখা দিয়ে প্রতিস্থাপন</Button></>}>
        <p>আপনি সম্পাদনা করার সময় অন্য কেউ (বা অন্য ট্যাবে আপনি) এই পাতাটি সংরক্ষণ করেছেন। সর্বশেষটি লোড করলে আপনার অসংরক্ষিত পরিবর্তন হারাবে; প্রতিস্থাপন করলে অন্যের পরিবর্তন মুছে যাবে।</p>
      </Dialog>
      <Confirm open={askDiscard} title="অপ্রকাশিত খসড়া বাতিল করবেন?" confirmLabel="খসড়া বাতিল করুন" danger busy={busy === 'discard'} onClose={() => setAskDiscard(false)} onConfirm={() => void discardServerDraft()}>
        <p>সংরক্ষিত কিন্তু প্রকাশ না হওয়া সব পরিবর্তন মুছে যাবে, খসড়া আবার লাইভ লেখার মতো হবে।</p>
      </Confirm>
    </div>
  );
}

function EditorSkeleton({ title }: { title: string }) {
  return (
    <div role="status" aria-label="লোড হচ্ছে">
      <PageHead kicker="সাইটের পাতা" title={title} back={{ to: '..', label: 'সব পাতা' }} />
      <div className="editor-grid">
        <div className="stack">{[0, 1].map((i) => <div className="card" key={i}><Skeleton w="40%" h={22} /><div style={{ height: 18 }} /><Skeleton h={52} r={12} /><div style={{ height: 14 }} /><Skeleton h={120} r={12} /></div>)}</div>
        <div className="card"><Skeleton w="50%" h={20} /><div style={{ height: 14 }} /><Skeleton h={14} /><div style={{ height: 8 }} /><Skeleton h={14} w="70%" /></div>
      </div>
    </div>
  );
}
