import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  IconBulb,
  IconChartDots3,
  IconClover,
  IconCrown,
  IconDeviceDesktop,
  IconHome,
  IconMoon,
  IconPlayerPlay,
  IconRefresh,
  IconSun,
  IconUserEdit,
  type Icon,
} from '@tabler/icons-react';
import { HOME_ENTERTAINMENT_CAPTION, HOME_ENTERTAINMENT_CAPTION_TL } from '../lib/disclaimers';
import { lsGet, lsSet } from '../lib/storage';
import { API_BASE } from '../lib/api';
import { hasSeenIntro, useSession } from '../state/session';
import { useWallet } from '../state/wallet';

type NavItem = { to: string; label: string; icon: Icon; elite?: boolean; match?: string[] };

export const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: IconHome },
  { to: '/luckypick', label: 'LuckyPick', icon: IconClover },
  { to: '/elite', label: 'Elite', icon: IconCrown, elite: true },
  { to: '/tips', label: 'Tips', icon: IconBulb, match: ['/tips', '/cognitive'] },
  { to: '/analytics', label: 'Analytics', icon: IconChartDots3 },
];

type Theme = 'system' | 'light' | 'dark';
const THEME_KEY = 'swerte3_theme';

function applyTheme(t: Theme) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

export function initTheme() {
  const t = lsGet(THEME_KEY);
  if (t === 'light' || t === 'dark') applyTheme(t);
}

function isActive(item: NavItem, path: string): boolean {
  if (item.to === '/') return path === '/';
  return (item.match ?? [item.to]).some((p) => path === p || path.startsWith(`${p}/`));
}

function AccountMenu() {
  const { account } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (lsGet(THEME_KEY) as Theme) || 'system');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chooseTheme = (t: Theme) => {
    setTheme(t);
    lsSet(THEME_KEY, t);
    applyTheme(t);
  };

  const initial = (account?.alias ?? '?').slice(0, 1);

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Account${account?.alias ? `: ${account.alias}` : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar" aria-hidden>
          {initial}
        </span>
      </button>
      {open ? (
        <div className="menu__panel">
          <div className="menu__who">
            <strong>{account?.alias ?? 'Guest'}</strong>
            <span className="tnum">{account?.phone ?? 'No mobile number yet'}</span>
          </div>
          <button
            type="button"
            className="menu__item"
            onClick={() => {
              setOpen(false);
              navigate('/profile?from=home');
            }}
          >
            <IconUserEdit size={20} aria-hidden /> Edit profile
          </button>
          <button
            type="button"
            className="menu__item"
            onClick={() => {
              setOpen(false);
              navigate('/welcome');
            }}
          >
            <IconPlayerPlay size={20} aria-hidden /> Replay intro video
          </button>
          <p className="menu__group-label" id="theme-label">
            Theme
          </p>
          <div className="theme-switch segmented" role="radiogroup" aria-labelledby="theme-label">
            {(
              [
                ['system', 'Auto', IconDeviceDesktop],
                ['light', 'Light', IconSun],
                ['dark', 'Dark', IconMoon],
              ] as const
            ).map(([value, label, Ico]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                onClick={() => chooseTheme(value)}
                style={{ minWidth: 0, display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ico size={16} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TokenChip() {
  const { account } = useSession();
  const { openTopUp } = useWallet();
  const n = account?.credits;
  return (
    <button
      type="button"
      className="token-chip tnum"
      onClick={openTopUp}
      aria-label={`${n ?? 'Unknown'} tokens. Add tokens`}
    >
      <span className="token-chip__coin" aria-hidden>
        ₱
      </span>
      {n ?? '–'}
      <span className="token-chip__label">tokens</span>
    </button>
  );
}

function Gate() {
  const { status, error, account, refresh } = useSession();
  const { pathname } = useLocation();

  if (!hasSeenIntro()) return <Navigate to="/welcome" replace />;

  if (status === 'loading' && !account) {
    return (
      <div className="center-state" aria-busy="true">
        <span className="spinner" aria-hidden />
        <p>Loading your account…</p>
      </div>
    );
  }

  if (status === 'error' && !account) {
    return (
      <div className="container container--narrow page">
        <div className="notice notice--danger" role="alert">
          <IconRefresh size={22} aria-hidden />
          <div>
            <strong>We couldn't load your account</strong>
            <p>{error}</p>
            <p className="hint" style={{ marginTop: 8 }}>
              This app talks to the Swerte3 API at <code>{API_BASE}</code>. If you run it locally, start the backend, or
              set <code>VITE_API_URL</code> in <code>web/.env.local</code>.
            </p>
            <div className="notice__actions">
              <button type="button" className="btn btn--primary" onClick={() => void refresh()}>
                <IconRefresh size={18} aria-hidden /> Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (account?.needsProfile && pathname !== '/profile') {
    return <Navigate to={`/profile?from=complete_profile&next=${encodeURIComponent(pathname)}`} replace />;
  }

  return <Outlet />;
}

export function AppShell() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <div className="container app-header__inner">
          <Link to="/" className="brand" aria-label="Swerte3 home">
            <img src="/logo-192.webp" alt="" width={40} height={40} />
            <span>Swerte3</span>
          </Link>
          <nav className="top-nav" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={item.elite ? 'is-elite' : undefined}
                aria-current={isActive(item, pathname) ? 'page' : undefined}
              >
                <item.icon size={18} aria-hidden />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <TokenChip />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main id="main" className="app-main" tabIndex={-1}>
        <Gate />
        <footer className="app-footer">
          <div className="container app-footer__inner">
            <p>
              {HOME_ENTERTAINMENT_CAPTION} Not affiliated with PCSO.
              <em lang="tl">{HOME_ENTERTAINMENT_CAPTION_TL}</em>
            </p>
            <span className="age-badge" aria-label="For ages 18 and up">
              18+
            </span>
          </div>
        </footer>
      </main>

      <nav className="tab-bar" aria-label="Main">
        {NAV.map((item) => {
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={item.elite ? 'is-elite' : undefined}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon size={24} stroke={active ? 2.2 : 1.6} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
