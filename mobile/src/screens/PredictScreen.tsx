import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Paragraph,
  SegmentedButtons,
  Title,
} from 'react-native-paper';
import * as SecureStore from 'expo-secure-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { logEvent } from '../analytics';
import type { DrawSession, FreePrediction, PremiumPrediction } from '../services/api';
import { fetchFreePrediction, fetchPremiumPrediction } from '../services/api';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Predict'>;

const TOKEN_KEY = 'swerte3_access_token';

export function PredictScreen(_props: Props): React.ReactElement {
  const [session, setSession] = useState<DrawSession>('9am');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FreePrediction | PremiumPrediction | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    void SecureStore.getItemAsync(TOKEN_KEY).then(setToken);
  }, []);

  const runFree = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      await logEvent('prediction_request', { tier: 'free', session });
      const res = await fetchFreePrediction(session);
      setData(res);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [session]);

  const runPremium = useCallback(async () => {
    const t = token ?? (await SecureStore.getItemAsync(TOKEN_KEY));
    if (!t) {
      Alert.alert('Sign in required', 'Create an account and unlock premium first.');
      return;
    }
    setLoading(true);
    setData(null);
    try {
      await logEvent('prediction_request', { tier: 'premium', session });
      const res = await fetchPremiumPrediction(session, t);
      setData(res);
    } catch (e) {
      Alert.alert('Premium error', e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [session, token]);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.pad} accessibilityLabel="Predictions screen">
      <Title accessibilityRole="header">Predict</Title>
      <Paragraph accessibilityLabel="Disclaimer summary">{data?.disclaimer ?? 'Entertainment only. Random draws.'}</Paragraph>
      <SegmentedButtons
        value={session}
        onValueChange={(v) => setSession(v as DrawSession)}
        buttons={[
          { value: '9am', label: '9 AM', accessibilityLabel: 'Nine a m draw' },
          { value: '4pm', label: '4 PM', accessibilityLabel: 'Four p m draw' },
          { value: '9pm', label: '9 PM', accessibilityLabel: 'Nine p m draw' },
        ]}
        style={styles.seg}
      />
      <View style={styles.row}>
        <Button mode="contained" onPress={runFree} disabled={loading} accessibilityLabel="Run free prediction">
          Free prediction
        </Button>
        <Button mode="outlined" onPress={runPremium} disabled={loading} accessibilityLabel="Run premium prediction">
          Premium
        </Button>
      </View>
      {loading ? <ActivityIndicator style={styles.loader} accessibilityLabel="Loading prediction" /> : null}
      {data ? (
        <Card style={styles.card} accessibilityLabel="Prediction results">
          <Card.Content>
            <Title>Results ({data.session})</Title>
            <Paragraph>XGBoost: {(data.models.XGBoost?.digits ?? []).join(' - ')}</Paragraph>
            <Paragraph>Markov: {(data.models.Markov?.digits ?? []).join(' - ')}</Paragraph>
            {'miro' in data && data.miro
              ? 'digits' in data.miro && data.miro.digits
                ? <Paragraph accessibilityLabel="Miro digits">Miro: {data.miro.digits.join(' - ')}</Paragraph>
                : <Paragraph>Miro: {JSON.stringify(data.miro)}</Paragraph>
              : null}
          </Card.Content>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  pad: { padding: 16, paddingBottom: 40 },
  seg: { marginVertical: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  loader: { marginVertical: 24 },
  card: { marginTop: 8 },
});
