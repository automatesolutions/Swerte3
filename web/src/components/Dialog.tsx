import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconX } from '@tabler/icons-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Disables Esc / backdrop close while work is in flight. */
  busy?: boolean;
  variant?: 'default' | 'full';
  /** Hide the built-in heading (when children render their own bar). */
  hideHead?: boolean;
};

/** Native <dialog>: focus trap, Esc to close and inert background come from the browser. */
export function Dialog({ open, onClose, title, children, busy, variant = 'default', hideHead }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog${variant === 'full' ? ' dialog--full' : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy && variant !== 'full') onClose();
      }}
    >
      {hideHead ? (
        <>
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
          {open ? children : null}
        </>
      ) : (
        <div className="dialog__body">
          <div className="dialog__head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn dialog__close" onClick={onClose} disabled={busy} aria-label="Close">
              <IconX size={20} />
            </button>
          </div>
          {open ? children : null}
        </div>
      )}
    </dialog>
  );
}
