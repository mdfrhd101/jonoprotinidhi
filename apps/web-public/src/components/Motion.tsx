'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { toBn, toEn } from '@jonoshetu/shared/src/bangla.js';
import { groupIndian } from '@jonoshetu/shared/src/bangla.js';

/* Page motion from the demo: reveal-on-scroll (.reveal), promise bars (.p-row), count-up numbers ([data-count]) and
   parallax photos ([data-px]). Everything is skipped when the visitor prefers reduced motion; content is visible
   without JavaScript because the `js` class that hides .reveal is only added by script. */
export default function Motion() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const main = document.getElementById('main');
    if (!main) return;
    const seen = new WeakSet<Element>();
    const countUp = (el: HTMLElement) => {
      const raw = el.dataset.count ?? '';
      const to = Number(toEn(raw).replace(/,/g, ''));
      if (reduce || !Number.isFinite(to) || to <= 0 || !/^[\d,]+$/.test(toEn(raw))) return;
      const t0 = performance.now(), dur = 1400;
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = toBn(groupIndian(Math.round(to * e)));
        if (p < 1) requestAnimationFrame(step); else el.textContent = raw;
      };
      requestAnimationFrame(step);
    };
    const useIO = 'IntersectionObserver' in window && !reduce;
    const io = useIO ? new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      e.target.querySelectorAll<HTMLElement>('[data-count]').forEach(countUp);
      io!.unobserve(e.target);
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }) : null;
    const rowIO = useIO ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); rowIO!.unobserve(e.target); } }), { threshold: 0.3 }) : null;
    const scan = () => {
      main.querySelectorAll('.reveal, .p-row').forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        const obs = el.classList.contains('p-row') ? rowIO : io;
        if (obs) obs.observe(el); else el.classList.add('in');
      });
    };
    root.classList.add('js');
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(main, { childList: true, subtree: true });

    let ticking = false;
    const onScroll = () => {
      if (reduce || ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        document.querySelectorAll<HTMLElement>('[data-px]').forEach((el) => {
          const r = el.parentElement!.getBoundingClientRect();
          if (r.bottom < 0 || r.top > innerHeight) return;
          el.style.transform = `translate3d(0,${((r.top + r.height / 2 - innerHeight / 2) * -Number(el.dataset.px)).toFixed(1)}px,0)`;
        });
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { mo.disconnect(); io?.disconnect(); rowIO?.disconnect(); window.removeEventListener('scroll', onScroll); };
  }, [pathname]);
  return null;
}
