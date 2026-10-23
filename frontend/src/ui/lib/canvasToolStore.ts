import { create } from 'zustand';

import { announce } from './announcer';

/** Select draws a rectangle on the background. Hand (free navigation) drags the view itself. */
export type CanvasTool = 'select' | 'hand';

interface ToolState {
  tool: CanvasTool;
  /** Space held down turns the hand on for as long as it is held, whatever the tool. */
  spaceHeld: boolean;
  setTool: (tool: CanvasTool) => void;
  setSpaceHeld: (held: boolean) => void;
}

export const useCanvasToolStore = create<ToolState>((set, get) => ({
  tool: 'select',
  spaceHeld: false,
  setTool: (tool) => {
    if (get().tool === tool) return;
    set({ tool });
    announce(
      tool === 'hand'
        ? 'Free navigation on. Drag to move around.'
        : 'Select tool on. Drag to select.'
    );
  },
  setSpaceHeld: (held) => {
    if (get().spaceHeld !== held) set({ spaceHeld: held });
  },
}));

/** Whether a press on the background moves the view right now. */
export function panning(): boolean {
  const { tool, spaceHeld } = useCanvasToolStore.getState();
  return tool === 'hand' || spaceHeld;
}
