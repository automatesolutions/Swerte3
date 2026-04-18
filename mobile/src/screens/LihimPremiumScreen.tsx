import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator } from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { logEvent } from '../analytics';
import { SWERTRES_LEGAL_CAPTION, SWERTRES_LEGAL_CAPTION_TL } from '../constants/disclaimers';
import { getStoredAccessToken } from '../auth/storage';
import type { RootStackParamList } from '../navigation/types';
import type { DrawSession, PremiumPrediction } from '../services/api';
import { fetchPremiumPrediction } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'LihimPremium'>;

const SESSIONS: DrawSession[] = ['9am', '4pm', '9pm'];
const SESSION_LABEL: Record<DrawSession, string> = {
  '9am': '9 AM',
  '4pm': '4 PM',
  '9pm': '9 PM',
};

function formatDigits(digits: number[] | undefined): string {
  if (!digits || digits.length !== 3) return '—';
  return digits.map((d) => String(d)).join('  ');
}

/** Single display character for blend slot — strips API junk so one glyph never spans lines. */
function blendChar(d: unknown): string {
  const s = String(d).replace(/\s+/g, '').trim();
  if (s.length === 0) return '?';
  return s.slice(-1);
}

/** One string, non-breaking spaces only — browser/Android cannot legally break between digits. */
function blendNonBreakingLine(digits: unknown[]): string {
  return digits.map((d) => blendChar(d)).join('\u00A0\u00A0');
}

