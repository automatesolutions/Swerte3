import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import type { AnalyticsGraphLink } from '../services/api';

export const ANALYTICS_BG = '#0a1628';
export const ANALYTICS_CARD = 'rgba(15, 23, 42, 0.92)';
export const ANALYTICS_CYAN = '#7dd3fc';
export const ANALYTICS_GOLD = '#fbbf24';
export const ANALYTICS_MUTED = 'rgba(148, 163, 184, 0.85)';
export const ANALYTICS_GRID = 'rgba(56, 189, 248, 0.18)';
export const ANALYTICS_LINE_XGB = '#38bdf8';
export const ANALYTICS_LINE_MKV = '#c084fc';
export const ANALYTICS_LINE_MIRO = '#fbbf24';

type Pt = { x: number; y: number };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export type ForceGraphLayout = 'compact' | 'spread';

/** Simple force layout for small digit graphs (0–9 nodes). */
export function useForcePositions(
  nodeIds: string[],
  links: AnalyticsGraphLink[],
  width: number,
  height: number,
  layout: ForceGraphLayout = 'compact',
): Record<string, Pt> {
  return useMemo(() => {
    const spread = layout === 'spread';
    const margin = spread ? 26 : 36;
    const W = width - margin * 2;
    const H = height - margin * 2;
    const n = nodeIds.length;
    if (n === 0) return {};
    const idx = new Map(nodeIds.map((id, i) => [id, i]));
    const ring = spread ? 0.52 : 0.28;
    const pos: Pt[] = nodeIds.map((_, i) => {
      const a = (i / Math.max(n, 1)) * Math.PI * 2;
      return {
        x: margin + W * 0.5 + Math.cos(a) * W * ring,
        y: margin + H * 0.5 + Math.sin(a) * H * ring,
      };
    });
    const vel: Pt[] = nodeIds.map(() => ({ x: 0, y: 0 }));
    const iterations = spread ? 165 : 85;
    const kRep = spread ? 14_000 : 4200;
    const kAtt = spread ? 0.011 : 0.032;
    const damp = spread ? 0.72 : 0.78;
    const centerPull = spread ? 0.003 : 0.018;

    const maxW = links.reduce((m, l) => Math.max(m, l.weight), 1);

    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i < n; i++) {
        vel[i].x = 0;
        vel[i].y = 0;
      }
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = pos[i].x - pos[j].x;
          let dy = pos[i].y - pos[j].y;
          const distPad = spread ? 7 : 4;
          const dist = Math.sqrt(dx * dx + dy * dy) + distPad;
          const f = kRep / (dist * dist);
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
        if (i === undefined || j === undefined) continue;
        let dx = pos[j].x - pos[i].x;
        let dy = pos[j].y - pos[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const w = 0.35 + (l.weight / maxW) * 1.25;
        const f = dist * kAtt * w;
        dx = (dx / dist) * f;
        dy = (dy / dist) * f;
        vel[i].x += dx;
        vel[i].y += dy;
        vel[j].x -= dx;
        vel[j].y -= dy;
      }
      const cx = margin + W * 0.5;
      const cy = margin + H * 0.5;
      for (let i = 0; i < n; i++) {
        vel[i].x += (cx - pos[i].x) * centerPull;
        vel[i].y += (cy - pos[i].y) * centerPull;
        vel[i].x *= damp;
        vel[i].y *= damp;
        pos[i].x += vel[i].x;
        pos[i].y += vel[i].y;
        pos[i].x = clamp(pos[i].x, margin + 8, margin + W - 8);
        pos[i].y = clamp(pos[i].y, margin + 8, margin + H - 8);
      }
    }
    const out: Record<string, Pt> = {};
    nodeIds.forEach((id, i) => {
      out[id] = pos[i];
    });
    return out;
  }, [nodeIds, links, width, height, layout]);
}

type ForceGraphProps = {
  width: number;
  height: number;
  nodes: { id: string }[];
  links: AnalyticsGraphLink[];
  nodeBorder: string;
  layout?: ForceGraphLayout;
  zoomable?: boolean;
  edgeStyle?: 'solid' | 'dotted';
  edgeThickness?: 'normal' | 'thin';
};

const GRAPH_FOOTER_H = 44;
const ZOOM_BAR_H = 38;
const ZOOM_LEVELS = [1, 1.25, 1.5, 1.75, 2] as const;

