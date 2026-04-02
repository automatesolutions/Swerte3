import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BarChart } from 'react-native-gifted-charts';

import type { AnalyticsGaussianPayload } from '../services/api';
import { ANALYTICS_GOLD, ANALYTICS_MUTED } from './chartParts';

type BarDatum = {
  value: number;
  label: string;
  frontColor: string;
  sumIdx?: number;
  logCenter?: number;
  curveY?: number;
  zLog?: number;
};

const BAR = 'rgba(56, 189, 248, 0.58)';

type Props = {
  data: AnalyticsGaussianPayload;
  width: number;
};

function pointerLabel(items: BarDatum[] | undefined, kind: 'sum' | 'log'): React.ReactElement {
  const it = items?.[0];
  const obs = it?.value ?? 0;
  const curve = it?.curveY;
  if (kind === 'sum') {
    const s = it?.sumIdx;
    return (
      <View style={styles.tooltip}>
        <Text style={styles.tooltipTitle}>Digit sum {s != null ? s : '—'}</Text>
        <Text style={styles.tooltipLine}>Observed: {obs}</Text>
        {curve != null ? <Text style={styles.tooltipMuted}>Curve: {curve.toFixed(1)}</Text> : null}
      </View>
    );
  }
  const c = it?.logCenter;
  const z = it?.zLog;
  return (
    <View style={styles.tooltip}>
      <Text style={styles.tooltipTitle}>ln(product) ≈ {c != null ? c.toFixed(2) : '—'}</Text>
      <Text style={styles.tooltipLine}>Observed: {obs}</Text>
      {curve != null ? <Text style={styles.tooltipMuted}>Curve: {curve.toFixed(1)}</Text> : null}
      {z != null ? <Text style={styles.tooltipMuted}>z: {z.toFixed(2)}</Text> : null}
    </View>
  );
}

