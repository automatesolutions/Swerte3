import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { IconRefresh, IconZoomIn, IconZoomOut } from '@tabler/icons-react';
import type { AnalyticsGraphLink } from '../lib/api';

type Pt = { x: number; y: number };

const W = 640;
const H = 480;
const MARGIN = 34;
const NODE_R = 18;
const ZOOMS = [1, 1.25, 1.5, 2, 2.5];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Small force layout for digit graphs (0–9 nodes), seeded on a ring so it is stable. */
function layoutNodes(ids: string[], links: AnalyticsGraphLink[]): Record<string, Pt> {
  const n = ids.length;
  if (!n) return {};
  const iw = W - MARGIN * 2;
  const ih = H - MARGIN * 2;
  const idx = new Map(ids.map((id, i) => [id, i]));
  const pos: Pt[] = ids.map((_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: MARGIN + iw / 2 + Math.cos(a) * iw * 0.4, y: MARGIN + ih / 2 + Math.sin(a) * ih * 0.4 };
  });
  const maxW = links.reduce((m, l) => Math.max(m, l.weight), 1);
  for (let it = 0; it < 180; it++) {
    const vel: Pt[] = ids.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        const dist = Math.hypot(dx, dy) + 8;
        const f = 22000 / (dist * dist);
        dx = (dx / dist) * f;
        dy = (dy / dist) * f;
        vel[i].x += dx;
        vel[i].y += dy;
        vel[j].x -= dx;
        vel[j].y -= dy;
      }
    }
    for (const l of links) {
      const i = idx.get(l.source);
      const j = idx.get(l.target);
      if (i === undefined || j === undefined || i === j) continue;
      let dx = pos[j].x - pos[i].x;
      let dy = pos[j].y - pos[i].y;
      const dist = Math.hypot(dx, dy) + 0.01;
      const f = dist * 0.01 * (0.35 + (l.weight / maxW) * 1.25);
      dx = (dx / dist) * f;
      dy = (dy / dist) * f;
      vel[i].x += dx;
      vel[i].y += dy;
      vel[j].x -= dx;
      vel[j].y -= dy;
    }
    for (let i = 0; i < n; i++) {
      vel[i].x += (W / 2 - pos[i].x) * 0.004;
      vel[i].y += (H / 2 - pos[i].y) * 0.004;
      pos[i].x = clamp(pos[i].x + vel[i].x * 0.7, MARGIN + NODE_R, W - MARGIN - NODE_R);
      pos[i].y = clamp(pos[i].y + vel[i].y * 0.7, MARGIN + NODE_R, H - MARGIN - NODE_R);
    }
  }
  // Dense graphs (every digit linked) collapse to the centre: stretch the result to fill the frame.
  const xs = pos.map((p) => p.x);
  const ys = pos.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const lo = MARGIN + NODE_R;
  const fit = (v: number, a: number, b: number, size: number) => (b - a < 1 ? size / 2 : lo + ((v - a) / (b - a)) * (size - 2 * lo));
  return Object.fromEntries(ids.map((id, i) => [id, { x: fit(pos[i].x, x0, x1, W), y: fit(pos[i].y, y0, y1, H) }]));
}

type Props = {
  nodes: { id: string }[];
  links: AnalyticsGraphLink[];
  /** Directed links draw as dotted lines with the arrow sense in labels. */
  directed?: boolean;
  label: string;
};

