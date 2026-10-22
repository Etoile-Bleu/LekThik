import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { memo } from 'react';

import type { CardSummary, Label } from '@lib/boardsApi';
import { splitDragListeners } from '@lib/dragListeners';

import { GripIcon, TextLinesIcon } from '../ui/Icons';
import { AssigneeStack } from './AssigneeStack';
import { DueBadge } from './DueBadge';
import { LabelChip } from './LabelChip';
import './BoardCard.css';

interface BoardCardProps {
  card: CardSummary;
  labels: Label[];
  fresh: boolean;
  dimmed: boolean;
  onOpen: (cardId: string) => void;
  readOnly?: boolean;
}

export function CardFace({ card, labels }: { card: CardSummary; labels: Label[] }) {
  return (
    <>
      <span className="board-card__title">{card.title}</span>
      {(labels.length > 0 || card.has_description) && (
        <span className="board-card__meta">
          {labels.map((label) => (
            <LabelChip
              key={label.id}
              name={label.name}
              color={label.color}
              priority={label.priority}
            />
          ))}
          {card.has_description && (
            <span className="board-card__description-flag">
              <TextLinesIcon size={16} />
              <span className="sr-only">Has a description</span>
            </span>
          )}
        </span>
      )}
      {(card.due_date || card.assignee_ids.length > 0) && (
        <span className="board-card__foot">
          {card.due_date && <DueBadge day={card.due_date} />}
          <AssigneeStack ids={card.assignee_ids} />
        </span>
      )}
    </>
  );
}

function BoardCardComponent({
  card,
  labels,
  fresh,
  dimmed,
  onOpen,
  readOnly = false,
}: BoardCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: 'card', listId: card.list_id },
    disabled: readOnly,
  });

  const { onKeyDown, pointer: pointerListeners } = splitDragListeners(listeners);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="board-card"
      data-fresh={fresh || undefined}
      data-dimmed={dimmed || undefined}
      data-dragging={isDragging || undefined}
    >
      <button
        type="button"
        className="board-card__open"
        onClick={() => onOpen(card.id)}
        {...(readOnly ? {} : pointerListeners)}
      >
        <CardFace card={card} labels={labels} />
      </button>
      {!readOnly && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="board-card__grip"
          aria-label={`Reorder card ${card.title}`}
          onKeyDown={onKeyDown}
          {...attributes}
        >
          <GripIcon size={16} />
        </button>
      )}
    </li>
  );
}

export const BoardCard = memo(BoardCardComponent);
