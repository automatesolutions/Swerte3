import React from 'react';
import { Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { LihimPremiumScreen } from '../screens/LihimPremiumScreen';
import { PredictScreen } from '../screens/PredictScreen';
import { VideoHomeScreen } from '../screens/VideoHomeScreen';
import { PaywallScreen } from '../screens/PaywallScreen';
import { PictureAnalysisScreen } from '../screens/PictureAnalysisScreen';
import { MathAlgoScreen } from '../screens/MathAlgoScreen';
import { AnalyticsFeatureScreen, analyticsFeatureTitle } from '../screens/AnalyticsFeatureScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Native: map PayPal return + main routes. Web: leave linking off — a partial config + URL sync
 * breaks `navigation.reset` after Welcome (state gets reconciled back to `/` / wrong screen, and
 * serializing `prefetchedMe` to the URL can fail or strip params).
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [ExpoLinking.createURL('/'), 'swerte3://'],
  config: {
    screens: {
      VideoHome: '',
      ProfileSetup: 'profile-setup',
      Home: 'checkout-done',
    },
  },
};

const screenOptions = {
  headerStyle: { backgroundColor: '#1e4a31' },
  headerTintColor: '#ecffe9',
  headerTitleStyle: { fontWeight: '600' as const },
};

/**
 * Welcome (video) is always the first screen on a cold start. Continue/Skip then goes to
 * Profile (if needed) or Home — see VideoHomeScreen.continueAfterWelcome.
 */
export function RootNavigator(): React.ReactElement {
  return (
    <NavigationContainer linking={Platform.OS === 'web' ? undefined : linking}>
      <Stack.Navigator initialRouteName="VideoHome" screenOptions={screenOptions}>
        <Stack.Screen
          name="VideoHome"
          component={VideoHomeScreen}
          options={{ headerShown: false, title: 'Welcome' }}
        />
        <Stack.Screen
          name="ProfileSetup"
          component={ProfileSetupScreen}
          options={{ title: 'Profile' }}
        />
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
          }}
        />
        <Stack.Screen
          name="AnalyticsFeature"
          component={AnalyticsFeatureScreen}
          options={({ route }) => ({
            title: analyticsFeatureTitle(route.params.kind),
            headerStyle: { backgroundColor: '#0a1628' },
            headerTintColor: '#e2e8f0',
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
