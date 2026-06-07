import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getStoredAccessToken, saveAuthTokens } from '../auth/storage';
import { stashWelcomePrefetch } from '../navigation/welcomePrefetch';
import { fetchUserMe, registerGuestSession, resetApiBaseCache, userNeedsProfile } from '../services/api';
import type { RootStackParamList } from '../navigation/types';

const logoSource = require('../../assets/Logo.png');
/** Bundled welcome sequence (copies of repo `Assets/Video1.mp4` … `Video4.mp4`). Override with `EXPO_PUBLIC_VIDEO_HOME_URL` for a single remote clip. */
const WELCOME_CLIPS_LOCAL = [
  require('../../assets/Video1.mp4'),
  require('../../assets/Video2.mp4'),
  require('../../assets/Video3.mp4'),
  require('../../assets/Video4.mp4'),
] as const;

/** Android: expo-video SurfaceView/TextureView can cover the whole screen and block all touches in Expo Go. */
const USE_INTRO_VIDEO = Platform.OS === 'ios' || Platform.OS === 'web';

/**
 * Expo Go on Android draws an invisible full-screen layer above the RN view tree (blocks Skip/Continue).
 * Auto-continue is the only reliable path until you use a dev build (`npx expo run:android`).
 */
const IS_EXPO_GO_ANDROID =
  Platform.OS === 'android' &&
  (Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient');

const EXPO_GO_AUTO_CONTINUE_SEC = 3;

type Props = NativeStackScreenProps<RootStackParamList, 'VideoHome'>;

type WelcomeNav = {
  continuing: boolean;
  continueAfterWelcome: () => Promise<void>;
};

function useWelcomeNavigation(navigation: Props['navigation']): WelcomeNav {
  const continueInFlight = useRef(false);
  const [continuing, setContinuing] = useState(false);

  const leaveWelcome = useCallback(
    (routeName: 'ProfileSetup' | 'Home', params?: RootStackParamList['ProfileSetup']) => {
      setContinuing(false);
      continueInFlight.current = false;
      if (Platform.OS === 'web') {
        navigation.replace(routeName, params);
        return;
      }
      navigation.reset({
        index: 0,
        routes: [{ name: routeName, params }],
      });
    },
    [navigation],
  );

  const continueAfterWelcome = useCallback(async () => {
    if (continueInFlight.current) return;
    continueInFlight.current = true;
    setContinuing(true);
    try {
      let token = (await getStoredAccessToken())?.trim() ?? '';
      if (!token) {
        try {
          const pair = await registerGuestSession();
          await saveAuthTokens(pair.access_token, pair.refresh_token);
          token = pair.access_token;
        } catch {
          Alert.alert(
            'Connection',
            'Could not start a guest session. Check that the API is running (e.g. http://10.0.2.2:8000) and try Continue again.',
          );
          return;
        }
      }
      try {
        const me = await fetchUserMe(token);
        if (userNeedsProfile(me)) {
          stashWelcomePrefetch(me);
          leaveWelcome('ProfileSetup', { from: 'onboarding' });
        } else {
          leaveWelcome('Home');
        }
      } catch {
        leaveWelcome('ProfileSetup', { from: 'onboarding' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not leave the welcome screen.';
      Alert.alert('Error', msg);
    } finally {
      continueInFlight.current = false;
      setContinuing(false);
    }
  }, [leaveWelcome]);

  return { continuing, continueAfterWelcome };
}

function AndroidIntroPanel({ clipIndex }: { clipIndex: number }): React.ReactElement {
  return (
    <View style={styles.androidIntroPanel}>
      <Image source={logoSource} style={styles.androidIntroLogo} resizeMode="contain" accessibilityLabel="Swerte3" />
      <Text style={styles.androidIntroTitle}>Welcome to Swerte3</Text>
      <Text style={styles.androidIntroBody}>
        Intro {clipIndex + 1} ng {WELCOME_CLIPS_LOCAL.length} — i-tap ang Continue o Skip para magpatuloy.
      </Text>
    </View>
  );
}

type IntroVideoProps = {
  source: number | { uri: string };
  isWeb: boolean;
  webSoundUnlocked: boolean;
  onWebSoundUnlock: () => void;
  onClipEnd: () => void;
  onStatusLoading: () => void;
  onStatusReady: () => void;
  onStatusError: () => void;
};

function IntroVideoClip({
  source,
  isWeb,
  webSoundUnlocked,
  onWebSoundUnlock,
  onClipEnd,
  onStatusLoading,
  onStatusReady,
  onStatusError,
}: IntroVideoProps): React.ReactElement {
  const webSoundUnlockedRef = useRef(webSoundUnlocked);
  webSoundUnlockedRef.current = webSoundUnlocked;

  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.volume = 1;
    if (isWeb) {
      p.muted = !webSoundUnlockedRef.current;
    } else {
      p.muted = false;
    }
    void p.play();
  });

  useEventListener(player, 'playToEnd', onClipEnd);
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'loading') onStatusLoading();
    if (status === 'readyToPlay') {
      onStatusReady();
      player.volume = 1;
      if (isWeb) {
        player.muted = !webSoundUnlockedRef.current;
      } else {
        player.muted = false;
      }
      void player.play();
    }
    if (status === 'error') onStatusError();
  });

  return (
    <View style={styles.videoStage}>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls={false}
        contentFit="cover"
        allowsFullscreen={false}
      />
      {isWeb && !webSoundUnlocked ? (
        <Pressable
          style={styles.webSoundOverlay}
          onPress={() => {
            onWebSoundUnlock();
            player.muted = false;
            player.volume = 1;
            void player.play();
          }}
          accessibilityLabel="Tap to turn on sound for the intro"
          accessibilityRole="button"
        >
          <View style={styles.webSoundHint} pointerEvents="none">
            <Text style={styles.webSoundHintText}>Tap for sound</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

export function VideoHomeScreen({ navigation }: Props): React.ReactElement {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { continuing, continueAfterWelcome } = useWelcomeNavigation(navigation);

  const envVideoUrl = process.env.EXPO_PUBLIC_VIDEO_HOME_URL?.trim() ?? '';
  const useRemoteSingleClip = envVideoUrl.length > 0;

  const [clipIndex, setClipIndex] = useState(0);
  const clipIndexRef = useRef(0);
  clipIndexRef.current = clipIndex;

  const [webSoundUnlocked, setWebSoundUnlocked] = useState(false);
  const [playerStatus, setPlayerStatus] = useState<'loading' | 'ready' | 'error'>(
    USE_INTRO_VIDEO ? 'loading' : 'ready',
  );
  const [expoGoCountdown, setExpoGoCountdown] = useState<number | null>(
    IS_EXPO_GO_ANDROID ? EXPO_GO_AUTO_CONTINUE_SEC : null,
  );
  const continueAfterWelcomeRef = useRef(continueAfterWelcome);
  continueAfterWelcomeRef.current = continueAfterWelcome;

  const source = useMemo(() => {
    if (useRemoteSingleClip) return { uri: envVideoUrl };
    return WELCOME_CLIPS_LOCAL[clipIndex];
  }, [useRemoteSingleClip, envVideoUrl, clipIndex]);

  const handleClipEnd = useCallback(() => {
    if (useRemoteSingleClip) {
      void continueAfterWelcome();
      return;
    }
    const i = clipIndexRef.current;
    if (i >= WELCOME_CLIPS_LOCAL.length - 1) {
      void continueAfterWelcome();
      return;
    }
    setPlayerStatus('loading');
    setClipIndex(i + 1);
  }, [continueAfterWelcome, useRemoteSingleClip]);

  useEffect(() => {
    if (!USE_INTRO_VIDEO) return;
    const t = setTimeout(() => {
      setPlayerStatus((s) => (s === 'loading' ? 'error' : s));
    }, 20000);
    return () => clearTimeout(t);
  }, [clipIndex]);

  useEffect(() => {
    if (!IS_EXPO_GO_ANDROID) return;
    const tick = setInterval(() => {
      setExpoGoCountdown((c) => (c !== null && c > 1 ? c - 1 : c));
    }, 1000);
    const go = setTimeout(() => {
      setExpoGoCountdown(null);
      resetApiBaseCache();
      void continueAfterWelcomeRef.current();
    }, EXPO_GO_AUTO_CONTINUE_SEC * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, []);

  const showVideo = USE_INTRO_VIDEO && playerStatus !== 'error';
  const showLoading = USE_INTRO_VIDEO && playerStatus === 'loading';

  const contentPadding = {
    paddingTop: Math.max(insets.top, 12),
    paddingBottom: Math.max(insets.bottom, 20),
  };

  const skipControl =
    Platform.OS === 'android' ? (
      <TouchableOpacity
        style={[styles.skipPill, { alignSelf: 'flex-end' }, continuing && styles.ctaDisabled]}
        onPress={() => void continueAfterWelcome()}
        disabled={continuing}
        activeOpacity={0.7}
        accessibilityLabel="Skip intro"
        accessibilityRole="button"
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>
    ) : (
      <Pressable
        style={[styles.skipPill, { alignSelf: 'flex-end' }, continuing && styles.ctaDisabled]}
        onPress={() => void continueAfterWelcome()}
        disabled={continuing}
        accessibilityLabel="Skip intro"
        accessibilityRole="button"
      >
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
    );

  const continueControl =
    Platform.OS === 'android' ? (
      <TouchableOpacity
        style={[styles.cta, continuing && styles.ctaDisabled]}
        onPress={() => void continueAfterWelcome()}
        disabled={continuing}
        activeOpacity={0.85}
        accessibilityLabel="Continue to profile or home"
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>{continuing ? 'Connecting…' : 'Continue'}</Text>
      </TouchableOpacity>
    ) : (
      <Pressable
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed, continuing && styles.ctaDisabled]}
        onPress={() => void continueAfterWelcome()}
        disabled={continuing}
        accessibilityLabel="Continue to profile or home"
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>Continue</Text>
      </Pressable>
    );

  const body = (
    <>
      {skipControl}

        <View style={styles.brandBlock}>
          <Image source={logoSource} style={styles.logo} resizeMode="contain" accessibilityLabel="Swerte3 logo" />
          <Text style={styles.appTitle}>Swerte3</Text>
          <Text style={styles.tagline}>Play smart. Stay lucky.</Text>
        </View>

        <View style={styles.videoShell}>
          <LinearGradient
            colors={['rgba(132, 204, 138, 0.35)', 'rgba(30, 74, 49, 0.5)']}
            style={styles.videoShellBorder}
          >
            <View style={styles.videoInner}>
              {USE_INTRO_VIDEO && showVideo ? (
                <>
                  <IntroVideoClip
                    source={source}
                    isWeb={isWeb}
                    webSoundUnlocked={webSoundUnlocked}
                    onWebSoundUnlock={() => setWebSoundUnlocked(true)}
                    onClipEnd={handleClipEnd}
                    onStatusLoading={() => setPlayerStatus('loading')}
                    onStatusReady={() => setPlayerStatus('ready')}
                    onStatusError={() => setPlayerStatus('error')}
                  />
                  {showLoading ? (
                    <View style={styles.loadingOverlay} pointerEvents="none">
                      <ActivityIndicator size="large" color="#ecffe9" />
                      <Text style={styles.loadingCaption}>Loading intro…</Text>
                    </View>
                  ) : null}
                </>
              ) : USE_INTRO_VIDEO ? (
                <View style={styles.fallbackPanel}>
                  <Text style={styles.fallbackTitle}>Welcome to Swerte3</Text>
                  <Text style={styles.fallbackBody}>
                    We couldn’t load the intro video. You can still continue to the home screen.
                  </Text>
                </View>
              ) : (
                <AndroidIntroPanel clipIndex={clipIndex} />
              )}
            </View>
          </LinearGradient>
        </View>

      {continueControl}

      <Text style={styles.hint}>
        {useRemoteSingleClip
          ? 'Susunod: profile (mobile + alias) kung kinakailangan, pagkatapos ay Home. O hintayin ang video.'
          : `Intro ${clipIndex + 1} ng ${WELCOME_CLIPS_LOCAL.length} — susunod ang profile kung kinakailangan, pagkatapos ay Home.`}
        {isWeb && !webSoundUnlocked
          ? '\n\nSa web, tumatakbo muna ang video nang naka-mute (patakaran ng browser). I-tap ang video para sa tunog.'
          : ''}
        {!USE_INTRO_VIDEO
          ? IS_EXPO_GO_ANDROID && expoGoCountdown !== null
            ? `\n\nExpo Go: hindi gumagana ang tap sa emulator — auto-continue sa ${expoGoCountdown}s…`
            : '\n\nSa Android, static intro lang — i-tap ang Continue o Skip.'
          : ''}
      </Text>
    </>
  );

  return (
    <View style={styles.root} accessibilityLabel="Swerte3 intro">
      <StatusBar style="light" />
      <LinearGradient
        colors={['#143d28', '#1e4a31', '#2f6b45', '#1a3020']}
        locations={[0, 0.35, 0.72, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {Platform.OS === 'android' ? (
        <View style={[styles.scrollContent, styles.androidBody, contentPadding]}>{body}</View>
      ) : (
        <ScrollView
          style={styles.androidBody}
          contentContainerStyle={[styles.scrollContent, contentPadding]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="always"
        >
          {body}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#143d28',
  },
  navigatingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    backgroundColor: 'rgba(10, 24, 16, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  navigatingCaption: {
    marginTop: 14,
    color: '#ecffe9',
    fontSize: 16,
    fontWeight: '700',
  },
  navigatingHint: {
    marginTop: 8,
    color: 'rgba(236, 255, 233, 0.75)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  ctaDisabled: {
    opacity: 0.55,
  },
  androidBody: {
    flex: 1,
    zIndex: 2,
    elevation: 2,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    ...(Platform.OS === 'web' ? { maxWidth: 520, width: '100%', alignSelf: 'center' as const } : {}),
  },
  skipPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    marginBottom: 8,
    zIndex: 10,
    elevation: 10,
  },
  skipText: {
    color: '#ecffe9',
    fontWeight: '700',
    fontSize: 14,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 8,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f7fff4',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tagline: {
    marginTop: 6,
    fontSize: 15,
    color: '#c5f0c9',
    fontWeight: '500',
  },
  videoShell: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
  },
  videoShellBorder: {
    padding: 3,
    borderRadius: 20,
  },
  videoInner: {
    height: 220,
    borderRadius: 17,
    overflow: 'hidden',
    backgroundColor: '#0f2418',
    justifyContent: 'center',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  videoStage: {
    ...StyleSheet.absoluteFillObject,
  },
  webSoundOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 12,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  webSoundHint: {
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  webSoundHintText: {
    color: '#ecffe9',
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 20, 15, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCaption: {
    marginTop: 10,
    color: '#d8f5dc',
    fontSize: 13,
    fontWeight: '600',
  },
  fallbackPanel: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ecffe9',
    textAlign: 'center',
    marginBottom: 8,
  },
  fallbackBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#b8e3bc',
    textAlign: 'center',
  },
  androidIntroPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  androidIntroLogo: {
    width: 100,
    height: 100,
    marginBottom: 12,
  },
  androidIntroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ecffe9',
    textAlign: 'center',
    marginBottom: 8,
  },
  androidIntroBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#b8e3bc',
    textAlign: 'center',
  },
  cta: {
    backgroundColor: '#2f855a',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#276749',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 10,
  },
  ctaPressed: {
    opacity: 0.92,
  },
  ctaText: {
    color: '#f4fff3',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  hint: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(236, 255, 233, 0.75)',
    lineHeight: 17,
    paddingHorizontal: 8,
  },
});