export function ForceGraphView({
  width,
  height,
  nodes,
  links,
  nodeBorder,
  layout = 'compact',
  zoomable = false,
  edgeStyle = 'solid',
  edgeThickness = 'normal',
}: ForceGraphProps): React.ReactElement {
  const ids = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const plotH = Math.max(100, height - GRAPH_FOOTER_H - (zoomable ? ZOOM_BAR_H : 0));
  const initialPos = useForcePositions(ids, links, width, plotH, layout);
  const [positions, setPositions] = useState<Record<string, Pt>>(initialPos);
  const positionsRef = useRef(positions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const interactionRef = useRef<'node' | 'pan' | null>(null);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [zoomIdx, setZoomIdx] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef(pan);
  const zoom = ZOOM_LEVELS[zoomIdx];

  const layoutMargin = layout === 'spread' ? 26 : 36;
  const nodePad = layout === 'spread' ? 5 : 8;
  const maxW = links.reduce((m, l) => Math.max(m, l.weight), 1);

  useEffect(() => {
    setPositions({ ...initialPos });
    setSelectedId(null);
    setPan({ x: 0, y: 0 });
    setZoomIdx(0);
  }, [initialPos]);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const neighborIds = useMemo(() => {
    if (!selectedId) return null as Set<string> | null;
    const s = new Set<string>();
    s.add(selectedId);
    for (const l of links) {
      if (l.source === selectedId) s.add(l.target);
      if (l.target === selectedId) s.add(l.source);
    }
    return s;
  }, [selectedId, links]);

  const findNodeAt = useCallback(
    (x: number, y: number) => {
      const hitR = 18;
      for (const id of ids) {
        const p = positionsRef.current[id];
        if (!p) continue;
        const dx = x - p.x;
        const dy = y - p.y;
        if (dx * dx + dy * dy <= hitR * hitR) return id;
      }
      return null;
    },
    [ids],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (e) => {
          const x = e.nativeEvent.locationX;
          const y = e.nativeEvent.locationY;
          if (findNodeAt(x, y)) return true;
          if (zoomable && zoom > 1.001) return true;
          return false;
        },
        onMoveShouldSetPanResponder: (_, gs) =>
          interactionRef.current === 'pan' ||
          (interactionRef.current === 'node' &&
            dragRef.current != null &&
            (Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2)),
        onPanResponderGrant: (e) => {
          const x = e.nativeEvent.locationX;
          const y = e.nativeEvent.locationY;
          const id = findNodeAt(x, y);
          if (id) {
            interactionRef.current = 'node';
            const p = positionsRef.current[id];
            dragRef.current = { id, ox: p.x, oy: p.y };
          } else if (zoomable && zoom > 1.001) {
            interactionRef.current = 'pan';
            dragRef.current = null;
            panStartRef.current = { ...panRef.current };
          } else {
            interactionRef.current = null;
            dragRef.current = null;
          }
        },
        onPanResponderMove: (_, gs) => {
          if (interactionRef.current === 'node' && dragRef.current) {
            const { id, ox, oy } = dragRef.current;
            const nx = clamp(ox + gs.dx, layoutMargin + nodePad, width - layoutMargin - nodePad);
            const ny = clamp(oy + gs.dy, layoutMargin + nodePad, plotH - layoutMargin - nodePad);
            setPositions((prev) => ({ ...prev, [id]: { x: nx, y: ny } }));
          } else if (interactionRef.current === 'pan') {
            setPan({
              x: panStartRef.current.x + gs.dx,
              y: panStartRef.current.y + gs.dy,
            });
          }
        },
        onPanResponderRelease: (_, gs) => {
          if (interactionRef.current === 'node' && dragRef.current) {
            const moved = Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5;
            if (!moved) {
              const id = dragRef.current.id;
              setSelectedId((s) => (s === id ? null : id));
            }
          }
          dragRef.current = null;
          interactionRef.current = null;
        },
        onPanResponderTerminate: () => {
          dragRef.current = null;
          interactionRef.current = null;
        },
      }),
    [findNodeAt, width, plotH, layoutMargin, nodePad, zoomable, zoom],
  );

  const neighborLine = useMemo(() => {
    if (!selectedId) return '';
    const rows = links
      .filter((l) => l.source === selectedId || l.target === selectedId)
      .map((l) => ({
        other: l.source === selectedId ? l.target : l.source,
        w: Math.round(l.weight),
      }))
      .sort((a, b) => b.w - a.w)
      .slice(0, 8)
      .map((r) => `${selectedId}↔${r.other}: ${r.w}`);
    return rows.join(' · ');
  }, [selectedId, links]);

  const cx = width / 2;
  const cy = plotH / 2;

  return (
    <View style={{ width, height }}>
      <View style={{ width, height: plotH, overflow: 'hidden' }} {...panResponder.panHandlers}>
        <View
          style={{
            width,
            height: plotH,
            transform: [
              { translateX: cx },
              { translateY: cy },
              { scale: zoom },
              { translateX: -cx + pan.x },
              { translateY: -cy + pan.y },
            ],
          }}
        >
          <Svg width={width} height={plotH}>
            {links.map((l, i) => {
              const a = positions[l.source];
              const b = positions[l.target];
              if (!a || !b) return null;
              const t = 0.35 + (0.65 * l.weight) / maxW;
              const incident = !!(selectedId && (l.source === selectedId || l.target === selectedId));
              const fadeOthers = !!selectedId;
              const stroke = incident ? nodeBorder : 'rgba(125,211,252,0.92)';
              const baseOp = 0.78 + t * 0.22;
              const opacity = fadeOthers ? (incident ? 1 : 0.12) : baseOp;
              const thin = edgeThickness === 'thin';
              const normalW = thin ? Math.min(2.2, 0.65 + t * 1.15) : Math.min(3.4, 1.05 + t * 2.05);
              const selectedW = thin ? Math.min(2.8, 0.9 + t * 1.45) : Math.min(4.2, 1.5 + t * 2.1);
              return (
                <Line
                  key={`${l.source}-${l.target}-${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={stroke}
                  strokeLinecap="round"
                  strokeWidth={incident ? selectedW : normalW}
                  strokeDasharray={edgeStyle === 'dotted' ? (incident ? '2.5 5' : '2 5') : undefined}
                  opacity={opacity}
                />
              );
            })}
            {nodes.map((n) => {
              const p = positions[n.id];
              if (!p) return null;
              const sel = n.id === selectedId;
              const relevant = !neighborIds || neighborIds.has(n.id);
              const nodeOp = neighborIds && !relevant ? 0.32 : 1;
              return (
                <React.Fragment key={n.id}>
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r={sel ? 13 : 11}
                    fill={sel ? 'rgba(30,58,95,0.98)' : 'rgba(10,22,40,0.95)'}
                    stroke={nodeBorder}
                    strokeWidth={sel ? 2.2 : 1.6}
                    opacity={nodeOp}
                  />
                  <SvgText
                    x={p.x}
                    y={p.y + 4}
                    fill="#f8fafc"
                    fontSize={sel ? 12 : 11}
                    fontWeight="700"
                    textAnchor="middle"
                    opacity={nodeOp}
                  >
                    {n.id}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
        </View>
      </View>
      {zoomable ? (
        <View style={styles.zoomBar}>
          <Pressable
            onPress={() => setZoomIdx((i) => Math.max(0, i - 1))}
            style={({ pressed }) => [styles.zoomBtn, pressed && styles.zoomBtnPressed]}
            disabled={zoomIdx <= 0}
          >
            <Text style={[styles.zoomBtnTxt, zoomIdx <= 0 && styles.zoomBtnTxtOff]}>−</Text>
          </Pressable>
          <Text style={styles.zoomLabel}>{zoom.toFixed(2)}×</Text>
          <Pressable
            onPress={() => setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
            style={({ pressed }) => [styles.zoomBtn, pressed && styles.zoomBtnPressed]}
            disabled={zoomIdx >= ZOOM_LEVELS.length - 1}
          >
            <Text style={[styles.zoomBtnTxt, zoomIdx >= ZOOM_LEVELS.length - 1 && styles.zoomBtnTxtOff]}>+</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setZoomIdx(0);
              setPan({ x: 0, y: 0 });
            }}
            style={({ pressed }) => [styles.zoomReset, pressed && styles.zoomBtnPressed]}
          >
            <Text style={styles.zoomResetTxt}>Reset</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.graphFooter}>
        {selectedId && neighborLine ? (
          <Text style={styles.graphFooterText} numberOfLines={2}>
            {neighborLine}
          </Text>
        ) : (
          <Text style={styles.graphFooterText}>
            {zoomable
              ? '+/− zoom · Drag empty area to pan when zoomed · Tap/drag nodes'
              : 'Tap a digit for pair weights · Drag nodes to rearrange'}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  graphFooter: {
    height: GRAPH_FOOTER_H,
    paddingHorizontal: 6,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(56, 189, 248, 0.15)',
  },
  graphFooterText: {
    color: ANALYTICS_MUTED,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  zoomBar: {
    height: ZOOM_BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(56, 189, 248, 0.12)',
  },
  zoomBtn: {
    minWidth: 40,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  zoomBtnPressed: { opacity: 0.75 },
  zoomBtnTxt: { color: ANALYTICS_CYAN, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  zoomBtnTxtOff: { opacity: 0.35 },
  zoomLabel: { color: '#e2e8f0', fontSize: 13, fontWeight: '700', minWidth: 52, textAlign: 'center' },
  zoomReset: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.4)',
    marginLeft: 4,
  },
  zoomResetTxt: { color: ANALYTICS_GOLD, fontSize: 12, fontWeight: '800' },
});

type HistProps = {
  width: number;
  height: number;
  title: string;
  bins: number[];
  curve: { x: number; y: number }[];
  xLabel: string;
  xMin: number;
  xMax: number;
};

/** Histogram with overlaid normal PDF (same vertical scale as bars). */
export function HistogramWithNormal({
  width,
  height,
  title,
  bins,
  curve,
  xLabel,
  xMin,
  xMax,
}: HistProps): React.ReactElement {
  const padL = 36;
  const padR = 12;
  const padT = 28;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const histMax = Math.max(1, ...bins);
  const nb = bins.length;
  const barW = innerW / Math.max(nb, 1);
  const curvePts = useMemo(() => {
    if (!curve.length) return '';
    const cmax = Math.max(1e-12, ...curve.map((c) => c.y));
    const pts: string[] = [];
    for (const c of curve) {
      const nx = (c.x - xMin) / (xMax - xMin || 1);
      const px = padL + clamp(nx, 0, 1) * innerW;
      const py = padT + innerH - (c.y / cmax) * innerH * 0.92;
      pts.push(`${px},${py}`);
    }
    return pts.join(' ');
  }, [curve, xMin, xMax, innerW, innerH, padL, padT]);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <SvgText x={12} y={18} fill={ANALYTICS_CYAN} fontSize={11} fontWeight="700">
          {title}
        </SvgText>
        {bins.map((h, i) => {
          const bh = (h / histMax) * innerH * 0.92;
          const x = padL + i * barW + barW * 0.08;
          const bw = barW * 0.84;
          const y = padT + innerH - bh;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={bw}
              height={Math.max(1, bh)}
              fill="rgba(56,189,248,0.35)"
              rx={2}
            />
          );
        })}
        {curvePts ? (
          <Polyline points={curvePts} fill="none" stroke={ANALYTICS_GOLD} strokeWidth={2} opacity={0.95} />
        ) : null}
        <SvgText x={padL} y={height - 8} fill={ANALYTICS_MUTED} fontSize={9}>
          {xLabel}
        </SvgText>
      </Svg>
    </View>
  );
}

type ErrPoint = { i: number; xgb: number; mkv: number; miro: number | null };

type ErrorChartProps = {
  width: number;
  height: number;
  points: ErrPoint[];
};

function polylinesForNullableSeries(
  points: ErrPoint[],
  innerW: number,
  innerH: number,
  pad: number,
  sel: (p: ErrPoint) => number | null,
): string[] {
  const n = Math.max(points.length, 1);
  const segments: string[] = [];
  let cur: string[] = [];
  for (const p of points) {
    const v = sel(p);
    if (v === null) {
      if (cur.length) {
        segments.push(cur.join(' '));
        cur = [];
      }
      continue;
    }
    const px = pad + (p.i / Math.max(n - 1, 1)) * innerW;
    const py = pad + innerH - (v / 3) * innerH * 0.92;
    cur.push(`${px},${py}`);
  }
  if (cur.length) segments.push(cur.join(' '));
  return segments;
}

export function ErrorDistanceLineChart({ width, height, points }: ErrorChartProps): React.ReactElement {
  const pad = 36;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const line = (sel: (p: ErrPoint) => number | null, color: string) =>
    polylinesForNullableSeries(points, innerW, innerH, pad, sel).map((pts, idx) => (
      <Polyline key={`${color}-${idx}`} points={pts} fill="none" stroke={color} strokeWidth={2.2} />
    ));

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {[0, 1, 2, 3].map((g) => {
          const y = pad + innerH - (g / 3) * innerH * 0.92;
          return (
            <Line
              key={g}
              x1={pad}
              y1={y}
              x2={width - pad}
              y2={y}
              stroke={ANALYTICS_GRID}
              strokeWidth={1}
            />
          );
        })}
        {line((p) => p.xgb, ANALYTICS_LINE_XGB)}
        {line((p) => p.mkv, ANALYTICS_LINE_MKV)}
        {line((p) => p.miro, ANALYTICS_LINE_MIRO)}
        <SvgText x={pad} y={22} fill={ANALYTICS_MUTED} fontSize={10}>
          Hamming distance (0 = perfect)
        </SvgText>
      </Svg>
    </View>
  );
}
