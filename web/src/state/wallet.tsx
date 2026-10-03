import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconAlertTriangle, IconCoin } from '@tabler/icons-react';
import {
  capturePaypalOrder,
  completeGcashCheckout,
  fetchPaymentConfig,
  fetchTokenSurvey,
  fetchUserMe,
  startPremiumBatch,
  submitTokenSurvey,
  type PaypalCaptureResult,
  type TokenSurveyNext,
} from '../lib/api';
import { lsDelete, lsGet, lsSet } from '../lib/storage';
import { cleanError, errorStatus } from '../lib/dates';
import { logEvent } from '../lib/analytics';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';
import { useSession } from './session';

/** Kept for Home pending-payment banners from older checkouts. */
export const CHECKOUT_MIN_PESOS = 20;
export const PESOS_PER_TOKEN = 2;

const PENDING_GCASH_KEY = 'swerte3_pending_gcash';
const PENDING_PAYPAL_KEY = 'swerte3_pending_paypal';

type Provider = 'gcash' | 'paypal';

type WalletApi = {
  provider: Provider;
  openTopUp: () => void;
  /** GINTO: spends 1 token and opens Elite for all three draws. */
  startGinto: () => Promise<void>;
  gintoBusy: boolean;
  pendingGcash: string | null;
  pendingPaypal: string | null;
  confirmGcash: () => Promise<boolean>;
  confirmPaypal: () => Promise<boolean>;
  dismissPending: () => void;
  confirmBusy: boolean;
};

