import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useId, useRef, useState } from 'react';

import { announce } from '@lib/announcer';
import type { BoardList as BoardListData, CardSummary, Label } from '@lib/boardsApi';
import { splitDragListeners } from '@lib/dragListeners';
import { type LimitState, describeCount, limitState } from '@lib/wipLimit';

import { Composer } from '../ui/Composer';
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  GaugeIcon,
  GripIcon,
  TrashIcon,
} from '../ui/Icons';
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
  collapsed: boolean;
  onToggleCollapsed: (listId: string) => void;
  onRename: (listId: string, name: string) => void;
  onMove: (listId: string, index: number) => void;
  onDelete: (listId: string) => void;
  onEditLimit: (listId: string) => void;
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

interface CountBadgeProps {
  count: number;
  limit: number | null;
  state: LimitState;
  /** The words a screen reader gets, since the badge itself is only digits and an icon. */
  description: string;
}

/**
 * The card count, with the work in progress limit beside it when there is one.
 * Going over the limit is said by an icon and the words "over", never by the
 * colour alone.
 */
function CountBadge({ count, limit, state, description }: CountBadgeProps) {
  return (
    <span className="board-list__count" data-limit={state}>
      {state === 'over' && <AlertIcon size={13} />}
      <span aria-hidden="true">{limit === null ? count : `${count}/${limit}`}</span>
      {description && <span className="sr-only">{description}</span>}
    </span>
  );
}

export function BoardList({
  list,
  index,
  total,
  labelsById,
  matches,
  freshIds,
  collapsed,
  onToggleCollapsed,
  onRename,
  onMove,
  onDelete,
  onEditLimit,
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
    isOver,
  } = useSortable({
    id: list.id,
    data: { type: 'list' },
    disabled: readOnly || collapsed,
  });

  const { onKeyDown, pointer: pointerListeners } = splitDragListeners(listeners);
  const cardIds = list.cards.map((card) => card.id);
  const count = list.cards.length;
  const state = limitState(count, list.wip_limit);
  const description = describeCount(count, list.wip_limit);

  // Tell people when a list crosses its limit, whoever made it cross, but not on first paint.
  const previousState = useRef<LimitState>(state);
  useEffect(() => {
    if (previousState.current !== 'over' && state === 'over') {
      announce(`${list.name} is over its limit: ${description}.`);
    }
    previousState.current = state;
  }, [state, description, list.name]);

  // A list that has just opened grows from the rail, with its contents clipped meanwhile.
  const wasCollapsed = useRef(collapsed);
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    if (wasCollapsed.current && !collapsed) {
      setOpening(true);
      const timer = window.setTimeout(() => setOpening(false), 260);
      wasCollapsed.current = collapsed;
      return () => window.clearTimeout(timer);
    }
    wasCollapsed.current = collapsed;
    return undefined;
  }, [collapsed]);

  const style = { transform: CSS.Translate.toString(transform), transition };

  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        style={style}
        className="board-list board-list--collapsed"
        aria-label={`${list.name}, collapsed`}
        data-limit={state}
        data-over={isOver || undefined}
      >
        <button
          type="button"
          className="board-list__expand"
          aria-expanded={false}
          onClick={() => onToggleCollapsed(list.id)}
        >
          <ChevronsRightIcon size={16} />
          <span className="sr-only">Expand list </span>
          <span className="board-list__rail-name">{list.name}</span>{' '}
          <CountBadge
            count={count}
            limit={list.wip_limit}
            state={state}
            description={description}
          />
        </button>
      </section>
    );
  }

  return (
    <section
      ref={setNodeRef}
      style={style}
      className="board-list"
      aria-labelledby={headingId}
      data-fresh={freshIds.includes(list.id) || undefined}
      data-dragging={isDragging || undefined}
      data-opening={opening || undefined}
      data-limit={state}
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
        <CountBadge count={count} limit={list.wip_limit} state={state} description={description} />
        <button
          type="button"
          className="board-list__fold"
          aria-expanded={true}
          aria-label={`Collapse list ${list.name}`}
          onClick={() => onToggleCollapsed(list.id)}
        >
          <ChevronsLeftIcon size={16} />
        </button>
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
                label: list.wip_limit === null ? 'Set a card limit…' : 'Change the card limit…',
                icon: <GaugeIcon />,
                onSelect: () => onEditLimit(list.id),
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

      {state === 'over' && (
        <p className="board-list__warning">
          <AlertIcon size={14} />
          <span>
            {count - (list.wip_limit ?? 0)} over the limit of {list.wip_limit}
          </span>
        </p>
      )}

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
