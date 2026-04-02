import React, { useEffect } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { Button, Card, Text, Title } from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { clearAuthTokens } from '../auth/storage';
import { logScreenView } from '../analytics';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const logoSource = require('../../assets/Logo.png');

export function HomeScreen({ navigation }: Props): React.ReactElement {
  useEffect(() => {
    void logScreenView('Home');
  }, []);

  const handleLogout = async () => {
    await clearAuthTokens();
    navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
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
          style={styles.card}
          mode="elevated"
          accessibilityLabel="Predictions card"
        >
          <Card.Content>
            <View style={styles.titleRow}>
              <Title style={styles.cardTitle}>Alon</Title>
              <Text style={styles.superTag}>free tier prediction</Text>
            </View>
            <Text style={styles.explainText}>
              Alon combines two machine learning approaches: XGBoost and a Markov Chain model. XGBoost
              finds useful patterns from recent outcomes and feature relationships, while Markov Chain
              focuses on transition behavior between previous and next digit states. Together, they provide
              a balanced and explainable forecast style for users who want data-informed predictions in the
              free tier.
            </Text>
            <View style={styles.row}>
              <Button
                mode="contained"
                onPress={() => navigation.navigate('Predict')}
                accessibilityLabel="Open predictions"
                style={styles.btnMain}
                buttonColor="#2f855a"
                textColor="#f4fff3"
                contentStyle={styles.btnContent}
              >
                TUKLAS
              </Button>
            </View>
          </Card.Content>
        </Card>

        <Card
          style={[styles.card, styles.cardAccent]}
          mode="outlined"
          accessibilityLabel="Premium card"
        >
          <Card.Content>
            <View style={styles.titleRow}>
              <Title style={styles.cardTitle}>Lihim</Title>
              <Text style={styles.superTag}>premium prediction</Text>
            </View>
            <Text style={styles.explainText}>
              Lihim is powered by the MiroFish multi-agent prediction flow. Multiple AI agents generate
              independent reasoning paths, compare signal quality, and synthesize the strongest candidate
              combinations into one refined output. This collaborative approach is designed to produce more
              nuanced premium insights, with richer context than single-model predictions.
            </Text>
            <Button
              mode="contained-tonal"
              onPress={() => navigation.navigate('Paywall')}
              accessibilityLabel="Open premium paywall"
              buttonColor="#d4af37"
              textColor="#2b1d00"
              style={[styles.btnPremium, styles.btnGold]}
            >
              ✦ GINTO ✦
            </Button>
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
  btnMain: { borderRadius: 12 },
  btnSecondary: { borderRadius: 12, borderColor: '#6aa174' },
  logoutRow: { alignItems: 'flex-end', marginTop: 4 },
  btnLogout: { alignSelf: 'flex-end', borderRadius: 12, borderColor: '#6aa174' },
  btnContent: { paddingVertical: 4 },
  btnPremium: { marginTop: 8, borderRadius: 12, alignSelf: 'flex-start' },
  exploreHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2d5c40',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 10,
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
    minHeight: 102,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 12,
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
    fontSize: 11,
    fontWeight: '800',
    color: '#082818',
    lineHeight: 15,
    letterSpacing: 0.2,
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
});
