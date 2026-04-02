import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GaussianNormalizationCharts } from '../analytics/GaussianNormalizationCharts';
import {
  ANALYTICS_BG,
  ANALYTICS_CARD,
  ANALYTICS_CYAN,
  ANALYTICS_GOLD,
  ANALYTICS_LINE_MIRO,
  ANALYTICS_LINE_MKV,
  ANALYTICS_LINE_XGB,
  ANALYTICS_MUTED,
  ErrorDistanceLineChart,
  ForceGraphView,
} from '../analytics/chartParts';
import type { RootStackParamList } from '../navigation/types';
import type {
  AnalyticsCrossDrawGraph,
  AnalyticsDashboard,
  AnalyticsErrorSeriesPoint,
  AnalyticsGraphLink,
} from '../services/api';
import { fetchAnalyticsDashboard } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'AnalyticsFeature'>;

const logoSource = require('../../assets/Logo.png');

const TITLES: Record<Props['route']['params']['kind'], string> = {
  gaussian: 'Gaussian',
  error_distance: 'Error distance',
  cooccurrence: 'Co-occurrence',
  cross_draw: 'Cross-draw',
};

function sessionFilter(
  data: AnalyticsDashboard | null,
  f: string | null,
): AnalyticsDashboard | null {
  if (!data || f === null) return data;
  return {
    ...data,
    error_series: (data.error_series ?? []).filter((p) => p.session === f),
  };
}

