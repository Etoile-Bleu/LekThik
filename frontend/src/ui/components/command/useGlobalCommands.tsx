import { useNavigate } from 'react-router-dom';

import { useMyCardsStore } from '@lib/myCardsStore';
import { useCommandSource, useCommandStore } from '@lib/commandStore';
import { usePrefsStore } from '@lib/prefsStore';
import { useWorkspaceStore } from '@lib/workspaceStore';
import { useEffect } from 'react';

import { globalCommands } from './globalCommands';

/**
 * The commands that work on every screen, and the Ctrl+K or Cmd+K key that opens the palette.
 * The cards assigned to the signed in person are read again each time it opens, so they are
 * findable from any board.
 */
export function useGlobalCommands(): void {
  const navigate = useNavigate();
  const open = useCommandStore((state) => state.open);

  useCommandSource(() =>
    globalCommands({
      workspaces: useWorkspaceStore.getState().workspaces,
      myCards: useMyCardsStore.getState().cards,
      prefs: usePrefsStore.getState().prefs,
      navigate,
      updatePrefs: usePrefsStore.getState().update,
      createWorkspace: useWorkspaceStore.getState().createWorkspace,
      createBoard: useWorkspaceStore.getState().createBoard,
    })
  );

  useEffect(() => {
    if (open) void useMyCardsStore.getState().refresh();
  }, [open]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.shiftKey) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      useCommandStore.getState().toggle();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
}
