import { create } from 'zustand';

import type { EmbedProvider } from './boardsApi';

const KEY = 'lekthik.embeds.v1';

type Allowed = Partial<Record<EmbedProvider, boolean>>;

function read(): Allowed {
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Allowed;
    return {
      youtube: stored.youtube === true,
      vimeo: stored.vimeo === true,
      google_calendar: stored.google_calendar === true,
    };
  } catch {
    return {};
  }
}

function write(allowed: Allowed) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(allowed));
  } catch {
    // Private windows and blocked storage mean the choice is simply not remembered.
  }
}

interface ConsentState {
  allowed: Allowed;
  /** Remember, on this device only, that content from this provider may be loaded without asking. */
  allow: (provider: EmbedProvider) => void;
  /** Take the choice back. It is as easy to withdraw as it was to give. */
  withdraw: (provider: EmbedProvider) => void;
  withdrawAll: () => void;
}

/**
 * Outside content is only requested after a press on a button. People may ask for that choice to
 * be remembered, and it is kept in this browser only, never sent to LekThik. That is the whole
 * record: what is allowed, per provider, and nothing about what was watched.
 */
export const useEmbedConsent = create<ConsentState>((set, get) => ({
  allowed: read(),
  allow: (provider) => {
    const allowed = { ...get().allowed, [provider]: true };
    write(allowed);
    set({ allowed });
  },
  withdraw: (provider) => {
    const allowed = { ...get().allowed, [provider]: false };
    write(allowed);
    set({ allowed });
  },
  withdrawAll: () => {
    write({});
    set({ allowed: {} });
  },
}));
