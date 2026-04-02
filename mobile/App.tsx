import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider as PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1e3a5f',
    secondary: '#c2410c',
    secondaryContainer: '#ffedd5',
    onSecondaryContainer: '#431407',
    background: '#f1f5f9',
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level1: '#ffffff',
    },
  },
};

export default function App(): React.ReactElement {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <RootNavigator />
        <StatusBar style="auto" />
      </PaperProvider>
    </SafeAreaProvider>
  );
}
