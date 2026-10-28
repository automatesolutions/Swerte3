/**
 * Jev: the decision layer for getting a returning user onto the first screen fast.
 *
 * Jev only decides *order and timing* (what to show from cache, what to fetch first, what can wait).
 * It never authenticates anyone: the server checks every token on every call, and a cached account
 * is display-only until /me answers. Each decision is logged to the console under [Jev].
 */
import type { UserMe } from './api';
import { ME_CACHE_KEY, getStoredAccessToken, getStoredRefreshToken, lsGet, lsSet } from './storage';

/** Refresh a little before expiry so the first /me never lands on a guaranteed 401. */
const EXPIRY_SKEW_SEC = 30;

export type BootstrapPath =
  /** Access token still valid: show the cached account now, revalidate /me in the background. */
  | 'cached_then_revalidate'
  /** Access token expired but a refresh token exists: refresh first, skipping the 401 round trip. */
  | 'refresh_first'
  /** No tokens: create a guest session. */
  | 'new_guest';

export type BootstrapPlan = { path: BootstrapPath; cached: UserMe | null; why: string };

const t0 = typeof performance !== 'undefined' ? performance.now() : 0;

export function logJev(what: string, choice: string, why: string, extra?: Record<string, unknown>): void {
  const ms = typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0;
  console.info('[Jev]', { what, choice, why, at_ms: ms, ...extra });
}

/** Read `exp` from a JWT without verifying it. Only used to pick an order of calls, never to trust a user. */
function jwtExpiry(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

export function accessTokenLooksExpired(token: string): boolean {
  const exp = jwtExpiry(token);
  return exp != null && exp - EXPIRY_SKEW_SEC <= Date.now() / 1000;
}

export function readCachedMe(): UserMe | null {
  const raw = lsGet(ME_CACHE_KEY);
  if (!raw) return null;
  try {
    const me = JSON.parse(raw) as UserMe;
    return me && typeof me === 'object' ? me : null;
  } catch {
    return null;
  }
}

export function writeCachedMe(me: UserMe): void {
  lsSet(ME_CACHE_KEY, JSON.stringify(me));
}

export function planBootstrap(): BootstrapPlan {
  const access = getStoredAccessToken();
  const refresh = getStoredRefreshToken();
  const cached = access || refresh ? readCachedMe() : null;
  let plan: BootstrapPlan;
  if (access && !accessTokenLooksExpired(access)) {
    plan = { path: 'cached_then_revalidate', cached, why: 'access token not expired; server still verifies it on /me' };
  } else if (refresh) {
    plan = { path: 'refresh_first', cached, why: 'access token expired; refreshing first avoids a 401 round trip' };
  } else {
    plan = { path: 'new_guest', cached: null, why: 'no stored session' };
  }
  logJev('bootstrap_path', plan.path, plan.why, { has_cached_account: Boolean(plan.cached) });
  return plan;
}

/**
 * Start a cold Cloud Run instance while the app is still parsing. A plain GET with no custom headers
 * needs no CORS preflight, so this is a single round trip.
 */
export function wakeApi(apiBase: string): void {
  if (!apiBase) return;
  logJev('wake_api', 'ping_health', 'start a scaled-to-zero instance before the first real call');
  const started = performance.now();
  fetch(`${apiBase}/health`, { method: 'GET', cache: 'no-store' })
    .then(() => logJev('wake_api', 'answered', 'health check returned', { ms: Math.round(performance.now() - started) }))
    .catch(() => {
      // best effort: the real calls report their own errors
    });
}
