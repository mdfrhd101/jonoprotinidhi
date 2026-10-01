import { useEffect, useState } from 'react';

/* Complaint attachments arrive as data URLs. The API already decodes, checks and rebuilds them (BUG-2026-027); this is the
   second line of defence: only the expected types are ever turned into something the browser loads, and always as a Blob
   object URL with a fixed type. The raw string never goes into src/href (a long data: URL also fails to open big PDFs). */

const SAFE = {
  image: /^data:(image\/(?:webp|jpeg|png));base64,/,
  pdf: /^data:(application\/pdf);base64,/,
  audio: /^data:(audio\/(?:webm|ogg|mp4|mpeg|wav))(?:; ?[a-z0-9.+-]+=[a-z0-9.+-]+)*;base64,/,
} as const;
export type SafeKind = keyof typeof SAFE;

export function safeDataUrlToBlob(data: unknown, kind: SafeKind): Blob | null {
  if (typeof data !== 'string') return null;
  const m = SAFE[kind].exec(data);
  if (!m) return null;
  try {
    const bin = atob(data.slice(m[0].length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null; // not valid base64
  }
}

/** Object URL for a safe data URL (revoked on change/unmount); null when the value is not an allowed type. */
export function useSafeObjectUrl(data: unknown, kind: SafeKind): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = safeDataUrlToBlob(data, kind);
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data, kind]);
  return url;
}
