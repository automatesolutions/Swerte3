import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Paragraph, Title } from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AnalyticsDashboard } from '../services/api';
import { fetchAnalyticsDashboard } from '../services/api';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Analytics'>;

const W = Math.min(Dimensions.get('window').width - 32, 400);
const CHART_H = 200;

export function AnalyticsScreen(_props: Props): React.ReactElement {
  const [filter, setFilter] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchAnalyticsDashboard(filter);
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const gaussPts = useMemo(() => {
    if (!data?.gaussian_scatter?.length) return [];
    const pts = data.gaussian_scatter;
    const sums = pts.map((p) => p.sum);
    const logs = pts.map((p) => p.log_product);
    const smin = Math.min(...sums);
    const smax = Math.max(...sums);
    const lmin = Math.min(...logs);
    const lmax = Math.max(...logs);
    const sr = smax - smin || 1;
    const lr = lmax - lmin || 1;
    return pts.map((p) => ({
      left: ((p.sum - smin) / sr) * (W - 8),
      top: CHART_H - 8 - ((p.log_product - lmin) / lr) * (CHART_H - 16),
    }));
  }, [data]);

  const errMax = useMemo(() => {
    if (!data?.error_histogram) return 1;
    return Math.max(1, ...Object.values(data.error_histogram));
  }, [data]);

  const coocMax = useMemo(() => {
    if (!data?.cooccurrence_matrix?.length) return 1;
    let m = 0;
    for (const row of data.cooccurrence_matrix) {
      for (const v of row) m = Math.max(m, v);
    }
    return m || 1;
  }, [data]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Title style={styles.title}>Analytics</Title>
      <Paragraph style={styles.sub}>
        Gaussian-style scatter (sum vs log product), error histogram (nakaimbak sa database), co-occurrence at cross-draw transitions.
      </Paragraph>
      <View style={styles.filters}>
        {(['Lahat', '9am', '4pm', '9pm'] as const).map((label) => {
          const val = label === 'Lahat' ? null : label;
          const active = filter === val;
          return (
            <Button
              key={label}
              mode={active ? 'contained' : 'outlined'}
              compact
              onPress={() => setFilter(val)}
              buttonColor={active ? '#2f855a' : undefined}
              textColor={active ? '#f5fff5' : '#1f5130'}
              style={styles.filterBtn}
            >
              {label}
            </Button>
          );
        })}
      </View>
      {loading ? <ActivityIndicator size="large" color="#2f855a" style={styles.loader} /> : null}
      {err ? <Paragraph style={styles.error}>{err}</Paragraph> : null}
      {data && !loading ? (
        <>
          <Paragraph style={styles.meta}>Naka-save na outcome rows (prediction vs actual): {data.outcome_rows}</Paragraph>

          <Text style={styles.section}>Gaussian-style: sum vs log(product)</Text>
          <View style={[styles.chartBox, { width: W, height: CHART_H }]}>
            {gaussPts.map((p, i) => (
              <View key={i} style={[styles.dot, { left: p.left, top: p.top }]} />
            ))}
          </View>

          <Text style={styles.section}>Error analysis (Hamming distance)</Text>
          <View style={styles.barRow}>
            {(['0', '1', '2', '3'] as const).map((k) => {
              const v = data.error_histogram[k] ?? 0;
              const h = (v / errMax) * 120;
              return (
                <View key={k} style={styles.barCol}>
                  <View style={[styles.bar, { height: Math.max(4, h) }]} />
                  <Text style={styles.barLabel}>{k}</Text>
                  <Text style={styles.barCount}>{v}</Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.section}>Co-occurrence (digits sa iisang draw)</Text>
          <View style={styles.matrix}>
            {data.cooccurrence_matrix.map((row, i) => (
              <View key={i} style={styles.matrixRow}>
                {row.map((cell, j) => (
                  <View
                    key={j}
                    style={[
                      styles.cell,
                      {
                        backgroundColor: `rgba(47, 133, 90, ${0.15 + (cell / coocMax) * 0.85})`,
                      },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>

          <Text style={styles.section}>Cross-draw transition (9AM sample)</Text>
          <View style={styles.edgeList}>
            {(data.transitions['9am'] ?? []).slice(0, 12).map((e, i) => (
              <Text key={i} style={styles.edge}>
                {e.from} → {e.to} ({e.weight})
              </Text>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#dff1de' },
  pad: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '800', color: '#113526' },
  sub: { color: '#2b4f3a', marginBottom: 10, lineHeight: 20 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterBtn: { marginRight: 4 },
  loader: { marginVertical: 24 },
  error: { color: '#9c2f2f' },
  meta: { color: '#3d6b4d', marginBottom: 12 },
  section: { fontWeight: '700', color: '#173726', marginTop: 16, marginBottom: 8 },
  chartBox: {
    backgroundColor: '#f3fff1',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#b8dfb9',
    position: 'relative',
    marginBottom: 8,
  },
  dot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#2f855a',
  },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, height: 140, marginBottom: 8 },
  barCol: { alignItems: 'center', flex: 1 },
  bar: { width: '70%', backgroundColor: '#2f855a', borderRadius: 4 },
  barLabel: { fontSize: 12, marginTop: 4, color: '#214635' },
  barCount: { fontSize: 11, color: '#3d6b4d' },
  matrix: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#a8d9ae' },
  matrixRow: { flexDirection: 'row' },
  cell: { width: 14, height: 14, margin: 0.5 },
  edgeList: { backgroundColor: '#f3fff1', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#b8dfb9' },
  edge: { fontSize: 12, color: '#173726', marginBottom: 4, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
});
