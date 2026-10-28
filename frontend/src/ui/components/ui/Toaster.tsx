import { useEffect, useState } from 'react';

import { TOAST_LIFETIME_MS, type Toast, useToastStore } from '@lib/toastStore';

import { CloseIcon } from './Icons';
import './Toaster.css';

/**
 * A notification that goes away by itself, but never while you are reading it:
 * the clock stops while the pointer is over it or keyboard focus is inside it.
 */
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) {
      return undefined;
    }
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_LIFETIME_MS[toast.tone]);
    return () => window.clearTimeout(timer);
  }, [paused, toast.id, toast.tone, onDismiss]);

  return (
    <div
      className={`toast toast--${toast.tone}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className="toast__message">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="icon-button toast__close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        <CloseIcon size={16} />
      </button>
      <div
        className="toast__bar"
        aria-hidden="true"
        style={{
          animationDuration: `${TOAST_LIFETIME_MS[toast.tone]}ms`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
      />
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div className="toaster" role="status" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}
