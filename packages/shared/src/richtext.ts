/* Rich-text bodies are stored as sanitised HTML. Length limits count the visible TEXT, not the markup. */

export const BODY_MAX_TEXT = 8000;
export const BODY_MAX_HTML = 80000;

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** Visible text of an HTML string (tags removed, common entities decoded). Used for counters and limits. */
export function plainText(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
    .trim();
}
export const plainTextLength = (html: string) => Array.from(plainText(html)).length;
