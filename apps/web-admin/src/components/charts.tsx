import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { bnDayShort, bnDayLong, formatBn, toBn } from '../format';

/* Hand-written SVG charts (no chart library). Every chart is role="img" with an aria-label and a visually hidden data
   table, uses design tokens for colour, and its animation stops under prefers-reduced-motion (ds.css).
   Tones map to the chart palette; status colours match the pills. */

export type ChartTone = 'brass' | 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'violet';
export const TONE_COLOR: Record<ChartTone, string> = { brass: 'var(--c-c)', blue: 'var(--c-a)', green: 'var(--c-b)', amber: 'var(--c-d)', red: 'var(--c-f)', gray: 'var(--c-e)', violet: 'var(--c-g)' };
const sumOf = (a: number[]) => a.reduce((x, y) => x + y, 0);
const fmt = (n: number) => formatBn(Math.round(n * 10) / 10);
const sane = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '');

/** Width of an element, updated on resize (falls back where there is no layout, e.g. jsdom). */
function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => { const x = Math.round(el.getBoundingClientRect().width); if (x > 0) setW(x); };
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Smooth monotone cubic path (never overshoots below a data point, so a 0 stays a 0). */
export function monotonePath(pts: Array<[number, number]>): string {
  const n = pts.length;
  if (!n) return '';
  if (n === 1) return `M${pts[0]![0]},${pts[0]![1]}`;
  const dx: number[] = [], m: number[] = [], t: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1]![0] - pts[i]![0]; m[i] = (pts[i + 1]![1] - pts[i]![1]) / (dx[i] || 1); }
  t[0] = m[0]!; t[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i]! / m[i]!, b = t[i + 1]! / m[i]!, s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]!; t[i + 1] = k * b * m[i]!; }
  }
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[i]![0], y0 = pts[i]![1], x1 = pts[i + 1]![0], y1 = pts[i + 1]![1], h = dx[i]! / 3;
    d += `C${x0 + h},${y0 + t[i]! * h} ${x1 - h},${y1 - t[i + 1]! * h} ${x1},${y1}`;
  }
  return d;
}

function niceStep(max: number, ticks = 4): number {
  const raw = Math.max(max, 1) / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow);
}

