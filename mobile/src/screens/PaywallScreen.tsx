import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Card, Paragraph, Title } from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { logEvent } from '../analytics';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Paywall'>;

export function PaywallScreen({ navigation }: Props): React.ReactElement {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.pad} accessibilityLabel="Premium paywall">
      <Title accessibilityRole="header">Premium access</Title>
      <Card style={styles.card}>
        <Card.Content>
          <Title>₱2 unlock</Title>
          <Paragraph>
            Complete PayMongo checkout on the web or wire the native SDK. After payment, the webhook grants premium_until on
            your user (metadata user_id).
          </Paragraph>
          <Button
            mode="contained"
            onPress={() => {
              void logEvent('paywall_view', { source: 'mobile' });
            }}
            accessibilityLabel="Track paywall view event"
          >
            Track interest (analytics)
          </Button>
        </Card.Content>
      </Card>
      <Button onPress={() => navigation.navigate('Auth')} accessibilityLabel="Go to sign in before purchase">
        Sign in first
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  pad: { padding: 16, gap: 12 },
  card: { marginBottom: 16 },
});
