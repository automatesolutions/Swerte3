import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import './styles/app.css';
import { ToastProvider } from './components/Toast';
import { AppShell, initTheme } from './components/AppShell';
import { SessionProvider } from './state/session';
import { WalletProvider } from './state/wallet';
import { Welcome } from './pages/Welcome';
import { Profile } from './pages/Profile';
import { Home } from './pages/Home';
import { API_BASE } from './lib/api';
import { wakeApi } from './lib/jev';

// Start a cold API instance now, in parallel with React rendering and the bootstrap calls.
wakeApi(API_BASE);

// Only the first screens ship in the main bundle; the rest load when opened.
const LuckyPick = lazy(() => import('./pages/LuckyPick').then((m) => ({ default: m.LuckyPick })));
const Elite = lazy(() => import('./pages/Elite').then((m) => ({ default: m.Elite })));
const Tips = lazy(() => import('./pages/Tips').then((m) => ({ default: m.Tips })));
const Cognitive = lazy(() => import('./pages/Cognitive').then((m) => ({ default: m.Cognitive })));
const AnalyticsHub = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.AnalyticsHub })));
const AnalyticsFeature = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.AnalyticsFeature })));
const CheckoutDone = lazy(() => import('./pages/CheckoutDone').then((m) => ({ default: m.CheckoutDone })));

initTheme();

function NotFound() {
  return (
    <div className="center-state">
      <h1 style={{ fontSize: 'var(--text-3xl)' }}>Page not found</h1>
      <p>That link doesn't go anywhere in Swerte3.</p>
      <Link to="/" className="btn btn--primary">
        Go to Home
      </Link>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <WalletProvider>
            <Routes>
              <Route path="/welcome" element={<Welcome />} />
              <Route element={<AppShell />}>
                <Route path="/profile" element={<Profile />} />
                <Route path="/" element={<Home />} />
                <Route path="/luckypick" element={<LuckyPick />} />
                <Route path="/elite" element={<Elite />} />
                <Route path="/tips" element={<Tips />} />
                <Route path="/litrato" element={<Navigate to="/tips" replace />} />
                <Route path="/cognitive" element={<Cognitive />} />
                <Route path="/analytics" element={<AnalyticsHub />} />
                <Route path="/analytics/:kind" element={<AnalyticsFeature />} />
                <Route path="/checkout-done" element={<CheckoutDone />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </WalletProvider>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
