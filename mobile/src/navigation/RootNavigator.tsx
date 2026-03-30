import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { PredictScreen } from '../screens/PredictScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { PaywallScreen } from '../screens/PaywallScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.ReactElement {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Swerte3' }} />
        <Stack.Screen name="Predict" component={PredictScreen} options={{ title: 'Predict' }} />
        <Stack.Screen name="Auth" component={AuthScreen} options={{ title: 'Sign in' }} />
        <Stack.Screen name="Paywall" component={PaywallScreen} options={{ title: 'Premium' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
