import { COMPLAINT_IMAGE_MAX_EDGE, COMPLAINT_MAX_TOTAL_B64 } from '@jonoprotinidhi/shared/src/complaintLimits.js';

/* Complaint attachments in the browser (BUG-2026-028): photos are shrunk before upload and every size is counted the
   way the API counts it (characters of the data URL), so the citizen hears about a limit here, not as a server error. */

export function fitWithin(width: number, height: number, max = COMPLAINT_IMAGE_MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const attachmentsSize = (files: Array<{ data: string }>, voice?: string | null): number =>
  (voice?.length ?? 0) + files.reduce((n, f) => n + f.data.length, 0);

export const overTotal = (files: Array<{ data: string }>, voice?: string | null): boolean => attachmentsSize(files, voice) > COMPLAINT_MAX_TOTAL_B64;

/** `data:audio/ogg; codecs=opus;base64,…` (Firefox) -> `data:audio/ogg;base64,…`: only the bare type is sent. */
export function plainDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const mime = head.slice(5).split(';')[0]!.trim().toLowerCase();
  return comma > 0 && head.startsWith('data:') ? `data:${mime};base64,${dataUrl.slice(comma + 1)}` : dataUrl;
}

export const readAsDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/** Decodes a photo, scales it to fit COMPLAINT_IMAGE_MAX_EDGE and re-encodes it as JPEG (quality 0.8). */
export async function shrinkImage(file: File): Promise<{ data: string; size: number; mimeType: 'image/jpeg' }> {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('decode'));
      i.src = src;
    });
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('canvas');
    g.fillStyle = '#ffffff'; // transparent PNG areas would otherwise turn black in JPEG
    g.fillRect(0, 0, width, height);
    g.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.8));
    return { data: await readAsDataUrl(blob), size: blob.size, mimeType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(src);
  }
}
