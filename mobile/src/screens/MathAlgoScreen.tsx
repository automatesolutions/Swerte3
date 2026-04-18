import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getStoredAccessToken } from '../auth/storage';
import type { RootStackParamList } from '../navigation/types';
import { fetchDailyMathCognitive, postMathCognitiveGuess } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'MathAlgo'>;

function rollThreeDigits(): { a: number; b: number; c: number } {
  const one = (): number => {
    try {
      const c = globalThis.crypto;
      if (c?.getRandomValues) {
        const u = new Uint8Array(1);
        c.getRandomValues(u);
        return u[0] % 10;
      }
    } catch {
      /* use fallback */
    }
    return Math.floor(Math.random() * 10);
  };
  return { a: one(), b: one(), c: one() };
}

const CHOICES = [
  { n: '1', l: 'A' },
  { n: '2', l: 'B' },
  { n: '3', l: 'C' },
  { n: '4', l: 'D' },
  { n: '5', l: 'E' },
] as const;

/** Deep worksheet blue — matches cognitive practice test feel */
const NAVY = '#0a1628';
const WHITE = '#ffffff';
const MUTED = 'rgba(255,255,255,0.52)';
const DEFAULT_TITLE_TL = 'Ano ang susunod na pattern?';
/** Cap content width only on large tablets / desktop web; phones use nearly full width. */
const WIDE_MAX_COL = 480;
/** PNG canvas 900×760 */
const FIGURE_ASPECT = 760 / 900;

