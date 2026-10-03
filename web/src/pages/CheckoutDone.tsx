import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IconCircleCheck, IconCircleX, IconHourglass } from '@tabler/icons-react';
import { useSession } from '../state/session';
import { useWallet } from '../state/wallet';

/** GCash checkout sends the browser back here (success and cancel). */
export function CheckoutDone() {
  const [params] = useSearchParams();
  const cancelled = params.get('status') === 'cancelled';
  const { account } = useSession();
  const { pendingGcash, confirmGcash, dismissPending, confirmBusy } = useWallet();
  const [result, setResult] = useState<'working' | 'ok' | 'pending' | 'none' | 'cancelled'>(
    cancelled ? 'cancelled' : pendingGcash ? 'working' : 'none',
  );
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !account) return;
    ran.current = true;
    if (cancelled) {
      dismissPending();
      return;
    }
    if (!pendingGcash) return;
    void confirmGcash().then((ok) => setResult(ok ? 'ok' : 'pending'));
  }, [account, cancelled, confirmGcash, dismissPending, pendingGcash]);

  const view = {
    working: { icon: IconHourglass, title: 'Confirming your payment…', body: 'This takes a few seconds.' },
    ok: { icon: IconCircleCheck, title: 'Tokens added', body: `Your balance is ${account?.credits ?? 0} tokens.` },
    pending: {
      icon: IconHourglass,
      title: 'Payment still processing',
      body: 'GCash has not confirmed it yet. Wait a few seconds, then select Confirm GCash payment.',
    },
    none: { icon: IconCircleCheck, title: 'Nothing to confirm', body: 'There is no payment waiting on this browser.' },
    cancelled: { icon: IconCircleX, title: 'Checkout cancelled', body: 'No money was taken. You can top up again any time.' },
  }[result];

  return (
    <div className="container container--narrow page">
      <div className="card" style={{ textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 'var(--s-4)' }} role="status">
        <view.icon size={48} stroke={1.5} aria-hidden style={{ color: result === 'cancelled' ? 'var(--muted)' : 'var(--brand-text)' }} />
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>{view.title}</h1>
        <p style={{ color: 'var(--ink-2)' }}>{view.body}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {result === 'pending' ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={confirmBusy}
              onClick={() => void confirmGcash().then((ok) => ok && setResult('ok'))}
            >
              {confirmBusy ? <span className="spinner" aria-hidden /> : null}
              Confirm GCash payment
            </button>
          ) : null}
          <Link to="/" className={result === 'pending' ? 'btn' : 'btn btn--primary'}>
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
