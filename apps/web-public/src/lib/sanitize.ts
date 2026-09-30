/* Second line of defence for rich text. Post bodies arrive sanitised from the API; we sanitise them again with a
   small allow-list before rendering. Server only (sanitize-html is a Node library). */
import sanitizeHtml from 'sanitize-html';
import { safeHref } from './links';

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'hr'],
  allowedAttributes: { a: ['href', 'title', 'rel', 'target'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'template', 'svg', 'math'],
  transformTags: {
    a: (tagName, attribs) => {
      const href = safeHref(attribs.href ?? '');
      // keep the tag name: sanitize-html closes renamed tags inconsistently. An <a> without href is inert text.
      if (!href) return { tagName, attribs: {} };
      const external = /^https?:\/\//i.test(href);
      return { tagName, attribs: { href, ...(attribs.title ? { title: attribs.title } : {}), ...(external ? { rel: 'noopener noreferrer nofollow', target: '_blank' } : {}) } };
    },
    b: 'strong',
    i: 'em',
  },
};

/** Sanitised HTML for a post body. Empty input gives ''. */
export function sanitizeBody(html: string | null | undefined): string {
  if (!html) return '';
  return sanitizeHtml(String(html), OPTIONS).trim();
}

/** Plain text of an HTML string (for meta descriptions), shortened to `max` characters. */
export function textOf(html: string | null | undefined, max = 200): string {
  const t = sanitizeHtml(String(html ?? ''), { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/** Splits a sanitised body into top-level blocks so the pull quote can sit after the first paragraph. */
export function splitAfterFirstBlock(html: string): [string, string] {
  // only a leading <p> is split off: paragraphs cannot nest, so the lazy match always closes the right element
  const m = /^(\s*<p\b[^>]*>[\s\S]*?<\/p>)([\s\S]*)$/i.exec(html);
  return m ? [m[1]!, m[2]!] : [html, ''];
}
