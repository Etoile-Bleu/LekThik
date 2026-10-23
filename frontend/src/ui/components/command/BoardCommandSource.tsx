import { useCommandSource } from '@lib/commandStore';

import { type BoardCommandContext, boardCommands } from './boardCommands';

/** Offers the commands of the open board to the palette for as long as it is on screen. */
export function BoardCommandSource({ context }: { context: BoardCommandContext }) {
  useCommandSource(() => boardCommands(context));
  return null;
}
