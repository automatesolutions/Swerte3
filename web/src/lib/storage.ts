export const ACCESS_TOKEN_KEY = 'swerte3_access_token';
export const REFRESH_TOKEN_KEY = 'swerte3_refresh_token';

/** Best-effort localStorage: private mode or blocked storage must never crash the app. */
export function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable
  }
}

export function lsDelete(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // storage unavailable
  }
}

export function getStoredAccessToken(): string | null {
  return lsGet(ACCESS_TOKEN_KEY)?.trim() || null;
}

export function getStoredRefreshToken(): string | null {
  return lsGet(REFRESH_TOKEN_KEY)?.trim() || null;
}

export function saveAuthTokens(accessToken: string, refreshToken: string): void {
  lsSet(ACCESS_TOKEN_KEY, accessToken);
  lsSet(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearAuthTokens(): void {
  lsDelete(ACCESS_TOKEN_KEY);
  lsDelete(REFRESH_TOKEN_KEY);
}
