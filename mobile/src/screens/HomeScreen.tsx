import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { Button, Card, Text, Title } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { clearAuthTokens, getStoredAccessToken } from '../auth/storage';
import { logScreenView } from '../analytics';
import { fetchUserMe, purchaseTokens, startPremiumBatch } from '../services/api';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const logoSource = require('../../assets/Logo.png');

export function HomeScreen({ navigation }: Props): React.ReactElement {
  const [premiumCredits, setPremiumCredits] = useState<number | null>(null);
  const [noTokenModalVisible, setNoTokenModalVisible] = useState(false);
  const [gintoBusy, setGintoBusy] = useState(false);
  const [topupVisible, setTopupVisible] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'gcash' | 'maya' | 'gotyme'>('gcash');
  const [amountPesos, setAmountPesos] = useState('2');
  const [isBuying, setIsBuying] = useState(false);

  useEffect(() => {
    void logScreenView('Home');
  }, []);

  const loadPremiumCredits = useCallback(async () => {
    const token = await getStoredAccessToken();
    if (!token?.trim()) {
      setPremiumCredits(null);
      return;
    }
    try {
      const me = await fetchUserMe(token);
      setPremiumCredits(me.premium_credits);
    } catch {
      setPremiumCredits(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPremiumCredits();
    }, [loadPremiumCredits]),
  );

  const handleLogout = async () => {
    await clearAuthTokens();
    navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
  };

  const handleGinto = async () => {
    if (gintoBusy) return;
    const token = await getStoredAccessToken();
    if (!token?.trim()) {
      Alert.alert('Sign in', 'Mag-sign in muna para magamit ang Elite (premium).');
      return;
    }
    setGintoBusy(true);
    try {
      let credits: number;
      try {
        const me = await fetchUserMe(token);
        credits = Math.max(0, Math.floor(Number(me.premium_credits)));
        setPremiumCredits(credits);
      } catch {
        Alert.alert('Error', 'Hindi ma-load ang balanse. Subukan muli.');
        return;
      }
      if (credits < 1) {
        setNoTokenModalVisible(true);
        return;
      }
      const r = await startPremiumBatch(token);
      setPremiumCredits(r.premium_credits);
      navigation.navigate('LihimPremium');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('402') || msg.toLowerCase().includes('payment') || msg.toLowerCase().includes('kailangan')) {
        setNoTokenModalVisible(true);
      } else {
        Alert.alert('Elite', msg || 'Hindi makapagbukas ng Elite.');
      }
    } finally {
      setGintoBusy(false);
    }
  };

  const openAddTokensFromNoTokenModal = () => {
    setNoTokenModalVisible(false);
    setTopupVisible(true);
  };

  const handleConfirmTopup = async () => {
    const parsed = Number(amountPesos.trim());
    if (!Number.isFinite(parsed) || parsed < 2) {
      Alert.alert('Invalid amount', 'Minimum amount is 2 pesos.');
      return;
    }
    const wholePesos = Math.floor(parsed);
    const tokensToAdd = Math.floor(wholePesos / 2);
    if (tokensToAdd < 1) {
      Alert.alert('Invalid amount', 'Every 2 pesos adds 1 token.');
      return;
    }
    const token = await getStoredAccessToken();
    if (!token?.trim()) {
      Alert.alert('Session expired', 'Please log in again.');
      return;
    }
    try {
      setIsBuying(true);
      const result = await purchaseTokens(token, selectedProvider, wholePesos);
      setPremiumCredits(result.premium_credits);
      setTopupVisible(false);
      Alert.alert('Top-up successful', `Added ${result.tokens_added} token(s).`);
    } catch (err) {
      Alert.alert('Top-up failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsBuying(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      accessibilityLabel="Home scroll content"
    >
      <View style={styles.hero} accessibilityLabel="Swerte3">
        <Image
          source={logoSource}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Swerte3 logo"
          accessibilityRole="image"
        />
      </View>

      <View style={styles.sheet}>
        <Card
          style={[styles.card, styles.cardLuckyPick]}
          mode="elevated"
          accessibilityLabel="LuckyPick free predictions card"
        >
          <View style={styles.luckyPickStripe} />
          <Card.Content style={styles.cardContentTight}>
            <View style={styles.titleRowLuckyPick}>
              <Title style={styles.cardTitle}>LuckyPick</Title>
              <View style={styles.luckyPickPill}>
                <Text style={styles.luckyPickPillText}>free tier</Text>
              </View>
            </View>
            <Text style={styles.explainTextLuckyPick}>
              Smart and free—two AI models learn from 10,000+ past draws, compare what they see, and line up
              one confident pick for you. Tap Pick when you want today’s numbers.
            </Text>
            <View style={styles.row}>
              <Button
                mode="contained"
                onPress={() => navigation.navigate('Predict')}
                accessibilityLabel="Open LuckyPick predictions"
                style={styles.btnMain}
                buttonColor="#276749"
                textColor="#f4fff3"
                contentStyle={styles.btnContentLuckyPick}
                labelStyle={styles.btnLabelLuckyPick}
              >
                Pick
              </Button>
            </View>
          </Card.Content>
        </Card>

        <Card
          style={[styles.card, styles.cardAccent]}
          mode="outlined"
          accessibilityLabel="Elite premium card"
        >
          <Card.Content>
            <View style={styles.titleRow}>
              <Title style={styles.cardTitle}>Elite</Title>
              <Text style={styles.superTag}>premium prediction</Text>
            </View>
            <Text style={styles.explainTextElite}>
              Elite blends several AI agents into one premium number set. Tap the gold{' '}
              <Text style={styles.explainTextEliteEm}>GINTO</Text> button below to check your Elite prediction
              numbers for 9AM, 4PM, and 9PM.
            </Text>
            <View style={styles.lihimActionsRow}>
              <Button
                mode="contained-tonal"
                onPress={handleGinto}
                disabled={gintoBusy}
                loading={gintoBusy}
                accessibilityLabel="Open Elite prediction with GINTO"
                buttonColor="#d4af37"
                textColor="#2b1d00"
                style={[styles.btnPremium, styles.btnGold, styles.btnGintoInRow]}
                compact
              >
                ✦ GINTO ✦
              </Button>
              <Pressable
                onPress={() => setTopupVisible(true)}
                accessibilityLabel="Add tokens"
                style={({ pressed }) => [styles.addTokensBtn, pressed && styles.addTokensBtnPressed]}
              >
                <RNText style={styles.addTokensBtnText}>Add Tokens</RNText>
              </Pressable>
              <View
                style={styles.tokenCircle}
                accessibilityLabel={
                  premiumCredits === null ? 'Premium credits unknown' : `Premium credits ${premiumCredits}`
                }
              >
                <RNText style={styles.tokenCircleText}>
                  {premiumCredits === null ? '—' : String(premiumCredits)}
                </RNText>
              </View>
            </View>
          </Card.Content>
        </Card>

        <RNText style={styles.exploreHeading}>TIPS</RNText>
        <View style={styles.exploreRow}>
          <View style={styles.tileShadow}>
            <Pressable
              style={({ pressed }) => [styles.tilePress, pressed && styles.tilePressActive]}
              onPress={() => navigation.navigate('PictureAnalysis')}
              accessibilityLabel="Litrato mo Analyze mo"
              android_ripple={{ color: 'rgba(47, 133, 90, 0.22)' }}
            >
              <View style={[styles.tileInner, styles.tileInnerA]}>
                <View style={styles.tileAccent} />
                <RNText style={styles.squareLabel}>
                  Litrato mo{'\n'}Analyze mo
                </RNText>
              </View>
            </Pressable>
          </View>
          <View style={styles.tileShadow}>
            <Pressable
              style={({ pressed }) => [styles.tilePress, pressed && styles.tilePressActive]}
              onPress={() => navigation.navigate('MathAlgo')}
              accessibilityLabel="Cognitive challenge — susunod na pattern"
              android_ripple={{ color: 'rgba(47, 133, 90, 0.22)' }}
            >
              <View style={[styles.tileInner, styles.tileInnerB]}>
                <View style={styles.tileAccent} />
                <RNText style={styles.squareLabel}>
                  Cognitive{'\n'}challenge
                </RNText>
              </View>
            </Pressable>
          </View>
          <View style={styles.tileShadow}>
            <Pressable
              style={({ pressed }) => [styles.tilePress, pressed && styles.tilePressActive]}
              onPress={() => navigation.navigate('Analytics')}
              accessibilityLabel="Analytics"
              android_ripple={{ color: 'rgba(47, 133, 90, 0.22)' }}
            >
              <View style={[styles.tileInner, styles.tileInnerC]}>
                <View style={styles.tileAccent} />
                <RNText style={styles.squareLabel}>Analytics</RNText>
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.logoutRow}>
          <Button
            mode="outlined"
            onPress={handleLogout}
            accessibilityLabel="Log out"
            style={styles.btnLogout}
            textColor="#1f5130"
            contentStyle={styles.btnContent}
          >
            Log out
          </Button>
        </View>
      </View>
      <Modal
        visible={noTokenModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNoTokenModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <RNText style={styles.noTokenTitle}>Walang token</RNText>
            <RNText style={styles.noTokenLead}>
              Kailangan ng token para mabuksan ang Elite.
            </RNText>
            <RNText style={styles.noTokenBody}>
              Premium ang Elite (MiroFish): maraming matalinong AI ang tumatakbo, kaya may konting bayad sa
              server.
            </RNText>
            <RNText style={styles.noTokenPrice}>1 token = 2 pesos</RNText>
            <RNText style={styles.noTokenAction}>Pindutin ang Add Tokens sa ibaba para magpatuloy.</RNText>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setNoTokenModalVisible(false)}
              >
                <RNText style={styles.modalBtnGhostText}>Sara</RNText>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={openAddTokensFromNoTokenModal}>
                <RNText style={styles.modalBtnPrimaryText}>Add Tokens</RNText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={topupVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTopupVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <RNText style={styles.modalTitle}>Add Tokens</RNText>
            <RNText style={styles.topupLead}>
              Pick your wallet and how much to pay.{' '}
              <RNText style={styles.topupLeadEm}>2 pesos = 1 token.</RNText>
            </RNText>
            <RNText style={styles.topupNote}>
              Elite uses extra AI power—tokens help cover that cost.
            </RNText>
            <View style={styles.providerRow}>
              {(['gcash', 'maya', 'gotyme'] as const).map((provider) => {
                const selected = provider === selectedProvider;
                return (
                  <Pressable
                    key={provider}
                    onPress={() => setSelectedProvider(provider)}
                    style={[styles.providerChip, selected && styles.providerChipSelected]}
                  >
                    <RNText style={[styles.providerChipText, selected && styles.providerChipTextSelected]}>
                      {provider.toUpperCase()}
                    </RNText>
                  </Pressable>
                );
              })}
            </View>
            <RNText style={styles.inputLabel}>Amount (PHP)</RNText>
            <TextInput
              value={amountPesos}
              onChangeText={setAmountPesos}
              keyboardType="number-pad"
              placeholder="e.g. 10"
              placeholderTextColor="#6b7280"
              style={styles.amountInput}
              editable={!isBuying}
            />
            <RNText style={styles.previewText}>
              Tokens to add: {Math.max(0, Math.floor((Number(amountPesos) || 0) / 2))}
            </RNText>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setTopupVisible(false)}
                disabled={isBuying}
              >
                <RNText style={styles.modalBtnGhostText}>Cancel</RNText>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, isBuying && styles.modalBtnDisabled]}
                onPress={handleConfirmTopup}
                disabled={isBuying}
              >
                <RNText style={styles.modalBtnPrimaryText}>{isBuying ? 'Processing...' : 'Confirm'}</RNText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#1e4a31' },
  scrollContent: {
    flexGrow: 1,
    ...(Platform.OS === 'web'
      ? { maxWidth: 560, width: '100%', alignSelf: 'center' as const }
      : {}),
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? 32 : 24,
    paddingBottom: 16,
    backgroundColor: '#1e4a31',
    borderBottomWidth: 3,
    borderBottomColor: '#86c88f',
  },
  logo: {
    width: 168,
    height: 168,
  },
  sheet: {
    flex: 1,
    backgroundColor: '#dff1de',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 48,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -12,
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: '#f3fff1',
    borderWidth: 1,
    borderColor: '#b8dfb9',
  },
  cardLuckyPick: {
    overflow: 'hidden',
    borderColor: '#9dcea2',
    ...Platform.select({
      ios: {
        shadowColor: '#1a4d2e',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  luckyPickStripe: {
    height: 4,
    backgroundColor: '#2f855a',
    opacity: 0.9,
  },
  cardContentTight: { paddingTop: 14 },
  titleRowLuckyPick: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  luckyPickPill: {
    backgroundColor: 'rgba(47, 133, 90, 0.14)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(47, 133, 90, 0.35)',
  },
  luckyPickPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1e5630',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  cardAccent: {
    borderWidth: 1,
    borderColor: '#7fbf87',
  },
  cardTitle: {
    fontSize: 42,
    lineHeight: 44,
    marginBottom: 2,
    color: '#113526',
    fontWeight: '900',
    letterSpacing: 0.9,
    ...(Platform.OS === 'web'
      ? { fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif' }
      : { fontFamily: 'serif' }),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  superTag: {
    fontSize: 11,
    color: '#3f6950',
    fontStyle: 'italic',
    marginTop: 8,
    letterSpacing: 0.5,
    textTransform: 'lowercase',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  explainText: {
    color: '#2b4f3a',
    lineHeight: 22,
    fontSize: 15,
    opacity: 0.94,
    maxWidth: 680,
  },
  explainTextLuckyPick: {
    color: '#1a3324',
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '600',
    opacity: 1,
    maxWidth: 680,
    letterSpacing: 0.15,
  },
  explainTextElite: {
    color: '#1a3324',
    fontSize: 19,
    lineHeight: 29,
    fontWeight: '600',
    maxWidth: 680,
    letterSpacing: 0.2,
    marginTop: 2,
  },
  explainTextEliteEm: {
    color: '#7c5b0a',
    fontWeight: '900',
    fontSize: 19,
  },
  btnMain: { borderRadius: 14 },
  btnSecondary: { borderRadius: 12, borderColor: '#6aa174' },
  logoutRow: { alignItems: 'flex-end', marginTop: 4 },
  btnLogout: { alignSelf: 'flex-end', borderRadius: 12, borderColor: '#6aa174' },
  btnContent: { paddingVertical: 4 },
  btnContentLuckyPick: { paddingVertical: 12, minHeight: 52 },
  btnLabelLuckyPick: { fontSize: 17, fontWeight: '900', letterSpacing: 0.6 },
  btnPremium: { marginTop: 0, borderRadius: 12 },
  btnGintoInRow: { marginTop: 0, alignSelf: 'center' },
  lihimActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    width: '100%',
  },
  addTokensBtn: {
    backgroundColor: '#2f855a',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#276749',
    minWidth: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTokensBtnPressed: { opacity: 0.88 },
  addTokensBtnText: {
    color: '#f4fff3',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  tokenCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#94a3b8',
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  tokenCircleText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#475569',
  },
  exploreHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1a3d2a',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 12,
  },
  exploreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  tileShadow: {
    flex: 1,
    maxWidth: '32%',
    borderRadius: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#0a1f14',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
      },
      android: { elevation: 8 },
      default: {
        shadowColor: '#0a1f14',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
    }),
  },
  tilePress: { borderRadius: 18 },
  tilePressActive: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  tileInner: {
    minHeight: 118,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 14,
    borderWidth: 1.5,
  },
  tileInnerA: {
    backgroundColor: '#c9efd4',
    borderColor: '#3d8f5c',
  },
  tileInnerB: {
    backgroundColor: '#bfe8d9',
    borderColor: '#2f856f',
  },
  tileInnerC: {
    backgroundColor: '#d4edc9',
    borderColor: '#4a9048',
  },
  tileAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: '#1e4a31',
  },
  squareLabel: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    color: '#051910',
    lineHeight: 19,
    letterSpacing: 0.15,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(255,255,255,0.55)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 0,
      },
      default: {},
    }),
  },
  btnGold: {
    borderWidth: 1,
    borderColor: '#a67c00',
    backgroundColor: '#d4af37',
    shadowColor: '#b8860b',
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#f7fff7',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#8ec79c',
    padding: 18,
  },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#11402b' },
  noTokenTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#0d2818',
  },
  noTokenLead: {
    marginTop: 12,
    color: '#143d2a',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '800',
  },
  noTokenBody: {
    marginTop: 12,
    color: '#2b4f3a',
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
  },
  noTokenPrice: {
    marginTop: 14,
    color: '#0f4d2c',
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  noTokenAction: {
    marginTop: 12,
    color: '#1a4d2e',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  modalSub: { marginTop: 6, color: '#2b5b3f', fontSize: 15, lineHeight: 21, fontWeight: '700' },
  modalInfo: { marginTop: 8, color: '#355e49', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  topupLead: {
    marginTop: 10,
    color: '#163d29',
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '700',
  },
  topupLeadEm: { color: '#0f4d2c', fontWeight: '900' },
  topupNote: {
    marginTop: 10,
    color: '#355e49',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
  },
  providerRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  providerChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#8aa29a',
    backgroundColor: '#eef6ef',
  },
  providerChipSelected: {
    borderColor: '#1f7a4d',
    backgroundColor: '#d9f6e4',
  },
  providerChipText: { color: '#365646', fontWeight: '700', fontSize: 12 },
  providerChipTextSelected: { color: '#13472e' },
  inputLabel: { marginTop: 14, marginBottom: 6, color: '#214a33', fontWeight: '700' },
  amountInput: {
    borderWidth: 1,
    borderColor: '#8aa29a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    backgroundColor: '#fff',
    color: '#163b29',
    fontWeight: '700',
  },
  previewText: { marginTop: 8, color: '#205138', fontWeight: '700' },
  modalActions: { marginTop: 16, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  modalBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1 },
  modalBtnGhost: { backgroundColor: '#eff6f1', borderColor: '#b3cdbb' },
  modalBtnGhostText: { color: '#243d30', fontWeight: '800', fontSize: 16 },
  modalBtnPrimary: { backgroundColor: '#2f855a', borderColor: '#276749' },
  modalBtnPrimaryText: { color: '#f4fff3', fontWeight: '800', fontSize: 16 },
  modalBtnDisabled: { opacity: 0.7 },
});
