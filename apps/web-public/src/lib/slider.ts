/* Index math shared by the hero, gallery and video sliders. Pure, so it is unit-tested. */
import { toBn } from '@jonoshetu/shared/src/bangla.js';

/** Wraps any integer into 0..n-1 (negative numbers too). n <= 0 gives 0. */
export function wrapIndex(i: number, n: number): number {
  if (!Number.isFinite(i) || n <= 0) return 0;
  return ((Math.trunc(i) % n) + n) % n;
}

/** Moves by `delta` slides; with `loop` false it stops at the ends instead of wrapping. */
export function stepIndex(cur: number, delta: number, n: number, loop = true): number {
  if (n <= 0) return 0;
  const next = cur + delta;
  return loop ? wrapIndex(next, n) : Math.max(0, Math.min(n - 1, next));
}

/** "৩/১২" (1-based, Bangla digits). Empty when there is nothing to count. */
export const counterLabel = (i: number, n: number): string => (n > 0 ? `${toBn(wrapIndex(i, n) + 1)}/${toBn(n)}` : '');

/** A horizontal drag becomes a swipe when it is long enough and more horizontal than vertical.
    Returns +1 (go to next, finger moved left), -1 (previous) or 0 (not a swipe). */
export function swipeDirection(dx: number, dy: number, width: number, minPx = 48, minRatio = 0.12): -1 | 0 | 1 {
  const need = Math.max(minPx, Math.min(width * minRatio, 120));
  if (Math.abs(dx) < need || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}

/** Slides worth rendering an image for: the current one and its neighbours (the neighbours preload). */
export function nearbyIndexes(cur: number, n: number, radius = 1): number[] {
  if (n <= 0) return [];
  const out = new Set<number>();
  for (let d = -radius; d <= radius; d++) out.add(wrapIndex(cur + d, n));
  return [...out].sort((a, b) => a - b);
}

/** Keyboard → slide delta for a focused slider (Home/End jump to the ends). */
export function keyToAction(key: string, cur: number, n: number): number | null {
  switch (key) {
    case 'ArrowRight': return stepIndex(cur, 1, n);
    case 'ArrowLeft': return stepIndex(cur, -1, n);
    case 'Home': return 0;
    case 'End': return Math.max(0, n - 1);
    default: return null;
  }
}

/** Items with `featured` first, the rest in their original order (stable). */
export function featuredFirst<T extends { featured?: boolean }>(items: readonly T[]): T[] {
  return [...items.filter((x) => x.featured), ...items.filter((x) => !x.featured)];
}

/** Page numbers with gaps for a pager: 1 … 4 5 6 … 12 */
export function pageList(cur: number, total: number): Array<number | 'gap'> {
  const out: Array<number | 'gap'> = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - cur) <= 1) out.push(i);
    else if (out[out.length - 1] !== 'gap') out.push('gap');
  }
  return out;
}
