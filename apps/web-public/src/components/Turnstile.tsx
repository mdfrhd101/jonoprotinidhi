'use client';
import { useEffect, useRef } from 'react';

type TurnstileApi = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void };
declare global { interface Window { turnstile?: TurnstileApi } }

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error('turnstile')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Cloudflare Turnstile spam check. Without a site key (development) it reports the token "dev-ok" straight away;
    the API accepts any non-empty token when no Turnstile secret is configured. */
export default function Turnstile({ siteKey, onToken, resetKey = 0 }: { siteKey: string; onToken: (t: string) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  useEffect(() => {
    if (!siteKey) { cb.current('dev-ok'); return; }
    let id: string | undefined, alive = true;
    loadScript().then(() => {
      if (!alive || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, { sitekey: siteKey, language: 'bn', callback: (t: string) => cb.current(t), 'expired-callback': () => cb.current(''), 'error-callback': () => cb.current('') });
    }).catch(() => cb.current(''));
    return () => { alive = false; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [siteKey, resetKey]);
  return siteKey ? <div ref={box} className="cf-turnstile" /> : null;
}
