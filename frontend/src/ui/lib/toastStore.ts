import { create } from 'zustand';

export type ToastTone = 'error' | 'success' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (tone: ToastTone, message: string) => void;
  dismiss: (id: number) => void;
}

/** How long each kind stays. Errors get more time because people act on them. */
export const TOAST_LIFETIME_MS: Record<ToastTone, number> = {
  error: 12000,
  success: 6000,
  info: 8000,
};

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (tone, message) => {
    const id = nextId;
    nextId += 1;
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, tone, message }] }));
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export function notifyError(error: unknown, fallback = 'Something went wrong, try again.'): void {
  const message = error instanceof Error && error.message ? error.message : fallback;
  useToastStore.getState().push('error', message);
}

export function notifySuccess(message: string): void {
  useToastStore.getState().push('success', message);
}