export function ForceGraph({ nodes, links, directed = false, label }: Props) {
  const ids = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const initial = useMemo(() => layoutNodes(ids, links), [ids, links]);
  const [pos, setPos] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [pan, setPan] = useState<Pt>({ x: 0, y: 0 });
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: 'node'; id: string; moved: boolean } | { kind: 'pan'; start: Pt; origin: Pt } | null>(
    null,
  );

  useEffect(() => {
    setPos(initial);
    setSelected(null);
  }, [initial]);

  const zoom = ZOOMS[zoomIdx];
  const vw = W / zoom;
  const vh = H / zoom;
  const vx = clamp(W / 2 - vw / 2 - pan.x, 0, W - vw);
  const vy = clamp(H / 2 - vh / 2 - pan.y, 0, H - vh);
  const maxW = links.reduce((m, l) => Math.max(m, l.weight), 1);
  const arrow = directed ? '→' : '↔';

  const toSvg = (e: RPointerEvent): Pt => {
    const ctm = svg.current!.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const neighbors = useMemo(() => {
    if (!selected) return [];
    return links
      .filter((l) => l.source === selected || l.target === selected)
      .map((l) => ({ l, other: l.source === selected ? l.target : l.source }))
      .sort((a, b) => b.l.weight - a.l.weight);
  }, [links, selected]);
  const near = useMemo(() => new Set([selected, ...neighbors.map((n) => n.other)]), [neighbors, selected]);

  const onNodeDown = (e: RPointerEvent, id: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: 'node', id, moved: false };
  };

  const onBgDown = (e: RPointerEvent) => {
    if (zoom <= 1) return;
    svg.current!.setPointerCapture(e.pointerId);
    drag.current = { kind: 'pan', start: { x: e.clientX, y: e.clientY }, origin: pan };
  };

  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'node') {
      const p = toSvg(e);
      d.moved = true;
      setPos((prev) => ({
        ...prev,
        [d.id]: { x: clamp(p.x, NODE_R, W - NODE_R), y: clamp(p.y, NODE_R, H - NODE_R) },
      }));
    } else {
      const rect = svg.current!.getBoundingClientRect();
      const scale = vw / rect.width;
      setPan({ x: d.origin.x + (e.clientX - d.start.x) * scale, y: d.origin.y + (e.clientY - d.start.y) * scale });
    }
  };

  const onUp = () => {
    const d = drag.current;
    if (d?.kind === 'node' && !d.moved) setSelected((s) => (s === d.id ? null : d.id));
    drag.current = null;
  };

  return (
    <div className="chart">
      <div className="graph-stage">
        <svg
          ref={svg}
          viewBox={`${vx} ${vy} ${vw} ${vh}`}
          role="group"
          aria-label={`${label}. Tab to a digit and press Enter to see its strongest links.`}
          onPointerDown={onBgDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{ aspectRatio: `${W} / ${H}` }}
        >
          <rect x={0} y={0} width={W} height={H} fill="transparent" onClick={() => setSelected(null)} />
          {links.map((l, i) => {
            const a = pos[l.source];
            const b = pos[l.target];
            if (!a || !b) return null;
            const t = l.weight / maxW;
            const incident = selected != null && (l.source === selected || l.target === selected);
            const op = selected ? (incident ? 1 : 0.08) : 0.25 + t * 0.6;
            return (
              <line
                key={`${l.source}-${l.target}-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={incident ? 'var(--chart-curve)' : 'var(--chart-bar)'}
                strokeWidth={incident ? 1.5 + t * 2.5 : 1 + t * 2}
                strokeLinecap="round"
                strokeDasharray={directed ? '2 5' : undefined}
                opacity={op}
              />
            );
          })}
          {nodes.map((n) => {
            const p = pos[n.id];
            if (!p) return null;
            const sel = n.id === selected;
            const dim = selected != null && !near.has(n.id);
            return (
              <g
                key={n.id}
                className="graph-node"
                transform={`translate(${p.x} ${p.y})`}
                tabIndex={0}
                role="button"
                aria-pressed={sel}
                aria-label={`Digit ${n.id}`}
                opacity={dim ? 0.3 : 1}
                onPointerDown={(e) => onNodeDown(e, n.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected((s) => (s === n.id ? null : n.id));
                  }
                }}
              >
                <circle
                  r={sel ? NODE_R + 3 : NODE_R}
                  fill={sel ? 'var(--chart-curve)' : 'var(--chart-node)'}
                  stroke={sel ? 'var(--surface)' : 'var(--chart-bar)'}
                  strokeWidth={2}
                />
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  fontSize={16}
                  fontWeight={800}
                  fill={sel ? '#1b1300' : 'var(--ink)'}
                  style={{ fontFamily: 'var(--font-display)', pointerEvents: 'none' }}
                >
                  {n.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="chart-toolbar">
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => setZoomIdx((z) => Math.max(0, z - 1))}
          disabled={zoomIdx === 0}
          aria-label="Zoom out"
        >
          <IconZoomOut size={18} aria-hidden />
        </button>
        <span className="tnum" style={{ minWidth: 40, textAlign: 'center' }} aria-live="polite">
          {zoom}×
        </span>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))}
          disabled={zoomIdx === ZOOMS.length - 1}
          aria-label="Zoom in"
        >
          <IconZoomIn size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => {
            setZoomIdx(0);
            setPan({ x: 0, y: 0 });
            setPos(initial);
            setSelected(null);
          }}
        >
          <IconRefresh size={16} aria-hidden /> Reset
        </button>
        <p className="chart-toolbar__status" aria-live="polite">
          {selected && neighbors.length
            ? neighbors
                .slice(0, 6)
                .map((n) =>
                  directed
                    ? `${n.l.source}${arrow}${n.l.target}: ${Math.round(n.l.weight)}`
                    : `${selected}${arrow}${n.other}: ${Math.round(n.l.weight)}`,
                )
                .join(' · ')
            : 'Select a digit to see its strongest links. Drag digits to untangle; drag the background to pan when zoomed.'}
        </p>
      </div>

      <details className="table-toggle">
        <summary>Show as a table</summary>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{directed ? 'From draw N' : 'Digit'}</th>
                <th scope="col">{directed ? 'To draw N+1' : 'Pairs with'}</th>
                <th scope="col">Count</th>
              </tr>
            </thead>
            <tbody>
              {[...links]
                .sort((a, b) => b.weight - a.weight)
                .map((l, i) => (
                  <tr key={i}>
                    <td>{l.source}</td>
                    <td>{l.target}</td>
                    <td>{Math.round(l.weight).toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
