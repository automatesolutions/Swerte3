import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getStoredAccessToken } from '../auth/storage';
import { HomeScreen } from '../screens/HomeScreen';
import { LihimPremiumScreen } from '../screens/LihimPremiumScreen';
import { PredictScreen } from '../screens/PredictScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { PaywallScreen } from '../screens/PaywallScreen';
import { PictureAnalysisScreen } from '../screens/PictureAnalysisScreen';
import { MathAlgoScreen } from '../screens/MathAlgoScreen';
import { AnalyticsFeatureScreen, analyticsFeatureTitle } from '../screens/AnalyticsFeatureScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: '#1e4a31' },
  headerTintColor: '#ecffe9',
  headerTitleStyle: { fontWeight: '600' as const },
};

export function RootNavigator(): React.ReactElement {
  const [initialRoute, setInitialRoute] = useState<'Auth' | 'Home' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getStoredAccessToken();
        if (!cancelled) setInitialRoute(token ? 'Home' : 'Auth');
      } catch {
        if (!cancelled) setInitialRoute('Auth');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (initialRoute === null) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#0f172a',
        }}
        accessibilityLabel="Loading"
      >
        <ActivityIndicator size="large" color="#f8fafc" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={screenOptions}>
        <Stack.Screen name="Auth" component={AuthScreen} options={{ title: 'Sign in' }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Swerte3' }} />
        <Stack.Screen
          name="LihimPremium"
          component={LihimPremiumScreen}
          options={{
            title: 'Elite',
            headerStyle: { backgroundColor: '#1a0f08' },
            headerTintColor: '#f7e7b0',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen name="Predict" component={PredictScreen} options={{ title: 'LuckyPick' }} />
        <Stack.Screen name="Paywall" component={PaywallScreen} options={{ title: 'Premium' }} />
        <Stack.Screen
          name="PictureAnalysis"
          component={PictureAnalysisScreen}
          options={{
            title: 'Litrato',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="MathAlgo"
          component={MathAlgoScreen}
          options={{
            title: 'Cognitive challenge',
            headerStyle: { backgroundColor: '#0a1628' },
            headerTintColor: '#f1f5f9',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="Analytics"
          component={AnalyticsScreen}
          options={{
            title: 'Analytics',
            headerStyle: { backgroundColor: '#0a1628' },
            headerTintColor: '#e2e8f0',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="AnalyticsFeature"
          component={AnalyticsFeatureScreen}
          options={({ route }) => ({
            title: analyticsFeatureTitle(route.params.kind),
            headerStyle: { backgroundColor: '#0a1628' },
            headerTintColor: '#e2e8f0',
            headerShadowVisible: false,
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
