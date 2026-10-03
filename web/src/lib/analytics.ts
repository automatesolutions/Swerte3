/**
 * Analytics facade — wire GA4 (gtag) in production.
 * No-op when the measurement ID is unset.
 */
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

export function logScreenView(screenName: string): void {
  logEvent('screen_view', { screen_name: screenName });
}

export function logEvent(name: string, params?: Record<string, string | number | boolean>): void {
  if (import.meta.env.DEV) {
    console.log('[analytics]', name, params ?? {});
  }
  if (!GA_MEASUREMENT_ID) return;
  const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
  gtag?.('event', name, params ?? {});
}
