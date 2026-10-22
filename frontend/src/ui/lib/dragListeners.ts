import type { useSortable } from '@dnd-kit/sortable';
import type { KeyboardEventHandler } from 'react';

type SortableListeners = ReturnType<typeof useSortable>['listeners'];

export function splitDragListeners(listeners: SortableListeners) {
  const { onKeyDown, ...pointer } = listeners ?? {};

  return {
    onKeyDown: onKeyDown as KeyboardEventHandler<HTMLElement> | undefined,
    pointer,
  };
}
