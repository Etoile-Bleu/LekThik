import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useId } from 'react';

import type { BoardList as BoardListData, CardSummary, Label } from '@lib/boardsApi';
import { splitDragListeners } from '@lib/dragListeners';

import { Composer } from '../ui/Composer';
import { ArrowLeftIcon, ArrowRightIcon, GripIcon, TrashIcon } from '../ui/Icons';
import { InlineEdit } from '../ui/InlineEdit';
import { Menu } from '../ui/Menu';
import { BoardCard } from './BoardCard';
import './BoardList.css';

interface BoardListProps {
  list: BoardListData;
  index: number;
  total: number;
  labelsById: Map<string, Label>;
  matches: (card: CardSummary) => boolean;
  freshIds: string[];
  onRename: (listId: string, name: string) => void;
  onMove: (listId: string, index: number) => void;
  onDelete: (listId: string) => void;
  onAddCard: (listId: string, title: string) => Promise<unknown>;
  onOpenCard: (cardId: string) => void;
  readOnly?: boolean;
}

export function ListFace({ list, count }: { list: BoardListData; count: number }) {
  return (
    <div className="board-list board-list--overlay">
      <div className="board-list__header">
        <h2 className="board-list__name">{list.name}</h2>
        <span className="board-list__count">{count}</span>
      </div>
    </div>
  );
}

export function BoardList({
  list,
  index,
  total,
  labelsById,
  matches,
  freshIds,
  onRename,
  onMove,
  onDelete,
  onAddCard,
  onOpenCard,
  readOnly = false,
}: BoardListProps) {
  const headingId = useId();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: list.id,
    data: { type: 'list' },
    disabled: readOnly,
  });

  const { onKeyDown, pointer: pointerListeners } = splitDragListeners(listeners);
  const cardIds = list.cards.map((card) => card.id);

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="board-list"
      aria-labelledby={headingId}
      data-fresh={freshIds.includes(list.id) || undefined}
      data-dragging={isDragging || undefined}
    >
      <div className="board-list__header" {...(readOnly ? {} : pointerListeners)}>
        {!readOnly && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="board-list__grip"
            aria-label={`Reorder list ${list.name}`}
            onKeyDown={onKeyDown}
            {...attributes}
          >
            <GripIcon size={16} />
          </button>
        )}
        <div className="board-list__title" id={headingId}>
          <InlineEdit
            as="h2"
            className="board-list__name"
            value={list.name}
            label="list name"
            readOnly={readOnly}
            onCommit={(name) => onRename(list.id, name)}
          />
        </div>
        <span className="board-list__count" aria-label={`${list.cards.length} cards`}>
          {list.cards.length}
        </span>
        {!readOnly && (
          <Menu
            label={`Actions for list ${list.name}`}
            items={[
              {
                label: 'Move left',
                icon: <ArrowLeftIcon />,
                disabled: index === 0,
                onSelect: () => onMove(list.id, index - 1),
              },
              {
                label: 'Move right',
                icon: <ArrowRightIcon />,
                disabled: index === total - 1,
                onSelect: () => onMove(list.id, index + 1),
              },
              {
                label: 'Delete list',
                icon: <TrashIcon />,
                tone: 'danger',
                onSelect: () => onDelete(list.id),
              },
            ]}
          />
        )}
      </div>

      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <ul className="board-list__cards">
          {list.cards.map((card) => (
            <BoardCard
              key={card.id}
              card={card}
              labels={card.label_ids
                .map((id) => labelsById.get(id))
                .filter((label): label is Label => label !== undefined)}
              fresh={freshIds.includes(card.id)}
              dimmed={!matches(card)}
              onOpen={onOpenCard}
              readOnly={readOnly}
            />
          ))}
        </ul>
      </SortableContext>

      {!readOnly && (
        <div className="board-list__footer">
          <Composer
            triggerLabel="Add a card"
            inputLabel={`Title of the new card in ${list.name}`}
            placeholder="Enter a title for this card"
            submitLabel="Add card"
            multiline
            onSubmit={(title) => onAddCard(list.id, title)}
          />
        </div>
      )}
    </section>
  );
}
