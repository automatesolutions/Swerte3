import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchUserMe, isPlaceholderPhone, registerGuestSession, userNeedsProfile, type UserMe } from '../lib/api';
import { clearAuthTokens, getStoredAccessToken, lsGet, lsSet, saveAuthTokens } from '../lib/storage';
import { errorStatus } from '../lib/dates';

export type SessionStatus = 'loading' | 'ready' | 'error';

export type Account = {
  phone: string | null;
  alias: string | null;
  credits: number;
  needsProfile: boolean;
  placeholderPhone: boolean;
};

type SessionApi = {
  status: SessionStatus;
  error: string | null;
  me: UserMe | null;
  account: Account | null;
  /** Stored access token, or a new guest session. */
  ensureToken: () => Promise<string>;
  /** Re-read /me. Resolves with the fresh user, or null on failure. */
  refresh: () => Promise<UserMe | null>;
  setMe: (me: UserMe) => void;
  setCredits: (n: number) => void;
};

const SessionContext = createContext<SessionApi | null>(null);

const INTRO_SEEN_KEY = 'swerte3_intro_seen';
export const hasSeenIntro = (): boolean => lsGet(INTRO_SEEN_KEY) === '1';
export const markIntroSeen = (): void => lsSet(INTRO_SEEN_KEY, '1');

function toAccount(me: UserMe): Account {
  const raw = me as Record<string, unknown>;
  const phoneRaw = me.phone ?? raw.phone_e164 ?? raw.phoneE164;
  const aliasRaw = me.display_alias ?? raw.display_alias ?? raw.displayAlias;
  const credits = Number(me.premium_credits ?? raw.premium_credits ?? 0);
  const placeholder = isPlaceholderPhone(me);
  return {
    phone: !placeholder && typeof phoneRaw === 'string' && phoneRaw.trim() ? phoneRaw.trim() : null,
    alias: aliasRaw != null && String(aliasRaw).trim() ? String(aliasRaw).trim() : null,
    credits: Number.isFinite(credits) ? Math.max(0, Math.floor(credits)) : 0,
    needsProfile: userNeedsProfile(me),
    placeholderPhone: placeholder,
  };
}

async function newGuestToken(): Promise<string> {
  const pair = await registerGuestSession();
  saveAuthTokens(pair.access_token, pair.refresh_token);
  return pair.access_token;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<UserMe | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  /** Ignore stale results when focus and mount both trigger a refresh. */
  const seq = useRef(0);

  const ensureToken = useCallback(async () => getStoredAccessToken() ?? newGuestToken(), []);

  const refresh = useCallback(async (): Promise<UserMe | null> => {
    const mine = ++seq.current;
    try {
      let token = await ensureToken();
      let user: UserMe;
      try {
        user = await fetchUserMe(token);
      } catch (e) {
        // Both tokens expired or were revoked (api.ts already tried the refresh token): start a new guest.
        if (errorStatus(e) !== 401) throw e;
        clearAuthTokens();
        token = await newGuestToken();
        user = await fetchUserMe(token);
      }
      if (mine === seq.current) {
        setMeState(user);
        setError(null);
        setStatus('ready');
      }
      return user;
    } catch (e) {
      if (mine === seq.current) {
        setError(e instanceof Error ? e.message : 'Could not load your account.');
        setStatus('error');
      }
      return null;
    }
  }, [ensureToken]);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const setMe = useCallback((u: UserMe) => {
    setMeState(u);
    setStatus('ready');
  }, []);

  const setCredits = useCallback((n: number) => {
    setMeState((prev) => (prev ? { ...prev, premium_credits: n } : prev));
  }, []);

  const account = useMemo(() => (me ? toAccount(me) : null), [me]);

  const api = useMemo(
    () => ({ status, error, me, account, ensureToken, refresh, setMe, setCredits }),
    [status, error, me, account, ensureToken, refresh, setMe, setCredits],
  );

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
