import { useSelectionStore } from '@lib/selectionStore';
import { isCardList } from '@lib/blocks';
import type { BoardList } from '@lib/boardsApi';

import {
  CalendarIcon,
  CloseIcon,
  CopyIcon,
  FolderMoveIcon,
  TrashIcon,
  UsersIcon,
} from '../ui/Icons';
import { Menu } from '../ui/Menu';
import './SelectionBar.css';

interface SelectionBarProps {
  panels: BoardList[];
  meId: string | undefined;
  today: string;
  tomorrow: string;
  nextWeek: string;
  editable: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveTo: (listId: string) => void;
  onDueDate: (day: string | null) => void;
  onAssignMe: () => void;
}

/**
 * What can be done with everything that is picked, in one place that appears as soon as something
 * is: copy it, move it, date it, take it, delete it, or put the selection down.
 */
export function SelectionBar({
  panels,
  meId,
  today,
  tomorrow,
  nextWeek,
  editable,
  onDuplicate,
  onDelete,
  onMoveTo,
  onDueDate,
  onAssignMe,
}: SelectionBarProps) {
  const cards = useSelectionStore((state) => state.cards);
  const picked = useSelectionStore((state) => state.panels);
  const clear = useSelectionStore((state) => state.clear);
  const total = cards.length + picked.length;
  if (total === 0) return null;

  const lists = panels.filter(isCardList);
  const words = [
    cards.length > 0 ? `${cards.length} card${cards.length === 1 ? '' : 's'}` : null,
    picked.length > 0
      ? `${picked.length} ${picked.length === 1 ? 'list or block' : 'lists and blocks'}`
      : null,
  ]
    .filter(Boolean)
    .join(' and ');

  return (
    <div className="selection-bar" role="toolbar" aria-label="Actions for the selection">
      <span className="selection-bar__count">{words} selected</span>
      {editable && (
        <>
          <button type="button" className="selection-bar__button" onClick={onDuplicate}>
            <CopyIcon size={16} />
            Duplicate
          </button>
          {cards.length > 0 && (
            <>
              <Menu
                label="Move to"
                triggerClassName="selection-bar__button"
                trigger={
                  <>
                    <FolderMoveIcon size={16} />
                    Move to
                  </>
                }
                items={lists.map((list) => ({
                  label: list.name,
                  onSelect: () => onMoveTo(list.id),
                }))}
              />
              <Menu
                label="Due date"
                triggerClassName="selection-bar__button"
                trigger={
                  <>
                    <CalendarIcon size={16} />
                    Due date
                  </>
                }
                items={[
                  { label: 'Today', onSelect: () => onDueDate(today) },
                  { label: 'Tomorrow', onSelect: () => onDueDate(tomorrow) },
                  { label: 'Next week', onSelect: () => onDueDate(nextWeek) },
                  { label: 'Clear the date', onSelect: () => onDueDate(null) },
                ]}
              />
              {meId && (
                <button type="button" className="selection-bar__button" onClick={onAssignMe}>
                  <UsersIcon size={16} />
                  Assign to me
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="selection-bar__button selection-bar__button--danger"
            onClick={onDelete}
          >
            <TrashIcon size={16} />
            Delete
          </button>
        </>
      )}
      <button
        type="button"
        className="selection-bar__button selection-bar__button--quiet"
        onClick={clear}
      >
        <CloseIcon size={16} />
        <span className="sr-only">Clear the selection</span>
      </button>
    </div>
  );
}
