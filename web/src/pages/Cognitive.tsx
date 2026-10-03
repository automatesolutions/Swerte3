import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCircleCheck,
  IconDice5,
  IconExternalLink,
  IconLock,
  IconRefresh,
} from '@tabler/icons-react';
import { fetchDailyMathCognitive, postMathCognitiveGuess } from '../lib/api';
import { cleanError, errorStatus } from '../lib/dates';
import { logScreenView } from '../lib/analytics';
import { useReveal } from '../lib/motion';
import { useSession } from '../state/session';
import { Balls } from '../components/Balls';

const CHOICES = [
  { n: '1', l: 'A' },
  { n: '2', l: 'B' },
  { n: '3', l: 'C' },
  { n: '4', l: 'D' },
  { n: '5', l: 'E' },
] as const;

const DEFAULT_TITLE = 'Ano ang susunod na pattern?';

function rollDigit(): number {
  try {
    const u = new Uint8Array(1);
    crypto.getRandomValues(u);
    return u[0] % 10;
  } catch {
    return Math.floor(Math.random() * 10);
  }
}

type Feedback = { ok: boolean; text: string; a?: number; b?: number; c?: number };

export function Cognitive() {
  const { ensureToken, me } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [qNum, setQNum] = useState(1);
  const [title, setTitle] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [allowGuess, setAllowGuess] = useState(true);
  const [guess, setGuess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [tip, setTip] = useState<number[] | null>(null);
  const scope = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useReveal(scope, [loading]);
  useEffect(() => logScreenView('MathAlgo'), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchDailyMathCognitive(await ensureToken().catch(() => null));
      setDate((prev) => {
        // A new day (or a new account) starts fresh.
        if (prev !== null && prev !== d.calendar_date) {
          setFeedback(null);
          setGuess('');
          setTip(null);
        }
        return d.calendar_date;
      });
      setUri(`data:${d.mime_type};base64,${d.image_base64}`);
      setQNum(typeof d.question_number === 'number' ? d.question_number : 1);
      setTitle(d.title_tagalog ?? null);
      setInstruction(d.instruction_tagalog);
      setAllowGuess(d.allow_guess !== false);
    } catch (e) {
      setError(cleanError(e, 'Hindi ma-load ang puzzle.'));
      setUri(null);
    } finally {
      setLoading(false);
    }
  }, [ensureToken]);

  useEffect(() => {
    void load();
    // Reload when the signed-in account changes.
  }, [load, me?.phone]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!guess || !allowGuess || submitting) return;
    setSubmitting(true);
    try {
      const r = await postMathCognitiveGuess(guess, await ensureToken().catch(() => null));
      if (r.submitted) setAllowGuess(false);
      const fb: Feedback = {
        ok: r.correct,
        text: r.message,
        a: r.bonus_tip_digit_a ?? undefined,
        b: r.bonus_tip_digit_b ?? undefined,
        c: r.bonus_tip_digit_c ?? undefined,
      };
      setFeedback(fb);
      setTip(r.correct && fb.a !== undefined && fb.b !== undefined && fb.c !== undefined ? [fb.a, fb.b, fb.c] : null);
    } catch (err) {
      const msg = cleanError(err, 'Hindi naipadala ang sagot.');
      if (errorStatus(err) === 403 || /naisumite|isang beses/i.test(msg)) setAllowGuess(false);
      setFeedback({ ok: false, text: msg });
    } finally {
      setSubmitting(false);
      requestAnimationFrame(() => feedbackRef.current?.focus());
    }
  };

  const pickEnabled = allowGuess && !submitting;
  const hasThree = feedback?.ok && feedback.c !== undefined;
  const hasTwo = feedback?.ok && feedback.a !== undefined && feedback.b !== undefined && feedback.c === undefined;

  return (
    <div className="container container--narrow page" ref={scope}>
      <Link to="/tips" className="back-link">
        <IconArrowLeft size={18} aria-hidden /> Tips
      </Link>

      {loading ? (
        <div className="stack" aria-busy="true">
          <div className="skeleton" style={{ height: 48, width: '60%' }} />
          <div className="skeleton" style={{ aspectRatio: '900 / 760' }} />
          <p className="hint" lang="tl">
            Inihahanda ang sequence challenge…
          </p>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="notice notice--danger" role="alert">
          <IconAlertTriangle size={22} aria-hidden />
          <div>
            <strong>The puzzle didn't load</strong>
            <p>{error}</p>
            <div className="notice__actions">
              <button type="button" className="btn" onClick={() => void load()}>
                <IconRefresh size={18} aria-hidden /> Subukan ulit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && uri ? (
        <>
          <header className="page-head" data-reveal>
            <span className="card__eyebrow tnum">
              Cognitive challenge · Araw {qNum}
              {date ? ` · ${date}` : ''}
            </span>
            <h1 lang="tl">{(title?.trim() || DEFAULT_TITLE).slice(0, 120)}</h1>
          </header>

          <form className="card stack" onSubmit={onSubmit} data-reveal>
            <div className="stimulus">
              <img
                src={uri}
                alt="Sequence ng tatlong hugis. Pumili ng susunod mula A hanggang E."
                width={900}
                height={760}
              />
            </div>

            {allowGuess ? (
              <fieldset className="choices" disabled={!pickEnabled}>
                <legend lang="tl">{instruction.trim() || 'Pumili ng letrang A hanggang E na pinaka-angkop.'}</legend>
                {CHOICES.map((c) => (
                  <label key={c.n} className="choice">
                    <input
                      type="radio"
                      name="answer"
                      value={c.n}
                      checked={guess === c.n}
                      onChange={() => setGuess(c.n)}
                      aria-label={`Sagot ${c.l}`}
                    />
                    <span aria-hidden>{c.l}</span>
                  </label>
                ))}
              </fieldset>
            ) : !feedback ? (
              <div className="notice">
                <IconLock size={22} aria-hidden />
                <div lang="tl">
                  <strong>Tapos na ang sagot ngayon</strong>
                  <p>Isang beses lang bawat araw ang pagsagot dito. Bumalik bukas para sa bagong challenge.</p>
                </div>
              </div>
            ) : null}

            {allowGuess ? (
              <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={!guess || !pickEnabled}>
                {submitting ? <span className="spinner" aria-hidden /> : <IconCircleCheck size={20} aria-hidden />}
                {submitting ? 'Sinusuri…' : 'Suriin ang sagot'}
              </button>
            ) : null}
            {allowGuess ? (
              <p className="hint" style={{ textAlign: 'center' }} lang="tl">
                Isang sagot lang bawat araw.
              </p>
            ) : null}
          </form>

          {feedback ? (
            <div className="stack" style={{ marginTop: 'var(--s-5)' }} ref={feedbackRef} tabIndex={-1}>
              <div className={`notice ${feedback.ok ? 'notice--ok' : 'notice--warn'}`} role="status">
                {feedback.ok ? <IconCircleCheck size={22} aria-hidden /> : <IconAlertTriangle size={22} aria-hidden />}
                <div>
                  <strong>{feedback.ok ? 'Tama!' : 'Hindi tama'}</strong>
                  <p>{feedback.text}</p>
                </div>
              </div>

              {hasThree || hasTwo ? (
                <div className="tip-card">
                  <h3 lang="tl">{hasThree ? 'Random tip · tatlong digit (0–9)' : 'Random tip · dalawang digit (0–9)'}</h3>
                  {hasThree && tip ? (
                    <Balls digits={tip} tone="gold" label="Random tip" />
                  ) : (
                    <p className="date-card__display tnum">
                      {feedback.a} · {feedback.b}
                    </p>
                  )}
                  {hasThree ? (
                    <button type="button" className="btn" onClick={() => setTip([rollDigit(), rollDigit(), rollDigit()])}>
                      <IconDice5 size={18} aria-hidden /> Bagong tatlong numero
                    </button>
                  ) : null}
                  <p className="hint" lang="tl">
                    {hasThree
                      ? 'Bagong halo tuwing pipindutin. Pampaswerte lamang, hindi garantiya ng resulta.'
                      : 'Parehong pares kada araw para sa iyong account. Pampasiyasat lamang.'}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <p style={{ marginTop: 'var(--s-6)' }}>
            <a
              href="https://www.tests.com/practice/cognitive-abilities-practice-test"
              target="_blank"
              rel="noreferrer"
              className="back-link"
              style={{ color: 'var(--brand-text)' }}
            >
              Similar nonverbal sequence items on Tests.com <IconExternalLink size={16} aria-hidden />
            </a>
          </p>
        </>
      ) : null}
    </div>
  );
}