export function MathAlgoScreen(_props: Props): React.ReactElement {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gutter = width < 380 ? 10 : width < 480 ? 12 : 16;
  const colW =
    width >= 768 ? Math.min(width - gutter * 2, WIDE_MAX_COL) : width - gutter * 2;
  const compact = width < 400;
  const cardPad = compact ? 8 : 12;
  const imgMaxW = colW - cardPad * 2;
  const imgH = Math.round(imgMaxW * FIGURE_ASPECT);

  const bubbleSize = useMemo(() => {
    const inner = colW - gutter;
    const gap = width < 360 ? 8 : 10;
    const raw = Math.floor((inner - gap * 4) / 5);
    const cap = width < 360 ? 50 : 60;
    const floor = width < 360 ? 44 : 48;
    return Math.min(cap, Math.max(floor, raw));
  }, [colW, gutter, width]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [puzzleTitle, setPuzzleTitle] = useState<string | null>(null);
  const [instructionTl, setInstructionTl] = useState('');
  const [guess, setGuess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [allowGuess, setAllowGuess] = useState(true);
  const [tipDisplay, setTipDisplay] = useState<{ a: number; b: number; c: number } | null>(null);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    text: string;
    bonusA?: number;
    bonusB?: number;
    bonusC?: number;
  } | null>(null);
  const lastLoadedUserIdRef = useRef<number | null>(null);

  const displayTitle = (puzzleTitle?.trim() || DEFAULT_TITLE_TL).slice(0, 120);

  const resolvedTip = useMemo(() => {
    if (!feedback?.ok || feedback.bonusA === undefined || feedback.bonusB === undefined) {
      return null;
    }
    if (feedback.bonusC === undefined) {
      return { a: feedback.bonusA, b: feedback.bonusB, c: null as number | null };
    }
    return (
      tipDisplay ?? {
        a: feedback.bonusA,
        b: feedback.bonusB,
        c: feedback.bonusC,
      }
    );
  }, [feedback, tipDisplay]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getStoredAccessToken();
    try {
      const d = await fetchDailyMathCognitive(token?.trim() || undefined);
      const uid = typeof d.user_id === 'number' ? d.user_id : null;
      if (uid != null) {
        if (lastLoadedUserIdRef.current !== null && lastLoadedUserIdRef.current !== uid) {
          setFeedback(null);
          setGuess('');
          setTipDisplay(null);
        }
        lastLoadedUserIdRef.current = uid;
      }
      setCalendarDate((prevCal) => {
        if (prevCal != null && prevCal !== d.calendar_date) {
          setFeedback(null);
          setGuess('');
          setTipDisplay(null);
        }
        return d.calendar_date;
      });
      setUri(`data:${d.mime_type};base64,${d.image_base64}`);
      setQuestionNumber(typeof d.question_number === 'number' ? d.question_number : 1);
      setPuzzleTitle(d.title_tagalog ?? null);
      setInstructionTl(d.instruction_tagalog);
      setAllowGuess(d.allow_guess !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hindi ma-load ang puzzle.');
      setUri(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onSubmit = useCallback(async () => {
    if (!guess || !allowGuess) return;
    const token = await getStoredAccessToken();
    setSubmitting(true);
    try {
      const r = await postMathCognitiveGuess(guess, token?.trim() || undefined);
      const bonusA = r.bonus_tip_digit_a;
      const bonusB = r.bonus_tip_digit_b;
      const bonusC = r.bonus_tip_digit_c;
      if (r.submitted) {
        setAllowGuess(false);
      }
      setFeedback({
        ok: r.correct,
        text: r.message,
        bonusA: bonusA != null ? bonusA : undefined,
        bonusB: bonusB != null ? bonusB : undefined,
        bonusC: bonusC != null ? bonusC : undefined,
      });
      if (r.correct && bonusA != null && bonusB != null && bonusC != null) {
        setTipDisplay({ a: bonusA, b: bonusB, c: bonusC });
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Hindi naipadala ang sagot.';
      const msg = raw.replace(/^\d{3}:\s*/, '').trim();
      if (raw.startsWith('403') || /naisumite|isang beses/i.test(msg)) {
        setAllowGuess(false);
      }
      setFeedback({
        ok: false,
        text: msg,
      });
    } finally {
      setSubmitting(false);
    }
  }, [guess, allowGuess]);

  const footerInstruction = allowGuess
    ? instructionTl.trim() || 'Pumili ng letrang A hanggang E na pinaka-angkop.'
    : 'Isang sagot lang bawat araw sa numerong ito — naisumite mo na para sa petsang ito.';

  const pickEnabled = allowGuess && !submitting;

  return (
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: gutter,
            paddingBottom: Math.max(28, insets.bottom + 24),
            alignItems: 'center',
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={WHITE} />
            <Text style={styles.loadingCaption}>Inihahanda ang sequence challenge…</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={[styles.panel, { width: colW }]}>
            <Text style={styles.err}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryTxt}>Subukan ulit</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && uri ? (
          <View style={{ width: colW }}>
            <Text style={styles.meta}>
              Araw {questionNumber}
              {calendarDate ? ` · ${calendarDate}` : ''}
            </Text>

            <Text style={styles.badge}>Cognitive challenge</Text>
            <Text style={styles.headline}>{displayTitle}</Text>

            <View style={[styles.cardShadow, { width: colW }]}>
              <View style={styles.whiteCard}>
                <Image
                  source={{ uri }}
                  style={[
                    styles.stimulus,
                    { width: imgMaxW, height: imgH },
                    Platform.OS === 'web' && { objectFit: 'contain' as const },
                  ]}
                  resizeMode="contain"
                  accessibilityLabel="Sequence ng tatlong hugis — pumili ng susunod na A hanggang E"
                />
              </View>
            </View>

            <Text style={styles.footerInstruction}>{footerInstruction}</Text>

            {!allowGuess && !feedback ? (
              <View style={styles.lockedBanner}>
                <Text style={styles.lockedTitle}>Tapos na ang sagot ngayon</Text>
                <Text style={styles.lockedBody}>
                  Isang beses lang bawat araw ang pagsagot dito. Bumalik bukas para sa bagong challenge.
                </Text>
              </View>
            ) : null}

            <View style={[styles.bubbleRow, { maxWidth: colW + 4 }, !pickEnabled && styles.bubbleRowDisabled]}>
              {CHOICES.map((c) => {
                const sel = guess === c.n;
                return (
                  <Pressable
                    key={c.n}
                    disabled={!pickEnabled}
                    style={[
                      styles.bubble,
                      { width: bubbleSize, height: bubbleSize, minWidth: bubbleSize, minHeight: bubbleSize },
                      sel && styles.bubbleOn,
                      !pickEnabled && styles.bubbleDisabled,
                    ]}
                    onPress={() => {
                      setGuess(c.n);
                    }}
                    accessibilityLabel={`Opsyon ${c.l}`}
                  >
                    <Text style={[styles.bubbleLetter, compact && styles.bubbleLetterCompact, sel && styles.bubbleLetterOn]}>
                      {c.l}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[styles.submit, (!guess || submitting || !allowGuess) && styles.submitOff]}
              disabled={!guess || submitting || !allowGuess}
              onPress={() => void onSubmit()}
            >
              <Text style={styles.submitTxt}>{submitting ? 'Sinusuri…' : 'Suriin ang sagot'}</Text>
            </Pressable>

            {feedback ? (
              <View style={styles.feedbackBlock}>
                <View style={[styles.feedbackBanner, feedback.ok ? styles.feedbackOk : styles.feedbackBad]}>
                  <Text style={styles.feedbackMsg}>{feedback.text}</Text>
                </View>
                {feedback.ok && feedback.bonusA !== undefined && feedback.bonusB !== undefined ? (
                  <View style={styles.comboCard}>
                    <Text style={styles.comboTitle}>
                      {feedback.bonusC !== undefined
                        ? 'Random tip · tatlong digit (0–9)'
                        : 'Random tip · dalawang digit (0–9)'}
                    </Text>
                    <Text style={styles.comboDigits}>
                      {resolvedTip!.a}
                      <Text style={styles.comboDot}> · </Text>
                      {resolvedTip!.b}
                      {resolvedTip!.c !== null ? (
                        <>
                          <Text style={styles.comboDot}> · </Text>
                          {resolvedTip!.c}
                        </>
                      ) : null}
                    </Text>
                    {feedback.bonusC !== undefined ? (
                      <Pressable
                        style={({ pressed }) => [styles.rerollTipBtn, pressed && styles.rerollTipBtnPressed]}
                        onPress={() => setTipDisplay(rollThreeDigits())}
                        accessibilityRole="button"
                        accessibilityLabel="Bagong tatlong random na numero"
                      >
                        <Text style={styles.rerollTipBtnText}>Bagong tatlong numero</Text>
                      </Pressable>
                    ) : null}
                    <Text style={styles.comboNote}>
                      {feedback.bonusC !== undefined
                        ? 'Bagong halo tuwing pipindutin ang button — pampaswerte lamang, hindi garantiya ng resulta.'
                        : 'Parehong pares kada araw para sa iyong account pag tama ang sagot. Pampasiyasat lamang.'}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <Pressable
              style={styles.refWrap}
              onPress={() =>
                Linking.openURL(
                  'https://www.tests.com/practice/cognitive-abilities-practice-test',
                )
              }
            >
              <Text style={styles.refLink}>Tulad ng nonverbal sequence items (Tests.com) →</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: NAVY },
  scroll: {
    paddingTop: 8,
    flexGrow: 1,
  },
  badge: {
    alignSelf: 'center',
    fontSize: 10,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    textAlign: 'center',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  headline: {
    fontSize: 22,
    fontWeight: '800',
    color: WHITE,
    textAlign: 'center',
    lineHeight: 28,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  cardShadow: {
    alignSelf: 'center',
    marginBottom: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  whiteCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  stimulus: { backgroundColor: WHITE },
  footerInstruction: {
    marginTop: 16,
    fontSize: 15,
    lineHeight: 22,
    color: '#e2e8f0',
    textAlign: 'center',
    paddingHorizontal: 6,
    fontWeight: '600',
  },
  lockedBanner: {
    marginTop: 14,
    marginBottom: 4,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  lockedTitle: {
    color: '#fde68a',
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 6,
    textAlign: 'center',
  },
  lockedBody: {
    color: 'rgba(254,243,199,0.9)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  bubbleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    rowGap: 14,
    marginTop: 20,
    flexWrap: 'wrap',
  },
  bubbleRowDisabled: { opacity: 0.45 },
  bubble: {
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleOn: {
    backgroundColor: WHITE,
    borderColor: WHITE,
  },
  bubbleDisabled: {
    opacity: 0.55,
  },
  bubbleLetter: {
    fontSize: 22,
    fontWeight: '800',
    color: WHITE,
    lineHeight: 24,
  },
  bubbleLetterCompact: { fontSize: 20 },
  bubbleLetterOn: { color: NAVY },
  submit: {
    marginTop: 28,
    backgroundColor: WHITE,
    paddingVertical: 16,
    minHeight: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  submitOff: { opacity: 0.38 },
  submitTxt: { color: NAVY, fontSize: 16, fontWeight: '800' },
  loadingBlock: { alignItems: 'center', paddingVertical: 48 },
  loadingCaption: { marginTop: 14, fontSize: 14, color: MUTED },
  panel: {
    marginBottom: 16,
    padding: 18,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  panelTitle: { color: '#fecaca', fontWeight: '800', fontSize: 16, marginBottom: 6 },
  panelBody: { color: '#cbd5e1', lineHeight: 21, fontSize: 14 },
  err: { color: '#fecaca', marginBottom: 12, lineHeight: 22, fontSize: 14 },
  retryBtn: {
    alignSelf: 'center',
    backgroundColor: WHITE,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 999,
  },
  retryTxt: { color: NAVY, fontWeight: '800', fontSize: 14 },
  feedbackBlock: { marginTop: 18 },
  feedbackBanner: { padding: 14, borderRadius: 12, marginBottom: 10 },
  feedbackOk: {
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.5)',
  },
  feedbackBad: {
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
  },
  feedbackMsg: { fontSize: 15, lineHeight: 22, color: '#f8fafc' },
  comboCard: {
    borderRadius: 12,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  comboTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#93c5fd',
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  comboDigits: {
    fontSize: 26,
    fontWeight: '900',
    color: WHITE,
    letterSpacing: 2,
    textAlign: 'center',
  },
  comboDot: { fontSize: 26, color: MUTED, fontWeight: '700' },
  comboNote: { fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 16 },
  rerollTipBtn: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.45)',
  },
  rerollTipBtnPressed: { opacity: 0.85 },
  rerollTipBtnText: { color: '#7dd3fc', fontWeight: '800', fontSize: 13 },
  refWrap: { marginTop: 20, alignItems: 'center', paddingBottom: 8 },
  refLink: { fontSize: 12, color: '#93c5fd', fontWeight: '600', textAlign: 'center' },
});