export function LihimPremiumScreen({ navigation }: Props): React.ReactElement {
  const { width: windowWidth } = useWindowDimensions();
  const [session, setSession] = useState<DrawSession>('9pm');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PremiumPrediction | null>(null);

  const blendHeroFontSize = React.useMemo(() => {
    const scrollPad = 40;
    const cardHorizontalPad = 16;
    const track = Math.max(120, windowWidth - scrollPad - cardHorizontalPad);
    const slot = track / 3;
    const cap = Platform.OS === 'web' ? 54 : 42;
    return Math.min(cap, Math.max(18, Math.floor(slot * 0.38)));
  }, [windowWidth]);

  const runPremium = async () => {
    const token = await getStoredAccessToken();
    if (!token?.trim()) {
      Alert.alert('Sign in required', 'Please sign in to use Elite.');
      return;
    }
    setLoading(true);
    setData(null);
    try {
      await logEvent('prediction_request', { tier: 'premium', session });
      const res = await fetchPremiumPrediction(session, token);
      setData(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      if (msg.includes('402') || msg.toLowerCase().includes('payment')) {
        Alert.alert(
          'Kailangan mag-GINTO',
          'Mag-GINTO sa Home muna (1 token bawat pindot — LLM/compute cost). Pagkatapos, puwede ang 9AM, 4PM, at 9PM nang walang dagdag-bawas.',
          [{ text: 'OK', onPress: () => navigation.navigate('Home') }],
        );
      } else {
        Alert.alert('Elite error', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const miro = data?.miro;
  const miroDigits = miro && 'digits' in miro && Array.isArray(miro.digits) ? miro.digits : null;
  const miroErr = miro && 'error' in miro ? String(miro.error) : null;

  return (
    <LinearGradient colors={['#2a1810', '#1a0f08', '#0d0704']} style={styles.gradient}>
      <ScrollView contentContainerStyle={styles.scrollContent} accessibilityLabel="Elite premium screen">
        <RNText style={styles.brandMark}>✦ ELITE ✦</RNText>
        <RNText style={styles.subbrand}>MiroFish multi-agent</RNText>

        <View style={styles.sessionRow}>
          {SESSIONS.map((s) => {
            const active = s === session;
            return (
              <Pressable
                key={s}
                onPress={() => setSession(s)}
                style={[styles.sessionChip, active && styles.sessionChipActive]}
                accessibilityLabel={`Draw session ${SESSION_LABEL[s]}`}
              >
                <RNText style={[styles.sessionChipText, active && styles.sessionChipTextActive]}>
                  {SESSION_LABEL[s]}
                </RNText>
              </Pressable>
            );
          })}
        </View>

        <RNText style={styles.staticSwertresLegal}>{SWERTRES_LEGAL_CAPTION}</RNText>
        <RNText style={styles.staticSwertresLegalTl}>{SWERTRES_LEGAL_CAPTION_TL}</RNText>

        <Pressable
          onPress={runPremium}
          disabled={loading}
          style={({ pressed }) => [styles.goldCta, pressed && styles.goldCtaPressed, loading && styles.goldCtaDisabled]}
          accessibilityLabel="Run Elite premium prediction"
        >
          <LinearGradient
            colors={['#f7e7b0', '#d4af37', '#a67c00']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.goldCtaInner}
          >
            <RNText style={styles.goldCtaText}>{loading ? 'Synthesizing…' : 'kunin ang hula'}</RNText>
          </LinearGradient>
        </Pressable>

        {loading ? (
          <ActivityIndicator color="#f7e7b0" style={styles.loader} accessibilityLabel="Loading" />
        ) : null}

        {data ? (
          <View style={styles.resultBlock}>
            <RNText style={styles.sectionEyebrow}>Ginto &mdash; final blend</RNText>
            <View style={styles.heroDigitsCard}>
              {miroErr ? (
                <RNText style={styles.heroDigitsFallback} accessibilityLabel="No blend">
                  —
                </RNText>
              ) : miroDigits && miroDigits.length === 3 ? (
                <View
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={`Elite blend ${miroDigits.map((d) => blendChar(d)).join(' ')}`}
                  style={styles.heroBlendClip}
                  collapsable={false}
                >
                  <RNText
                    style={[
                      styles.heroBlendOneLine,
                      {
                        fontSize: blendHeroFontSize,
                        lineHeight: Math.round(blendHeroFontSize * 1.22),
                      },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                    allowFontScaling={false}
                    maxFontSizeMultiplier={1}
                    {...(Platform.OS === 'android'
                      ? { textBreakStrategy: 'simple' as const }
                      : {})}
                  >
                    {blendNonBreakingLine(miroDigits)}
                  </RNText>
                </View>
              ) : (
                <RNText style={styles.heroDigitsFallback} accessibilityLabel="No blend yet">
                  —
                </RNText>
              )}
              {miroErr ? <RNText style={styles.errNote}>{miroErr}</RNText> : null}
            </View>

            <View style={styles.baseRow}>
              <View style={styles.baseItem}>
                <RNText style={styles.baseLabel}>Alon XGB</RNText>
                <RNText style={styles.baseDigits}>
                  {formatDigits(data.models?.XGBoost?.digits as number[] | undefined)}
                </RNText>
              </View>
              <View style={styles.baseItem}>
                <RNText style={styles.baseLabel}>Alon Markov</RNText>
                <RNText style={styles.baseDigits}>
                  {formatDigits(data.models?.Markov?.digits as number[] | undefined)}
                </RNText>
              </View>
            </View>

            <RNText style={styles.disclaimer}>{data.disclaimer}</RNText>
          </View>
        ) : null}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    ...(Platform.OS === 'web' ? { maxWidth: 520, width: '100%', alignSelf: 'center' as const } : {}),
  },
  brandMark: {
    fontSize: Platform.OS === 'web' ? 40 : 36,
    fontWeight: '900',
    color: '#fcefb4',
    textAlign: 'center',
    letterSpacing: 4,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  subbrand: {
    marginTop: 6,
    textAlign: 'center',
    color: '#c9b27a',
    fontWeight: '700',
    letterSpacing: 2,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  sessionChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(26,15,8,0.65)',
  },
  sessionChipActive: {
    borderColor: '#f7e7b0',
    backgroundColor: 'rgba(212,175,55,0.2)',
  },
  sessionChipText: { color: '#a8956a', fontWeight: '800', fontSize: 13 },
  sessionChipTextActive: { color: '#fff6d4' },
  staticSwertresLegal: {
    marginTop: 14,
    paddingHorizontal: 8,
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(232,220,190,0.72)',
    textAlign: 'center',
    fontWeight: '600',
  },
  staticSwertresLegalTl: {
    marginTop: 6,
    paddingHorizontal: 8,
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(201,178,122,0.7)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  goldCta: {
    marginTop: 22,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#f7e7b0',
    ...Platform.select({
      ios: {
        shadowColor: '#ffd700',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  goldCtaInner: { paddingVertical: 16, alignItems: 'center' },
  goldCtaPressed: { opacity: 0.92 },
  goldCtaDisabled: { opacity: 0.65 },
  goldCtaText: {
    color: '#2b1d00',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  loader: { marginTop: 28 },
  resultBlock: { marginTop: 28 },
  sectionEyebrow: {
    color: '#d4af37',
    fontWeight: '800',
    letterSpacing: 3,
    fontSize: 11,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 12,
  },
  heroDigitsCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(247,231,176,0.85)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingVertical: 28,
    paddingHorizontal: 8,
    alignItems: 'stretch',
  },
  heroBlendClip: {
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  heroBlendOneLine: {
    width: '100%',
    textAlign: 'center',
    fontWeight: '900',
    color: '#fff6d4',
    letterSpacing: 0,
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as const } : {}),
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(212,175,55,0.45)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 4,
      },
      default: {},
    }),
  },
  heroDigitsFallback: {
    fontSize: 44,
    fontWeight: '900',
    color: 'rgba(255,246,212,0.45)',
    textAlign: 'center',
    alignSelf: 'center',
  },
  errNote: {
    marginTop: 12,
    color: '#f0c0a0',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  baseRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  baseItem: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,178,122,0.35)',
    backgroundColor: 'rgba(20,12,8,0.55)',
    padding: 14,
  },
  baseLabel: { color: '#9a8a6e', fontWeight: '700', fontSize: 11, marginBottom: 8, letterSpacing: 1 },
  baseDigits: {
    color: '#f0e6c8',
    fontWeight: '900',
    fontSize: 26,
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
  },
  disclaimer: {
    marginTop: 20,
    color: 'rgba(232,220,190,0.65)',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
