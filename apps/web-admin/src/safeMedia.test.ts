import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeDataUrlToBlob, type SafeKind } from './safeMedia';

/* QA verification of BUG-2026-027 (defence in depth in the admin): only allow-listed data-URL prefixes are decoded,
   and what comes out is always a Blob with a fixed type taken from the allow-list, never from the attacker's string. */

const b64 = (s: string) => Buffer.from(s).toString('base64');
const readBlob = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(b); });

describe('safeDataUrlToBlob (BUG-2026-027)', () => {
  it('refuses every non-allow-listed prefix for every kind', () => {
    const hostile = [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      `data:text/html;base64,${b64('<script>alert(1)</script>')}`,
      `data:text/html,<script>alert(1)</script>`,
      `data:image/svg+xml;base64,${b64('<svg onload=alert(1)>')}`,
      `data:application/xhtml+xml;base64,${b64('<html/>')}`,
      `data:application/javascript;base64,${b64('alert(1)')}`,
      `data:image/gif;base64,${b64('GIF89a')}`,
      `data:image/png;charset=utf-8;base64,${b64('x')}`, // images allow no parameters
      `data:image/webp;base64`, // no payload separator
      `DATA:image/webp;base64,${b64('x')}`, // case variants are not accepted (the API writes lower case)
      ` data:image/webp;base64,${b64('x')}`, // leading space
      `\ndata:image/webp;base64,${b64('x')}`,
      `blob:https://evil.example/uuid`,
      `https://evil.example/a.png`,
      `//evil.example/a.png`,
      '',
      'not a data url',
    ];
    for (const kind of ['image', 'pdf', 'audio'] as SafeKind[]) for (const h of hostile) expect([kind, h.slice(0, 40), safeDataUrlToBlob(h, kind)]).toEqual([kind, h.slice(0, 40), null]);
  });

  it('refuses non-strings', () => {
    for (const v of [null, undefined, 42, {}, [], { toString: () => 'data:image/png;base64,AAAA' }]) expect(safeDataUrlToBlob(v, 'image')).toBeNull();
  });

  it('a prefix of one kind is refused for another kind (a PDF url cannot be used as an image and vice versa)', () => {
    expect(safeDataUrlToBlob(`data:application/pdf;base64,${b64('%PDF-1.4')}`, 'image')).toBeNull();
    expect(safeDataUrlToBlob(`data:image/png;base64,${b64('x')}`, 'pdf')).toBeNull();
    expect(safeDataUrlToBlob(`data:audio/webm;base64,${b64('x')}`, 'image')).toBeNull();
    expect(safeDataUrlToBlob(`data:image/png;base64,${b64('x')}`, 'audio')).toBeNull();
  });

  it('allowed types decode to a Blob whose type and bytes come from the allow-list and the payload', async () => {
    const cases: Array<[SafeKind, string, string]> = [
      ['image', 'image/webp', 'RIFF'], ['image', 'image/jpeg', 'jpg'], ['image', 'image/png', 'png'],
      ['pdf', 'application/pdf', '%PDF-1.4'],
      ['audio', 'audio/webm', 'abc'], ['audio', 'audio/ogg', 'OggS'], ['audio', 'audio/mp4', 'mp4'], ['audio', 'audio/mpeg', 'ID3'], ['audio', 'audio/wav', 'RIFF'],
    ];
    for (const [kind, mime, payload] of cases) {
      const blob = safeDataUrlToBlob(`data:${mime};base64,${b64(payload)}`, kind);
      expect(blob, mime).not.toBeNull();
      expect(blob!.type).toBe(mime);
      expect(await readBlob(blob!)).toBe(payload);
    }
    // audio may carry a codec parameter (MediaRecorder), the Blob type is still the bare allow-listed type
    const withParam = safeDataUrlToBlob(`data:audio/webm;codecs=opus;base64,${b64('abc')}`, 'audio');
    expect(withParam!.type).toBe('audio/webm');
    expect(safeDataUrlToBlob(`data:audio/ogg; codecs=opus;base64,${b64('abc')}`, 'audio')!.type).toBe('audio/ogg');
    // a mismatching parameter smuggling a different type is not honoured
    expect(safeDataUrlToBlob(`data:audio/webm;type=text/html;base64,${b64('abc')}`, 'audio')).toBeNull();
  });

  it('invalid base64 after an allowed prefix yields null, not an exception', () => {
    expect(safeDataUrlToBlob('data:image/png;base64,@@@@', 'image')).toBeNull();
    expect(safeDataUrlToBlob('data:image/png;base64,A', 'image')).toBeNull();
  });
});

describe('the complaint detail page never puts the raw attachment string into src/href', () => {
  const src = readFileSync(join(process.cwd(), 'src/pages/tenant/Complaints.tsx'), 'utf8');
  it('no <img>/<iframe>/<audio>/<a> in Complaints.tsx takes d.files[..].data / audioData directly', () => {
    // intrinsic DOM elements only (<AudioPlayer src=...> is a component whose prop goes through useSafeObjectUrl)
    expect(src).not.toMatch(/<(?:img|iframe|audio|video|source|a|embed|object)\b[^>]*\b(?:src|href|data)=\{[^}]*\.(?:data|audioData)\}/);
    expect(src).not.toMatch(/<(?:img|iframe|audio|video|source|a|embed|object)\b[^>]*\b(?:src|href)=["']?data:/);
    expect(src).not.toMatch(/dangerouslySetInnerHTML/);
    // every media element is fed from a blob URL produced by useSafeObjectUrl
    expect(src).toMatch(/useSafeObjectUrl\(src, 'audio'\)/);
    expect(src).toMatch(/useSafeObjectUrl\(img \? file\.data : null, 'image'\)/);
  });
});
