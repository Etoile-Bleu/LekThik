import { create } from 'zustand';

export type ToastTone = 'error' | 'success' | 'info' | 'action';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  push: (tone: ToastTone, message: string, action?: ToastAction) => number;
  dismiss: (id: number) => void;
}

/** How long each kind stays. Errors get more time because people act on them, and a toast with
 * a choice to make (Undo) gets the most, so nobody has to rush a decision. */
export const TOAST_LIFETIME_MS: Record<ToastTone, number> = {
  error: 12000,
  success: 6000,
  info: 8000,
  action: 10000,
};

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (tone, message, action) => {
    const id = nextId;
    nextId += 1;
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, tone, message, action }] }));
    return id;
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

/**
 * A notice with its own Undo button, for something already done that a person may not have
 * meant: nothing blocks them first, and nothing asks them to remember a shortcut. The toast
 * itself is dismissed as soon as its button is pressed; left alone, it fades on its own and
 * the change stands.
 */
export function notifyUndo(message: string, onUndo: () => void): void {
  useToastStore.getState().push('action', message, { label: 'Undo', onClick: onUndo });
}
