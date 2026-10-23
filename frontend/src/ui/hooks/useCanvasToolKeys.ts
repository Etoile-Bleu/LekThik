import { useEffect } from 'react';

import { useCanvasToolStore } from '@lib/canvasToolStore';
import { hasSelection, useSelectionStore } from '@lib/selectionStore';

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  );
}

function pressable(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('button, a, summary, [role="menuitem"]') !== null
  );
}

/**
 * The keys of the canvas tools: hold Space to move the view, H for the hand and V for the select
 * tool, Escape to put the selection down, and Ctrl or Cmd with A to pick every card. They stay out of
 * the way of text fields, of buttons (which Space presses) and of dialogs.
 */
export function useCanvasToolKeys(options: {
  enabled: boolean;
  selectAll: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}): void {
  const { enabled, selectAll, onDelete, onDuplicate } = options;

  useEffect(() => {
    if (!enabled) return undefined;
    const { setTool, setSpaceHeld } = useCanvasToolStore.getState();

    function dialogOpen(): boolean {
      return document.querySelector('dialog[open]') !== null;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || typing(event.target) || dialogOpen()) return;
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;

      if (event.key === ' ' && plain && !pressable(event.target)) {
        if (!event.repeat) setSpaceHeld(true);
        event.preventDefault();
        return;
      }
      if (plain && !event.shiftKey && event.key.toLowerCase() === 'h') {
        setTool(useCanvasToolStore.getState().tool === 'hand' ? 'select' : 'hand');
      } else if (plain && !event.shiftKey && event.key.toLowerCase() === 'v') setTool('select');
      else if (event.key === 'Escape' && hasSelection()) useSelectionStore.getState().clear();
      else if ((event.key === 'Delete' || event.key === 'Backspace') && plain && hasSelection()) {
        event.preventDefault();
        onDelete();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'd' &&
        hasSelection()
      ) {
        event.preventDefault();
        onDuplicate();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'a'
      ) {
        event.preventDefault();
        selectAll();
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.key === ' ') setSpaceHeld(false);
    }

    function release() {
      setSpaceHeld(false);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
      release();
    };
  }, [enabled, selectAll, onDelete, onDuplicate]);
}
