import sanitizeHtml from 'sanitize-html';

/* Post bodies are rich text from the admin editor. Never trust the browser: everything is re-sanitised here with an
   allow-list, so a hostile or hacked editor cannot store <script>, event handlers, iframes or javascript: links that
   the public site would later render (stored XSS). Old plain-text bodies (paragraphs split by blank lines) are
   converted to <p> blocks so both formats work. */

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const looksLikeHtml = (s: string) => /<\/?(p|h[1-6]|ul|ol|li|blockquote|strong|em|b|i|u|a|br|hr)\b/i.test(s);

export function plainToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function sanitizeRichText(input: string): string {
  const raw = looksLikeHtml(input) ? input : plainToHtml(input);
  const clean = sanitizeHtml(raw, {
    allowedTags: ['p', 'br', 'strong', 'em', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'hr'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    // headings other than h2/h3 (h1 belongs to the page title) are demoted instead of dropped
    transformTags: {
      h1: 'h2', h4: 'h3', h5: 'h3', h6: 'h3', b: 'strong', i: 'em',
      a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href ?? '', target: '_blank', rel: 'noopener noreferrer nofollow' } }),
    },
    disallowedTagsMode: 'discard',
  });
  return clean.replace(/<p>\s*<\/p>/g, '').trim();
}
