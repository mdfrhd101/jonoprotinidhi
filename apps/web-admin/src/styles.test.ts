import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* jsdom does not lay out CSS, so this guards the source of the rule; e2e/smoke.py measures the real heights in a browser. */
describe('form control styling (BUG-2026-015)', () => {
  const css = readFileSync(join(__dirname, 'extra.css'), 'utf8');
  it('styles inputs that have NO type attribute (most inputs in the app) and gives them room', () => {
    const rule = css.split('}').find((r) => r.includes('input:not([type])') && r.includes('min-height'));
    expect(rule, 'rule for untyped inputs').toBeTruthy();
    expect(Number(/min-height:(\d+)px/.exec(rule!)![1])).toBeGreaterThanOrEqual(48);
    expect(rule).toMatch(/font-size:16px/);
  });
  it('textareas are tall by default', () => {
    expect(Number(/textarea\{min-height:(\d+)px/.exec(css)![1])).toBeGreaterThanOrEqual(150);
  });
});

describe('content editors stylesheet', () => {
  const css = readFileSync(join(__dirname, 'content.css'), 'utf8');
  it('BUG-2026-022: the pill-style tab list does not get the status-pill dot', () => {
    expect(css).toMatch(/\.tabs\.pill::before\{content:none/);
  });
  it('every content class is prefixed ct- (page styles never leak into the design system)', () => {
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]+\{/g, '').replace(/@keyframes[^{]+\{[^}]*\}[^}]*\}/g, '').split('}').map((r) => r.split('{')[0]!.trim()).filter(Boolean);
    const classes = selectors.flatMap((s) => s.match(/\.[a-zA-Z][\w-]*/g) ?? []);
    const own = classes.filter((c) => c.startsWith('.ct-'));
    expect(own.length).toBeGreaterThan(100);
    // any selector must involve a ct- class, except the documented BUG-2026-022 fix and the small .icon-btn disabled state
    const foreign = selectors.filter((s) => !s.includes('.ct-') && !/^\.tabs\.pill::before$|^\.icon-btn:disabled|^\[draggable/.test(s));
    expect(foreign).toEqual([]);
  });
});
