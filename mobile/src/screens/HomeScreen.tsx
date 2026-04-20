import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Card, Text, Title } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getStoredAccessToken, saveAuthTokens } from '../auth/storage';
import { HOME_ENTERTAINMENT_CAPTION, HOME_ENTERTAINMENT_CAPTION_TL } from '../constants/disclaimers';
import { logScreenView } from '../analytics';
import {
  capturePaypalOrder,
  completeGcashCheckout,
  createGcashCheckout,
  createPaypalCheckout,
  fetchPaymentConfig,
  fetchUserMe,
  purchaseTokens,
  registerGuestSession,
  startPremiumBatch,
  userNeedsProfile,
  type CheckoutSessionResult,
} from '../services/api';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

/** Minimum top-up amount (matches backend / PayPal order). */
const CHECKOUT_MIN_PESOS = 20;
/** Same rate as backend: premium credits scale with whole pesos at this ratio. */
const PESOS_PER_TOKEN = 2;
const MIN_CHECKOUT_TOKEN_EQUIVALENT = CHECKOUT_MIN_PESOS / PESOS_PER_TOKEN;

const logoSource = require('../../assets/Logo.png');

export function HomeScreen({ navigation }: Props): React.ReactElement {
  const [premiumCredits, setPremiumCredits] = useState<number | null>(null);
  const [noTokenModalVisible, setNoTokenModalVisible] = useState(false);
  const [gintoBusy, setGintoBusy] = useState(false);
  const [topupVisible, setTopupVisible] = useState(false);
  const [amountPesos, setAmountPesos] = useState(String(CHECKOUT_MIN_PESOS));
  const [isBuying, setIsBuying] = useState(false);
  const [checkoutProvider, setCheckoutProvider] = useState<'gcash' | 'paypal' | null>(null);
  const [pendingPaypalOrderId, setPendingPaypalOrderId] = useState<string | null>(null);
  const [paypalCompleteBusy, setPaypalCompleteBusy] = useState(false);
  const [pendingGcashSessionId, setPendingGcashSessionId] = useState<string | null>(null);
  const [gcashCompleteBusy, setGcashCompleteBusy] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const [profileAlias, setProfileAlias] = useState<string | null>(null);
  /** False until the latest refreshWallet attempt finishes (avoids invisible strip while /me loads). */
  const [accountBarReady, setAccountBarReady] = useState(false);
  /** Ignore stale async results when focus + AppState fire refreshWallet in parallel. */
  const refreshWalletSeq = useRef(0);

  useEffect(() => {
    void logScreenView('Home');
  }, []);

  const refreshWallet = useCallback(async () => {
    const seq = ++refreshWalletSeq.current;
    let token = (await getStoredAccessToken())?.trim() ?? '';
    if (!token) {
      try {
        const pair = await registerGuestSession();
        await saveAuthTokens(pair.access_token, pair.refresh_token);
        token = pair.access_token;
      } catch {
        if (seq !== refreshWalletSeq.current) return;
        setPremiumCredits(null);
        setProfileComplete(false);
        setProfilePhone(null);
        setProfileAlias(null);
        setAccountBarReady(true);
        return;
      }
    }
    try {
      const me = await fetchUserMe(token);
      if (seq !== refreshWalletSeq.current) return;

      const raw = me as Record<string, unknown>;
      const phoneRaw = me.phone ?? raw.phone_e164 ?? raw.phoneE164;
      const phoneStr =
        typeof phoneRaw === 'string' && phoneRaw.trim() ? phoneRaw.trim() : null;

      const aliasRaw = me.display_alias ?? raw.display_alias ?? raw.displayAlias;
      const aliasStr =
        aliasRaw != null && String(aliasRaw).trim() ? String(aliasRaw).trim() : null;

      const creditsNum = Number(me.premium_credits ?? raw.premium_credits ?? 0);
      setPremiumCredits(Number.isFinite(creditsNum) ? Math.max(0, Math.floor(creditsNum)) : 0);
      const needsProfile = userNeedsProfile(me);
      setProfileComplete(!needsProfile);
      setProfilePhone(phoneStr);
      setProfileAlias(aliasStr);

      if (needsProfile) {
        navigation.replace('ProfileSetup', { from: 'complete_profile' });
      }
    } catch {
      if (seq !== refreshWalletSeq.current) return;
      setPremiumCredits(null);
      setProfileComplete(false);
      setProfilePhone(null);
      setProfileAlias(null);
      // Don’t leave users on Home with empty account — send them to Profile (recovery + retry).
      navigation.replace('ProfileSetup', { from: 'complete_profile' });
    } finally {
      if (seq === refreshWalletSeq.current) {
        setAccountBarReady(true);
      }
    }
  }, [navigation]);

  const refreshCheckoutProvider = useCallback(async () => {
    try {
      const c = await fetchPaymentConfig();
      setCheckoutProvider(c.checkout_provider);
    } catch {
      setCheckoutProvider('gcash');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshWallet();
      void refreshCheckoutProvider();
    }, [refreshWallet, refreshCheckoutProvider]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshWallet();
    });
    return () => sub.remove();
  }, [refreshWallet]);

  const handleCompletePaypal = async () => {
    if (!pendingPaypalOrderId?.trim() || paypalCompleteBusy) return;
    const token = await getStoredAccessToken();
    if (!token?.trim()) {
      Alert.alert('Session expired', 'Please log in again.');
      return;
    }
    setPaypalCompleteBusy(true);
    try {
      const r = await capturePaypalOrder(token, pendingPaypalOrderId.trim());
      setPremiumCredits(r.premium_credits);
      setPendingPaypalOrderId(null);
      Alert.alert(
        'Top-up complete',
        r.tokens_added > 0
          ? `Added ${r.tokens_added} token credit(s). Balance: ${r.premium_credits}.`
          : `Payment was already applied. Balance: ${r.premium_credits}.`,
      );
    } catch (err) {
      Alert.alert('PayPal', err instanceof Error ? err.message : 'Could not complete payment.');
    } finally {
      setPaypalCompleteBusy(false);
    }
  };

  const handleCompleteGcash = async () => {
    if (!pendingGcashSessionId?.trim() || gcashCompleteBusy) return;
    const token = await getStoredAccessToken();
    if (!token?.trim()) {
      Alert.alert('Session expired', 'Please log in again.');
      return;
    }
    setGcashCompleteBusy(true);
    try {
      const r = await completeGcashCheckout(token, pendingGcashSessionId.trim());
      setPremiumCredits(r.premium_credits);
      setPendingGcashSessionId(null);
      Alert.alert(
        'Top-up complete',
        r.tokens_added > 0
          ? `Added ${r.tokens_added} token credit(s). Balance: ${r.premium_credits}.`
          : `Payment was already applied. Balance: ${r.premium_credits}.`,
      );
    } catch (err) {
      Alert.alert('Payment', err instanceof Error ? err.message : 'Could not confirm payment.');
    } finally {
      setGcashCompleteBusy(false);
    }
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
    if (!Number.isFinite(parsed) || parsed < CHECKOUT_MIN_PESOS) {
      Alert.alert(
        'Invalid amount',
        `Minimum top-up is ${CHECKOUT_MIN_PESOS} PHP. At ${PESOS_PER_TOKEN} PHP per token, that is ${MIN_CHECKOUT_TOKEN_EQUIVALENT} tokens.`,
      );
      return;
    }
    const wholePesos = Math.floor(parsed);
    const tokensToAdd = Math.floor(wholePesos / PESOS_PER_TOKEN);
    if (tokensToAdd < 1) {
      Alert.alert('Invalid amount', `Every ${PESOS_PER_TOKEN} pesos adds 1 token.`);
      return;
    }
    const token = await getStoredAccessToken();
    if (!token?.trim()) {
      Alert.alert('Session expired', 'Please log in again.');
      return;
    }
    try {
      setIsBuying(true);
      try {
        const mode = checkoutProvider ?? 'gcash';
        let checkout: CheckoutSessionResult;
        let gcashAuthReturn: string | undefined;
        if (mode === 'paypal') {
          checkout = await createPaypalCheckout(token, wholePesos);
        } else {
          gcashAuthReturn = ExpoLinking.createURL('checkout-done');
          try {
            checkout = await createGcashCheckout(token, wholePesos, {
              returnSuccessUrl: gcashAuthReturn,
              returnCancelUrl: gcashAuthReturn,
            });
          } catch (firstErr) {
            gcashAuthReturn = 'swerte3://checkout-done';
            try {
              checkout = await createGcashCheckout(token, wholePesos, {
                returnSuccessUrl: gcashAuthReturn,
                returnCancelUrl: gcashAuthReturn,
              });
            } catch {
              throw firstErr;
            }
          }
        }
        if (checkout.amount_pesos < CHECKOUT_MIN_PESOS) {
          Alert.alert(
            'Backend is outdated',
            `The server opened a ${checkout.amount_pesos} PHP checkout. Minimum is ${CHECKOUT_MIN_PESOS} PHP. Redeploy the API.`,
          );
          return;
        }
        if (checkout.amount_pesos !== wholePesos) {
          Alert.alert(
            'Amount mismatch',
            `You asked for ${wholePesos} PHP but the server returned ${checkout.amount_pesos} PHP. Do not pay on that page; fix the API.`,
          );
          return;
        }
        setTopupVisible(false);
        if (mode === 'paypal') {
          const canOpen = await Linking.canOpenURL(checkout.checkout_url);
          if (!canOpen) {
            Alert.alert('Checkout', 'Cannot open payment page on this device.');
            return;
          }
          await Linking.openURL(checkout.checkout_url);
          setPendingPaypalOrderId(checkout.checkout_session_id);
          Alert.alert(
            'PayPal',
            'After you approve payment in PayPal, return to this app and tap “Complete PayPal payment” on Home to add tokens.',
          );
        } else {
          setPendingPaypalOrderId(null);
          setPendingGcashSessionId(checkout.checkout_session_id);
          const returnForSession = gcashAuthReturn ?? ExpoLinking.createURL('checkout-done');
          try {
            await WebBrowser.openAuthSessionAsync(checkout.checkout_url, returnForSession);
            const tokenAfter = await getStoredAccessToken();
            if (tokenAfter?.trim()) {
              setGcashCompleteBusy(true);
              try {
                const r = await completeGcashCheckout(tokenAfter, checkout.checkout_session_id);
                setPremiumCredits(r.premium_credits);
                setPendingGcashSessionId(null);
                Alert.alert(
                  'Top-up complete',
                  r.tokens_added > 0
                    ? `Added ${r.tokens_added} token credit(s). Balance: ${r.premium_credits}.`
                    : `Payment was already applied. Balance: ${r.premium_credits}.`,
                );
              } catch {
                void refreshWallet();
              } finally {
                setGcashCompleteBusy(false);
              }
            }
          } catch {
            const canOpen = await Linking.canOpenURL(checkout.checkout_url);
            if (!canOpen) {
              Alert.alert('Checkout', 'Cannot open payment page on this device.');
              return;
            }
            await Linking.openURL(checkout.checkout_url);
            Alert.alert(
              'GCash / payment',
              'Nagbukas ang browser. Pagkatapos magbayad sa GCash o ibang paraan, bumalik sa app at i-tap ang “Confirm payment” kung hindi pa tumataas ang tokens.',
            );
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg.includes('410') || msg.toLowerCase().includes('gone')) {
          const result = await purchaseTokens(token, 'gcash', wholePesos);
          setPremiumCredits(result.premium_credits);
          setTopupVisible(false);
          Alert.alert('Top-up successful', `Added ${result.tokens_added} token(s). (dev mode)`);
        } else {
          throw e;
        }
      }
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
      <LinearGradient
        colors={['#071a10', '#123d28', '#1b5640']}
        locations={[0, 0.45, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.hero}
        accessibilityLabel="Swerte3"
      >
        <View style={styles.heroGlowOrb} pointerEvents="none" />

        <View style={styles.profileGlass} accessibilityLabel="Account mobile and alias">
          {!accountBarReady ? (
            <View style={styles.profileIdentityLoadingWrap}>
              <ActivityIndicator color="#ecffe9" style={styles.profileIdentitySpinner} />
              <RNText style={styles.profileIdentityLoading}>Loading account…</RNText>
            </View>
          ) : (
            <View style={styles.profileGlassInner}>
              <View style={[styles.profileCol, styles.profileColLeft]}>
                <RNText style={styles.profileIdentityLabel}>Mobile</RNText>
                <RNText style={styles.profileIdentityPhone} numberOfLines={1} ellipsizeMode="tail">
                  {profilePhone ?? '—'}
                </RNText>
              </View>
              <View style={styles.profileDivider} />
              <View style={[styles.profileCol, styles.profileColRight]}>
                <RNText style={[styles.profileIdentityLabel, styles.profileIdentityLabelRight]}>Alias</RNText>
                <RNText style={styles.profileIdentityAlias} numberOfLines={1} ellipsizeMode="tail">
                  {profileAlias ?? '—'}
                </RNText>
              </View>
            </View>
          )}
        </View>

        <View style={styles.logoWrap}>
          <LinearGradient
            colors={['rgba(255,214,120,0.22)', 'rgba(255,255,255,0)', 'rgba(72,187,120,0.12)']}
            style={styles.logoGlow}
            pointerEvents="none"
          />
          <Image
            source={logoSource}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Swerte3 logo"
            accessibilityRole="image"
          />
        </View>

        <LinearGradient
          colors={['rgba(212,175,55,0.55)', 'rgba(236,255,233,0.35)', 'rgba(72,187,120,0.5)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.heroBottomSheen}
          pointerEvents="none"
        />
      </LinearGradient>

      <View style={styles.sheet}>
        <LinearGradient
          colors={['#f0fff4', '#dff1de', '#d2ebd4']}
          locations={[0, 0.35, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sheetGradientBg}
          pointerEvents="none"
        />
        <View style={styles.sheetContent}>
        <Card
          style={[styles.card, styles.cardLuckyPick]}
          mode="elevated"
          accessibilityLabel="LuckyPick free predictions card"
        >
          <LinearGradient
            colors={['#134e2e', '#276749', '#48bb78']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.luckyPickStripe}
            pointerEvents="none"
          />
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

        {checkoutProvider === 'paypal' && pendingPaypalOrderId ? (
          <Card style={[styles.card, styles.paypalPendingCard]} mode="elevated" accessibilityLabel="PayPal pending">
            <Card.Content>
              <Title style={styles.paypalPendingTitle}>PayPal pending</Title>
              <Text style={styles.paypalPendingText}>
                Finish approving payment in PayPal, then tap below to capture the order and add tokens to your account.
              </Text>
              <View style={styles.paypalPendingActions}>
                <Button
                  mode="contained"
                  onPress={() => void handleCompletePaypal()}
                  loading={paypalCompleteBusy}
                  disabled={paypalCompleteBusy}
                  buttonColor="#0070ba"
                  textColor="#ffffff"
                  style={styles.paypalCompleteBtn}
                >
                  Complete PayPal payment
                </Button>
                <Button mode="text" onPress={() => setPendingPaypalOrderId(null)} textColor="#4a5568">
                  Dismiss
                </Button>
              </View>
            </Card.Content>
          </Card>
        ) : null}

        {checkoutProvider === 'gcash' && pendingGcashSessionId ? (
          <Card style={[styles.card, styles.paypalPendingCard]} mode="elevated" accessibilityLabel="GCash payment pending">
            <Card.Content>
              <Title style={styles.paypalPendingTitle}>GCash payment pending</Title>
              <Text style={styles.paypalPendingText}>
                After paying with GCash in the browser, tap below to confirm and add tokens. If the payment is still
                processing, wait a few seconds and try again.
              </Text>
              <View style={styles.paypalPendingActions}>
                <Button
                  mode="contained"
                  onPress={() => void handleCompleteGcash()}
                  loading={gcashCompleteBusy}
                  disabled={gcashCompleteBusy}
                  buttonColor="#0f6b3f"
                  textColor="#ffffff"
                  style={styles.paypalCompleteBtn}
                >
                  Confirm GCash payment
                </Button>
                <Button mode="text" onPress={() => setPendingGcashSessionId(null)} textColor="#4a5568">
                  Dismiss
                </Button>
              </View>
            </Card.Content>
          </Card>
        ) : null}

        <Card
          style={[styles.card, styles.cardAccent]}
          mode="outlined"
          accessibilityLabel="Elite premium card"
        >
          <LinearGradient
            colors={['#8b6914', '#d4af37', '#f0d78c']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.eliteStripe}
            pointerEvents="none"
          />
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
                style={styles.tokenRingWrap}
                accessibilityLabel={
                  premiumCredits === null ? 'Premium credits unknown' : `Premium credits ${premiumCredits}`
                }
              >
                <LinearGradient
                  colors={['#c9a227', '#f4e4a6', '#b8860b']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.tokenRing}
                >
                  <View style={styles.tokenCircleInner}>
                    <RNText style={styles.tokenCircleText}>
                      {premiumCredits === null ? '—' : String(premiumCredits)}
                    </RNText>
                  </View>
                </LinearGradient>
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

        {profileComplete ? (
          <View style={styles.editProfileRow}>
            <Button
              mode="outlined"
              onPress={() => navigation.navigate('ProfileSetup', { from: 'home' })}
              textColor="#1f5130"
              style={styles.editProfileBtn}
              accessibilityLabel="Edit mobile number or alias"
            >
              Edit profile
            </Button>
          </View>
        ) : null}

        <View style={styles.replayIntroRow}>
          <Pressable
            onPress={() =>
              navigation.reset({
                index: 0,
                routes: [{ name: 'VideoHome' }],
              })
            }
            accessibilityLabel="Replay intro video"
            accessibilityRole="button"
          >
            <RNText style={styles.replayIntroLink}>Replay intro video</RNText>
          </Pressable>
        </View>

        <View
          style={styles.homeFooterDisclaimer}
          accessibilityRole="text"
          accessibilityLabel={`${HOME_ENTERTAINMENT_CAPTION} ${HOME_ENTERTAINMENT_CAPTION_TL}`}
        >
          <RNText style={styles.homeFooterDisclaimerText}>{HOME_ENTERTAINMENT_CAPTION}</RNText>
          <RNText style={styles.homeFooterDisclaimerTl}>{HOME_ENTERTAINMENT_CAPTION_TL}</RNText>
        </View>
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
            <RNText style={styles.noTokenPrice}>
              1 token = {PESOS_PER_TOKEN} pesos — smallest top-up {CHECKOUT_MIN_PESOS} pesos ({MIN_CHECKOUT_TOKEN_EQUIVALENT}{' '}
              tokens)
            </RNText>
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
              <RNText style={styles.topupLeadEm}>
                {PESOS_PER_TOKEN} PHP = 1 token.
              </RNText>{' '}
              Minimum {CHECKOUT_MIN_PESOS} PHP — smallest purchase is {MIN_CHECKOUT_TOKEN_EQUIVALENT} tokens (
              {CHECKOUT_MIN_PESOS} ÷ {PESOS_PER_TOKEN}).
              {checkoutProvider === 'paypal'
                ? ' You pay with PayPal.'
                : ' You pay with GCash — a secure browser page opens to complete payment.'}
            </RNText>
            <RNText style={styles.topupNote}>
              {checkoutProvider === 'paypal'
                ? 'After PayPal, tap “Complete PayPal payment” on Home.'
                : 'Credits update after GCash payment (webhook or confirm on Home).'}
            </RNText>
            <RNText style={styles.inputLabel}>Amount (PHP)</RNText>
            <TextInput
              value={amountPesos}
              onChangeText={setAmountPesos}
              keyboardType="number-pad"
              placeholder={`e.g. ${CHECKOUT_MIN_PESOS}`}
              placeholderTextColor="#6b7280"
              style={styles.amountInput}
              editable={!isBuying}
            />
            <RNText style={styles.previewText}>
              Tokens to add: {Math.max(0, Math.floor((Number(amountPesos) || 0) / PESOS_PER_TOKEN))}
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
  scroll: { flex: 1, backgroundColor: '#dff1de' },
  scrollContent: {
    flexGrow: 1,
    ...(Platform.OS === 'web'
      ? { maxWidth: 560, width: '100%', alignSelf: 'center' as const }
      : {}),
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 10,
    paddingBottom: 20,
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
    ...(Platform.OS === 'web' ? {} : { elevation: 6 }),
  },
  heroGlowOrb: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    top: -100,
    right: -70,
    backgroundColor: 'rgba(212, 175, 55, 0.14)',
  },
  profileGlass: {
    alignSelf: 'stretch',
    maxWidth: 420,
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  profileGlassInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    minHeight: 64,
  },
  profileCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingVertical: 2,
  },
  profileColLeft: {
    alignItems: 'flex-start',
    paddingRight: 8,
  },
  profileColRight: {
    alignItems: 'flex-end',
    paddingLeft: 8,
  },
  profileDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignSelf: 'stretch',
    marginVertical: 0,
    opacity: 0.95,
  },
  profileIdentityLoadingWrap: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  profileIdentitySpinner: {
    marginBottom: 6,
  },
  profileIdentityLoading: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(236, 255, 233, 0.88)',
    textAlign: 'center',
  },
  profileIdentityLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(220, 237, 224, 0.72)',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'left',
    marginBottom: 6,
  },
  profileIdentityLabelRight: {
    textAlign: 'right',
  },
  profileIdentityPhone: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f4fff1',
    letterSpacing: 0.5,
    textAlign: 'left',
    lineHeight: 20,
  },
  profileIdentityAlias: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fffffe',
    letterSpacing: 0.25,
    textAlign: 'right',
    lineHeight: 22,
    maxWidth: '100%',
  },
  logoWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  logoGlow: {
    position: 'absolute',
    width: 208,
    height: 208,
    borderRadius: 104,
    opacity: 0.85,
  },
  logo: {
    width: 176,
    height: 176,
    ...(Platform.OS === 'web' ? { maxWidth: '100%' as const } : {}),
  },
  heroBottomSheen: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    opacity: 0.95,
  },
  sheet: {
    position: 'relative',
    backgroundColor: 'transparent',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 48,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -16,
    overflow: 'hidden',
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#0a1f14',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  sheetGradientBg: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContent: {
    position: 'relative',
    zIndex: 1,
  },
  card: {
    marginBottom: 16,
    borderRadius: 18,
    backgroundColor: '#f8fff6',
    borderWidth: 1,
    borderColor: '#a8dcc0',
    overflow: 'hidden',
  },
  paypalPendingCard: {
    backgroundColor: '#e8f4fc',
    borderColor: '#90cdf4',
    borderWidth: 1,
  },
  paypalPendingTitle: { fontSize: 20, color: '#1a365d', marginBottom: 8 },
  paypalPendingText: { fontSize: 14, color: '#2d3748', lineHeight: 20, marginBottom: 12 },
  paypalPendingActions: { gap: 4 },
  paypalCompleteBtn: { marginBottom: 4 },
  cardLuckyPick: {
    borderColor: '#7dce99',
    ...Platform.select({
      ios: {
        shadowColor: '#0f2818',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
      },
      android: { elevation: 7 },
      default: {},
    }),
  },
  editProfileRow: { alignItems: 'center', marginTop: 8, marginBottom: 8 },
  replayIntroRow: { alignItems: 'center', marginBottom: 10 },
  replayIntroLink: {
    fontSize: 14,
    color: '#276749',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  editProfileBtn: { borderColor: '#6aa174', borderRadius: 12 },
  luckyPickStripe: {
    height: 5,
    width: '100%',
  },
  eliteStripe: {
    height: 4,
    width: '100%',
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
    backgroundColor: 'rgba(72, 187, 120, 0.22)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(39, 103, 73, 0.45)',
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
    borderColor: '#9dcc93',
    backgroundColor: '#f4fff1',
    ...Platform.select({
      ios: {
        shadowColor: '#6b5c12',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 5 },
      default: {},
    }),
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
    color: '#4f6d42',
    fontStyle: 'italic',
    marginTop: 8,
    letterSpacing: 0.6,
    textTransform: 'lowercase',
    fontWeight: '600',
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
  btnMain: {
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#1a4d2e',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  btnSecondary: { borderRadius: 12, borderColor: '#6aa174' },
  homeFooterDisclaimer: {
    marginTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 28,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  homeFooterDisclaimerText: {
    fontSize: 11,
    lineHeight: 15,
    color: '#4a6b54',
    textAlign: 'center',
    fontWeight: '600',
    maxWidth: 340,
  },
  homeFooterDisclaimerTl: {
    fontSize: 11,
    lineHeight: 15,
    color: '#5c7568',
    textAlign: 'center',
    marginTop: 5,
    fontStyle: 'italic',
    maxWidth: 340,
  },
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
    backgroundColor: '#276749',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f5a3c',
    minWidth: 108,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#0f2818',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  addTokensBtnPressed: { opacity: 0.88 },
  addTokensBtnText: {
    color: '#f4fff3',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  tokenRingWrap: {
    marginLeft: 'auto',
  },
  tokenRing: {
    borderRadius: 28,
    padding: 2.5,
    overflow: 'hidden',
  },
  tokenCircleInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenCircleText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#334155',
  },
  exploreHeading: {
    fontSize: 14,
    fontWeight: '900',
    color: '#134028',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 14,
    opacity: 0.92,
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
    backgroundColor: '#c4efce',
    borderColor: '#2d8a52',
  },
  tileInnerB: {
    backgroundColor: '#b3e8da',
    borderColor: '#248066',
  },
  tileInnerC: {
    backgroundColor: '#cae8be',
    borderColor: '#3a8f3d',
  },
  tileAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: '#143d2a',
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
