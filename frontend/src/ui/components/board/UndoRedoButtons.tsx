import { redoLast, undoLast, useHistoryStore } from '@lib/history';

import { RedoIcon, UndoIcon } from '../ui/Icons';
import './UndoRedoButtons.css';

const MAC = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);

export function UndoRedoButtons() {
  const past = useHistoryStore((state) => state.past);
  const future = useHistoryStore((state) => state.future);
  const busy = useHistoryStore((state) => state.busy);
  const lastUndo = past[past.length - 1]?.label;
  const lastRedo = future[future.length - 1]?.label;

  return (
    <div className="undo-redo" role="group" aria-label="History">
      <button
        type="button"
        className="undo-redo__button"
        disabled={!lastUndo || busy}
        aria-label={lastUndo ? `Undo ${lastUndo}` : 'Undo'}
        title={`${lastUndo ? `Undo: ${lastUndo}` : 'Nothing to undo'} (${MAC ? '⌘Z' : 'Ctrl+Z'})`}
        onClick={() => void undoLast()}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        className="undo-redo__button"
        disabled={!lastRedo || busy}
        aria-label={lastRedo ? `Redo ${lastRedo}` : 'Redo'}
        title={`${lastRedo ? `Redo: ${lastRedo}` : 'Nothing to redo'} (${MAC ? '⌘⇧Z' : 'Ctrl+Y'})`}
        onClick={() => void redoLast()}
      >
        <RedoIcon />
      </button>
    </div>
  );
}
