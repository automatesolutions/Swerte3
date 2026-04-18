import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Text,
  TextInput,
  Title,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { logEvent } from '../analytics';
import { SWERTRES_LEGAL_CAPTION, SWERTRES_LEGAL_CAPTION_TL } from '../constants/disclaimers';
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

function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return new Date();
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return new Date();
  return new Date(y, mo - 1, d);
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatFriendly(iso: string): string {
  const d = parseIsoDate(iso);
  try {
    return d.toLocaleDateString('en-PH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function PredictScreen(_props: Props): React.ReactElement {
  const today = new Date().toISOString().slice(0, 10);
  const [targetDate, setTargetDate] = useState(today);
  const [pickerDate, setPickerDate] = useState(() => parseIsoDate(today));
  const [androidOpen, setAndroidOpen] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);
  const [webY, setWebY] = useState(today.slice(0, 4));
  const [webM, setWebM] = useState(today.slice(5, 7));
  const [webD, setWebD] = useState(today.slice(8, 10));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DailyPredictionResponse | null>(null);

  const webPreviewIso = useMemo(() => {
    const y = Math.min(2100, Math.max(1900, parseInt(webY, 10) || 2000));
    const mo = Math.min(12, Math.max(1, parseInt(webM, 10) || 1));
    const d = Math.min(31, Math.max(1, parseInt(webD, 10) || 1));
    return toIsoDate(new Date(y, mo - 1, d));
  }, [webY, webM, webD]);

  const displayIso = Platform.OS === 'web' ? webPreviewIso : targetDate;

  const isoValid = useMemo(() => {
    if (Platform.OS === 'web') {
      const y = parseInt(webY, 10);
      const mo = parseInt(webM, 10);
      const d = parseInt(webD, 10);
      if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return false;
      if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
      return true;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(targetDate.trim());
  }, [targetDate, webY, webM, webD]);

  const applyPickerDate = useCallback((d: Date) => {
    setPickerDate(d);
    setTargetDate(toIsoDate(d));
  }, []);

  const setToday = useCallback(() => {
    const n = new Date();
    applyPickerDate(n);
    if (Platform.OS === 'web') {
      const iso = toIsoDate(n);
      setWebY(iso.slice(0, 4));
      setWebM(iso.slice(5, 7));
      setWebD(iso.slice(8, 10));
    }
  }, [applyPickerDate]);

  const onAndroidChange = useCallback((_event: unknown, date?: Date) => {
    setAndroidOpen(false);
    if (date) applyPickerDate(date);
  }, [applyPickerDate]);

  const openPicker = useCallback(() => {
    setPickerDate(parseIsoDate(targetDate));
    if (Platform.OS === 'android') setAndroidOpen(true);
    else if (Platform.OS === 'ios') setIosOpen(true);
  }, [targetDate]);

  const syncWebToIso = useCallback(() => {
    const y = Math.min(2100, Math.max(1900, parseInt(webY, 10) || 2000));
    const mo = Math.min(12, Math.max(1, parseInt(webM, 10) || 1));
    const d = Math.min(31, Math.max(1, parseInt(webD, 10) || 1));
    const safe = new Date(y, mo - 1, d);
    setWebY(String(safe.getFullYear()));
    setWebM(String(safe.getMonth() + 1).padStart(2, '0'));
    setWebD(String(safe.getDate()).padStart(2, '0'));
    setTargetDate(toIsoDate(safe));
  }, [webY, webM, webD]);

  const runDaily = async () => {
    let iso = targetDate.trim();
    if (Platform.OS === 'web') {
      const y = Math.min(2100, Math.max(1900, parseInt(webY, 10) || 0));
      const mo = Math.min(12, Math.max(1, parseInt(webM, 10) || 0));
      const d = Math.min(31, Math.max(1, parseInt(webD, 10) || 0));
      if (!y || !mo || !d) {
        Alert.alert('Petsa', 'Pakilagay ang taon, buwan, at araw.');
        return;
      }
      const safe = new Date(y, mo - 1, d);
      iso = toIsoDate(safe);
      setTargetDate(iso);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      Alert.alert('Petsa', 'Pakitsek ang taon, buwan, at araw.');
      return;
    }
    setLoading(true);
    setData(null);
    try {
      await logEvent('prediction_request', { tier: 'free', mode: 'daily', targetDate: iso });
      const variationKey = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const res = await fetchDailyPredictions(iso, variationKey);
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
    <LinearGradient colors={['#143625', '#1e4a31', '#234f35']} style={styles.gradient}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.pad}
        accessibilityLabel="LuckyPick predictions screen"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <LinearGradient
            colors={['#2f855a', '#276749']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroStripe}
          />
          <RNText style={styles.heroKicker}>LIBRE · FREE TIER</RNText>
          <Title style={styles.pageTitle} accessibilityRole="header">
            LuckyPick
          </Title>
          <Text style={styles.heroSub}>
            Pumili ng petsang mahalaga sa iyo—hindi na kailangang i-type ang buong format.
          </Text>
          <RNText style={styles.swertresLegal}>{SWERTRES_LEGAL_CAPTION}</RNText>
          <RNText style={styles.swertresLegalTl}>{SWERTRES_LEGAL_CAPTION_TL}</RNText>
        </View>

        <View style={styles.dateShell}>
          <RNText style={styles.dateSectionLabel}>Ang napiling petsa</RNText>
          <RNText style={styles.dateBig} accessibilityLiveRegion="polite">
            {formatFriendly(displayIso)}
          </RNText>
          <RNText style={styles.dateIso}>({displayIso})</RNText>

          {Platform.OS === 'web' ? (
            <View style={styles.webGrid}>
              <View style={styles.webField}>
                <RNText style={styles.webFieldLbl}>Taon</RNText>
                <TextInput
                  mode="outlined"
                  value={webY}
                  onChangeText={setWebY}
                  keyboardType="number-pad"
                  maxLength={4}
                  style={styles.webInput}
                  outlineColor="#86b98f"
                  activeOutlineColor="#2f855a"
                  dense
                />
              </View>
              <View style={styles.webField}>
                <RNText style={styles.webFieldLbl}>Buwan (01–12)</RNText>
                <TextInput
                  mode="outlined"
                  value={webM}
                  onChangeText={(t) => setWebM(t.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={styles.webInput}
                  outlineColor="#86b98f"
                  activeOutlineColor="#2f855a"
                  dense
                />
              </View>
              <View style={styles.webField}>
                <RNText style={styles.webFieldLbl}>Araw (01–31)</RNText>
                <TextInput
                  mode="outlined"
                  value={webD}
                  onChangeText={(t) => setWebD(t.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={styles.webInput}
                  outlineColor="#86b98f"
                  activeOutlineColor="#2f855a"
                  dense
                />
              </View>
            </View>
          ) : null}

          <View style={styles.dateActions}>
            {Platform.OS !== 'web' ? (
              <Pressable
                onPress={openPicker}
                style={({ pressed }) => [styles.datePickBtn, pressed && styles.datePickBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Palitan ang petsa gamit ang kalendaryo"
              >
                <RNText style={styles.datePickBtnText}>Palitan ang petsa</RNText>
                <RNText style={styles.datePickBtnHint}>Buksan ang kalendaryo</RNText>
              </Pressable>
            ) : (
              <Button
                mode="contained-tonal"
                onPress={syncWebToIso}
                buttonColor="rgba(47,133,90,0.25)"
                textColor="#113526"
                style={styles.syncWebBtn}
              >
                Ilapat ang petsa
              </Button>
            )}
            <Pressable
              onPress={setToday}
              style={({ pressed }) => [styles.todayBtn, pressed && styles.todayBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Gamitin ang petsa ngayon"
            >
              <RNText style={styles.todayBtnText}>Ngayon (today)</RNText>
            </Pressable>
          </View>
        </View>

        {androidOpen ? (
          <DateTimePicker
            value={pickerDate}
            mode="date"
            display="default"
            onChange={onAndroidChange}
          />
        ) : null}

        <Modal visible={iosOpen} animationType="slide" transparent onRequestClose={() => setIosOpen(false)}>
          <View style={styles.iosModalWrap}>
            <Pressable style={styles.iosModalBackdrop} onPress={() => setIosOpen(false)} accessibilityLabel="Isara" />
            <SafeAreaView style={styles.iosModalSheet} edges={['bottom']}>
              <RNText style={styles.iosModalTitle}>Piliin ang petsa</RNText>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="spinner"
                onChange={(_e, d) => {
                  if (d) setPickerDate(d);
                }}
                themeVariant="light"
              />
              <View style={styles.iosModalActions}>
                <Button mode="outlined" onPress={() => setIosOpen(false)} textColor="#1a4d2e">
                  Kanselahin
                </Button>
                <Button
                  mode="contained"
                  buttonColor="#2f855a"
                  onPress={() => {
                    applyPickerDate(pickerDate);
                    setIosOpen(false);
                  }}
                >
                  OK
                </Button>
              </View>
            </SafeAreaView>
          </View>
        </Modal>

        <Button
          mode="contained"
          buttonColor="#1f5c3a"
          textColor="#f5fff5"
          onPress={runDaily}
          disabled={loading || !isoValid}
          style={styles.cta}
          contentStyle={styles.ctaContent}
          labelStyle={styles.ctaLabel}
          accessibilityLabel="Kunin ang LuckyPick numbers"
        >
          Kunin ang aking pick
        </Button>
        {!isoValid ? (
          <Text style={styles.warnText}>Pakikumpleto ang petsa bago magpatuloy.</Text>
        ) : null}
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
                  elevation={3}
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
            <RNText style={styles.swertresLegalFooter}>{SWERTRES_LEGAL_CAPTION}</RNText>
            <RNText style={styles.swertresLegalFooterTl}>{SWERTRES_LEGAL_CAPTION_TL}</RNText>
          </View>
        ) : null}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  pad: {
    padding: 18,
    paddingBottom: 48,
    ...(Platform.OS === 'web' ? { maxWidth: 520, width: '100%', alignSelf: 'center' as const } : {}),
  },
  heroCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(47,133,90,0.35)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  heroStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: '900',
    color: '#2f855a',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 4,
  },
  pageTitle: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    color: '#0d2818',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  heroSub: {
    fontSize: 16,
    lineHeight: 23,
    color: '#2d4f3a',
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  swertresLegal: {
    marginTop: 14,
    fontSize: 11,
    lineHeight: 16,
    color: '#3d5c47',
    fontWeight: '600',
    opacity: 0.92,
  },
  swertresLegalTl: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 16,
    color: '#4a6b54',
    fontStyle: 'italic',
    opacity: 0.9,
  },
  swertresLegalFooter: {
    marginTop: 18,
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(13,40,24,0.75)',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  swertresLegalFooterTl: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(13,40,24,0.65)',
    textAlign: 'center',
    paddingHorizontal: 12,
    fontStyle: 'italic',
  },
  dateShell: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(47,133,90,0.25)',
  },
  dateSectionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#276749',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  dateBig: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: '#0d2818',
    letterSpacing: 0.2,
  },
  dateIso: {
    marginTop: 6,
    fontSize: 15,
    color: '#4a6b54',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  webGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  webField: { flex: 1, minWidth: 88 },
  webFieldLbl: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a4d2e',
    marginBottom: 6,
  },
  webInput: { backgroundColor: '#f0fdf4', minHeight: 56, fontSize: 20 },
  dateActions: { marginTop: 16, gap: 12 },
  datePickBtn: {
    backgroundColor: '#2f855a',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#86efac',
  },
  datePickBtnPressed: { opacity: 0.9 },
  datePickBtnText: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  datePickBtnHint: { color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: '600', marginTop: 4 },
  todayBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#2f855a',
    backgroundColor: 'rgba(47,133,90,0.08)',
  },
  todayBtnPressed: { opacity: 0.88 },
  todayBtnText: { color: '#14532d', fontSize: 17, fontWeight: '800' },
  syncWebBtn: { marginTop: 4 },
  iosModalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  iosModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  iosModalSheet: {
    backgroundColor: '#f8fff8',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(47,133,90,0.2)',
  },
  iosModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0d2818',
    textAlign: 'center',
    marginBottom: 4,
  },
  iosModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
    marginBottom: 8,
  },
  cta: { borderRadius: 16, marginBottom: 6 },
  ctaContent: { paddingVertical: 14, minHeight: 54 },
  ctaLabel: { fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },
  warnText: {
    color: '#9a3412',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  loader: { marginVertical: 28 },
  resultsWrap: { marginTop: 20 },
  card: {
    marginBottom: 14,
    borderRadius: 18,
    backgroundColor: '#f7fff5',
    borderWidth: 1,
    borderColor: '#8fce98',
    overflow: 'hidden',
  },
  cardInner: { paddingVertical: 6 },
  sessionBadge: {
    marginBottom: 12,
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
