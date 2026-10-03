import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

export type HistBin = {
  value: number;
  curve: number;
  /** Axis tick text; empty to skip. */
  tick: string;
  /** Tooltip heading, e.g. "Digit sum 13". */
  title: string;
  extra?: string;
};

type Props = {
  bins: HistBin[];
  /** Accessible chart name. */
  label: string;
  barName?: string;
  curveName?: string;
};

const W = 640;
const H = 260;
const PAD = { top: 12, right: 8, bottom: 28, left: 40 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Bars of observed counts with a fitted normal curve on the same axis. */
export function HistogramCurve({ bins, label, barName = 'Observed count', curveName = 'Fitted normal' }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const geo = useMemo(() => {
    const n = Math.max(bins.length, 1);
    const max = niceMax(Math.max(1, ...bins.map((b) => Math.max(b.value, b.curve))) * 1.05);
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const step = plotW / n;
    const gap = 2;
    const x = (i: number) => PAD.left + i * step;
    const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
    const curve = bins.map((b, i) => `${i === 0 ? 'M' : 'L'}${(x(i) + step / 2).toFixed(1)},${y(b.curve).toFixed(1)}`).join(' ');
    return { n, max, step, gap, x, y, ticks, curve, plotH };
  }, [bins]);

  const pickFromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svg.current!.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.floor((vx - PAD.left) / geo.step);
    setActive(i >= 0 && i < bins.length ? i : null);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      setActive((a) => Math.min(bins.length - 1, Math.max(0, (a ?? (d > 0 ? -1 : bins.length)) + d)));
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  };

  const a = active != null ? bins[active] : null;
  const tipLeft = active != null ? ((geo.x(active) + geo.step / 2) / W) * 100 : 0;
  const tipTop = a ? (geo.y(Math.max(a.value, a.curve)) / H) * 100 : 0;

  return (
    <div className="chart">
      <div className="chart__legend">
        <span>
          <i className="swatch-bar" aria-hidden /> {barName}
        </span>
        <span>
          <i className="swatch-line" aria-hidden /> {curveName}
        </span>
      </div>
      <div style={{ position: 'relative' }}>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}. Use the left and right arrow keys to read each bar.`}
        tabIndex={0}
        onPointerMove={pickFromPointer}
        onPointerDown={pickFromPointer}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setActive(null);
        }}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        <g className="chart-axis">
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--chart-grid)" />
              <text x={PAD.left - 8} y={geo.y(t) + 4} textAnchor="end">
                {t.toLocaleString()}
              </text>
            </g>
          ))}
          {bins.map((b, i) =>
            b.tick ? (
              <text key={i} x={geo.x(i) + geo.step / 2} y={H - 8} textAnchor="middle">
                {b.tick}
              </text>
            ) : null,
          )}
        </g>

        {active != null ? (
          <rect
            x={geo.x(active)}
            y={PAD.top}
            width={geo.step}
            height={geo.plotH}
            fill="var(--ink)"
            opacity={0.06}
          />
        ) : null}

        {bins.map((b, i) => {
          const bw = Math.max(1, geo.step - geo.gap);
          const top = geo.y(b.value);
          const h = Math.max(0, geo.y(0) - top);
          const r = Math.min(4, bw / 2, h);
          const x0 = geo.x(i) + geo.gap / 2;
          // Rounded data-end, square baseline.
          const d = `M${x0},${geo.y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${geo.y(0)} Z`;
          return <path key={i} d={d} fill="var(--chart-bar)" opacity={active == null || active === i ? 1 : 0.55} />;
        })}

        <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(0)} y2={geo.y(0)} stroke="var(--line-strong)" />
        <path d={geo.curve} fill="none" stroke="var(--chart-curve)" strokeWidth={2} strokeLinejoin="round" />
        {a ? (
          <circle
            cx={geo.x(active!) + geo.step / 2}
            cy={geo.y(a.curve)}
            r={4}
            fill="var(--chart-curve)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ) : null}
      </svg>
      {a ? (
        <div className="chart__tooltip" style={{ left: `${tipLeft}%`, top: `${tipTop}%` }} aria-live="polite">
          <strong>{a.title}</strong>
          {barName}: {a.value.toLocaleString()}
          <br />
          {curveName}: {a.curve.toFixed(1)}
          {a.extra ? (
            <>
              <br />
              {a.extra}
            </>
          ) : null}
        </div>
      ) : null}
      </div>
    </div>
  );
}
