import { useEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconCoin, IconCrown, IconSparkles } from '@tabler/icons-react';
import { fetchPremiumPrediction, type DrawSession, type PremiumPrediction } from '../lib/api';
import { cleanError, errorStatus } from '../lib/dates';
import { SWERTRES_LEGAL_CAPTION, SWERTRES_LEGAL_CAPTION_TL } from '../lib/disclaimers';
import { logEvent, logScreenView } from '../lib/analytics';
import { useReveal } from '../lib/motion';
import { useSession } from '../state/session';
import { useWallet } from '../state/wallet';
import { Balls } from '../components/Balls';

const SESSIONS: { key: DrawSession; label: string }[] = [
  { key: '9am', label: '9 AM' },
  { key: '4pm', label: '4 PM' },
  { key: '9pm', label: '9 PM' },
];

export function Elite() {
  const { ensureToken, account } = useSession();
  const { startGinto, gintoBusy, openTopUp } = useWallet();
  const [session, setSession] = useState<DrawSession>('9pm');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PremiumPrediction | null>(null);
  const [needsGinto, setNeedsGinto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scope = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useReveal(scope);
  useEffect(() => logScreenView('Elite'), []);

  const run = async () => {
    if (loading) return;
    setLoading(true);
    setData(null);
    setError(null);
    setNeedsGinto(false);
    try {
      logEvent('prediction_request', { tier: 'premium', session });
      const res = await fetchPremiumPrediction(session, await ensureToken());
      setData(res);
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : '';
      if (errorStatus(e) === 402 || msg.includes('payment')) setNeedsGinto(true);
      else setError(cleanError(e, 'Elite could not finish. Try again in a moment.'));
    } finally {
      setLoading(false);
    }
  };

  const miro = data?.miro;
  const miroDigits = miro && Array.isArray(miro.digits) ? miro.digits : null;
  const miroErr = miro && 'error' in miro && miro.error ? String(miro.error) : null;
  const label = SESSIONS.find((s) => s.key === session)!.label;

  return (
    <div className="elite" ref={scope}>
      <div className="elite__media" aria-hidden>
        <img
          src="/img/elite.webp"
          srcSet="/img/elite-800.webp 800w, /img/elite.webp 1376w"
          sizes="100vw"
          alt=""
          width={1376}
          height={768}
        />
      </div>
      <div className="container container--narrow page">
        <header className="page-head" data-reveal style={{ textAlign: 'center', justifyItems: 'center' }}>
          <span className="pill pill--gold">
            <IconCrown size={14} aria-hidden /> Premium
          </span>
          <h1>Elite</h1>
          <p>Several AI agents (MiroFish) study the same draw and blend their answers into one premium pick.</p>
        </header>

        <section className="elite-panel" data-reveal aria-label="Get your Elite pick">
          <div style={{ display: 'grid', gap: 'var(--s-3)', justifyItems: 'center' }}>
            <span id="elite-draw" className="elite-result__label">
              Choose a draw
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="elite-draw">
              {SESSIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={session === s.key}
                  onClick={() => {
                    setSession(s.key);
                    setData(null);
                  }}
                  disabled={loading}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="btn btn--gold btn--lg btn--block"
            onClick={() => void run()}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? <span className="spinner" aria-hidden /> : <IconSparkles size={20} aria-hidden />}
            {loading ? 'Blending the models…' : `Get my ${label} Elite pick`}
          </button>

          {needsGinto ? (
            <div className="notice" role="alert">
              <IconSparkles size={22} aria-hidden />
              <div>
                <strong>Press GINTO first</strong>
                <p>
                  GINTO uses 1 token and opens Elite for 9 AM, 4 PM and 9 PM until your next GINTO. You have{' '}
                  {account?.credits ?? 0} {account?.credits === 1 ? 'token' : 'tokens'}.
                </p>
                <div className="notice__actions row">
                  <button
                    type="button"
                    className="btn btn--gold"
                    onClick={() => void startGinto().then(() => setNeedsGinto(false))}
                    disabled={gintoBusy}
                    aria-busy={gintoBusy}
                  >
                    {gintoBusy ? <span className="spinner" aria-hidden /> : null}
                    GINTO (1 token)
                  </button>
                  <button type="button" className="btn btn--on-dark" onClick={openTopUp}>
                    <IconCoin size={18} aria-hidden /> Add tokens
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="notice notice--danger" role="alert">
              <IconAlertTriangle size={22} aria-hidden />
              <div>
                <strong>Elite didn't finish</strong>
                <p>{error}</p>
              </div>
            </div>
          ) : null}

          {data ? (
            <div className="elite-result" ref={resultRef} tabIndex={-1} aria-label={`${label} Elite result`}>
              <span className="elite-result__label">Ginto · final blend · {label}</span>
              {miroDigits && miroDigits.length === 3 ? (
                <Balls digits={miroDigits} size="lg" tone="gold" label="Elite blend" />
              ) : (
                <Balls digits={null} size="lg" label="Elite blend" animate={false} />
              )}
              {miroErr ? <p className="legal">The blend didn't finish: {miroErr}</p> : null}
              <div className="base-models">
                <div className="base-model">
                  <span>Alon · XGBoost</span>
                  <Balls digits={data.models?.XGBoost?.digits} size="sm" label="XGBoost" />
                </div>
                <div className="base-model">
                  <span>Alon · Markov</span>
                  <Balls digits={data.models?.Markov?.digits} size="sm" label="Markov" />
                </div>
              </div>
              {data.disclaimer ? <p className="legal">{data.disclaimer}</p> : null}
            </div>
          ) : null}
        </section>

        <p className="legal" style={{ marginTop: 'var(--s-8)', textAlign: 'center', marginInline: 'auto' }}>
          {SWERTRES_LEGAL_CAPTION}
          <em lang="tl">{SWERTRES_LEGAL_CAPTION_TL}</em>
        </p>
      </div>
    </div>
  );
}
