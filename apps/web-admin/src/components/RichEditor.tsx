import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { plainTextLength, toBn } from '@jonoprotinidhi/shared';

/* Rich-text editor (Tiptap, MIT licence, built on ProseMirror). It only offers what the public site can render:
   bold, italic, underline, two heading levels, lists, quote and links. The server re-sanitises everything, so this
   component is a convenience, not a security boundary. Old plain-text bodies are shown as paragraphs. */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const looksLikeHtml = (s: string) => /<\/?(p|h[1-6]|ul|ol|li|blockquote|strong|em|b|i|u|a|br)\b/i.test(s);
/** Existing bodies may be plain text with blank lines between paragraphs. */
export const toEditorHtml = (v: string) =>
  !v ? '' : looksLikeHtml(v) ? v : v.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
const isEmptyDoc = (html: string) => html === '<p></p>' || html === '';
const safeHref = (u: string) => /^(https?:\/\/|mailto:|tel:)/i.test(u.trim());

type Props = { id?: string; value: string; onChange: (html: string) => void; maxText?: number; placeholder?: string; invalid?: boolean; describedBy?: string };

export function RichEditor({ id, value, onChange, maxText = 8000, placeholder = 'এখানে পুরো খবর লিখুন…', invalid, describedBy }: Props) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, horizontalRule: false, strike: false, link: { openOnClick: false, autolink: false } })],
    content: toEditorHtml(value),
    editorProps: {
      attributes: {
        ...(id ? { id } : {}), role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'পুরো খবর',
        ...(describedBy ? { 'aria-describedby': describedBy } : {}), ...(invalid ? { 'aria-invalid': 'true' } : {}), 'data-placeholder': placeholder,
      },
    },
    onUpdate: ({ editor: e }) => { const h = e.getHTML(); onChange(isEmptyDoc(h) ? '' : h); },
  });

  // an existing post arrives after the editor was created: load it, but never fight the user's typing
  useEffect(() => {
    if (!editor) return;
    const cur = editor.getHTML();
    if ((isEmptyDoc(cur) ? '' : cur) !== value) editor.commands.setContent(toEditorHtml(value), { emitUpdate: false });
  }, [value, editor]);

  if (!editor) return <div className="rte" aria-busy="true" />;
  const count = plainTextLength(value);
  const btn = (label: string, title: string, active: boolean, run: () => void, disabled = false) => (
    <button type="button" aria-label={title} title={title} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>{label}</button>
  );
  const c = () => editor.chain().focus();
  const openLink = () => { setHref(editor.getAttributes('link').href ?? ''); setLinkErr(''); setLinkOpen(true); };
  const applyLink = () => {
    const u = href.trim();
    if (!u) { c().unsetLink().run(); setLinkOpen(false); return; }
    if (!safeHref(u)) { setLinkErr('লিংক https:// দিয়ে শুরু করুন (ইমেইল হলে mailto:, ফোন হলে tel:)'); return; }
    c().extendMarkRange('link').setLink({ href: u }).run();
    setLinkOpen(false);
  };
  return (
    <div>
      <div className="rte" data-invalid={invalid ? 'true' : undefined}>
        <div className="rte-bar" role="toolbar" aria-label="লেখা সাজানোর টুল">
          {btn('B', 'মোটা', editor.isActive('bold'), () => c().toggleBold().run())}
          {btn('I', 'বাঁকা', editor.isActive('italic'), () => c().toggleItalic().run())}
          {btn('U', 'নিচে দাগ', editor.isActive('underline'), () => c().toggleUnderline().run())}
          <span className="sep" />
          {btn('বড় হেডিং', 'বড় হেডিং', editor.isActive('heading', { level: 2 }), () => c().toggleHeading({ level: 2 }).run())}
          {btn('ছোট হেডিং', 'ছোট হেডিং', editor.isActive('heading', { level: 3 }), () => c().toggleHeading({ level: 3 }).run())}
          <span className="sep" />
          {btn('• তালিকা', 'বুলেট তালিকা', editor.isActive('bulletList'), () => c().toggleBulletList().run())}
          {btn('১. তালিকা', 'নম্বর তালিকা', editor.isActive('orderedList'), () => c().toggleOrderedList().run())}
          {btn('❝ উদ্ধৃতি', 'উদ্ধৃতি', editor.isActive('blockquote'), () => c().toggleBlockquote().run())}
          {btn('লিংক', 'লিংক যোগ করুন', editor.isActive('link'), openLink)}
          <span className="sep" />
          {btn('↶', 'আগের অবস্থায় ফিরুন', false, () => c().undo().run(), !editor.can().undo())}
          {btn('↷', 'আবার করুন', false, () => c().redo().run(), !editor.can().redo())}
        </div>
        {linkOpen && (
          <div className="rte-link">
            <input type="url" aria-label="লিংকের ঠিকানা" placeholder="https://…" value={href} autoFocus onChange={(e) => setHref(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } if (e.key === 'Escape') setLinkOpen(false); }} />
            <button type="button" className="btn btn-p btn-s" onClick={applyLink}>ঠিক আছে</button>
            <button type="button" className="btn btn-g btn-s" onClick={() => setLinkOpen(false)}>বাতিল</button>
            {linkErr && <span className="err" role="alert" style={{ flexBasis: '100%' }}>{linkErr}</span>}
          </div>
        )}
        <div className="rte-body"><EditorContent editor={editor} /></div>
      </div>
      <p className="hint" style={{ margin: '6px 0 0' }} aria-live="polite">{toBn(count)}/{toBn(maxText)} অক্ষর{count > maxText ? ' · সীমা ছাড়িয়েছে' : ''}</p>
    </div>
  );
}
