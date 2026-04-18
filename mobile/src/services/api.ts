import { getStoredRefreshToken, saveAuthTokens } from '../auth/storage';

/** Android emulator host; browsers cannot reach it — use localhost when the app runs on web. */
function defaultApiBaseFromEnvironment(): string {
  if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
    const loc = (globalThis as { location?: { hostname?: string; port?: string } }).location;
    const host = loc?.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      const port = process.env.EXPO_PUBLIC_API_PORT ?? '8000';
      return `http://${host}:${port}`;
    }
  }
  return 'http://10.0.2.2:8000';
}

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? defaultApiBaseFromEnvironment()).replace(/\/$/, '');

const FETCH_TIMEOUT_MS = 25000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export type DrawSession = '9am' | '4pm' | '9pm';

type AccessRefreshPayload = { access_token: string; refresh_token: string };

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return `${res.status} error`;
  try {
    const parsed = JSON.parse(text) as { detail?: string | string[]; message?: string };
    const d = parsed.detail;
    if (Array.isArray(d)) {
      return d.map((x) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: string }).msg) : String(x))).join('; ');
    }
    return d ?? parsed.message ?? text;
  } catch {
    return text;
  }
}

/** One attempt to rotate access token after 401 (expired JWT). */
async function tryRefreshAccessToken(): Promise<string | null> {
  const refresh = await getStoredRefreshToken();
  if (!refresh?.trim()) return null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AccessRefreshPayload;
    await saveAuthTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

async function getJson<T>(path: string, init?: RequestInit & { token?: string | null }): Promise<T> {
  const { token, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let res = await fetchWithTimeout(`${API_BASE}${path}`, { ...rest, headers });
  if (res.status === 401 && token) {
    const next = await tryRefreshAccessToken();
    if (next) {
      headers.Authorization = `Bearer ${next}`;
      res = await fetchWithTimeout(`${API_BASE}${path}`, { ...rest, headers });
    }
  }
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(`${res.status}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(
  path: string,
  body: unknown,
  init?: RequestInit & { token?: string | null },
): Promise<T> {
  const { token, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const reqBody = JSON.stringify(body);
  let res = await fetchWithTimeout(`${API_BASE}${path}`, {
    ...rest,
    method: 'POST',
    headers,
    body: reqBody,
  });
  if (res.status === 401 && token) {
    const next = await tryRefreshAccessToken();
    if (next) {
      headers.Authorization = `Bearer ${next}`;
      res = await fetchWithTimeout(`${API_BASE}${path}`, {
        ...rest,
        method: 'POST',
        headers,
        body: reqBody,
      });
    }
  }
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(`${res.status}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

async function putJson<T>(
  path: string,
  body: unknown,
  init?: RequestInit & { token?: string | null },
): Promise<T> {
  const { token, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const reqBody = JSON.stringify(body);
  let res = await fetchWithTimeout(`${API_BASE}${path}`, {
    ...rest,
    method: 'PUT',
    headers,
    body: reqBody,
  });
  if (res.status === 401 && token) {
    const next = await tryRefreshAccessToken();
    if (next) {
      headers.Authorization = `Bearer ${next}`;
      res = await fetchWithTimeout(`${API_BASE}${path}`, {
        ...rest,
        method: 'PUT',
        headers,
        body: reqBody,
      });
    }
  }
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(`${res.status}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

export type FreePrediction = {
  session: string;
  models: Record<string, { digits: number[]; note?: string }>;
  council_preview?: unknown;
  disclaimer: string;
};

export type PremiumPrediction = FreePrediction & {
  tier?: string;
  miro?: { digits?: number[]; error?: string };
  council?: unknown;
  agent_enrichment?: Record<string, unknown>;
};

export type DailyPredictionResponse = {
  date: string;
  warning?: string;
  ingestion?: { inserted: number; skipped: number; errors?: string | null };
  sessions: Record<
    DrawSession,
    {
      session: string;
      models: Record<string, { digits: number[]; note?: string }>;
      history_count: number;
      source: string;
    }
  >;
  disclaimer: string;
};

export function fetchFreePrediction(session: DrawSession): Promise<FreePrediction> {
  const q = new URLSearchParams({ session });
  return getJson<FreePrediction>(`/api/predict/free?${q.toString()}`);
}

export function fetchPremiumPrediction(session: DrawSession, token: string): Promise<PremiumPrediction> {
  const q = new URLSearchParams({ session });
  return getJson<PremiumPrediction>(`/api/predict/premium?${q.toString()}`, { token });
}

export type PremiumStartResult = {
  premium_credits: number;
  lihim_unlocked: boolean;
  charged: boolean;
};

/** GINTO: always spends 1 token; then 9AM/4PM/9PM premium GETs do not deduct until next GINTO. */
export function startPremiumBatch(token: string): Promise<PremiumStartResult> {
  return postJson<PremiumStartResult>('/api/predict/premium/start', {}, { token });
}

export function fetchDailyPredictions(targetDate: string, variationKey?: string): Promise<DailyPredictionResponse> {
  const q = new URLSearchParams({ target_date: targetDate });
  if (variationKey) q.set('variation_key', variationKey);
  return getJson<DailyPredictionResponse>(`/api/predict/free/daily?${q.toString()}`);
}

export async function requestOtp(phone: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phone.trim() }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
}

export type TokenPair = { access_token: string; refresh_token: string; token_type: string };

export type UserMe = {
  phone: string;
  display_alias?: string | null;
  needs_profile?: boolean;
  is_placeholder_phone?: boolean;
  /** True for POST /auth/guest accounts (server may repair placeholder flag on GET /me). */
  is_guest_bootstrap?: boolean;
  premium_credits: number;
  lihim_unlocked?: boolean;
};

/**
 * True if the user must visit Profile (real phone + alias) before treating them as "complete".
 *
 * First-timer rule (matches backend `needs_profile = is_placeholder_phone or not alias`): anyone still
 * on a placeholder/synthetic mobile or with no saved alias is treated as incomplete even if
 * `needs_profile` were wrong or missing in the payload.
 */
export function userNeedsProfile(me: UserMe): boolean {
  const raw = me as Record<string, unknown>;

  const placeholder =
    typeof me.is_placeholder_phone === 'boolean'
      ? me.is_placeholder_phone
      : typeof raw.is_placeholder_phone === 'boolean'
        ? raw.is_placeholder_phone
        : typeof raw.isPlaceholderPhone === 'boolean'
          ? raw.isPlaceholderPhone
          : false;

  const alias =
    me.display_alias != null && String(me.display_alias).trim()
      ? String(me.display_alias).trim()
      : typeof raw.display_alias === 'string' && raw.display_alias.trim()
        ? raw.display_alias.trim()
        : typeof raw.displayAlias === 'string' && String(raw.displayAlias).trim()
          ? String(raw.displayAlias).trim()
          : '';

  const guestBootstrap =
    typeof me.is_guest_bootstrap === 'boolean'
      ? me.is_guest_bootstrap
      : typeof raw.is_guest_bootstrap === 'boolean'
        ? raw.is_guest_bootstrap
        : false;

  const np =
    typeof me.needs_profile === 'boolean'
      ? me.needs_profile
      : typeof raw.needs_profile === 'boolean'
        ? raw.needs_profile
        : typeof raw.needsProfile === 'boolean'
          ? raw.needsProfile
          : undefined;

  // No real saved profile yet → first-time / onboarding (same as backend _me_payload)
  if (placeholder || !alias) return true;

  // Guest session not finished in DB even if flags look wrong
  if (guestBootstrap) return true;

  if (np === true) return true;
  if (np === false) return false;

  return false;
}

/** Resolves placeholder-phone flag from /me (snake or camel). */
export function isPlaceholderPhone(me: UserMe): boolean {
  const raw = me as Record<string, unknown>;
  if (typeof me.is_placeholder_phone === 'boolean') return me.is_placeholder_phone;
  if (typeof raw.is_placeholder_phone === 'boolean') return raw.is_placeholder_phone;
  if (typeof raw.isPlaceholderPhone === 'boolean') return raw.isPlaceholderPhone;
  return false;
}

export function fetchUserMe(token: string): Promise<UserMe> {
  return getJson<UserMe>('/api/auth/me', { token });
}

export async function registerGuestSession(): Promise<TokenPair> {
  const res = await fetchWithTimeout(`${API_BASE}/api/auth/guest`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json() as Promise<TokenPair>;
}

export type AliasCheckResult = { available: boolean; reason?: string };

export function checkAliasAvailable(alias: string): Promise<AliasCheckResult> {
  const q = new URLSearchParams({ alias: alias.trim() });
  return getJson<AliasCheckResult>(`/api/auth/alias-check?${q.toString()}`);
}

export function updateUserProfile(
  token: string,
  body: { alias: string; phone?: string },
): Promise<UserMe> {
  const payload: { alias: string; phone?: string } = { alias: body.alias.trim() };
  if (body.phone?.trim()) {
    payload.phone = body.phone.trim();
  }
  return putJson<UserMe>('/api/auth/profile', payload, { token });
}

export type WalletProvider = 'gcash' | 'maya' | 'gotyme';

export type PurchaseTokensResult = {
  provider: WalletProvider;
  amount_pesos: number;
  tokens_added: number;
  premium_credits: number;
};

export function purchaseTokens(token: string, provider: WalletProvider, amountPesos: number): Promise<PurchaseTokensResult> {
  return postJson<PurchaseTokensResult>(
    '/api/payments/topup',
    { provider, amount_pesos: amountPesos },
    { token },
  );
}

export type CheckoutSessionResult = {
  checkout_url: string;
  checkout_session_id: string;
  amount_pesos: number;
};

export type PaymentConfig = {
  checkout_provider: 'paymongo' | 'paypal';
  paymongo_auth_return_url?: string | null;
};

export function fetchPaymentConfig(): Promise<PaymentConfig> {
  return getJson<PaymentConfig>('/api/payments/config');
}

/** PayMongo hosted checkout — credits via webhook; use expo-web-browser + return URLs in the app. */
export function createPaymongoCheckout(
  token: string,
  provider: WalletProvider,
  amountPesos: number,
  opts?: { returnSuccessUrl?: string; returnCancelUrl?: string },
): Promise<CheckoutSessionResult> {
  const body: Record<string, string | number> = { provider, amount_pesos: amountPesos };
  if (opts?.returnSuccessUrl) body.return_success_url = opts.returnSuccessUrl;
  if (opts?.returnCancelUrl) body.return_cancel_url = opts.returnCancelUrl;
  return postJson<CheckoutSessionResult>('/api/payments/checkout', body, { token });
}

/** PayPal Orders — open `checkout_url`, then `capturePaypalOrder` after approve. */
export function createPaypalCheckout(token: string, amountPesos: number): Promise<CheckoutSessionResult> {
  return postJson<CheckoutSessionResult>('/api/payments/checkout', { amount_pesos: amountPesos }, { token });
}

export type PaypalCaptureResult = {
  premium_credits: number;
  tokens_added: number;
  amount_pesos: number;
};

export function capturePaypalOrder(token: string, orderId: string): Promise<PaypalCaptureResult> {
  return postJson<PaypalCaptureResult>(
    '/api/payments/paypal/capture',
    { order_id: orderId },
    { token },
  );
}

export type AnalyticsBivariatePoint = { sum: number; log_product: number; session?: string };

/** 1D normalization: histograms + scaled normal PDF for digit sum and log(product). */
export type AnalyticsGaussianPayload = {
  draws_sampled: number;
  mean_sum: number;
  std_sum: number;
  mean_log_product: number;
  std_log_product: number;
  correlation: number;
  sum_histogram: number[];
  sum_normal_curve: { x: number; y: number }[];
  log_histogram: number[];
  log_histogram_range: { min: number; max: number; bins: number };
  log_normal_curve: { x: number; y: number }[];
  gaussian_scatter?: AnalyticsBivariatePoint[];
};

export type AnalyticsGraphLink = { source: string; target: string; weight: number };

export type AnalyticsCooccurrenceGraph = {
  nodes: { id: string }[];
  links: AnalyticsGraphLink[];
  draws_sampled: number;
  links_shown: number;
  pair_types_available?: number;
};

export type AnalyticsCrossDrawGraph = {
  nodes: { id: string }[];
  links: AnalyticsGraphLink[];
  session: string;
  draws_sampled: number;
  links_shown: number;
  pair_types_in_data?: number;
};

export type AnalyticsErrorSeriesPoint = {
  t: string;
  session: string;
  alon_xgb: number;
  alon_markov: number;
  lihim_miro: number | null;
  cognitive: number | null;
};

export type AnalyticsDashboard = {
  gaussian_scatter: { sum: number; log_product: number; session: string }[];
  gaussian?: AnalyticsGaussianPayload;
  cooccurrence_matrix: number[][];
  cooccurrence_graph?: AnalyticsCooccurrenceGraph;
  cross_draw_graphs?: Record<string, AnalyticsCrossDrawGraph>;
  transitions: Record<string, { from: string; to: string; weight: number }[]>;
  error_histogram: Record<string, number>;
  error_series?: AnalyticsErrorSeriesPoint[];
  outcome_rows: number;
};

export function fetchAnalyticsDashboard(session?: string | null): Promise<AnalyticsDashboard> {
  const q = new URLSearchParams();
  if (session) q.set('session', session);
  const qs = q.toString();
  return getJson<AnalyticsDashboard>(`/api/analytics/dashboard${qs ? `?${qs}` : ''}`);
}

export type DailyPictureAnalysis = {
  calendar_date: string;
  mime_type: string;
  image_base64: string;
  theme_key?: string | null;
  scene_hint: string;
};

export function fetchDailyPictureAnalysis(token?: string | null): Promise<DailyPictureAnalysis> {
  const t = token?.trim();
  return getJson<DailyPictureAnalysis>('/api/picture-analysis/daily', t ? { token: t } : {});
}

export type DailyMathCognitive = {
  /** Server user id; bawat naka-register na numero = hiwalay na quota araw-araw. */
  user_id: number;
  calendar_date: string;
  mime_type: string;
  image_base64: string;
  booklet_prompt_en: string;
  tip_tagalog: string;
  title_tagalog?: string | null;
  question_number?: number;
  instruction_tagalog: string;
  /** False after one guess submitted for the app's calendar day. */
  allow_guess?: boolean;
};

export type MathCognitiveGuessResult = {
  correct: boolean;
  message: string;
  bonus_tip_digit_a?: number | null;
  bonus_tip_digit_b?: number | null;
  bonus_tip_digit_c?: number | null;
  submitted?: boolean;
};

export function fetchDailyMathCognitive(token?: string | null): Promise<DailyMathCognitive> {
  const t = token?.trim();
  return getJson<DailyMathCognitive>('/api/math-cognitive/daily', t ? { token: t } : {});
}

export function postMathCognitiveGuess(guess: string, token?: string | null): Promise<MathCognitiveGuessResult> {
  const t = token?.trim();
  return postJson<MathCognitiveGuessResult>(
    '/api/math-cognitive/daily/guess',
    { guess },
    t ? { token: t } : {},
  );
}

export async function verifyOtp(phone: string, code: string): Promise<TokenPair> {
  const res = await fetchWithTimeout(`${API_BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json() as Promise<TokenPair>;
}
