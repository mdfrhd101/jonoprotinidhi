import { COMPLAINT_IMAGE_MAX_EDGE, COMPLAINT_MAX_TOTAL_B64, type ComplaintSubmit } from '@jonoprotinidhi/shared';
import { ApiError } from '../errors.js';
import { processImage, sniffVideo } from './media.js';

/* Complaint attachments (BUG-2026-027). A data URL from a citizen is only a claim, and the admin puts these values into
   <img>, <iframe>, <audio> and download links. So nothing the browser wrote is stored verbatim: every payload is decoded,
   its declared type must match its real bytes, photos are decoded and re-encoded by sharp (WebP, EXIF/GPS dropped, any
   hidden payload gone), and the stored data URL is rebuilt here from the checked bytes with a fixed type. */

export type CleanFile = { name: string; mimeType: string; size: number; data: string };
export type CleanVoice = { audioData: string; durationSec?: number };

const HEADER = /^data:([a-z]+\/[a-z0-9.+-]+)(?:; ?[a-z0-9.+-]+=[a-z0-9.+-]+)*;base64$/i;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Splits and decodes `data:<mime>[;param=value];base64,<payload>`; null for anything else. */
export function decodeDataUrl(s: string): { mime: string; bytes: Buffer } | null {
  const comma = s.indexOf(',');
  if (comma < 0 || comma > 200) return null;
  const head = HEADER.exec(s.slice(0, comma));
  const b64 = s.slice(comma + 1);
  if (!head || !b64 || b64.length % 4 !== 0 || !BASE64.test(b64)) return null;
  return { mime: head[1]!.toLowerCase(), bytes: Buffer.from(b64, 'base64') };
}

const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString('latin1');
const AUDIO_MAGIC: Record<string, (b: Buffer) => boolean> = {
  'audio/webm': (b) => sniffVideo(b) === 'webm',
  'audio/mp4': (b) => sniffVideo(b) === 'mp4',
  'audio/ogg': (b) => ascii(b, 0, 4) === 'OggS',
  'audio/mpeg': (b) => ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0),
  'audio/wav': (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE',
};

const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`;
const badFile = (name: string) => ApiError.unprocessable('BAD_FILE', `"${name}" ফাইলটি পড়া যায়নি। শুধু JPG, PNG বা WebP ছবি অথবা PDF দিন।`);

async function cleanFile(f: ComplaintSubmit['files'][number]): Promise<CleanFile> {
  const d = decodeDataUrl(f.data);
  if (!d || d.mime !== f.mimeType || !d.bytes.length) throw badFile(f.name);
  if (f.mimeType === 'application/pdf') {
    if (ascii(d.bytes, 0, 5) !== '%PDF-') throw badFile(f.name);
    return { name: f.name, mimeType: 'application/pdf', size: d.bytes.length, data: dataUrl('application/pdf', d.bytes) };
  }
  const img = await processImage(d.bytes, COMPLAINT_IMAGE_MAX_EDGE); // throws 422 BAD_IMAGE unless it really is a JPEG/PNG/WebP
  return { name: `${f.name.replace(/\.[^.]{1,5}$/, '')}.webp`, mimeType: img.contentType, size: img.data.length, data: dataUrl(img.contentType, img.data) };
}

function cleanVoice(v: NonNullable<ComplaintSubmit['voiceNote']>): CleanVoice {
  const d = decodeDataUrl(v.audioData);
  const sniff = d ? AUDIO_MAGIC[d.mime] : undefined;
  if (!d || !sniff || !sniff(d.bytes)) throw ApiError.unprocessable('BAD_VOICE', 'ভয়েস রেকর্ডটি পড়া যায়নি। আবার রেকর্ড করে পাঠান।');
  return { audioData: dataUrl(d.mime, d.bytes), ...(v.durationSec ? { durationSec: v.durationSec } : {}) };
}

/** Returns only checked, rebuilt attachments. Files are processed one at a time to keep memory flat. */
export async function cleanAttachments(input: Pick<ComplaintSubmit, 'files' | 'voiceNote'>): Promise<{ files: CleanFile[]; voiceNote?: CleanVoice }> {
  const voiceNote = input.voiceNote ? cleanVoice(input.voiceNote) : undefined;
  const files: CleanFile[] = [];
  for (const f of input.files ?? []) files.push(await cleanFile(f));
  // re-encoding can in rare cases grow a photo: the stored document must still stay far below 16 MB (BUG-2026-028)
  const total = (voiceNote?.audioData.length ?? 0) + files.reduce((n, f) => n + f.data.length, 0);
  if (total > COMPLAINT_MAX_TOTAL_B64) throw ApiError.unprocessable('ATTACHMENTS_TOO_LARGE', 'সংযুক্তি অনেক বড়: সব ছবি, PDF ও ভয়েস মিলিয়ে সীমার বেশি হয়ে গেছে। কিছু ফাইল বাদ দিয়ে আবার পাঠান।');
  return { files, ...(voiceNote ? { voiceNote } : {}) };
}
