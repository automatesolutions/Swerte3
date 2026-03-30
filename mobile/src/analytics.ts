/**
 * Analytics facade — wire Firebase/GA4 SDK in production.
 * Respects privacy: no-op when measurement ID is unset.
 */
const GA_MEASUREMENT_ID = process.env.EXPO_PUBLIC_GA_MEASUREMENT_ID;

export async function logScreenView(screenName: string): Promise<void> {
  await logEvent('screen_view', { screen_name: screenName });
}

export async function logEvent(
  name: string,
  params?: Record<string, string | number | boolean>
): Promise<void> {
  if (__DEV__) {
    console.log('[analytics]', name, params ?? {});
  }
  if (!GA_MEASUREMENT_ID) {
    return;
  }
  // Production: replace with @react-native-firebase/analytics or expo-firebase-analytics
}
