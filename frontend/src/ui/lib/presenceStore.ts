import { create } from 'zustand';

import { announce } from './announcer';
import { API_URL, CLIENT_ID } from './api';
import { type Viewer, fetchPresence, sendPresence } from './boardsApi';
import { usePrefsStore } from './prefsStore';

/** How often a tab says it is still here. The server forgets a tab after 50 seconds of silence. */
export const HEARTBEAT_MS = 20_000;
const REFRESH_DELAY_MS = 120;

interface PresenceState {
  /** The others on the open board, never the person themselves. */
  viewers: Viewer[];
  /** The same people, by the card they have open. */
  byCard: Record<string, Viewer[]>;
  /** Replaces what is known, and says nothing when nothing changed. */
  apply: (viewers: Viewer[]) => void;
  reset: () => void;
}

function key(viewers: Viewer[]): string {
  return viewers.map((viewer) => `${viewer.user_id}:${viewer.card_id ?? ''}`).join('|');
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  viewers: [],
  byCard: {},
  apply: (viewers) => {
    if (key(viewers) === key(get().viewers)) return;
    const byCard: Record<string, Viewer[]> = {};
    for (const viewer of viewers) {
      if (viewer.card_id) (byCard[viewer.card_id] ??= []).push(viewer);
    }
    set({ viewers, byCard });
  },
  reset: () => set({ viewers: [], byCard: {} }),
}));

/** "Wen", "Wen and Rita", "Wen, Rita and 2 others": the way people say it. */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} and ${others} other${others === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------------------------
// The session of the open board: who I am, where I am, and keeping both fresh.
// ---------------------------------------------------------------------------------------------

let boardId: string | null = null;
let meId: string | null = null;
let openCard: string | null = null;
let heartbeat: number | undefined;
let refreshTimer: number | undefined;
let announceTimer: number | undefined;
let stopListening: (() => void) | undefined;
let known = new Map<string, string>();
let first = true;

function hidden(): boolean {
  return usePrefsStore.getState().prefs.hide_presence;
}

async function report(present: boolean): Promise<void> {
  if (!boardId) return;
  try {
    await sendPresence(boardId, { client_id: CLIENT_ID, card_id: openCard, present });
  } catch {
    // Being seen is a courtesy: a failure here must never get in the way of the work.
  }
}

/** A last word as the page goes away: a normal request may be cancelled, a keepalive one is not. */
function leaveWithTheWind() {
  if (!boardId) return;
  try {
    void fetch(`${API_URL}/api/boards/${boardId}/presence`, {
      method: 'PUT',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': CLIENT_ID },
      body: JSON.stringify({ client_id: CLIENT_ID, card_id: null, present: false }),
    });
  } catch {
    // Nothing to do: the server forgets this tab on its own.
  }
}

function tellAboutArrivals(next: Viewer[]) {
  const now = new Map(next.map((viewer) => [viewer.user_id, viewer.username]));
  if (!first && usePrefsStore.getState().prefs.announce_changes) {
    const arrived = next
      .filter((viewer) => !known.has(viewer.user_id))
      .map((viewer) => viewer.username);
    const left = [...known.entries()].filter(([id]) => !now.has(id)).map(([, name]) => name);
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      if (arrived.length > 0) {
        announce(`${nameList(arrived)} ${arrived.length === 1 ? 'is' : 'are'} on this board.`);
      } else if (left.length > 0) {
        announce(`${nameList(left)} left this board.`);
      }
    }, 1500);
  }
  known = now;
  first = false;
}

async function refresh(): Promise<void> {
  const current = boardId;
  if (!current) return;
  try {
    const { viewers } = await fetchPresence(current);
    if (boardId !== current) return;
    const others = viewers.filter((viewer) => viewer.user_id !== meId);
    tellAboutArrivals(others);
    usePresenceStore.getState().apply(others);
  } catch {
    // The next event or heartbeat tries again.
  }
}

/** Asks for the crowd again soon, so a burst of arrivals is one request. */
export function refreshPresenceSoon(forBoard: string): void {
  if (forBoard !== boardId) return;
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void refresh(), REFRESH_DELAY_MS);
}

function beat() {
  if (hidden() || document.visibilityState === 'hidden') return;
  void report(true);
}

/** Begins being on a board: reports now, then every 20 seconds, and follows the tab being hidden. */
export function startPresence(board: string, me: string): void {
  stopPresence();
  boardId = board;
  meId = me;
  openCard = null;
  first = true;
  known = new Map();
  beat();
  void refresh();
  heartbeat = window.setInterval(beat, HEARTBEAT_MS);

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      void report(false);
    } else {
      beat();
      void refresh();
    }
  };
  const onHide = () => leaveWithTheWind();
  const unsubscribe = usePrefsStore.subscribe((state, previous) => {
    if (state.prefs.hide_presence === previous.prefs.hide_presence) return;
    if (state.prefs.hide_presence) void report(false);
    else beat();
  });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onHide);
  stopListening = () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onHide);
    unsubscribe();
  };
}

/** Says which card is open, or none, so the others see where this person is looking. */
export function setPresenceCard(card: string | null): void {
  if (openCard === card) return;
  openCard = card;
  beat();
}

/** Leaves the board: the others stop seeing this person at once. */
export function stopPresence(): void {
  if (!boardId) return;
  window.clearInterval(heartbeat);
  window.clearTimeout(refreshTimer);
  window.clearTimeout(announceTimer);
  stopListening?.();
  stopListening = undefined;
  if (!hidden()) void report(false);
  boardId = null;
  meId = null;
  openCard = null;
  usePresenceStore.getState().reset();
}