const WalletContext = createContext<WalletApi | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { ensureToken, setCredits, refresh } = useSession();

  const [provider, setProvider] = useState<Provider>('gcash');
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [noTokenOpen, setNoTokenOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [survey, setSurvey] = useState<TokenSurveyNext | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [gintoBusy, setGintoBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pendingGcash, setPendingGcash] = useState<string | null>(() => lsGet(PENDING_GCASH_KEY));
  const [pendingPaypal, setPendingPaypal] = useState<string | null>(() => lsGet(PENDING_PAYPAL_KEY));

  useEffect(() => {
    fetchPaymentConfig()
      .then((c) => setProvider(c.checkout_provider))
      .catch(() => setProvider('gcash'));
  }, []);

  const setPending = useCallback((kind: Provider, id: string | null) => {
    const key = kind === 'gcash' ? PENDING_GCASH_KEY : PENDING_PAYPAL_KEY;
    if (id) lsSet(key, id);
    else lsDelete(key);
    (kind === 'gcash' ? setPendingGcash : setPendingPaypal)(id);
  }, []);

  const announceCapture = useCallback(
    (r: PaypalCaptureResult) => {
      setCredits(r.premium_credits);
      toast.show({
        tone: 'ok',
        title: r.tokens_added > 0 ? `${r.tokens_added} tokens added` : 'Payment already applied',
        body: `Your balance is ${r.premium_credits} tokens.`,
      });
    },
    [setCredits, toast],
  );

  const confirmGcash = useCallback(async () => {
    if (!pendingGcash || confirmBusy) return false;
    setConfirmBusy(true);
    try {
      const r = await completeGcashCheckout(await ensureToken(), pendingGcash);
      setPending('gcash', null);
      announceCapture(r);
      return true;
    } catch (e) {
      toast.show({
        tone: 'warn',
        title: "We couldn't confirm the payment yet",
        body: `${cleanError(e, 'The payment may still be processing.')} Wait a few seconds, then try again.`,
      });
      void refresh();
      return false;
    } finally {
      setConfirmBusy(false);
    }
  }, [announceCapture, confirmBusy, ensureToken, pendingGcash, refresh, setPending, toast]);

  const confirmPaypal = useCallback(async () => {
    if (!pendingPaypal || confirmBusy) return false;
    setConfirmBusy(true);
    try {
      const r = await capturePaypalOrder(await ensureToken(), pendingPaypal);
      setPending('paypal', null);
      announceCapture(r);
      return true;
    } catch (e) {
      toast.show({
        tone: 'danger',
        title: "PayPal payment didn't go through",
        body: cleanError(e, 'Approve the payment in PayPal first, then try again.'),
      });
      return false;
    } finally {
      setConfirmBusy(false);
    }
  }, [announceCapture, confirmBusy, ensureToken, pendingPaypal, setPending, toast]);

  const dismissPending = useCallback(() => {
    setPending('gcash', null);
    setPending('paypal', null);
  }, [setPending]);

  const startGinto = useCallback(async () => {
    if (gintoBusy) return;
    setGintoBusy(true);
    try {
      const token = await ensureToken();
      let credits: number;
      try {
        const me = await fetchUserMe(token);
        credits = Math.max(0, Math.floor(Number(me.premium_credits)));
        setCredits(credits);
      } catch {
        toast.show({ tone: 'danger', title: "Couldn't load your balance", body: 'Check your connection and try again.' });
        return;
      }
      if (credits < 1) {
        setNoTokenOpen(true);
        return;
      }
      const r = await startPremiumBatch(token);
      setCredits(r.premium_credits);
      logEvent('ginto_start', { charged: r.charged });
      toast.show({
        tone: 'ok',
        title: 'GINTO is on',
        body: r.charged
          ? `1 token used. 9 AM, 4 PM and 9 PM are open until your next GINTO. Balance: ${r.premium_credits}.`
          : '9 AM, 4 PM and 9 PM are open.',
      });
      navigate('/elite');
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : '';
      if (errorStatus(e) === 402 || msg.includes('payment') || msg.includes('kailangan')) {
        setNoTokenOpen(true);
      } else {
        toast.show({ tone: 'danger', title: "Elite didn't open", body: cleanError(e, 'Try again in a moment.') });
      }
    } finally {
      setGintoBusy(false);
    }
  }, [ensureToken, gintoBusy, navigate, setCredits, toast]);

  const loadSurvey = useCallback(async () => {
    setSurveyLoading(true);
    setTopUpError(null);
    setPicks({});
    try {
      const next = await fetchTokenSurvey(await ensureToken());
      setSurvey(next);
    } catch (e) {
      setSurvey(null);
      const raw = e instanceof Error ? e.message : '';
      setTopUpError(
        raw.includes('404') || raw.toLowerCase().includes('not found')
          ? 'The Swerte3 API is not serving the questions yet. Restart uvicorn on port 8002, then try again.'
          : cleanError(e, 'Could not load the questions. Try again in a moment.'),
      );
    } finally {
      setSurveyLoading(false);
    }
  }, [ensureToken]);

  const openTopUp = useCallback(() => {
    setTopUpError(null);
    setTopUpOpen(true);
    void loadSurvey();
  }, [loadSurvey]);

  const questions = survey?.questions ?? [];
  const allPicked = questions.length === 3 && questions.every((q) => Boolean(picks[q.id]));

  const handleConfirmTopUp = async () => {
    if (!allPicked || buying || !survey || survey.already_claimed) return;
    setBuying(true);
    setTopUpError(null);
    try {
      const r = await submitTokenSurvey(
        await ensureToken(),
        questions.map((q) => ({ question_id: q.id, answer: picks[q.id] })),
      );
      setCredits(r.premium_credits);
      setTopUpOpen(false);
      logEvent('token_survey_complete', { tokens: r.tokens_added });
      toast.show({
        tone: 'ok',
        title: `${r.tokens_added} tokens added`,
        body: `Your balance is ${r.premium_credits} tokens.`,
      });
    } catch (e) {
      setTopUpError(cleanError(e, 'The answers were not saved. Check each question, then try again.'));
    } finally {
      setBuying(false);
    }
  };

  const api = useMemo(
    () => ({
      provider,
      openTopUp,
      startGinto,
      gintoBusy,
      pendingGcash,
      pendingPaypal,
      confirmGcash,
      confirmPaypal,
      dismissPending,
      confirmBusy,
    }),
    [
      provider,
      openTopUp,
      startGinto,
      gintoBusy,
      pendingGcash,
      pendingPaypal,
      confirmGcash,
      confirmPaypal,
      dismissPending,
      confirmBusy,
    ],
  );

  return (
    <WalletContext.Provider value={api}>
      {children}

      <Dialog open={noTokenOpen} onClose={() => setNoTokenOpen(false)} title="You're out of tokens">
        <p className="card__lead">Elite needs 1 token for each GINTO.</p>
        <p style={{ color: 'var(--ink-2)' }}>
          Answer three short questions for our charts. If all three have a choice, you get 10 tokens. No payment.
        </p>
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setNoTokenOpen(false)}>
            Not now
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setNoTokenOpen(false);
              openTopUp();
            }}
          >
            <IconCoin size={18} aria-hidden />
            Add tokens
          </button>
        </div>
      </Dialog>

      <Dialog open={topUpOpen} onClose={() => setTopUpOpen(false)} title="Add tokens" busy={buying || surveyLoading}>
        {surveyLoading ? (
          <div className="center-state" style={{ minHeight: 160 }} aria-busy="true">
            <span className="spinner" aria-hidden />
            <p>Loading today’s questions…</p>
          </div>
        ) : null}

        {!surveyLoading && survey?.already_claimed ? (
          <p style={{ color: 'var(--ink-2)' }}>
            You already earned 10 tokens today. Come back tomorrow for three new questions.
          </p>
        ) : null}

        {!surveyLoading && survey && !survey.already_claimed ? (
          <>
            <p style={{ color: 'var(--ink-2)' }}>
              Three questions about how you follow Swertres. We use the answers to improve the charts
              and picks. Choose one answer on each, then you get{' '}
              <strong style={{ color: 'var(--ink)' }}>10 tokens</strong>. No payment.
            </p>
            {questions.map((q, i) => (
              <div key={q.id} className="field" style={{ marginTop: 'var(--s-4)' }}>
                <p id={`survey-q-${q.id}`} style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 'var(--s-2)' }}>
                  {i + 1}. {q.prompt}
                </p>
                <div className="segmented" role="radiogroup" aria-labelledby={`survey-q-${q.id}`} style={{ display: 'grid' }}>
                  {q.choices.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={picks[q.id] === c}
                      onClick={() => setPicks((prev) => ({ ...prev, [q.id]: c }))}
                      disabled={buying}
                      style={{ minWidth: 0, textAlign: 'left' }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : null}

        {topUpError ? (
          <div className="notice notice--danger" role="alert" style={{ marginTop: 'var(--s-4)' }}>
            <IconAlertTriangle size={20} aria-hidden />
            <div>
              <strong>Tokens were not added</strong>
              <p>{topUpError}</p>
            </div>
          </div>
        ) : null}
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setTopUpOpen(false)} disabled={buying}>
            Cancel
          </button>
          {questions.length === 3 && !survey?.already_claimed ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void handleConfirmTopUp()}
              disabled={!allPicked || buying || surveyLoading}
            >
              {buying ? <span className="spinner" aria-hidden /> : <IconCoin size={18} aria-hidden />}
              {buying ? 'Saving…' : 'Get 10 tokens'}
            </button>
          ) : null}
        </div>
      </Dialog>
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletApi {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}
