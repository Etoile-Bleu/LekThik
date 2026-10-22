import { create } from 'zustand';

import { API_URL, CLIENT_ID, whenWritesSettle } from './api';
import { useBoardStore } from './boardStore';
import { useInvitationStore } from './invitationStore';
import { useMembersStore } from './membersStore';
import { useWorkspaceStore } from './workspaceStore';

export type LiveStatus = 'off' | 'connecting' | 'live' | 'reconnecting';

interface LiveState {
  status: LiveStatus;
  set: (status: LiveStatus) => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  status: 'off',
  set: (status) => set({ status }),
}));

interface ChangePayload {
  workspace_id: string | null;
  board_id: string | null;
  user_id: string | null;
  origin: string | null;
}

const REFRESH_DELAY_MS = 150;

function parse(event: Event): ChangePayload | null {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as ChangePayload;
  } catch {
    return null;
  }
}

/** Reloads everything shown on screen, used after a (re)connection or a gap. */
function refreshAll() {
  void useWorkspaceStore.getState().load();
  void useInvitationStore.getState().load();
  void useMembersStore.getState().refresh();
  void useBoardStore.getState().refresh();
}

/**
 * Opens the server-sent events stream and turns each notification into a
 * refetch of the data it concerns. Events carry identifiers only, so a missed
 * or duplicated one costs at most one extra request. Returns a stop function.
 */
export function startRealtime(): () => void {
  if (typeof EventSource === 'undefined') {
    return () => undefined;
  }

  const live = useLiveStore.getState();
  live.set('connecting');

  const source = new EventSource(`${API_URL}/api/events`, { withCredentials: true });
  let boardTimer: number | undefined;
  let hasConnected = false;

  const ownEcho = (payload: ChangePayload | null) => payload?.origin === CLIENT_ID;

  const scheduleBoardRefresh = () => {
    window.clearTimeout(boardTimer);
    boardTimer = window.setTimeout(() => {
      void whenWritesSettle().then(() => useBoardStore.getState().refresh());
    }, REFRESH_DELAY_MS);
  };

  source.addEventListener('ready', () => {
    live.set('live');
    if (hasConnected) {
      refreshAll();
    }
    hasConnected = true;
  });

  source.addEventListener('resync', refreshAll);

  source.addEventListener('board', (event) => {
    const payload = parse(event);
    if (ownEcho(payload)) return;
    const current = useBoardStore.getState().view?.board.id;
    if (payload?.board_id && payload.board_id === current) {
      scheduleBoardRefresh();
    }
  });

  source.addEventListener('workspace', (event) => {
    if (ownEcho(parse(event))) return;
    void useWorkspaceStore.getState().load();
    scheduleBoardRefresh();
  });

  source.addEventListener('workspaces', () => {
    void useWorkspaceStore.getState().load();
  });

  source.addEventListener('members', (event) => {
    const payload = parse(event);
    void useMembersStore.getState().refresh();
    // Own actions already reloaded what they changed.
    if (!ownEcho(payload)) {
      void useWorkspaceStore.getState().load();
      scheduleBoardRefresh();
    }
  });

  source.addEventListener('invitations', () => {
    void useInvitationStore.getState().load();
  });

  source.onerror = () => {
    // EventSource reconnects by itself; show it while it does.
    live.set(source.readyState === EventSource.CLOSED ? 'off' : 'reconnecting');
  };

  return () => {
    window.clearTimeout(boardTimer);
    source.close();
    live.set('off');
  };
}