export function GaussianNormalizationCharts({ data, width }: Props): React.ReactElement {
  const compactLayout = width < 360;
  /** Card inner width minus this chart block’s horizontal padding */
  const blockHPad = compactLayout ? 8 : 20;
  const chartW = Math.max(200, width - blockHPad);
  const compact = chartW < 340;
  const sumLabelEvery = compact ? 5 : 3;
  const logLabelEvery = compact ? 6 : 4;

  const sumPack = useMemo(() => {
    const hist = data.sum_histogram ?? [];
    const curve = data.sum_normal_curve ?? [];
    const n = 28;
    const h = hist.length >= n ? hist.slice(0, n) : [...hist, ...Array(n - hist.length).fill(0)];
    const lineYs = Array.from({ length: n }, (_, i) => curve[i]?.y ?? 0);
    const maxVal = Math.max(...h, ...lineYs, 1) * 1.08;
    const barData: BarDatum[] = h.map((v, i) => ({
      value: v,
      label: i % sumLabelEvery === 0 ? String(i) : '',
      frontColor: BAR,
      sumIdx: i,
      curveY: lineYs[i],
    }));
    const lineData = lineYs.map((v) => ({ value: v }));
    return { barData, lineData, maxVal };
  }, [data.sum_histogram, data.sum_normal_curve, sumLabelEvery]);

  const logPack = useMemo(() => {
    const hist = data.log_histogram ?? [];
    const curve = data.log_normal_curve ?? [];
    const range = data.log_histogram_range ?? { min: 0, max: 1, bins: hist.length || 24 };
    const bins = range.bins || hist.length || 1;
    const lo = range.min;
    const hi = range.max;
    const step = bins > 0 && hi > lo ? (hi - lo) / bins : 1;
    const h = hist.length >= bins ? hist.slice(0, bins) : [...hist, ...Array(bins - hist.length).fill(0)];
    const mu = data.mean_log_product;
    const sig = data.std_log_product > 1e-12 ? data.std_log_product : 1e-12;
    const lineYs = Array.from({ length: bins }, (_, i) => curve[i]?.y ?? 0);
    const maxVal = Math.max(...h, ...lineYs, 1) * 1.08;
    const barData: BarDatum[] = h.map((v, i) => {
      const center = lo + (i + 0.5) * step;
      return {
        value: v,
        label: i % logLabelEvery === 0 ? center.toFixed(1) : '',
        frontColor: BAR,
        logCenter: center,
        curveY: lineYs[i],
        zLog: (center - mu) / sig,
      };
    });
    const lineData = lineYs.map((v) => ({ value: v }));
    return { barData, lineData, maxVal };
  }, [
    data.log_histogram,
    data.log_normal_curve,
    data.log_histogram_range,
    data.mean_log_product,
    data.std_log_product,
    logLabelEvery,
  ]);

  const chartHeight = compact ? 200 : 220;
  const yAxisLabelWidth = compact ? 36 : 44;

  const commonChart = {
    height: chartHeight,
    adjustToWidth: true,
    parentWidth: chartW,
    width: chartW,
    yAxisLabelWidth,
    rotateLabel: compact,
    labelsExtraHeight: compact ? 14 : 4,
    xAxisLabelsVerticalShift: compact ? 4 : 0,
    noOfSections: 4,
    showLine: true,
    isAnimated: true,
    animationDuration: 550,
    roundedTop: true,
    barBorderRadius: 4,
    yAxisColor: 'rgba(148,163,184,0.35)',
    xAxisColor: 'rgba(148,163,184,0.35)',
    rulesColor: 'rgba(56,189,248,0.08)',
    yAxisTextStyle: { color: ANALYTICS_MUTED, fontSize: compact ? 9 : 10 },
    xAxisLabelTextStyle: { color: ANALYTICS_MUTED, fontSize: compact ? 8 : 9 },
    backgroundColor: 'rgba(10, 22, 40, 0.72)',
    lineConfig: {
      color: ANALYTICS_GOLD,
      thickness: 2.5,
      curved: true,
      hideDataPoints: true,
      isAnimated: true,
    },
  } as const;

  const blockPad = compactLayout ? styles.blockCompact : styles.block;

  return (
    <View style={styles.wrap}>
      <LinearGradient colors={['rgba(30, 58, 95, 0.35)', 'rgba(15, 23, 42, 0.95)']} style={blockPad}>
        <Text style={styles.blockTitle}>Digit sum (0–27)</Text>
        <Text style={styles.blockHint} numberOfLines={compact ? 3 : undefined}>
          {compact
            ? 'Bars: counts · line: fitted normal (scaled)'
            : 'Bars: observed counts · Gold: fitted normal (peak matched)'}
        </Text>
        <BarChart
          {...commonChart}
          data={sumPack.barData}
          lineData={sumPack.lineData}
          maxValue={sumPack.maxVal}
          pointerConfig={{
            pointerStripColor: 'rgba(251, 191, 36, 0.4)',
            pointerStripWidth: 2,
            activatePointersInstantlyOnTouch: true,
            pointerLabelComponent: (items: BarDatum[]) => pointerLabel(items, 'sum'),
          }}
        />
      </LinearGradient>

      <LinearGradient colors={['rgba(30, 58, 95, 0.35)', 'rgba(15, 23, 42, 0.95)']} style={blockPad}>
        <Text style={styles.blockTitle}>Log(product)</Text>
        <Text style={styles.blockHint} numberOfLines={compact ? 3 : undefined}>
          {compact
            ? 'ln(d₁×d₂×d₃) bins vs normal at bin centers'
            : 'Binned ln(d₁×d₂×d₃) vs scaled normal at bin centers'}
        </Text>
        <BarChart
          {...commonChart}
          data={logPack.barData}
          lineData={logPack.lineData}
          maxValue={logPack.maxVal}
          pointerConfig={{
            pointerStripColor: 'rgba(251, 191, 36, 0.4)',
            pointerStripWidth: 2,
            activatePointersInstantlyOnTouch: true,
            pointerLabelComponent: (items: BarDatum[]) => pointerLabel(items, 'log'),
          }}
        />
      </LinearGradient>

      <Text style={styles.footerHint} numberOfLines={compact ? 2 : undefined}>
        {compact
          ? 'Tap or drag on a chart to see counts and the reference curve.'
          : 'Drag across a chart to inspect counts and the reference curve.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignSelf: 'stretch', gap: 14 },
  block: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.14)',
    overflow: 'hidden',
  },
  blockCompact: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.14)',
    overflow: 'hidden',
  },
  blockTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  blockHint: { color: ANALYTICS_MUTED, fontSize: 11, marginBottom: 8, lineHeight: 16 },
  footerHint: { color: ANALYTICS_MUTED, fontSize: 11, textAlign: 'center', marginTop: 4 },
  tooltip: {
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.45)',
    minWidth: 120,
  },
  tooltipTitle: { color: '#f8fafc', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  tooltipLine: { color: '#e2e8f0', fontSize: 12 },
  tooltipMuted: { color: ANALYTICS_MUTED, fontSize: 11, marginTop: 2 },
});
