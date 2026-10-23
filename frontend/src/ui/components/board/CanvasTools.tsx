import { createPortal } from 'react-dom';

import { useCanvasToolStore } from '@lib/canvasToolStore';

import { CursorIcon, HandIcon } from '../ui/Icons';
import './CanvasTools.css';

/**
 * The two ways a press on the background of a board can work: drawing a rectangle to select, or
 * moving the view around, like the select and hand tools of a diagram editor. They sit in the dock
 * at the bottom right, beside the full screen buttons.
 */
export function CanvasTools() {
  const tool = useCanvasToolStore((state) => state.tool);
  const spaceHeld = useCanvasToolStore((state) => state.spaceHeld);
  const setTool = useCanvasToolStore((state) => state.setTool);
  const hand = tool === 'hand' || spaceHeld;

  const tools = (
    <div className="canvas-tools" role="group" aria-label="Tool">
      <button
        type="button"
        className="canvas-tools__button"
        aria-pressed={!hand}
        aria-keyshortcuts="V"
        title="Select: drag on the background to draw a rectangle (V)"
        onClick={() => setTool('select')}
      >
        <CursorIcon size={16} />
        <span>Select</span>
      </button>
      <button
        type="button"
        className="canvas-tools__button"
        aria-pressed={hand}
        aria-keyshortcuts="H"
        title="Free navigation: drag to move around (H turns it on and off, or hold Space)"
        onClick={() => setTool(tool === 'hand' ? 'select' : 'hand')}
      >
        <HandIcon size={16} />
        <span>Free navigation</span>
      </button>
    </div>
  );

  const dock = typeof document === 'undefined' ? null : document.getElementById('shell-dock');
  return dock ? createPortal(tools, dock) : tools;
}
