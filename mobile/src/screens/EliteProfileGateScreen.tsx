import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getStoredAccessToken } from '../auth/storage';
import type { RootStackParamList } from '../navigation/types';
import {
  fetchEliteProfileNext,
  startPremiumBatch,
  getApiBaseUrl,
  resetApiBaseCache,
  submitEliteProfileAnswer,
  type EliteProfileQuestion,
} from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'EliteProfileGate'>;

export function EliteProfileGateScreen({ navigation }: Props): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [question, setQuestion] = useState<EliteProfileQuestion | null>(null);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const enterElite = useCallback(
    async (token: string) => {
      setSubmitting(true);
      try {
        await startPremiumBatch(token);
        navigation.replace('LihimPremium');
      } catch (e) {
        Alert.alert('Elite', e instanceof Error ? e.message : 'Hindi makapasok sa Elite.');
        navigation.goBack();
      } finally {
        setSubmitting(false);
      }
    },
    [navigation],
  );

  const loadQuestion = useCallback(async () => {
    const seq = ++loadSeq.current;
    const token = (await getStoredAccessToken())?.trim();
    if (!token) {
      Alert.alert('Sign in', 'Mag-sign in muna para magamit ang Elite.');
      navigation.goBack();
      return;
    }
    setLoading(true);
    setQuestion(null);
    setSelected(null);
    try {
      resetApiBaseCache();
      const res = await fetchEliteProfileNext(token);
      console.log('[GINTO] api_url', getApiBaseUrl());
      console.log('[GINTO] response', JSON.stringify(res));
      if (seq !== loadSeq.current) return;
      setCalendarDate(res.calendar_date);
      if (!res.question?.id || !res.question.options?.length) {
        const staleApi = (res.gate_version ?? 1) < 2 || (res.already_answered_today && res.elite_ready);
        const hint = staleApi
          ? 'Lumang backend pa ang tumatakbo. Sa backend folder: i-restart ang uvicorn. Sa Metro: pindutin ang r para i-reload ang app.'
          : 'Walang tanong mula sa server. Subukan muli.';
        Alert.alert('Elite', `${hint}\n\nAPI: ${getApiBaseUrl()}`);
        navigation.goBack();
        return;
      }
      setQuestion(res.question);
      const prev = res.previous_answer?.trim();
      setSelected(prev && res.question.options.some((o) => o.value === prev) ? prev : null);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      Alert.alert('Error', e instanceof Error ? e.message : 'Hindi ma-load ang tanong.');
      navigation.goBack();
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
      }
    }
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      void loadQuestion();
    }, [loadQuestion]),
  );

  useEffect(() => {
    if (Platform.OS !== 'android' || loading || !question) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert(
        'Kailangan ng sagot',
        'Pumili ng isang opsyon (multiple choice) bago makapasok sa Elite.',
      );
      return true;
    });
    return () => sub.remove();
  }, [loading, question]);

  const handleSubmit = async () => {
    if (!question || submitting || !selected) {
      if (!selected) {
        Alert.alert('Sagot', 'Pumili ng isa sa mga opsyon bago magpatuloy.');
      }
      return;
    }
    const token = (await getStoredAccessToken())?.trim();
    if (!token) {
      Alert.alert('Sign in', 'Mag-sign in muna.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitEliteProfileAnswer(token, question.id, selected);
      if (!res.elite_ready) {
        Alert.alert('Sagot', 'Hindi natanggap ang sagot. Subukan muli.');
        return;
      }
      await enterElite(token);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Hindi na-save ang sagot.');
    } finally {
      setSubmitting(false);
    }
  };

  const canContinue = Boolean(selected) && !submitting;

  return (
    <LinearGradient colors={['#2a1810', '#1a0f08', '#0d0704']} style={styles.gradient}>
      <ScrollView contentContainerStyle={styles.scroll} accessibilityLabel="Elite profiling gate">
        <RNText style={styles.brand}>✦ ELITE ✦</RNText>
        <RNText style={styles.subtitle}>Tanong ngayong araw (multiple choice)</RNText>
        <RNText style={styles.note}>
          Iba ang tanong araw-araw. Kailangan pumili ng sagot bawat pagpasok sa Elite (GINTO) — kahit nakasagot ka na
          ngayong araw.
        </RNText>

        {calendarDate ? (
          <RNText style={styles.dateLabel}>Petsa: {calendarDate}</RNText>
        ) : null}

        {loading ? (
          <ActivityIndicator color="#f7e7b0" style={styles.loader} />
        ) : question ? (
          <View style={styles.card}>
            <RNText style={styles.promptTl}>{question.prompt_tl}</RNText>
            <RNText style={styles.promptEn}>{question.prompt_en}</RNText>

            <View style={styles.options}>
              {question.options.map((opt) => {
                const active = selected === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setSelected(opt.value)}
                    disabled={submitting}
                    style={[styles.option, active && styles.optionActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <RNText style={[styles.optionText, active && styles.optionTextActive]}>
                      {opt.label_tl}
                    </RNText>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => void handleSubmit()}
              disabled={!canContinue}
              style={({ pressed }) => [
                styles.cta,
                pressed && canContinue && styles.ctaPressed,
                !canContinue && styles.ctaDisabled,
              ]}
            >
              <LinearGradient colors={['#f7e7b0', '#d4af37', '#a67c00']} style={styles.ctaInner}>
                <RNText style={styles.ctaText}>
                  {submitting ? 'Saving…' : 'Continue to Elite'}
                </RNText>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: {
    padding: 20,
    paddingBottom: 40,
    ...(Platform.OS === 'web' ? { maxWidth: 520, width: '100%', alignSelf: 'center' as const } : {}),
  },
  brand: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fcefb4',
    textAlign: 'center',
    letterSpacing: 3,
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: '#c9b27a',
    fontWeight: '700',
    fontSize: 14,
  },
  note: {
    marginTop: 16,
    color: 'rgba(232,220,190,0.75)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  dateLabel: {
    marginTop: 12,
    textAlign: 'center',
    color: '#d4af37',
    fontSize: 12,
    fontWeight: '700',
  },
  loader: { marginTop: 32 },
  card: {
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(247,231,176,0.5)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 16,
  },
  promptTl: { color: '#fff6d4', fontSize: 18, fontWeight: '800', lineHeight: 24 },
  promptEn: { marginTop: 6, color: 'rgba(232,220,190,0.8)', fontSize: 14, lineHeight: 20 },
  options: { marginTop: 14, gap: 10 },
  option: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(26,15,8,0.55)',
  },
  optionActive: {
    borderColor: '#f7e7b0',
    backgroundColor: 'rgba(212,175,55,0.22)',
  },
  optionText: { color: '#c9b27a', fontWeight: '700', fontSize: 15 },
  optionTextActive: { color: '#fff6d4' },
  cta: {
    marginTop: 20,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#f7e7b0',
  },
  ctaInner: { paddingVertical: 14, alignItems: 'center' },
  ctaPressed: { opacity: 0.92 },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: '#2b1d00', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
});
