import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Paragraph, Title, useTheme } from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { logScreenView } from '../analytics';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props): React.ReactElement {
  const theme = useTheme();

  useEffect(() => {
    void logScreenView('Home');
  }, []);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.pad}
      accessibilityLabel="Home scroll content"
    >
      <Title style={styles.title} accessibilityRole="header">
        Swerte3
      </Title>
      <Paragraph style={styles.sub} accessibilityLabel="App tagline">
        Swertres / 3D companion — predictions are advisory only. Play responsibly.
      </Paragraph>
      <Card style={styles.card} accessibilityLabel="Predictions card">
        <Card.Content>
          <Title>Draw sessions</Title>
          <Paragraph>Get free XGBoost + Markov picks, or premium Miro + council with an account.</Paragraph>
          <View style={styles.row}>
            <Button mode="contained" onPress={() => navigation.navigate('Predict')} accessibilityLabel="Open predictions">
              Predictions
            </Button>
            <Button mode="outlined" onPress={() => navigation.navigate('Auth')} accessibilityLabel="Open sign in">
              Sign in
            </Button>
          </View>
        </Card.Content>
      </Card>
      <Card style={styles.card}>
        <Card.Content>
          <Title>Premium</Title>
          <Paragraph>Unlock LLM swarm + Miro synthesis after purchase (see PayMongo setup).</Paragraph>
          <Button onPress={() => navigation.navigate('Paywall')} accessibilityLabel="Open premium paywall">
            Premium (₱2)
          </Button>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  pad: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 28, marginBottom: 8 },
  sub: { marginBottom: 16, opacity: 0.85 },
  card: { marginBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
});
