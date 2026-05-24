import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getStoredAccessToken } from '../auth/storage';
import type { RootStackParamList } from '../navigation/types';
import {
  fetchEliteProfileNext,
  startPremiumBatch,
  submitEliteProfileAnswer,
  type EliteProfileQuestion,
} from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'EliteProfileGate'>;

export function EliteProfileGateScreen({ navigation }: Props): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [question, setQuestion] = useState<EliteProfileQuestion | null>(null);
  const [progress, setProgress] = useState<{ primary_answered: number; primary_total: number } | null>(
    null,
  );
  const [textAnswer, setTextAnswer] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const loadQuestion = useCallback(async () => {
    const token = (await getStoredAccessToken())?.trim();
    if (!token) {
      Alert.alert('Sign in', 'Mag-sign in muna para magamit ang Elite.');
      navigation.goBack();
      return;
    }
    setLoading(true);
    try {
      const res = await fetchEliteProfileNext(token);
      setProgress(res.progress);
      setQuestion(res.question);
      setTextAnswer('');
      setSelected(null);
      if (!res.question) {
        await enterElite(token);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Hindi ma-load ang tanong.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  const enterElite = async (token: string) => {
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
  };

  useEffect(() => {
    void loadQuestion();
  }, [loadQuestion]);

  const handleSubmit = async () => {
    if (!question || submitting) return;
    const token = (await getStoredAccessToken())?.trim();
    if (!token) {
      Alert.alert('Sign in', 'Mag-sign in muna.');
      return;
    }
    const answer = question.kind === 'text' ? textAnswer.trim() : selected;
    if (!answer) {
      Alert.alert('Sagot', 'Pumili o mag-type ng sagot bago magpatuloy.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitEliteProfileAnswer(token, question.id, answer);
      setProgress(res.progress);
      await enterElite(token);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Hindi na-save ang sagot.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={['#2a1810', '#1a0f08', '#0d0704']} style={styles.gradient}>
      <ScrollView contentContainerStyle={styles.scroll} accessibilityLabel="Elite profiling gate">
        <RNText style={styles.brand}>✦ ELITE ✦</RNText>
        <RNText style={styles.subtitle}>Isang mabilis na tanong bago ang hula</RNText>
        <RNText style={styles.note}>
          Hinihingi namin ang kaunting impormasyon nang unti-unti — hindi lahat sa isang beses — para mas maintindihan
          ang paggamit at mapabuti ang karanasan. Hindi ito para sa pagbebenta ng personal na data.
        </RNText>

        {progress ? (
          <RNText style={styles.progress}>
            Profile progress: {progress.primary_answered} / {progress.primary_total} core questions
          </RNText>
        ) : null}

        {loading ? (
          <ActivityIndicator color="#f7e7b0" style={styles.loader} />
        ) : question ? (
          <View style={styles.card}>
            <RNText style={styles.promptTl}>{question.prompt_tl}</RNText>
            <RNText style={styles.promptEn}>{question.prompt_en}</RNText>

            {question.kind === 'text' ? (
              <TextInput
                value={textAnswer}
                onChangeText={setTextAnswer}
                placeholder={question.placeholder_tl ?? question.placeholder_en ?? ''}
                placeholderTextColor="#8a7a62"
                style={styles.input}
                editable={!submitting}
                maxLength={120}
                accessibilityLabel="Profile text answer"
              />
            ) : (
              <View style={styles.options}>
                {(question.options ?? []).map((opt) => {
                  const active = selected === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setSelected(opt.value)}
                      disabled={submitting}
                      style={[styles.option, active && styles.optionActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <RNText style={[styles.optionText, active && styles.optionTextActive]}>
                        {opt.label_tl}
                      </RNText>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Pressable
              onPress={() => void handleSubmit()}
              disabled={submitting}
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed, submitting && styles.ctaDisabled]}
            >
              <LinearGradient colors={['#f7e7b0', '#d4af37', '#a67c00']} style={styles.ctaInner}>
                <RNText style={styles.ctaText}>{submitting ? 'Saving…' : 'Continue to Elite'}</RNText>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}

        <Pressable onPress={() => navigation.goBack()} disabled={submitting} style={styles.backBtn}>
          <RNText style={styles.backText}>Back to Home</RNText>
        </Pressable>
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
  progress: {
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
  input: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    color: '#fff6d4',
    fontSize: 16,
    backgroundColor: 'rgba(26,15,8,0.65)',
  },
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
  ctaDisabled: { opacity: 0.65 },
  ctaText: { color: '#2b1d00', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  backBtn: { marginTop: 24, alignItems: 'center' },
  backText: { color: '#c9b27a', fontWeight: '700', textDecorationLine: 'underline' },
});
