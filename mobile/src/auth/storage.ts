import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const ACCESS_TOKEN_KEY = 'swerte3_access_token';
export const REFRESH_TOKEN_KEY = 'swerte3_refresh_token';

async function safeSecureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function safeSecureSet(key: string, value: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(key, value);
    return true;
  } catch {
    return false;
  }
}

async function safeSecureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // best-effort delete
  }
}

function webGet(key: string): string | null {
  if (Platform.OS !== 'web') return null;
  try {
    return globalThis?.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function webSet(key: string, value: string): void {
  if (Platform.OS !== 'web') return;
  try {
    globalThis?.localStorage?.setItem(key, value);
  } catch {
    // best-effort web fallback
  }
}

function webDelete(key: string): void {
  if (Platform.OS !== 'web') return;
  try {
    globalThis?.localStorage?.removeItem(key);
  } catch {
    // best-effort web fallback
  }
}

export async function getStoredAccessToken(): Promise<string | null> {
  const secureValue = await safeSecureGet(ACCESS_TOKEN_KEY);
  if (secureValue) return secureValue;
  return webGet(ACCESS_TOKEN_KEY);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  const secureValue = await safeSecureGet(REFRESH_TOKEN_KEY);
  if (secureValue) return secureValue;
  return webGet(REFRESH_TOKEN_KEY);
}

export async function saveAuthTokens(accessToken: string, refreshToken: string): Promise<void> {
  const accessSaved = await safeSecureSet(ACCESS_TOKEN_KEY, accessToken);
  const refreshSaved = await safeSecureSet(REFRESH_TOKEN_KEY, refreshToken);
  if (!accessSaved) webSet(ACCESS_TOKEN_KEY, accessToken);
  if (!refreshSaved) webSet(REFRESH_TOKEN_KEY, refreshToken);
}

export async function clearAuthTokens(): Promise<void> {
  await Promise.all([safeSecureDelete(ACCESS_TOKEN_KEY), safeSecureDelete(REFRESH_TOKEN_KEY)]);
  webDelete(ACCESS_TOKEN_KEY);
  webDelete(REFRESH_TOKEN_KEY);
}
