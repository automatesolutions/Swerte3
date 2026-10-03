import { StrictMode } from 'react';
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
import { LuckyPick } from './pages/LuckyPick';
import { Elite } from './pages/Elite';
import { Tips } from './pages/Tips';
import { Cognitive } from './pages/Cognitive';
import { AnalyticsFeature, AnalyticsHub } from './pages/Analytics';
import { CheckoutDone } from './pages/CheckoutDone';

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
