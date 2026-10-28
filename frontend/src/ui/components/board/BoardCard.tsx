import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type MouseEvent, memo } from 'react';

import type { CardSummary, Label } from '@lib/boardsApi';
import { splitDragListeners } from '@lib/dragListeners';
import { displayValue, optionOf, shownOnCard } from '@lib/fields';
import { useSelectionStore } from '@lib/selectionStore';

import { ChatIcon, GripIcon, TextLinesIcon } from '../ui/Icons';
import { useBoardMeta } from '@hooks/useBoardMeta';

import { PresenceOnCard } from '../collab/PresenceOnCard';
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
  const { display, fields, fieldValues } = useBoardMeta();
  const shownLabels = display.labels ? labels : [];
  const cardValues = fieldValues.get(card.id);
  const shownFields = shownOnCard(fields).filter((field) => {
    const value = cardValues?.get(field.id);
    return value !== undefined && value !== false;
  });
  const showMarker = display.description_marker && card.has_description;
  const preview = display.description_preview ? card.description_preview.trim() : '';
  const showDue = display.due_date && card.due_date !== null;
  const showPeople = display.assignees && card.assignee_ids.length > 0;
  const comments = card.comment_count ?? 0;

  return (
    <>
      <span className="board-card__title">{card.title}</span>
      {preview && <span className="board-card__preview">{preview}</span>}
      {shownFields.length > 0 && (
        <span className="board-card__fields">
          {shownFields.map((field) => {
            const value = cardValues?.get(field.id);
            const chosen = field.kind === 'select' ? optionOf(field, value) : null;
            return chosen ? (
              <LabelChip key={field.id} name={chosen.name} color={chosen.color} priority="none" />
            ) : (
              <span key={field.id} className="board-card__field">
                <span className="board-card__field-name">{field.name}</span>
                {field.kind === 'checkbox' ? '' : displayValue(field, value)}
              </span>
            );
          })}
        </span>
      )}
      {(shownLabels.length > 0 || showMarker) && (
        <span className="board-card__meta">
          {shownLabels.map((label) => (
            <LabelChip
              key={label.id}
              name={label.name}
              color={label.color}
              priority={label.priority}
            />
          ))}
          {showMarker && (
            <span className="board-card__description-flag">
              <TextLinesIcon size={16} />
              <span className="sr-only">Has a description</span>
            </span>
          )}
        </span>
      )}
      {(showDue || showPeople || comments > 0) && (
        <span className="board-card__foot">
          {showDue && card.due_date && <DueBadge day={card.due_date} />}
          {comments > 0 && (
            <span className="board-card__comments">
              <ChatIcon size={14} />
              <span aria-hidden="true">{comments}</span>
              <span className="sr-only">
                {comments} {comments === 1 ? 'comment' : 'comments'}
              </span>
            </span>
          )}
          {showPeople && <AssigneeStack ids={card.assignee_ids} />}
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
  const selected = useSelectionStore((state) => state.cards.includes(card.id));
  const toggleCard = useSelectionStore((state) => state.toggleCard);

  // Shift or Ctrl with a click picks the card instead of opening it, and X does the same from the keyboard.
  function handleClick(event: MouseEvent) {
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      toggleCard(card.id);
      return;
    }
    onOpen(card.id);
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="board-card"
      data-fresh={fresh || undefined}
      data-dimmed={dimmed || undefined}
      data-dragging={isDragging || undefined}
      data-card-id={card.id}
      data-selected={selected || undefined}
    >
      <button
        type="button"
        className="board-card__open"
        onClick={handleClick}
        onKeyDown={(event) => {
          if (
            event.key.toLowerCase() === 'x' &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            event.preventDefault();
            toggleCard(card.id);
          }
        }}
        {...(readOnly ? {} : pointerListeners)}
      >
        <CardFace card={card} labels={labels} />
        {selected && <span className="sr-only">Selected</span>}
      </button>
      <PresenceOnCard cardId={card.id} />
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
