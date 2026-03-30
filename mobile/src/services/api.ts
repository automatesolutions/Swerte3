const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000').replace(/\/$/, '');

export type DrawSession = '9am' | '4pm' | '9pm';

async function getJson<T>(path: string, init?: RequestInit & { token?: string | null }): Promise<T> {
  const { token, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
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
};

export function fetchFreePrediction(session: DrawSession): Promise<FreePrediction> {
  const q = new URLSearchParams({ session });
  return getJson<FreePrediction>(`/api/predict/free?${q.toString()}`);
}

export function fetchPremiumPrediction(session: DrawSession, token: string): Promise<PremiumPrediction> {
  const q = new URLSearchParams({ session });
  return getJson<PremiumPrediction>(`/api/predict/premium?${q.toString()}`, { token });
}

export async function requestOtp(phone: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

export type TokenPair = { access_token: string; refresh_token: string; token_type: string };

export async function verifyOtp(phone: string, code: string): Promise<TokenPair> {
  const res = await fetch(`${API_BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json() as Promise<TokenPair>;
}
