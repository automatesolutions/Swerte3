import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { Button, Text, Title } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { consumeWelcomePrefetch } from '../navigation/welcomePrefetch';
import { clearAuthTokens, getStoredAccessToken, saveAuthTokens } from '../auth/storage';
import {
  checkAliasAvailable,
  fetchUserMe,
  isPlaceholderPhone,
  registerGuestSession,
  updateUserProfile,
  userNeedsProfile,
  type UserMe,
} from '../services/api';
import { isValidPhilippineMobile } from '../utils/phPhone';

const ALIAS_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

function isUnauthorizedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /^401\s*:/i.test(msg.trim());
}

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileSetup'>;

export function ProfileSetupScreen({ navigation, route }: Props): React.ReactElement {
  const from = route.params?.from ?? 'onboarding';
  const isEditFromHome = from === 'home';
  /** VideoHome or Home redirect when profile still required — no back to a “valid” home. */
  const isProfileGate = from === 'onboarding' || from === 'complete_profile';
  /** Only the welcome flow may replace a dead session with a new guest (avoid clobbering OTP users). */
  const allowGuestRecoveryOn401 = from === 'onboarding';

  const [me, setMe] = useState<UserMe | null>(null);
  const [loading, setLoading] = useState(true);
  /** When /me fails (no prefetch), show error instead of infinite “Loading…”. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAlias, setProfileAlias] = useState('');
  const [saving, setSaving] = useState(false);
  const [aliasStatus, setAliasStatus] = useState<string | null>(null);
  /** Welcome flow passes prefetchedMe — use once, then always refresh from API on later focuses. */
  const consumedPrefetch = useRef(false);

  const applyUserToForm = useCallback((u: UserMe) => {
    setMe(u);
    setProfilePhone(isPlaceholderPhone(u) ? '' : u.phone);
    setProfileAlias((u.display_alias ?? '').trim());
    setAliasStatus(null);
  }, []);

  const loadMe = useCallback(async () => {
    const recoverGuestAndFetchMe = async (): Promise<UserMe> => {
      await clearAuthTokens();
      const pair = await registerGuestSession();
      await saveAuthTokens(pair.access_token, pair.refresh_token);
      return fetchUserMe(pair.access_token);
    };

    const token = (await getStoredAccessToken())?.trim();
    if (!token) {
      setLoading(false);
      setMe(null);
      setLoadError(null);
      navigation.replace('VideoHome');
      return;
    }

    if (!consumedPrefetch.current && isProfileGate) {
      const prefetch = route.params?.prefetchedMe ?? consumeWelcomePrefetch();
      if (prefetch) {
        consumedPrefetch.current = true;
        setLoadError(null);
        applyUserToForm(prefetch);
        if (!userNeedsProfile(prefetch) && isProfileGate) {
          navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
          return;
        }
        setLoading(false);
        try {
          const m = await fetchUserMe(token);
          if (!userNeedsProfile(m) && isProfileGate) {
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            return;
          }
          applyUserToForm(m);
        } catch (e) {
          if (allowGuestRecoveryOn401 && isUnauthorizedError(e)) {
            try {
              const m = await recoverGuestAndFetchMe();
              if (!userNeedsProfile(m) && isProfileGate) {
                navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
                return;
              }
              applyUserToForm(m);
            } catch (e2) {
              setMe(null);
              setLoadError(e2 instanceof Error ? e2.message : 'Could not load profile');
            }
          }
          // Non-401: keep prefetched form; user can retry on focus
        }
        return;
      }
    }

    setLoadError(null);
    try {
      let m = await fetchUserMe(token);
      if (!userNeedsProfile(m) && isProfileGate) {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
        return;
      }
      applyUserToForm(m);
    } catch (e) {
      if (allowGuestRecoveryOn401 && isUnauthorizedError(e)) {
        try {
          const recovered = await recoverGuestAndFetchMe();
          if (!userNeedsProfile(recovered) && isProfileGate) {
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            return;
          }
          applyUserToForm(recovered);
        } catch (e2) {
          setMe(null);
          setLoadError(e2 instanceof Error ? e2.message : 'Could not load profile');
        }
      } else {
        setMe(null);
        setLoadError(e instanceof Error ? e.message : 'Could not load profile');
      }
    } finally {
      setLoading(false);
    }
  }, [allowGuestRecoveryOn401, applyUserToForm, isProfileGate, navigation, route.params?.prefetchedMe]);

  useFocusEffect(
    useCallback(() => {
      void loadMe();
    }, [loadMe]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackVisible: isEditFromHome,
      gestureEnabled: isEditFromHome,
    });
  }, [navigation, isEditFromHome]);

  const runAliasCheck = useCallback(async () => {
    const a = profileAlias.trim();
    if (a.length < 3) {
      setAliasStatus(null);
      return;
    }
    try {
      const r = await checkAliasAvailable(a);
      if (r.available) {
        setAliasStatus('Available');
      } else if (r.reason === 'reserved') {
        setAliasStatus('Reserved — pick another');
      } else if (r.reason === 'invalid') {
        setAliasStatus('3–20 chars: letters, numbers, underscore');
      } else {
        setAliasStatus('Already taken');
      }
    } catch {
      setAliasStatus(null);
    }
  }, [profileAlias]);

  const handleSave = useCallback(async () => {
    const token = (await getStoredAccessToken())?.trim();
    if (!token || !me) return;
    const alias = profileAlias.trim();
    if (!ALIAS_PATTERN.test(alias)) {
      Alert.alert('Alias', 'Enter an alias (3–20 characters: letters, numbers, underscore).');
      return;
    }
    if (isPlaceholderPhone(me)) {
      if (!isValidPhilippineMobile(profilePhone)) {
        Alert.alert(
          'Mobile',
          'Maglagay ng wastong Philippine mobile number (hal. 09171234567 o +63 917 123 4567).',
        );
        return;
      }
    }
    setSaving(true);
    try {
      const updated = await updateUserProfile(token, {
        alias,
        phone: isPlaceholderPhone(me) ? profilePhone.trim() : undefined,
      });
      setMe(updated);
      if (!userNeedsProfile(updated)) {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Failed';
      const msg = raw.replace(/^\d{3}:\s*/, '').trim();
      Alert.alert('Profile', msg || raw);
    } finally {
      setSaving(false);
    }
  }, [me, navigation, profileAlias, profilePhone]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (!me && loadError) {
    return (
      <View style={styles.centered}>
        <View style={styles.errorCard}>
          <Title style={styles.errorTitle}>Could not load profile</Title>
          <RNText style={styles.errorText}>{loadError}</RNText>
          <RNText style={styles.errorHint}>
            On web, the app must reach your API (usually http://localhost:8000). Set EXPO_PUBLIC_API_URL in
            mobile/.env if the backend uses another host or port.
          </RNText>
          <Button
            mode="contained"
            onPress={() => {
              setLoadError(null);
              setLoading(true);
              void loadMe();
            }}
            style={styles.retryBtn}
            buttonColor="#2f855a"
            textColor="#f4fff3"
          >
            Retry
          </Button>
        </View>
      </View>
    );
  }

  if (!me) {
    return (
      <View style={styles.centered}>
        <Text>Loading…</Text>
      </View>
    );
  }

  const aliasTrim = profileAlias.trim();
  const aliasFormatOk = ALIAS_PATTERN.test(aliasTrim);
  const phoneOkForGate = !isPlaceholderPhone(me) || isValidPhilippineMobile(profilePhone);
  const canSave = aliasFormatOk && phoneOkForGate;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Profile setup"
    >
      <View style={styles.card}>
        <Title style={styles.title}>Profile</Title>
        <Text style={styles.lead}>
          {isEditFromHome
            ? 'Baguhin ang inyong profile. I-save para ilapat ang mga pagbabago.'
            : from === 'complete_profile'
              ? 'Ilagay ang mobile number at alias para makapasok sa Home.'
              : 'Ilagay ang inyong mobile number at unique na alias. Isang beses lang ito bago makapasok sa Home.'}
        </Text>

        {isPlaceholderPhone(me) ? (
          <>
            <RNText style={styles.label}>Mobile number</RNText>
            <TextInput
              value={profilePhone}
              onChangeText={setProfilePhone}
              keyboardType="phone-pad"
              placeholder="e.g. 09171234567"
              placeholderTextColor="#6b7280"
              style={styles.input}
              editable={!saving}
            />
            {profilePhone.trim() && !isValidPhilippineMobile(profilePhone) ? (
              <RNText style={styles.fieldError}>
                Dapat wastong Philippine mobile (09XXXXXXXXX o +63 9XX XXX XXXX).
              </RNText>
            ) : null}
          </>
        ) : (
          <>
            <RNText style={styles.label}>Mobile (nakarehistro)</RNText>
            <RNText style={styles.readonlyPhone}>{me.phone}</RNText>
          </>
        )}

        <RNText style={styles.label}>Alias (unique)</RNText>
        <TextInput
          value={profileAlias}
          onChangeText={(t) => {
            setProfileAlias(t);
            setAliasStatus(null);
          }}
          onBlur={() => void runAliasCheck()}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="hal. Lucky_Juan_3"
          placeholderTextColor="#6b7280"
          style={styles.input}
          editable={!saving}
        />
        {aliasStatus ? (
          <RNText
            style={[styles.aliasStatus, aliasStatus === 'Available' ? styles.aliasOk : styles.aliasWarn]}
          >
            {aliasStatus}
          </RNText>
        ) : (
          <RNText style={styles.hint}>
            3–20 characters: letters, numbers, at underscore lang. Kung taken na, pumili ng bago.
          </RNText>
        )}

        <Button
          mode="contained"
          onPress={() => void handleSave()}
          loading={saving}
          disabled={saving || !canSave}
          style={styles.saveBtn}
          buttonColor="#2f855a"
          textColor="#f4fff3"
        >
          Save profile
        </Button>

        {isEditFromHome ? (
          <Pressable onPress={() => navigation.goBack()} style={styles.cancelBtn} accessibilityRole="button">
            <RNText style={styles.cancelText}>Cancel</RNText>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#dff1de' },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    ...(Platform.OS === 'web' ? { maxWidth: 520, width: '100%', alignSelf: 'center' as const } : {}),
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#dff1de', padding: 20 },
  errorCard: {
    maxWidth: 420,
    width: '100%',
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#86c88f',
  },
  errorTitle: { fontSize: 18, color: '#14532d', marginBottom: 10 },
  errorText: { fontSize: 14, color: '#36573e', marginBottom: 10, lineHeight: 20 },
  errorHint: { fontSize: 12, color: '#5c7568', marginBottom: 16, lineHeight: 18 },
  retryBtn: { borderRadius: 12, alignSelf: 'flex-start' },
  card: {
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#86c88f',
  },
  title: { fontSize: 22, color: '#14532d', marginBottom: 8 },
  lead: { fontSize: 14, color: '#36573e', lineHeight: 20, marginBottom: 14 },
  label: { marginTop: 10, marginBottom: 6, color: '#214a33', fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#86b98f',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#18402a',
    backgroundColor: '#ffffff',
    marginBottom: 6,
  },
  readonlyPhone: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f5130',
    marginBottom: 4,
  },
  fieldError: {
    fontSize: 12,
    color: '#b45309',
    marginBottom: 8,
    lineHeight: 17,
  },
  hint: { fontSize: 12, color: '#5c7568', marginBottom: 12, lineHeight: 17 },
  aliasStatus: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  aliasOk: { color: '#276749' },
  aliasWarn: { color: '#b45309' },
  saveBtn: { marginTop: 8, borderRadius: 12 },
  cancelBtn: { marginTop: 14, alignSelf: 'center', padding: 8 },
  cancelText: { color: '#276749', fontWeight: '600', fontSize: 15 },
});
