import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconX } from '@tabler/icons-react';

export type ToastTone = 'ok' | 'info' | 'warn' | 'danger';
type Toast = { id: number; tone: ToastTone; title: string; body?: string };
type ToastApi = { show: (t: Omit<Toast, 'id'>) => void };

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { ok: IconCircleCheck, info: IconInfoCircle, warn: IconAlertTriangle, danger: IconAlertTriangle };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.tone === 'danger' ? 9000 : 6000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div key={t.id} className={`toast toast--${t.tone}`}>
              <Icon className="toast__icon" size={22} aria-hidden />
              <div>
                <strong>{t.title}</strong>
                {t.body ? <p>{t.body}</p> : null}
              </div>
              <button type="button" className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <IconX size={18} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
