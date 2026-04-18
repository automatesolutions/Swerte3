import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import type { ImageLoadEventData, NativeSyntheticEvent } from 'react-native';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getStoredAccessToken } from '../auth/storage';
import type { RootStackParamList } from '../navigation/types';
import { fetchDailyPictureAnalysis } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'PictureAnalysis'>;

/** Readable column on phones; centered “phone width” on tablet/desktop web. */
const MAX_CARD_WIDTH = 432;

export function PictureAnalysisScreen(_props: Props): React.ReactElement {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gutter = 16;
  const cardPad = 18;
  const mountPad = 12;
  const contentW = Math.min(width - gutter * 2, MAX_CARD_WIDTH);
  const mountW = Math.max(200, contentW - cardPad * 2);
  const imgInner = Math.max(152, mountW - mountPad * 2);
  const compact = width < 380;

  const [imageExpanded, setImageExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [sceneHint, setSceneHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getStoredAccessToken();
    try {
      const d = await fetchDailyPictureAnalysis(token?.trim() || undefined);
      setImgNatural(null);
      setUri(`data:${d.mime_type};base64,${d.image_base64}`);
      setCalendarDate(d.calendar_date);
      setSceneHint(d.scene_hint);
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Hindi ma-load ang larawan.';
      const msg = raw.replace(/^\d{3}:\s*/, '').trim();
      setError(msg.length > 220 ? 'Hindi makagawa ng larawan. Subukan muli mamaya.' : msg);
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

  useEffect(() => {
    if (!uri) return;
    Image.getSize(
      uri,
      (w, h) => {
        if (w > 0 && h > 0) setImgNatural({ w, h });
      },
      () => {},
    );
  }, [uri]);

  const onThumbLoad = useCallback(
    (e: NativeSyntheticEvent<ImageLoadEventData>) => {
      const src = e.nativeEvent.source;
      if (src && typeof src.width === 'number' && typeof src.height === 'number' && src.width > 0 && src.height > 0) {
        setImgNatural({ w: src.width, h: src.height });
        return;
      }
      if (uri) {
        Image.getSize(
          uri,
          (w, h) => setImgNatural({ w, h }),
          () => setImgNatural(null),
        );
      }
    },
    [uri],
  );

  const maxThumbW = imgInner;
  /** Let tall puzzles use vertical space; outer ScrollView scrolls (avoids “cropped” feel). */
  const maxThumbH = Math.min(height * 0.92, 2400);
  let thumbW = maxThumbW;
  let thumbH = maxThumbW;
  if (imgNatural && imgNatural.w > 0 && imgNatural.h > 0) {
    const ar = imgNatural.h / imgNatural.w;
    thumbH = maxThumbW * ar;
    if (thumbH > maxThumbH) {
      thumbH = maxThumbH;
      thumbW = maxThumbH / ar;
    }
  }
  const mountPadTotal = mountPad * 2;
  const photoMountW = Math.min(mountW, thumbW + mountPadTotal);

  const modalInnerW = width - 28;
  let modalImgW = modalInnerW;
  let modalImgH = modalInnerW;
  if (imgNatural && imgNatural.w > 0 && imgNatural.h > 0) {
    modalImgH = modalInnerW * (imgNatural.h / imgNatural.w);
  }

  return (
    <LinearGradient colors={['#07120f', '#0f2419', '#163d30']} style={styles.gradient}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: gutter,
            alignItems: 'center',
            paddingBottom: Math.max(28, insets.bottom + 20),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={[styles.centerBox, { minHeight: 200 }]}>
            <ActivityIndicator size="large" color="#4ade80" />
            <Text style={styles.loadingText}>Ginagawa ang puzzle…</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={[styles.centerBox, { paddingHorizontal: 0, maxWidth: contentW }]}>
            <Text style={styles.errTitle}>Hindi available</Text>
            <Text style={styles.errBody}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Subukan ulit</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && uri ? (
          <>
            <View style={[styles.mainCard, { width: contentW }]}>
              <View style={styles.cardAccent} />
              {calendarDate ? (
                <View style={styles.dateRow}>
                  <View style={styles.datePill}>
                    <Ionicons name="calendar-outline" size={15} color="#bbf7d0" style={styles.dateIcon} />
                    <Text style={styles.datePillText}>{calendarDate}</Text>
                  </View>
                </View>
              ) : null}
              <View style={styles.cardHeader}>
                <Ionicons name="search-outline" size={compact ? 20 : 22} color="#86efac" />
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardKicker, compact && styles.cardKickerCompact]}>
                    Hanapin ang mga numero
                  </Text>
                  <Text style={[styles.cardSub, compact && styles.cardSubCompact]}>
                    Itim-at-puti · pindutin ang larawan
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setImageExpanded(true)}
                accessibilityRole="button"
                accessibilityLabel="Palakihin ang larawan"
                style={({ pressed }) => [styles.tapArea, pressed && styles.tapAreaPressed]}
              >
                <View style={styles.photoMountShadow}>
                  <View style={[styles.photoMount, { width: photoMountW }]}>
                    <View style={[styles.imageBox, { width: thumbW, height: thumbH }]}>
                      <Image
                        source={{ uri }}
                        style={[
                          styles.image,
                          StyleSheet.absoluteFillObject,
                          Platform.OS === 'web' && { objectFit: 'contain' as const },
                        ]}
                        resizeMode="contain"
                        onLoad={onThumbLoad}
                        accessibilityLabel="Black and white cartoon na may mga numero"
                      />
                    </View>
                  </View>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setImageExpanded(true)}
                style={({ pressed }) => [styles.fullscreenChip, pressed && styles.fullscreenChipPressed]}
                accessibilityRole="button"
                accessibilityLabel="Buong screen"
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Ionicons name="expand-outline" size={20} color="#ecfdf5" />
                <Text style={styles.fullscreenChipText}>Buong screen</Text>
                <Ionicons name="chevron-forward" size={18} color="rgba(236,253,245,0.5)" />
              </Pressable>
              <Text style={styles.zoomHint}>iOS: pinch sa buong screen para i-zoom</Text>
            </View>

            <Modal
              visible={imageExpanded}
              animationType="fade"
              transparent
              onRequestClose={() => setImageExpanded(false)}
              statusBarTranslucent
            >
              <View style={styles.modalRoot}>
                <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
                  <ScrollView
                    style={styles.modalScroll}
                    contentContainerStyle={styles.modalScrollContent}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator
                    {...(Platform.OS === 'ios'
                      ? {
                          maximumZoomScale: 4,
                          minimumZoomScale: 1,
                          centerContent: true,
                          bouncesZoom: true,
                        }
                      : {})}
                  >
                    <View style={styles.modalImageFrame}>
                      <Image
                        source={{ uri }}
                        style={{
                          width: modalImgW,
                          height: modalImgH,
                          backgroundColor: '#0f172a',
                          ...(Platform.OS === 'web' ? { objectFit: 'contain' as const } : {}),
                        }}
                        resizeMode="contain"
                        onLoad={onThumbLoad}
                        accessibilityLabel="Malaking larawan — hanapin ang mga numero"
                      />
                    </View>
                  </ScrollView>
                  <View style={styles.modalBottomBar}>
                    <Pressable
                      onPress={() => setImageExpanded(false)}
                      style={({ pressed }) => [styles.modalDismissCta, pressed && styles.modalDismissCtaPressed]}
                      accessibilityRole="button"
                      accessibilityLabel="Bumalik sa normal na Litrato"
                    >
                      <Ionicons name="contract-outline" size={22} color="#ecfdf5" />
                      <Text style={styles.modalDismissCtaText}>Bumalik sa normal na larawan</Text>
                    </Pressable>
                  </View>
                </SafeAreaView>
              </View>
            </Modal>

            {sceneHint ? (
              <View style={[styles.hintCard, { width: contentW }]}>
                <View style={styles.hintCardHead}>
                  <Ionicons name="bulb-outline" size={18} color="#fde047" />
                  <Text style={styles.hintTitle}>Gabay</Text>
                </View>
                <Text style={styles.hintBody}>{sceneHint}</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { paddingTop: 10 },
  dateRow: { marginBottom: 12 },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(187,247,208,0.25)',
  },
  dateIcon: { marginRight: 6 },
  datePillText: { color: '#ecfdf5', fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  centerBox: { paddingVertical: 28, alignItems: 'center' },
  loadingText: { marginTop: 14, color: '#a7f3d0', fontSize: 15, fontWeight: '600' },
  errTitle: { color: '#fecaca', fontWeight: '800', fontSize: 18, marginBottom: 8 },
  errBody: { color: '#d1fae5', textAlign: 'center', lineHeight: 22, fontSize: 15 },
  retryBtn: {
    marginTop: 18,
    backgroundColor: '#16a34a',
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 999,
  },
  retryText: { color: '#ecfdf5', fontWeight: '800', fontSize: 15 },
  mainCard: {
    alignSelf: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    padding: 18,
    overflow: 'visible',
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#4ade80',
    opacity: 0.85,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  cardHeaderText: { flex: 1 },
  cardKicker: { color: '#ecfdf5', fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },
  cardKickerCompact: { fontSize: 16 },
  cardSub: { color: 'rgba(167,243,208,0.88)', fontSize: 14, marginTop: 4, fontWeight: '600' },
  cardSubCompact: { fontSize: 12 },
  tapArea: { alignSelf: 'center' },
  tapAreaPressed: { opacity: 0.94 },
  photoMountShadow: {
    alignSelf: 'center',
    overflow: 'visible',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 14,
  },
  photoMount: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#0f172a',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  imageBox: {
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: '#f8fafc',
  },
  image: { backgroundColor: '#f8fafc' },
  fullscreenChip: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    minHeight: 52,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(34,197,94,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.35)',
  },
  fullscreenChipPressed: { opacity: 0.88 },
  fullscreenChipText: { flex: 1, color: '#ecfdf5', fontSize: 15, fontWeight: '800' },
  zoomHint: {
    textAlign: 'center',
    color: 'rgba(226,255,240,0.65)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  modalSafe: { flex: 1 },
  modalScroll: { flex: 1 },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#000',
  },
  modalImageFrame: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: '#020617',
  },
  modalBottomBar: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.22)',
  },
  modalDismissCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: 'rgba(22,163,74,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(134,239,172,0.55)',
  },
  modalDismissCtaPressed: { opacity: 0.9 },
  modalDismissCtaText: {
    color: '#ecfdf5',
    fontWeight: '900',
    fontSize: 16,
    textAlign: 'center',
    flexShrink: 1,
  },
  hintCard: {
    alignSelf: 'center',
    marginTop: 20,
    padding: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 78, 59, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(134,239,172,0.28)',
  },
  hintCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  hintTitle: { color: '#fde047', fontWeight: '800', fontSize: 15 },
  hintBody: { color: '#d1fae5', lineHeight: 22, fontSize: 15 },
});
