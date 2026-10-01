/* Body caps for the same-origin API proxy (BUG-2026-031). Only the complaint submission may be large (attachments; the
   API accepts up to 13 MB there and 1 MB elsewhere). A declared Content-Length is checked before any byte is read, and
   the size is counted again while reading, because a chunked request has no Content-Length. */

const COMPLAINT_BODY_MAX = 13 * 1024 * 1024;
const SMALL_BODY_MAX = 16 * 1024;

export const bodyLimitFor = (path: string): number => (path === 'complaints' ? COMPLAINT_BODY_MAX : SMALL_BODY_MAX);

export function declaredTooLarge(contentLength: string | null, max: number): boolean {
  if (contentLength === null) return false;
  const n = Number(contentLength);
  return !Number.isFinite(n) || n > max;
}

/** Reads the whole body as text, or returns null (and stops reading) as soon as it grows past `max` bytes. */
export async function readBodyCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<string | null> {
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
