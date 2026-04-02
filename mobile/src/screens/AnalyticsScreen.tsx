import React from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ANALYTICS_CYAN, ANALYTICS_GOLD, ANALYTICS_MUTED } from '../analytics/chartParts';
import type { AnalyticsFeatureKind, RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Analytics'>;

const MENU: { kind: AnalyticsFeatureKind; title: string; blurb: string }[] = [
  {
    kind: 'gaussian',
    title: 'Gaussian',
    blurb: 'Normal distribution ng suma at log(product) mula sa lahat ng winning draws (sheet DB).',
  },
  {
    kind: 'cooccurrence',
    title: 'Co-occurrence',
    blurb: 'Network ng mga digit na madalas magkasabay sa iisang draw.',
  },
  {
    kind: 'cross_draw',
    title: 'Cross-draw',
    blurb: 'Mga transisyon ng digit sa magkakasunod na draws (may direksyon).',
  },
];

const BG_TOP = '#0d1b2e';
const BG_BOTTOM = '#050a12';

const logoSource = require('../../assets/Logo.png');

export function AnalyticsScreen({ navigation }: Props): React.ReactElement {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gutter = width < 380 ? 16 : 20;

  const cardShadow = Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 14,
    },
    android: { elevation: 6 },
    default: {},
  });

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[BG_TOP, BG_BOTTOM]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: gutter,
            paddingTop: Math.max(8, insets.top > 0 ? 4 : 12),
            paddingBottom: Math.max(28, insets.bottom + 20),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoWrap} accessibilityRole="image" accessibilityLabel="Swerte3 logo">
          <Image source={logoSource} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.head}>Analytics</Text>

        {MENU.map((item, index) => (
          <Pressable
            key={item.kind}
            onPress={() => navigation.navigate('AnalyticsFeature', { kind: item.kind })}
            style={({ pressed }) => [
              styles.card,
              cardShadow,
              pressed && styles.cardPressed,
              index === 0 && styles.cardFirst,
            ]}
            accessibilityRole="button"
            accessibilityLabel={item.title}
          >
            <LinearGradient
              colors={['rgba(30, 58, 95, 0.55)', 'rgba(15, 27, 46, 0.92)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradient}
            >
              <View style={styles.accent} />
              <View style={styles.cardInner}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBlurb}>{item.blurb}</Text>
                <Text style={styles.cardGo}>Buksan →</Text>
              </View>
            </LinearGradient>
          </Pressable>
        ))}

        <Text style={styles.disclaimer}>
          Pampasiyasat lamang — hindi garantiya ng resulta. Ang Cognitive challenge ay hiwalay na laro;
          walang automated na triple na kinukumpara sa lottery draws.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_BOTTOM,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'stretch',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  logoWrap: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  logo: {
    width: 96,
    height: 96,
  },
  head: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: -0.5,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  card: {
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.14)',
    overflow: 'hidden',
  },
  cardFirst: {
    marginTop: 0,
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.992 }],
  },
  cardGradient: {
    borderRadius: 17,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: ANALYTICS_CYAN,
    opacity: 0.55,
  },
  cardInner: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    paddingLeft: 20,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#f1f5f9',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  cardBlurb: {
    fontSize: 14,
    lineHeight: 21,
    color: ANALYTICS_MUTED,
    marginBottom: 14,
  },
  cardGo: {
    fontSize: 13,
    fontWeight: '700',
    color: ANALYTICS_GOLD,
    letterSpacing: 0.3,
  },
  disclaimer: {
    marginTop: 16,
    fontSize: 11,
    lineHeight: 17,
    color: 'rgba(148, 163, 184, 0.55)',
    alignSelf: 'stretch',
  },
});
