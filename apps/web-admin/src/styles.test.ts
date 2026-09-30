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
