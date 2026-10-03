import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  IconArrowRight,
  IconBrandPaypal,
  IconChartDots3,
  IconChevronRight,
  IconClover,
  IconCoin,
  IconCrown,
  IconPuzzle,
  IconSparkles,
  IconWallet,
} from '@tabler/icons-react';
import { useSession } from '../state/session';
import { useWallet } from '../state/wallet';
import { useReveal } from '../lib/motion';
import { logScreenView } from '../lib/analytics';

export const TIP_TILES = [
  {
    to: '/cognitive',
    icon: IconPuzzle,
    title: 'Cognitive challenge',
    text: 'Solve today’s pattern. Get it right for a bonus tip.',
  },
  {
    to: '/analytics',
    icon: IconChartDots3,
    title: 'Analytics',
    text: 'See how past draws spread and which digits pair up.',
  },
];

function PendingPayment() {
  const { provider, pendingGcash, pendingPaypal, confirmGcash, confirmPaypal, dismissPending, confirmBusy } =
    useWallet();
  const isPaypal = provider === 'paypal' && pendingPaypal;
  const isGcash = provider === 'gcash' && pendingGcash;
  if (!isPaypal && !isGcash) return null;
  return (
    <div className="notice" role="region" aria-label="Payment waiting" data-reveal>
      {isPaypal ? <IconBrandPaypal size={22} aria-hidden /> : <IconWallet size={22} aria-hidden />}
      <div>
        <strong>{isPaypal ? 'Your PayPal payment is waiting' : 'Your GCash payment is waiting'}</strong>
        <p>
          {isPaypal
            ? 'After you approve the payment in PayPal, select Complete PayPal payment to add your tokens.'
            : 'If you paid in GCash, select Confirm GCash payment to add your tokens. If it is still processing, wait a few seconds.'}
        </p>
        <div className="notice__actions row">
          <button
            type="button"
            className="btn btn--primary"
            disabled={confirmBusy}
            aria-busy={confirmBusy}
            onClick={() => void (isPaypal ? confirmPaypal() : confirmGcash())}
          >
            {confirmBusy ? <span className="spinner" aria-hidden /> : null}
            {isPaypal ? 'Complete PayPal payment' : 'Confirm GCash payment'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={dismissPending} disabled={confirmBusy}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export function Home() {
  const { account } = useSession();
  const { startGinto, gintoBusy, openTopUp } = useWallet();
  const scope = useRef<HTMLDivElement>(null);
  useReveal(scope);
  useEffect(() => logScreenView('Home'), []);

  const credits = account?.credits ?? null;

  return (
    <div ref={scope}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__media" aria-hidden>
          <img
            src="/img/hero.webp"
            srcSet="/img/hero-800.webp 800w, /img/hero.webp 1344w"
            sizes="100vw"
            alt=""
            width={1344}
            height={768}
            fetchPriority="high"
          />
        </div>
        <div className="container">
          <div className="hero__inner">
            <p className="hero__kicker" data-reveal>
              <IconSparkles size={18} aria-hidden />
              {account?.alias ? (
                <span>
                  Hi, <b>{account.alias}</b>
                </span>
              ) : (
                <span>Welcome back</span>
              )}
            </p>
            <h1 id="hero-title" data-reveal>
              Three draws a day. <em>Three numbers</em> each.
            </h1>
            <p data-reveal>
              Get free picks for 9 AM, 4 PM and 9 PM from two models trained on 10,000+ past draws. Want more? Elite blends
              several AI models into one premium pick.
            </p>
            <div className="row" data-reveal>
              <Link to="/luckypick" className="btn btn--primary btn--lg">
                <IconClover size={20} aria-hidden />
                Get free picks
              </Link>
              <Link to="/elite" className="btn btn--on-dark btn--lg">
                <IconCrown size={20} aria-hidden />
                See Elite
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="container home-body">
        <div className="stack">
          <PendingPayment />

          <div className="grid-2">
            <article className="card feature-card" data-reveal aria-labelledby="lp-title">
              <div className="feature-card__head">
                <h2 id="lp-title">LuckyPick</h2>
                <span className="pill">Free</span>
              </div>
              <p>
                Two models, XGBoost and Markov, each learn from past draws and give you one pick per draw. Choose any
                date: a birthday, an anniversary, or today.
              </p>
              <div className="feature-card__foot">
                <Link to="/luckypick" className="btn btn--primary">
                  Get free picks <IconArrowRight size={18} aria-hidden />
                </Link>
              </div>
            </article>

            <article className="card feature-card feature-card--elite" data-reveal aria-labelledby="elite-title">
              <div className="feature-card__head">
                <h2 id="elite-title">Elite</h2>
                <span className="pill pill--gold">Premium</span>
              </div>
              <p>
                Several AI agents blend into one premium set. Press <strong>GINTO</strong> to spend 1 token and open your
                Elite picks for 9 AM, 4 PM and 9 PM.
              </p>
              <div className="feature-card__foot">
                <button
                  type="button"
                  className="btn btn--gold"
                  onClick={() => void startGinto()}
                  disabled={gintoBusy}
                  aria-busy={gintoBusy}
                >
                  {gintoBusy ? <span className="spinner" aria-hidden /> : <IconSparkles size={18} aria-hidden />}
                  GINTO
                </button>
                <button type="button" className="btn" onClick={openTopUp}>
                  <IconCoin size={18} aria-hidden />
                  Add tokens
                </button>
                <p className="balance" aria-live="polite">
                  <strong className="tnum">{credits ?? '–'}</strong>
                  {credits === 1 ? 'token' : 'tokens'}
                </p>
              </div>
            </article>
          </div>

          <div className="section-title" data-reveal>
            <h2>Tips and tools</h2>
            <Link to="/tips" className="btn btn--ghost btn--sm">
              All tips <IconChevronRight size={16} aria-hidden />
            </Link>
          </div>
          <div className="grid-3">
            {TIP_TILES.map((t) => (
              <Link key={t.to} to={t.to} className="tile" data-reveal>
                <span className="tile__icon" aria-hidden>
                  <t.icon size={24} />
                </span>
                <span>
                  <strong>{t.title}</strong>
                  <span>{t.text}</span>
                </span>
                <IconChevronRight className="tile__go" size={20} aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
