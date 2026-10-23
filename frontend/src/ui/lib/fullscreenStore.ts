import { create } from 'zustand';

import { announce } from './announcer';

interface FullscreenState {
  /** The app shows only the page: no top bar, and the navigation waits at the left edge. */
  active: boolean;
  /** Whether the browser itself went full screen too, which Escape and F11 can end. */
  real: boolean;
  /** The navigation is slid in over the page, from the left edge. */
  navOpen: boolean;
  enter: () => Promise<void>;
  exit: () => Promise<void>;
  toggle: () => Promise<void>;
  setNavOpen: (open: boolean) => void;
}

/** Fullscreen is offered everywhere the browser allows it, and never required. */
export function canGoFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true;
}

export const useFullscreenStore = create<FullscreenState>((set, get) => ({
  active: false,
  real: false,
  navOpen: false,

  enter: async () => {
    if (get().active) return;
    // The page is cleared first, so the change is instant even if the browser takes a moment
    // or refuses (iPhone, a frame, a policy): the app still hides its chrome then.
    set({ active: true, navOpen: false });
    announce(
      'Full screen. Move the pointer to the left edge, or use the navigation button, to bring the menu back.'
    );
    if (!canGoFullscreen()) return;
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      set({ real: true });
    } catch {
      set({ real: false });
    }
  },

  exit: async () => {
    if (!get().active) return;
    set({ active: false, real: false, navOpen: false });
    announce('Left full screen.');
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Already out.
      }
    }
  },

  toggle: async () => {
    await (get().active ? get().exit() : get().enter());
  },

  setNavOpen: (open) => {
    if (get().active) set({ navOpen: open });
  },
}));

/**
 * Keeps the app in step with the browser: Escape or F11 leave full screen without going through
 * the buttons, and the page must come back with them. Returns the cleanup.
 */
export function watchFullscreen(): () => void {
  const onChange = () => {
    const { active, real } = useFullscreenStore.getState();
    if (active && real && !document.fullscreenElement) {
      useFullscreenStore.setState({ active: false, real: false, navOpen: false });
      announce('Left full screen.');
    }
  };
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
}
