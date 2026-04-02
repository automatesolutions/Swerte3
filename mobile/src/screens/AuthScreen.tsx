import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { saveAuthTokens } from '../auth/storage';
import { requestOtp, verifyOtp } from '../services/api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;
const logoSource = require('../../assets/Logo.png');

export function AuthScreen({ navigation }: Props): React.ReactElement {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const sendOtp = async () => {
    const normalizedPhone = phone.trim();
    if (normalizedPhone.length < 10) {
      Alert.alert('Invalid phone', 'Please enter a valid PH mobile number.');
      return;
    }
    setBusy(true);
    try {
      await requestOtp(normalizedPhone);
      Alert.alert('OTP sent', 'Check server logs if using console SMS provider.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    const normalizedPhone = phone.trim();
    const normalizedCode = code.trim();
    if (normalizedPhone.length < 10) {
      Alert.alert('Invalid phone', 'Please enter a valid PH mobile number.');
      return;
    }
    if (!/^\d{6}$/.test(normalizedCode)) {
      Alert.alert('Invalid OTP', 'Enter the 6-digit OTP code.');
      return;
    }
    setBusy(true);
    try {
      const tokens = await verifyOtp(normalizedPhone, normalizedCode);
      await saveAuthTokens(tokens.access_token, tokens.refresh_token);
      Alert.alert('Signed in', 'You can run premium predictions if your account is entitled.');
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      accessibilityLabel="Authentication screen"
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Image
            source={logoSource}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Swerte3 logo"
            accessibilityRole="image"
          />
        </View>

        <View style={styles.sheet}>
          <Card style={styles.card} mode="elevated">
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Phone number
              </Text>
              <TextInput
                label="e.g. 09171234567"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                mode="outlined"
                style={styles.field}
                outlineColor="#86b98f"
                activeOutlineColor="#2f855a"
                textColor="#18402a"
                theme={{ colors: { background: '#e4f4dd', placeholder: '#4a6b54' } }}
                accessibilityLabel="Phone number input"
              />
              <Button
                mode="contained"
                onPress={sendOtp}
                disabled={busy}
                accessibilityLabel="Send OTP"
                contentStyle={styles.ctaContent}
                style={[styles.cta, busy ? styles.ctaBusy : null]}
                buttonColor="#2f855a"
                textColor="#f5fff5"
              >
                Send OTP
              </Button>

              <Text variant="titleMedium" style={styles.sectionTitle}>
                Verification code
              </Text>
              <TextInput
                label="6-digit OTP"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                mode="outlined"
                style={styles.field}
                outlineColor="#86b98f"
                activeOutlineColor="#2f855a"
                textColor="#18402a"
                theme={{ colors: { background: '#e4f4dd', placeholder: '#4a6b54' } }}
                accessibilityLabel="One time password input"
              />

              <View style={styles.row}>
                <Button
                  mode="contained-tonal"
                  onPress={confirm}
                  disabled={busy}
                  accessibilityLabel="Verify OTP"
                  contentStyle={styles.ctaContent}
                  style={[styles.verify, busy ? styles.verifyBusy : null]}
                  buttonColor="#d9f3d7"
                  textColor="#1f5130"
                >
                  Verify & Continue
                </Button>
                {navigation.canGoBack() ? (
                  <Button onPress={() => navigation.goBack()} accessibilityLabel="Go back">
                    Back
                  </Button>
                ) : null}
              </View>

            </Card.Content>
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#2f4f2f' },
  scroll: { flex: 1, backgroundColor: '#2f4f2f' },
  scrollContent: {
    flexGrow: 1,
    ...(Platform.OS === 'web' ? { maxWidth: 560, width: '100%', alignSelf: 'center' as const } : {}),
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? 26 : 20,
    paddingBottom: 10,
    backgroundColor: '#2f4f2f',
    borderBottomWidth: 2,
    borderBottomColor: '#84cc8a',
  },
  logo: { width: 154, height: 154, marginBottom: 2 },
  sheet: {
    flex: 1,
    marginTop: 8,
    backgroundColor: '#dff1de',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingBottom: 36,
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#eef9ed',
    borderWidth: 1,
    borderColor: '#b9dfb9',
  },
  sectionTitle: { marginBottom: 6, marginTop: 4, fontWeight: '600' },
  field: { marginBottom: 10 },
  cta: { borderRadius: 12, marginBottom: 14 },
  ctaBusy: { opacity: 0.85 },
  ctaContent: { paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 8, flexWrap: 'wrap' },
  verify: { borderRadius: 12 },
  verifyBusy: { opacity: 0.8 },
});
