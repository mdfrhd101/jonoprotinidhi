import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import sharp from 'sharp';
import { ApiError } from '../errors.js';

/* Image pipeline. Uploaded bytes are never served as they arrived: sharp decodes the image (so anything that is not
   a real JPEG/PNG/WebP fails), applies the EXIF rotation, then re-encodes to WebP. Re-encoding drops all metadata
   (GPS position, camera, owner name) and any payload hidden in the file. SVG and GIF are refused on purpose (script
   risk / animation). Storage is behind an interface so production can use S3-compatible storage. */

export const MAX_EDGE = 2400;
export const ALLOWED_INPUT = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type Processed = { data: Buffer; width: number; height: number; contentType: 'image/webp' };

export async function processImage(input: Buffer, maxEdge: number = MAX_EDGE): Promise<Processed> {
  try {
    const img = sharp(input, { limitInputPixels: 40_000_000, failOn: 'error' });
    const meta = await img.metadata();
    if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) throw new Error('format');
    const out = await img.rotate().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    return { data: out.data, width: out.info.width, height: out.info.height, contentType: 'image/webp' };
  } catch {
    throw ApiError.unprocessable('BAD_IMAGE', 'ছবিটি পড়া যায়নি। JPG, PNG বা WebP ছবি দিন (সর্বোচ্চ ৪০ মেগাপিক্সেল)');
  }
}

export type MediaExt = 'webp' | 'mp4' | 'webm';
export const CONTENT_TYPES: Record<MediaExt, string> = { webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm' };

/** Video containers are checked by their first bytes (the declared Content-Type is only a claim). They are NOT transcoded. */
export function sniffVideo(head: Buffer): 'mp4' | 'webm' | null {
  if (head.length >= 12 && head.subarray(4, 8).toString('latin1') === 'ftyp') return 'mp4';
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm';
  return null;
}

export type ByteRange = { start: number; end: number }; // inclusive

export interface MediaStorage {
  put(key: string, data: Buffer): Promise<void>;
  /** Streams a large upload to storage, failing (and cleaning up) if it grows past maxBytes. Returns the size. */
  putStream(key: string, source: AsyncIterable<Buffer>, maxBytes: number): Promise<number>;
  get(key: string): Promise<Buffer | null>;
  stat(key: string): Promise<{ size: number } | null>;
  createReadStream(key: string, range?: ByteRange): Readable;
  remove(key: string): Promise<void>;
}

export class TooLargeError extends Error {}

/** Keys are `<tenantId>/<assetId>.<ext>`. Both parts are validated hex/whitelist, so no path can escape the root. */
const KEY_RE = /^[a-f0-9]{24}\/[a-f0-9]{24}\.(webp|mp4|webm)$/;
const assertKey = (k: string) => { if (!KEY_RE.test(k)) throw new Error('bad media key'); };

export class DiskMediaStorage implements MediaStorage {
  constructor(private root: string) {}
  private file(key: string) { assertKey(key); return path.join(this.root, key); }
  async put(key: string, data: Buffer) { const f = this.file(key); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, data); }
  async putStream(key: string, source: AsyncIterable<Buffer>, maxBytes: number) {
    const f = this.file(key), tmp = `${f}.part`;
    await fs.mkdir(path.dirname(f), { recursive: true });
    const out = createWriteStream(tmp);
    let size = 0;
    try {
      for await (const chunk of source) {
        size += chunk.length;
        if (size > maxBytes) throw new TooLargeError();
        if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()));
      }
      await new Promise<void>((res, rej) => { out.once('error', rej); out.end(() => res()); });
      await fs.rename(tmp, f);
      return size;
    } catch (e) {
      out.destroy();
      await fs.unlink(tmp).catch(() => undefined);
      throw e;
    }
  }
  async get(key: string) { try { return await fs.readFile(this.file(key)); } catch { return null; } }
  async stat(key: string) { try { return { size: (await fs.stat(this.file(key))).size }; } catch { return null; } }
  createReadStream(key: string, range?: ByteRange) { return createReadStream(this.file(key), range); }
  async remove(key: string) { try { await fs.unlink(this.file(key)); } catch { /* already gone */ } }
}

export class MemoryMediaStorage implements MediaStorage {
  files = new Map<string, Buffer>();
  async put(key: string, data: Buffer) { assertKey(key); this.files.set(key, data); }
  async putStream(key: string, source: AsyncIterable<Buffer>, maxBytes: number) {
    assertKey(key);
    const parts: Buffer[] = []; let size = 0;
    for await (const c of source) { size += c.length; if (size > maxBytes) throw new TooLargeError(); parts.push(c); }
    this.files.set(key, Buffer.concat(parts));
    return size;
  }
  async get(key: string) { return this.files.get(key) ?? null; }
  async stat(key: string) { const f = this.files.get(key); return f ? { size: f.length } : null; }
  createReadStream(key: string, range?: ByteRange) { const f = this.files.get(key) ?? Buffer.alloc(0); return Readable.from([range ? f.subarray(range.start, range.end + 1) : f]); }
  async remove(key: string) { this.files.delete(key); }
}
