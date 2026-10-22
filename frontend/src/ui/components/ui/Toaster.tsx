import { useToastStore } from '@lib/toastStore';

import { CloseIcon } from './Icons';
import './Toaster.css';

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div className="toaster" role="status" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          <p className="toast__message">{toast.message}</p>
          <button
            type="button"
            className="icon-button toast__close"
            aria-label="Dismiss notification"
            onClick={() => dismiss(toast.id)}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
