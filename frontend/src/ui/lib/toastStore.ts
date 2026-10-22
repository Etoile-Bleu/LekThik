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

const TOAST_LIFETIME_MS = 5000;
let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (tone, message) => {
    const id = nextId;
    nextId += 1;
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, tone, message }] }));
    window.setTimeout(() => get().dismiss(id), TOAST_LIFETIME_MS);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export function notifyError(error: unknown, fallback = 'Something went wrong, try again.'): void {
  const message = error instanceof Error && error.message ? error.message : fallback;
  useToastStore.getState().push('error', message);
}
