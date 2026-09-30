import DOMPurify from 'dompurify';
import { toEditorHtml } from './RichEditor';

/* Read-only view of a post body. The API already sanitises on write; this sanitises again on read (defence in depth,
   e.g. for rows written by scripts or older versions) before anything reaches innerHTML. */

const ALLOWED = ['p', 'br', 'strong', 'em', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a'];

export const cleanHtml = (v: string) =>
  DOMPurify.sanitize(toEditorHtml(v || ''), { ALLOWED_TAGS: ALLOWED, ALLOWED_ATTR: ['href', 'target', 'rel'], ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i });

export function RichText({ html }: { html: string }) {
  return <div className="rte-body"><div className="ProseMirror" style={{ minHeight: 0, maxHeight: 'none', overflow: 'visible' }} dangerouslySetInnerHTML={{ __html: cleanHtml(html) }} /></div>;
}
