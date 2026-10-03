import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconAlertTriangle, IconCalendarEvent, IconClover, IconRefresh } from '@tabler/icons-react';
import { fetchDailyPredictions, type DailyPredictionResponse, type DrawSession } from '../lib/api';
import { cleanError, formatFriendly, parseIsoDate, toIsoDate } from '../lib/dates';
import { SWERTRES_LEGAL_CAPTION, SWERTRES_LEGAL_CAPTION_TL } from '../lib/disclaimers';
import { logEvent, logScreenView } from '../lib/analytics';
import { useReveal } from '../lib/motion';
import { Balls } from '../components/Balls';

const SESSIONS: { key: DrawSession; label: string }[] = [
  { key: '9am', label: '9 AM' },
  { key: '4pm', label: '4 PM' },
  { key: '9pm', label: '9 PM' },
];

export function LuckyPick() {
  const today = toIsoDate(new Date());
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DailyPredictionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scope = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);

  useReveal(scope);
  useEffect(() => logScreenView('LuckyPick'), []);

  const valid = parseIsoDate(date) !== null;

  const run = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      logEvent('prediction_request', { tier: 'free', mode: 'daily', targetDate: date });
      // A fresh key per request, so each press can give a new variation.
      const variationKey = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const res = await fetchDailyPredictions(date, variationKey);
      setData(res);
      requestAnimationFrame(() => resultsRef.current?.focus());
    } catch (err) {
      setError(cleanError(err, "We couldn't get picks. Try again in a moment."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container page" ref={scope}>
      <header className="page-head" data-reveal>
        <span className="pill" style={{ width: 'fit-content' }}>
          Free
        </span>
        <h1>LuckyPick</h1>
        <p>Choose a date that matters to you. You get one pick from each model for every draw that day.</p>
      </header>

      <form className="card date-card" onSubmit={run} data-reveal>
        <div>
          <span className="card__eyebrow">
            <IconCalendarEvent size={16} aria-hidden /> Your date
          </span>
          <p className="date-card__display" aria-live="polite">
            {valid ? formatFriendly(date) : 'Choose a date'}
          </p>
        </div>
        <div className="date-controls">
          <div className="field">
            <label htmlFor="lp-date">Date</label>
            <input
              id="lp-date"
              className="input tnum"
              type="date"
              value={date}
              min="1900-01-01"
              max="2100-12-31"
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          {date !== today ? (
            <button type="button" className="btn" onClick={() => setDate(today)}>
              Today
            </button>
          ) : null}
          <button type="submit" className="btn btn--primary btn--lg" disabled={!valid || loading} aria-busy={loading}>
            {loading ? <span className="spinner" aria-hidden /> : <IconClover size={20} aria-hidden />}
            {loading ? 'Getting picks…' : data ? 'Get new picks' : 'Get picks'}
          </button>
        </div>
      </form>

      <section aria-labelledby="lp-results" style={{ marginTop: 'var(--s-8)' }}>
        <h2 id="lp-results" ref={resultsRef} tabIndex={-1} className="sr-only">
          Picks for {formatFriendly(date)}
        </h2>

        {error ? (
          <div className="notice notice--danger" role="alert">
            <IconAlertTriangle size={22} aria-hidden />
            <div>
              <strong>No picks this time</strong>
              <p>{error}</p>
              <div className="notice__actions">
                <button type="button" className="btn" onClick={() => void run()}>
                  <IconRefresh size={18} aria-hidden /> Try again
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {data?.warning ? (
          <div className="notice notice--warn" style={{ marginBottom: 'var(--s-4)' }}>
            <IconAlertTriangle size={22} aria-hidden />
            <div>
              <strong>Note</strong>
              <p>{data.warning}</p>
            </div>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="results" aria-hidden>
            {SESSIONS.map((s) => (
              <div key={s.key} className="skeleton" style={{ height: 260 }} />
            ))}
          </div>
        ) : null}

        {data ? (
          <div className="results" aria-busy={loading}>
            {SESSIONS.map((s) => {
              const sess = data.sessions[s.key];
              return (
                <article key={s.key} className="session-card" aria-label={`${s.label} draw`}>
                  <div className="session-card__time">
                    <h3>{s.label}</h3>
                    <span className="pill pill--muted">{sess?.history_count ? `${sess.history_count.toLocaleString()} past draws` : 'Draw'}</span>
                  </div>
                  <div className="model-row">
                    <span className="model-row__name">
                      XGBoost <small>Pattern model</small>
                    </span>
                    <Balls digits={sess?.models?.XGBoost?.digits} size="sm" label={`${s.label} XGBoost`} />
                  </div>
                  <div className="model-row">
                    <span className="model-row__name">
                      Markov <small>Sequence model</small>
                    </span>
                    <Balls digits={sess?.models?.Markov?.digits} size="sm" label={`${s.label} Markov`} />
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {!data && !loading && !error ? (
          <div className="empty" data-reveal>
            <IconClover size={40} stroke={1.4} aria-hidden style={{ color: 'var(--brand-text)' }} />
            <h3>No picks yet</h3>
            <p>Choose a date above, then select Get picks. You can press it again for a new variation.</p>
          </div>
        ) : null}

        <p className="legal" style={{ marginTop: 'var(--s-8)' }}>
          {SWERTRES_LEGAL_CAPTION}
          <em lang="tl">{SWERTRES_LEGAL_CAPTION_TL}</em>
        </p>
      </section>
    </div>
  );
}