export function AnalyticsFeatureScreen({ route, navigation }: Props): React.ReactElement {
  const { kind } = route.params;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const chartW = Math.min(width - 32, 420);
  /** Scroll + card padding; cap width so web/desktop does not stretch charts edge-to-edge */
  const gaussianChartW = Math.min(Math.max(232, width - 64), 420);
  const coocChartW = Math.min(Math.max(232, width - 64), 440);
  const coocGraphH = Math.min(420, Math.max(300, Math.round(width * 0.92)));
  const graphH = Math.min(320, Math.round(width * 0.72));
  // Cross-draw needs more vertical space because the ForceGraph includes zoom + footer bars.
  const crossGraphW = Math.min(Math.max(232, width - 64), 420);
  const crossGraphH = Math.min(420, Math.max(300, Math.round(width * 0.92)));

  const [filter, setFilter] = useState<string | null>(null);
  const [raw, setRaw] = useState<AnalyticsDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Cross-draw + co-occurrence: show all sessions in one chart (no chips needed).
  const effectiveFilter =
    kind === 'gaussian' || kind === 'cooccurrence' || kind === 'cross_draw' ? null : filter;

  useLayoutEffect(() => {
    if (kind === 'gaussian') {
      navigation.setOptions({
        headerTitle: () => (
          <View style={styles.headerTitleRow}>
            <Image source={logoSource} style={styles.headerLogo} resizeMode="contain" accessibilityLabel="Swerte3 logo" />
            <Text style={styles.headerTitleText}>Gaussian</Text>
          </View>
        ),
      });
    } else {
      navigation.setOptions({ headerTitle: TITLES[kind] });
    }
  }, [kind, navigation]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchAnalyticsDashboard(effectiveFilter);
      setRaw(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Hindi ma-load.');
      setRaw(null);
    } finally {
      setLoading(false);
    }
  }, [effectiveFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = useMemo(() => sessionFilter(raw, effectiveFilter), [raw, effectiveFilter]);

  const errorPts = useMemo(() => {
    const s = data?.error_series ?? [];
    return s.map((p: AnalyticsErrorSeriesPoint, i: number) => ({
      i,
      xgb: p.alon_xgb,
      mkv: p.alon_markov,
      miro: p.lihim_miro,
    }));
  }, [data]);

  const crossGraphs = useMemo((): { key: string; g: AnalyticsCrossDrawGraph }[] => {
    const g = data?.cross_draw_graphs;
    if (!g) return [];
    if (filter) {
      const one = g[filter];
      return one && one.links.length ? [{ key: filter, g: one }] : [];
    }
    const out: { key: string; g: AnalyticsCrossDrawGraph }[] = [];
    for (const k of ['9am', '4pm', '9pm'] as const) {
      const cg = g[k];
      if (cg && cg.links.length) out.push({ key: k, g: cg });
    }
    return out;
  }, [data, filter]);

  const crossCombined = useMemo((): { nodes: { id: string }[]; links: AnalyticsGraphLink[]; draws: number; pairTypes: number } | null => {
    if (!crossGraphs.length) return null;
    const weightMap = new Map<string, number>();
    const nodeSet = new Set<string>();
    let draws = 0;
    for (const { g: cg } of crossGraphs) {
      draws += cg.draws_sampled;
      for (const l of cg.links) {
        const k = `${l.source}|${l.target}`;
        weightMap.set(k, (weightMap.get(k) ?? 0) + l.weight);
        nodeSet.add(l.source);
        nodeSet.add(l.target);
      }
    }
    const allLinks: { source: string; target: string; weight: number }[] = Array.from(weightMap.entries()).map(([k, w]) => {
      const [source, target] = k.split('|');
      return { source, target, weight: w };
    });
    allLinks.sort((a, b) => b.weight - a.weight);
    const mergedLinks = allLinks.slice(0, 120);
    return {
      nodes: Array.from(nodeSet)
        .sort((a, b) => Number(a) - Number(b))
        .map((id) => ({ id })),
      links: mergedLinks,
      draws,
      pairTypes: weightMap.size,
    };
  }, [crossGraphs]);

  const cooc = data?.cooccurrence_graph;

  const gauss = data?.gaussian;

  return (
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(28, insets.bottom + 20),
        }}
        showsVerticalScrollIndicator={false}
      >
        {kind !== 'gaussian' && kind !== 'cooccurrence' && kind !== 'cross_draw' ? (
          <View style={styles.filters}>
            {(['Lahat', '9am', '4pm', '9pm'] as const).map((label) => {
              const val = label === 'Lahat' ? null : label;
              const active = filter === val;
              return (
                <Pressable
                  key={label}
                  onPress={() => setFilter(val)}
                  style={[styles.chip, active && styles.chipOn]}
                >
                  <Text style={[styles.chipTxt, active && styles.chipTxtOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {loading ? <ActivityIndicator size="large" color={ANALYTICS_CYAN} style={styles.loader} /> : null}
        {err ? <Text style={styles.err}>{err}</Text> : null}

        {!loading && data && kind === 'gaussian' ? (
          <View style={[styles.card, styles.cardGaussian]}>
            <Text style={styles.cardTitle}>Normalization</Text>
            {gauss && gauss.draws_sampled > 0 && (gauss.sum_histogram?.length ?? 0) > 0 ? (
              <>
                <Text style={styles.meta}>
                  Draws: {gauss.draws_sampled} · ρ {gauss.correlation.toFixed(3)}
                </Text>
                <Text style={[styles.meta, { marginTop: 4 }]}>
                  μ sum {gauss.mean_sum.toFixed(2)} · σ {gauss.std_sum.toFixed(2)}
                </Text>
                <Text style={[styles.meta, { marginTop: 2 }]}>
                  μ ln(prod) {gauss.mean_log_product.toFixed(3)} · σ {gauss.std_log_product.toFixed(3)}
                </Text>
                <GaussianNormalizationCharts key={String(gauss.draws_sampled)} data={gauss} width={gaussianChartW} />
              </>
            ) : (
              <Text style={styles.muted}>
                Walang draw data para sa Gaussian — mag-ingest muna ng sheet o i-check ang DB.
              </Text>
            )}
          </View>
        ) : null}

        {!loading && data && kind === 'error_distance' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Prediction vs aktwal</Text>
            <Text style={styles.cardSub}>
              Hamming distance sa pagitan ng hula (Alon XGBoost, Alon Markov, Lihim/Miro kung premium) at
              susunod na draw. Cognitive challenge: walang naka-store na triple — hindi kasama.
            </Text>
            <Text style={styles.meta}>Puntos: {errorPts.length} · DB outcomes: {data.outcome_rows}</Text>
            {errorPts.length > 1 ? (
              <>
                <ErrorDistanceLineChart width={chartW} height={240} points={errorPts} />
                <View style={styles.legend}>
                  <Text style={[styles.legItem, { color: ANALYTICS_LINE_XGB }]}>● Alon (XGBoost)</Text>
                  <Text style={[styles.legItem, { color: ANALYTICS_LINE_MKV }]}>● Alon (Markov)</Text>
                  <Text style={[styles.legItem, { color: ANALYTICS_LINE_MIRO }]}>● Lihim (Miro)</Text>
                </View>
              </>
            ) : (
              <Text style={styles.muted}>
                Kulang pa ang naka-log na predictions. Buksan ang Alon/Lihim at i-ingest ang sheet para
                may mas maraming punto.
              </Text>
            )}
            <Text style={[styles.cardSub, { marginTop: 12 }]}>
              Histogram (XGB vs aktwal, DB): 0={data.error_histogram['0'] ?? 0} · 1=
              {data.error_histogram['1'] ?? 0} · 2={data.error_histogram['2'] ?? 0} · 3=
              {data.error_histogram['3'] ?? 0}
            </Text>
          </View>
        ) : null}

        {!loading && data && kind === 'cooccurrence' ? (
          <View style={[styles.card, styles.cardCooc]}>
            <Text style={styles.cardTitle}>Co-occurrence</Text>
            {cooc && cooc.links.length ? (
              <Text style={styles.cardSub}>
                Strongest digit pairs in one draw (top {cooc.links_shown} links for clarity). —
                {cooc.pair_types_available != null ? ` ${cooc.pair_types_available} pair types,` : ''}{' '}
                {cooc.draws_sampled.toLocaleString()} draws sampled.
              </Text>
            ) : null}
            {cooc && cooc.links.length ? (
              <>
                <View style={styles.graphBox}>
                  <ForceGraphView
                    width={coocChartW}
                    height={coocGraphH}
                    nodes={cooc.nodes}
                    links={cooc.links}
                    nodeBorder={ANALYTICS_GOLD}
                    layout="spread"
                    zoomable
                  />
                </View>
              </>
            ) : (
              <Text style={styles.muted}>Walang graph data.</Text>
            )}
          </View>
        ) : null}

        {!loading && data && kind === 'cross_draw' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cross-draw transitions</Text>
            <Text style={styles.cardSub}>
              Direksyon: digit sa draw N → digit sa draw N+1 (parehong session). Pinakamataas na
              frequency.
            </Text>
            {crossCombined ? (
              <>
                <Text style={styles.meta}>
                  All sessions combined · Draws: {crossCombined.draws.toLocaleString()} · Links:{' '}
                  {crossCombined.links.length}
                  {crossCombined.pairTypes ? ` · ${crossCombined.pairTypes} pair types` : ''}
                </Text>
                <View style={styles.graphBox}>
                  <ForceGraphView
                    width={crossGraphW}
                    height={crossGraphH}
                    nodes={crossCombined.nodes}
                    links={crossCombined.links}
                    nodeBorder={ANALYTICS_CYAN}
                    layout="spread"
                    zoomable
                  />
                </View>
              </>
            ) : (
              <Text style={styles.muted}>Walang cross-draw data.</Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function analyticsFeatureTitle(k: Props['route']['params']['kind']): string {
  return TITLES[k];
}

const styles = StyleSheet.create({
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: { width: 34, height: 34, marginRight: 10 },
  headerTitleText: { color: '#e2e8f0', fontSize: 18, fontWeight: '800' },
  page: { flex: 1, backgroundColor: ANALYTICS_BG },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  chipOn: {
    backgroundColor: 'rgba(56, 189, 248, 0.22)',
    borderColor: ANALYTICS_CYAN,
  },
  chipTxt: { color: ANALYTICS_MUTED, fontSize: 13, fontWeight: '600' },
  chipTxtOn: { color: '#f8fafc' },
  loader: { marginVertical: 24 },
  err: { color: '#fca5a5', marginBottom: 12, fontSize: 14 },
  card: {
    backgroundColor: ANALYTICS_CARD,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.18)',
    marginBottom: 16,
  },
  cardGaussian: { alignSelf: 'center', width: '100%', maxWidth: 440 },
  cardCooc: { alignSelf: 'center', width: '100%', maxWidth: 440 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#f8fafc', marginBottom: 8 },
  cardSub: { fontSize: 13, lineHeight: 20, color: ANALYTICS_MUTED, marginBottom: 10 },
  meta: { fontSize: 12, color: 'rgba(148, 163, 184, 0.95)', marginBottom: 10 },
  muted: { fontSize: 13, color: ANALYTICS_MUTED, lineHeight: 20 },
  hint: { fontSize: 12, color: ANALYTICS_GOLD, marginBottom: 10 },
  graphBox: {
    alignItems: 'center',
    marginTop: 4,
    backgroundColor: 'rgba(10, 22, 40, 0.65)',
    borderRadius: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.12)',
  },
  legend: { marginTop: 12, gap: 6 },
  legItem: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
});