/* ---------- Sparkline ---------- */
export function Sparkline({ data, tone = 'blue', height = 36, fill = true, label, className }: { data: number[]; tone?: ChartTone; height?: number; fill?: boolean; /** accessible description; without it the sparkline is decorative */ label?: string; className?: string }) {
  const uid = sane(useId());
  const W = 100, H = height, pad = 3;
  const min = Math.min(...data, 0), max = Math.max(...data, 1);
  const pts: Array<[number, number]> = data.map((v, i) => [data.length < 2 ? W / 2 : (i / (data.length - 1)) * W, H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2)]);
  const line = monotonePath(pts);
  const color = TONE_COLOR[tone];
  return (
    <svg className={`spark${className ? ` ${className}` : ''}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" height={H} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <defs><linearGradient id={`sp${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {fill && pts.length > 1 && <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#sp${uid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ---------- AreaChart (1-3 series over time, tooltip on hover and arrow keys) ---------- */
export type ChartSeries = { key: string; label: string; tone?: ChartTone; /** area fill under the line (default true for the first series) */ fill?: boolean };

export function AreaChart({ data, series, xKey = 'date', xFormat = bnDayShort, tooltipTitle = bnDayLong, valueFormat = (n) => toBn(n), height = 260, ariaLabel, caption, emptyText = 'এই সময়ে কোনো তথ্য নেই', legendTotals = true }: {
  data: Array<Record<string, number | string>>; series: ChartSeries[]; xKey?: string; xFormat?: (v: string) => string; tooltipTitle?: (v: string) => string; valueFormat?: (n: number) => string;
  height?: number; ariaLabel: string; caption?: string; emptyText?: string; legendTotals?: boolean;
}) {
  const uid = sane(useId());
  const [wrapRef, W] = useWidth<HTMLDivElement>(680);
  const [active, setActive] = useState<number | null>(null);
  const pad = { l: 40, r: 14, t: 16, b: 30 };
  const n = data.length;
  const plotW = Math.max(W - pad.l - pad.r, 10), plotH = height - pad.t - pad.b;
  const all = data.flatMap((d) => series.map((s) => Number(d[s.key] ?? 0)));
  const maxV = Math.max(0, ...all);
  const step = niceStep(maxV, 4);
  const yMax = Math.max(step * Math.ceil(maxV / step), step * 2);
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  const X = (i: number) => pad.l + (n < 2 ? plotW / 2 : (i / (n - 1)) * plotW);
  const Y = (v: number) => pad.t + plotH - (v / yMax) * plotH;
  const cols = series.map((s) => TONE_COLOR[s.tone ?? 'blue']);
  const paths = useMemo(() => series.map((s) => monotonePath(data.map((d, i) => [X(i), Y(Number(d[s.key] ?? 0))] as [number, number]))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, series, W, height, yMax]);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 84))));
  const xLabels = data.map((d, i) => ({ i, t: xFormat(String(d[xKey])) })).filter(({ i }) => (n - 1 - i) % labelEvery === 0);
  const empty = maxV === 0;
  const totals = series.map((s) => sumOf(data.map((d) => Number(d[s.key] ?? 0))));
  const summary = `${ariaLabel}। ${series.map((s, i) => `${s.label} মোট ${valueFormat(totals[i]!)}`).join(', ')}।`;
  const at = (i: number) => data[i]!;
  const activeText = active != null && n ? `${tooltipTitle(String(at(active)[xKey]))}: ${series.map((s) => `${s.label} ${valueFormat(Number(at(active)[s.key] ?? 0))}`).join(', ')}` : '';

  const move = (e: PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const rel = (e.clientX - r.left) / Math.max(r.width, 1);
    setActive(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  };
  const key = (e: KeyboardEvent) => {
    if (!n) return;
    const cur = active ?? n - 1;
    if (e.key === 'ArrowRight') { e.preventDefault(); setActive(Math.min(n - 1, active == null ? n - 1 : cur + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setActive(Math.max(0, active == null ? n - 1 : cur - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(n - 1); }
    else if (e.key === 'Escape') setActive(null);
  };
  const tipLeft = active == null ? 0 : Math.min(Math.max(X(active), 92), W - 92);

  return (
    <figure className="chart-fig">
      <div className="chart-legend">
        {series.map((s, i) => (
          <span className="lg" key={s.key}><i style={{ background: cols[i] }} />{s.label}{legendTotals && <b>{valueFormat(totals[i]!)}</b>}</span>
        ))}
      </div>
      <div className="ac" ref={wrapRef}>
        <div role="img" aria-label={summary} aria-describedby={`t${uid}`} tabIndex={0} className="ac-plot" onKeyDown={key} onFocus={() => setActive((a) => a ?? (n ? n - 1 : null))} onBlur={() => setActive(null)}>
          <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} focusable="false" aria-hidden>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`ac${uid}${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={cols[i]} stopOpacity=".26" /><stop offset="1" stopColor={cols[i]} stopOpacity="0.02" /></linearGradient>
              ))}
            </defs>
            {ticks.map((t) => (
              <g key={t}><line className="ac-gl" x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} /><text className="ac-ax" x={pad.l - 10} y={Y(t) + 4} textAnchor="end">{valueFormat(t)}</text></g>
            ))}
            {xLabels.map(({ i, t }) => <text key={i} className="ac-ax" x={X(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{t}</text>)}
            <g className="ac-data">
              {series.map((s, i) => (s.fill ?? i === 0) && n > 1 && !empty ? <path key={`a${s.key}`} d={`${paths[i]}L${X(n - 1)},${Y(0)}L${X(0)},${Y(0)}Z`} fill={`url(#ac${uid}${i})`} /> : null)}
              {series.map((s, i) => <path key={s.key} d={paths[i]} fill="none" stroke={cols[i]} strokeWidth={i === 0 ? 2.5 : 2.5} strokeLinecap="round" strokeLinejoin="round" />)}
            </g>
            {active != null && n > 0 && (
              <g>
                <line className="ac-guide" x1={X(active)} x2={X(active)} y1={pad.t} y2={pad.t + plotH} />
                {series.map((s, i) => <circle key={s.key} cx={X(active)} cy={Y(Number(at(active)[s.key] ?? 0))} r={5} fill="#fff" stroke={cols[i]} strokeWidth={2.5} />)}
              </g>
            )}
            <rect x={pad.l} y={pad.t} width={plotW} height={plotH} fill="transparent" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setActive(null)} />
          </svg>
          {empty && <div className="ac-empty">{emptyText}</div>}
        </div>
        {active != null && n > 0 && (
          <div className="ac-tip" style={{ left: tipLeft }} aria-hidden>
            <b>{tooltipTitle(String(at(active)[xKey]))}</b>
            {series.map((s, i) => <span key={s.key}><i style={{ background: cols[i] }} />{s.label}<em>{valueFormat(Number(at(active)[s.key] ?? 0))}</em></span>)}
          </div>
        )}
      </div>
      <div className="sr" aria-live="polite">{activeText}</div>
      <div className="sr"><table id={`t${uid}`}>
        <caption>{caption ?? ariaLabel}</caption>
        <thead><tr><th>তারিখ</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{data.map((d, i) => <tr key={i}><th>{tooltipTitle(String(d[xKey]))}</th>{series.map((s) => <td key={s.key}>{valueFormat(Number(d[s.key] ?? 0))}</td>)}</tr>)}</tbody>
      </table></div>
    </figure>
  );
}

/* ---------- Donut ---------- */
export type DonutSlice = { key: string; label: string; value: number; tone?: ChartTone; color?: string };
export function Donut({ data, size = 176, thickness = 26, centerLabel = 'মোট', ariaLabel, valueFormat = (n) => formatBn(n), emptyText = 'এখনো কোনো তথ্য নেই', legend = true }: {
  data: DonutSlice[]; size?: number; thickness?: number; centerLabel?: string; ariaLabel: string; valueFormat?: (n: number) => string; emptyText?: string; legend?: boolean;
}) {
  const [hot, setHot] = useState<string | null>(null);
  const rows = data.filter((d) => d.value > 0);
  const total = sumOf(rows.map((d) => d.value));
  const r = (size - thickness) / 2, C = 2 * Math.PI * r, cx = size / 2;
  const gap = rows.length > 1 ? 3 : 0;
  let off = 0;
  const colorOf = (d: DonutSlice) => d.color ?? TONE_COLOR[d.tone ?? 'gray'];
  const cur = rows.find((d) => d.key === hot);
  const summary = `${ariaLabel}: ${rows.length ? rows.map((d) => `${d.label} ${valueFormat(d.value)}`).join(', ') : emptyText}`;
  return (
    <figure className="donut-fig">
      <div className="donut" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={summary} focusable="false">
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--n-100)" strokeWidth={thickness} />
          {rows.map((d) => {
            const len = (d.value / total) * C;
            const seg = Math.max(len - gap, 0.5);
            const el = (
              <circle key={d.key} className={`donut-seg${hot && hot !== d.key ? ' dim' : ''}`} cx={cx} cy={cx} r={r} fill="none" stroke={colorOf(d)} strokeWidth={hot === d.key ? thickness + 4 : thickness}
                strokeDasharray={`${seg} ${C - seg}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cx})`} onMouseEnter={() => setHot(d.key)} onMouseLeave={() => setHot(null)} />
            );
            off += len;
            return el;
          })}
        </svg>
        <div className="donut-c" aria-hidden>
          {total ? <><b>{valueFormat(cur ? cur.value : total)}</b><small>{cur ? cur.label : centerLabel}</small></> : <small>{emptyText}</small>}
        </div>
      </div>
      {legend && (
        <ul className="donut-lg" aria-hidden>
          {rows.map((d) => (
            <li key={d.key} className={hot === d.key ? 'on' : undefined} onMouseEnter={() => setHot(d.key)} onMouseLeave={() => setHot(null)}>
              <i style={{ background: colorOf(d) }} /><span>{d.label}</span><b>{valueFormat(d.value)}</b><em>{toBn(Math.round((d.value / total) * 100))}%</em>
            </li>
          ))}
        </ul>
      )}
      <div className="sr"><table><caption>{ariaLabel}</caption><thead><tr><th>অবস্থা</th><th>সংখ্যা</th></tr></thead><tbody>{rows.map((d) => <tr key={d.key}><th>{d.label}</th><td>{valueFormat(d.value)}</td></tr>)}</tbody></table></div>
    </figure>
  );
}

/* ---------- BarList (ranked horizontal bars: label, value, optional hint and link) ---------- */
export type BarRow = { key?: string; label: string; value: number; hint?: string; tone?: ChartTone; to?: string };
export function BarList({ rows, max, ariaLabel, format = (n) => formatBn(n), emptyText = 'এখনো কোনো তথ্য নেই', tone = 'brass' }: { rows: BarRow[]; max?: number; ariaLabel: string; format?: (n: number) => string; emptyText?: string; tone?: ChartTone }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="muted bl-empty">{emptyText}</p>;
  return (
    <ul className="barlist" aria-label={ariaLabel}>
      {rows.map((r) => {
        const head = <><span className="bl-l">{r.label}{r.hint && <small>{r.hint}</small>}</span><b className="bl-v">{format(r.value)}</b></>;
        return (
          <li key={r.key ?? r.label} className="bl-row">
            {r.to ? <Link to={r.to} className="bl-h">{head}</Link> : <div className="bl-h">{head}</div>}
            <span className="bl-t" aria-hidden><i style={{ width: `${Math.max((r.value / m) * 100, r.value > 0 ? 2 : 0)}%`, background: TONE_COLOR[r.tone ?? tone] }} /></span>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- ProgressBar ---------- */
export function ProgressBar({ value, tone = 'brass', label, showValue = true, size = 'md' }: { value: number; tone?: ChartTone; label: string; showValue?: boolean; size?: 'sm' | 'md' }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={`pbar ${size}`}>
      <div className="pbar-t" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-valuetext={`${toBn(v)}%`}>
        <i style={{ width: `${v}%`, background: TONE_COLOR[tone] }} />
      </div>
      {showValue && <span className="pbar-v num">{toBn(v)}%</span>}
    </div>
  );
}

/* ---------- ProgressRing ---------- */
export function ProgressRing({ value, size = 140, stroke = 13, tone = 'brass', label, sub, children }: { value: number; size?: number; stroke?: number; tone?: ChartTone; label: string; sub?: string; children?: ReactNode }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${toBn(v)}%`} focusable="false">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--n-100)" strokeWidth={stroke} />
        <circle className="ring-fg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TONE_COLOR[tone]} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ '--c': C } as CSSProperties} />
      </svg>
      <div className="ring-c" aria-hidden>{children ?? <><b>{toBn(v)}<small>%</small></b>{sub && <span>{sub}</span>}</>}</div>
    </div>
  );
}
