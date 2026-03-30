import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Paragraph, TextInput, Title } from 'react-native-paper';
import * as SecureStore from 'expo-secure-store';
import { requestOtp, verifyOtp } from '../services/api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

const TOKEN_KEY = 'swerte3_access_token';
const REFRESH_KEY = 'swerte3_refresh_token';

export function AuthScreen({ navigation }: Props): React.ReactElement {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const sendOtp = async () => {
    setBusy(true);
    try {
      await requestOtp(phone);
      Alert.alert('OTP sent', 'Check server logs if using console SMS provider.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const tokens = await verifyOtp(phone, code);
      await SecureStore.setItemAsync(TOKEN_KEY, tokens.access_token);
      await SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh_token);
      Alert.alert('Signed in', 'You can run premium predictions if your account is entitled.');
      navigation.navigate('Home');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.pad} accessibilityLabel="Authentication screen">
      <Title accessibilityRole="header">Phone sign-in</Title>
      <Paragraph>Philippines numbers supported (+63…). OTP is printed to backend logs when SMS_PROVIDER=console.</Paragraph>
      <TextInput
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        mode="outlined"
        style={styles.field}
        accessibilityLabel="Phone number input"
      />
      <Button mode="contained" onPress={sendOtp} disabled={busy} accessibilityLabel="Send OTP">
        Send OTP
      </Button>
      <TextInput
        label="OTP code"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        mode="outlined"
        style={styles.field}
        accessibilityLabel="One time password input"
      />
      <View style={styles.row}>
        <Button mode="contained" onPress={confirm} disabled={busy} accessibilityLabel="Verify OTP">
          Verify
        </Button>
        <Button onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          Back
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  pad: { padding: 16 },
  field: { marginVertical: 8 },
  row: { flexDirection: 'row', gap: 8, marginTop: 16 },
});
