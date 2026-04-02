import React, { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Text,
  TextInput,
  Title,
} from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { logEvent } from '../analytics';
import type { DailyPredictionResponse, DrawSession } from '../services/api';
import { fetchDailyPredictions } from '../services/api';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Predict'>;
const SESSION_ORDER: DrawSession[] = ['9am', '4pm', '9pm'];

const SESSION_LABEL: Record<DrawSession, string> = {
  '9am': '9AM',
  '4pm': '4PM',
  '9pm': '9PM',
};

export function PredictScreen(_props: Props): React.ReactElement {
  const today = new Date().toISOString().slice(0, 10);
  const [targetDate, setTargetDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DailyPredictionResponse | null>(null);

  const runDaily = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate.trim())) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format, for example 2026-04-01.');
      return;
    }
    setLoading(true);
    setData(null);
    try {
      await logEvent('prediction_request', { tier: 'free', mode: 'daily', targetDate });
      const variationKey = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const res = await fetchDailyPredictions(targetDate.trim(), variationKey);
      if (res.warning) {
        Alert.alert('Notice', res.warning);
      }
      setData(res);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.pad} accessibilityLabel="Predictions screen">
      <Title accessibilityRole="header" style={styles.pageTitle}>
        TUKLAS
      </Title>
      <TextInput
        label="Memorable Date (YYYY-MM-DD)"
        value={targetDate}
        onChangeText={setTargetDate}
        mode="outlined"
        style={styles.field}
        outlineColor="#86b98f"
        activeOutlineColor="#2f855a"
        textColor="#18402a"
        theme={{ colors: { background: '#e4f4dd', placeholder: '#4a6b54' } }}
        accessibilityLabel="Memorable date"
      />
      <Button
        mode="contained"
        buttonColor="#2f855a"
        textColor="#f5fff5"
        onPress={runDaily}
        disabled={loading}
        style={styles.cta}
        contentStyle={styles.ctaContent}
        accessibilityLabel="Run prediction"
      >
        Prediction
      </Button>
      {loading ? (
        <ActivityIndicator style={styles.loader} color="#2f855a" accessibilityLabel="Loading prediction" />
      ) : null}
      {data ? (
        <View style={styles.resultsWrap}>
          {SESSION_ORDER.map((sessionKey) => {
            const s = data.sessions[sessionKey];
            const xgb = (s?.models?.XGBoost?.digits ?? []).join(' · ');
            const mkv = (s?.models?.Markov?.digits ?? []).join(' · ');
            return (
              <Card
                key={sessionKey}
                style={styles.card}
                mode="elevated"
                elevation={2}
                accessibilityLabel={`${SESSION_LABEL[sessionKey]} prediction`}
              >
                <Card.Content style={styles.cardInner}>
                  <View style={styles.sessionBadge}>
                    <Text variant="titleLarge" style={styles.sessionTitle}>
                      {SESSION_LABEL[sessionKey]}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.modelLabel}>XGBoost</Text>
                    <Text style={styles.digits}>{xgb || '—'}</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.row}>
                    <Text style={styles.modelLabel}>Markov</Text>
                    <Text style={styles.digits}>{mkv || '—'}</Text>
                  </View>
                </Card.Content>
              </Card>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#1e4a31' },
  pad: {
    padding: 20,
    paddingBottom: 48,
    backgroundColor: '#dff1de',
    ...(Platform.OS === 'web' ? { maxWidth: 520, width: '100%', alignSelf: 'center' as const } : {}),
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: '#113526',
    marginBottom: 16,
    letterSpacing: 1,
  },
  field: { marginBottom: 14, backgroundColor: '#e4f4dd' },
  cta: { borderRadius: 14, marginBottom: 4 },
  ctaContent: { paddingVertical: 8 },
  loader: { marginVertical: 28 },
  resultsWrap: { marginTop: 20 },
  card: {
    marginBottom: 14,
    borderRadius: 18,
    backgroundColor: '#f7fff5',
    borderWidth: 1,
    borderColor: '#a8d9ae',
    overflow: 'hidden',
  },
  cardInner: { paddingVertical: 4 },
  sessionBadge: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#2f855a',
  },
  sessionTitle: {
    fontWeight: '800',
    color: '#1a4d2e',
    letterSpacing: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  modelLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3d6b4d',
    width: '28%',
  },
  digits: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f3d24',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    backgroundColor: '#c5e8c8',
    marginVertical: 4,
  },
});
