import {
  type Announcements,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useMemo, useRef, useState } from 'react';

import { useBackdropGestures } from '@hooks/useBackdropGestures';
import { useCanvasToolStore } from '@lib/canvasToolStore';

import { findCard, moveCard } from '@lib/boardModel';
import type {
  BoardList as BoardListData,
  CardSummary,
  Label,
  PanelConfig,
  PanelKind,
} from '@lib/boardsApi';
import type { Layout } from '@lib/grid';
import type { ColumnWidth } from '@lib/prefs';

import { Composer } from '../ui/Composer';
import { PlusIcon } from '../ui/Icons';
import { CardFace } from './BoardCard';
import { BoardBlock } from './BoardBlock';
import { BoardGrid } from './BoardGrid';
import { BoardList, ListFace } from './BoardList';
import './BoardCanvas.css';
import './Selection.css';

interface BoardCanvasProps {
  lists: BoardListData[];
  labels: Label[];
  matches: (card: CardSummary) => boolean;
  freshIds: string[];
  columnWidth: ColumnWidth;
  collapsedIds: string[];
  onToggleCollapsed: (listId: string) => void;
  onEditLimit: (listId: string) => void;
  onBlockSettings: (blockId: string) => void;
  onSaveNote: (blockId: string, text: string) => void;
  onSaveConfig: (blockId: string, kind: PanelKind, config: PanelConfig) => void;
  onAddBlock: () => void;
  onRenameList: (listId: string, name: string) => void;
  onMoveList: (listId: string, index: number) => void;
  onDeleteList: (listId: string) => void;
  onAddList: (name: string) => Promise<unknown>;
  onAddCard: (listId: string, title: string) => Promise<unknown>;
  onMoveCard: (cardId: string, listId: string, index: number) => void;
  onOpenCard: (cardId: string) => void;
  readOnly?: boolean;
  /** Shows the panels as tiles of the free layout instead of one row. */
  freeLayout?: boolean;
  onLayout?: (layout: Layout) => void;
  onPositionPanel?: (panelId: string) => void;
}

type ActiveItem = { type: 'card' | 'list'; id: string };

const INSTRUCTIONS =
  'To pick up a card or a list, press space or enter on its grip button. While dragging, use the arrow keys to move it, space or enter to drop it, and escape to cancel.';

export function BoardCanvas({
  lists: storedLists,
  labels,
  matches,
  freshIds,
  columnWidth,
  collapsedIds,
  onToggleCollapsed,
  onEditLimit,
  onBlockSettings,
  onSaveNote,
  onSaveConfig,
  onAddBlock,
  onRenameList,
  onMoveList,
  onDeleteList,
  onAddList,
  onAddCard,
  onMoveCard,
  onOpenCard,
  readOnly = false,
  freeLayout = false,
  onLayout,
  onPositionPanel,
}: BoardCanvasProps) {
  const [draft, setDraft] = useState<BoardListData[] | null>(null);
  const [active, setActive] = useState<ActiveItem | null>(null);
  const activeTypeRef = useRef<ActiveItem['type'] | null>(null);
  const lastOverId = useRef<string | null>(null);
  const lists = draft ?? storedLists;
  const rowRef = useRef<HTMLDivElement>(null);
  const handTool = useCanvasToolStore((state) => state.tool === 'hand' || state.spaceHeld);
  const { marquee } = useBackdropGestures(rowRef, !freeLayout);

  const labelsById = useMemo(() => new Map(labels.map((label) => [label.id, label])), [labels]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const collisionDetection: CollisionDetection = (args) => {
    if (activeTypeRef.current === 'list') {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (container) => container.data.current?.type === 'list'
        ),
      });
    }

    // A card can only be dropped on a list, never on a block.
    args = {
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => !container.data.current?.block
      ),
    };
    const pointerCollisions = pointerWithin(args);
    const collisions = pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
    let overId = getFirstCollision(collisions, 'id');

    if (overId !== null && overId !== undefined) {
      const list = lists.find((candidate) => candidate.id === overId);
      if (list && list.cards.length > 0) {
        const cardIds = list.cards.map((card) => card.id);
        const closest = closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(
            (container) => container.id !== overId && cardIds.includes(String(container.id))
          ),
        });
        overId = closest[0]?.id ?? overId;
      }
      lastOverId.current = String(overId);
      return [{ id: overId }];
    }

    return lastOverId.current ? [{ id: lastOverId.current }] : [];
  };

  function cardTitle(id: string): string {
    const location = findCard(lists, id);
    return location ? lists[location.listIndex].cards[location.cardIndex].title : 'card';
  }

  function describePosition(id: string, type: ActiveItem['type']): string {
    if (type === 'list') {
      const index = lists.findIndex((list) => list.id === id);
      const name = lists[index]?.name ?? 'list';
      return `list ${name}, position ${index + 1} of ${lists.length}`;
    }
    const location = findCard(lists, id);
    if (!location) return 'card';
    const list = lists[location.listIndex];
    return `card ${list.cards[location.cardIndex].title}, position ${location.cardIndex + 1} of ${list.cards.length} in list ${list.name}`;
  }

  function describeOver(overId: string, overType: string | undefined): string {
    if (overType === 'list') {
      const list = lists.find((candidate) => candidate.id === overId);
      return `list ${list?.name ?? ''}`;
    }
    const location = findCard(lists, overId);
    if (!location) return 'another position';
    const list = lists[location.listIndex];
    return `${list.cards[location.cardIndex].title} in list ${list.name}`;
  }

  const announcements: Announcements = {
    onDragStart: ({ active: item }) => {
      const type = item.data.current?.type === 'list' ? 'list' : 'card';
      return `Picked up ${describePosition(String(item.id), type)}.`;
    },
    onDragOver: ({ active: item, over }) => {
      if (!over) return undefined;
      const type = item.data.current?.type === 'list' ? 'list' : 'card';
      const name =
        type === 'list' ? describePosition(String(item.id), 'list') : cardTitle(String(item.id));
      return `${name} is over ${describeOver(String(over.id), over.data.current?.type)}.`;
    },
    onDragEnd: ({ active: item, over }) => {
      const type = item.data.current?.type === 'list' ? 'list' : 'card';
      if (!over) return `${type === 'list' ? 'List' : 'Card'} dropped, nothing changed.`;
      return `Dropped over ${describeOver(String(over.id), over.data.current?.type)}.`;
    },
    onDragCancel: () => 'Dragging cancelled. Nothing changed.',
  };

  function clearDrag() {
    setDraft(null);
    setActive(null);
    activeTypeRef.current = null;
    lastOverId.current = null;
  }

  function handleDragStart(event: DragStartEvent) {
    const type = event.active.data.current?.type === 'list' ? 'list' : 'card';
    activeTypeRef.current = type;
    setActive({ type, id: String(event.active.id) });
    setDraft(storedLists);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active: item, over } = event;
    if (!over || item.data.current?.type !== 'card') {
      return;
    }
    const activeId = String(item.id);
    const overId = String(over.id);

    setDraft((current) => {
      if (!current) return current;
      const from = findCard(current, activeId);
      if (!from) return current;
      const sourceListId = current[from.listIndex].id;

      let targetListId: string;
      let targetIndex: number;
      if (over.data.current?.type === 'list') {
        targetListId = overId;
        targetIndex = current.find((list) => list.id === overId)?.cards.length ?? 0;
      } else {
        const to = findCard(current, overId);
        if (!to) return current;
        targetListId = current[to.listIndex].id;
        const translated = item.rect.current.translated;
        const isBelow = translated ? translated.top > over.rect.top + over.rect.height / 2 : false;
        targetIndex = to.cardIndex + (isBelow ? 1 : 0);
      }

      if (targetListId === sourceListId) return current;
      return moveCard(current, activeId, targetListId, targetIndex);
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active: item, over } = event;
    const activeId = String(item.id);

    if (!over) {
      clearDrag();
      return;
    }

    if (item.data.current?.type === 'list') {
      const from = storedLists.findIndex((list) => list.id === activeId);
      const to = storedLists.findIndex((list) => list.id === String(over.id));
      if (from !== -1 && to !== -1 && from !== to) {
        onMoveList(activeId, to);
      }
      clearDrag();
      return;
    }

    const current = draft ?? storedLists;
    const from = findCard(current, activeId);
    if (from) {
      const listId = current[from.listIndex].id;
      let index = from.cardIndex;

      if (over.data.current?.type === 'card') {
        const to = findCard(current, String(over.id));
        if (to && to.listIndex === from.listIndex) {
          index = to.cardIndex;
        }
      } else if (String(over.id) === listId) {
        index = current[from.listIndex].cards.length - 1;
      }

      const original = findCard(storedLists, activeId);
      const originalListId = original ? storedLists[original.listIndex].id : null;
      if (listId !== originalListId || original?.cardIndex !== index) {
        onMoveCard(activeId, listId, index);
      }
    }
    clearDrag();
  }

  const activeCardLocation = active?.type === 'card' ? findCard(lists, active.id) : null;
  const activeCard = activeCardLocation
    ? lists[activeCardLocation.listIndex].cards[activeCardLocation.cardIndex]
    : null;
  const activeList = active?.type === 'list' ? lists.find((list) => list.id === active.id) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={clearDrag}
    >
      {freeLayout ? (
        <SortableContext items={lists.map((list) => list.id)}>
          <BoardGrid
            panels={lists}
            freshIds={freshIds}
            editable={!readOnly}
            onLayout={(layout) => onLayout?.(layout)}
            onPosition={(panelId) => onPositionPanel?.(panelId)}
            onAddBlock={onAddBlock}
            addList={
              <div className="canvas__add-list">
                <Composer
                  variant="column"
                  triggerLabel="Add a list"
                  inputLabel="Name of the new list"
                  placeholder="Enter a list name"
                  submitLabel="Add list"
                  onSubmit={onAddList}
                />
              </div>
            }
            renderPanel={(panel, tile) =>
              panel.kind !== 'list' ? (
                <BoardBlock
                  block={panel}
                  panels={lists}
                  index={0}
                  total={lists.length}
                  freshIds={freshIds}
                  collapsed={false}
                  onToggleCollapsed={onToggleCollapsed}
                  onRename={onRenameList}
                  onMove={onMoveList}
                  onDelete={onDeleteList}
                  onSettings={onBlockSettings}
                  onSaveNote={onSaveNote}
                  onSaveConfig={onSaveConfig}
                  onOpenCard={onOpenCard}
                  readOnly={readOnly}
                  tile={tile}
                  inGrid
                />
              ) : (
                <BoardList
                  list={panel}
                  index={0}
                  total={lists.length}
                  labelsById={labelsById}
                  matches={matches}
                  freshIds={freshIds}
                  collapsed={false}
                  onToggleCollapsed={onToggleCollapsed}
                  onEditLimit={onEditLimit}
                  onRename={onRenameList}
                  onMove={onMoveList}
                  onDelete={onDeleteList}
                  onAddCard={onAddCard}
                  onOpenCard={onOpenCard}
                  readOnly={readOnly}
                  tile={tile}
                  inGrid
                />
              )
            }
          />
        </SortableContext>
      ) : (
        <div className="board-row">
          <div
            className="board-canvas"
            data-width={columnWidth}
            ref={rowRef}
            data-tool={handTool ? 'hand' : 'select'}
          >
            <SortableContext
              items={lists.map((list) => list.id)}
              strategy={horizontalListSortingStrategy}
            >
              {lists.map((list, index) =>
                list.kind !== 'list' ? (
                  <BoardBlock
                    key={list.id}
                    block={list}
                    panels={lists}
                    index={index}
                    total={lists.length}
                    freshIds={freshIds}
                    collapsed={collapsedIds.includes(list.id)}
                    onToggleCollapsed={onToggleCollapsed}
                    onRename={onRenameList}
                    onMove={onMoveList}
                    onDelete={onDeleteList}
                    onSettings={onBlockSettings}
                    onSaveNote={onSaveNote}
                    onSaveConfig={onSaveConfig}
                    onOpenCard={onOpenCard}
                    readOnly={readOnly}
                  />
                ) : (
                  <BoardList
                    key={list.id}
                    list={list}
                    index={index}
                    total={lists.length}
                    labelsById={labelsById}
                    matches={matches}
                    freshIds={freshIds}
                    collapsed={collapsedIds.includes(list.id)}
                    onToggleCollapsed={onToggleCollapsed}
                    onEditLimit={onEditLimit}
                    onRename={onRenameList}
                    onMove={onMoveList}
                    onDelete={onDeleteList}
                    onAddCard={onAddCard}
                    onOpenCard={onOpenCard}
                    readOnly={readOnly}
                  />
                )
              )}
            </SortableContext>
            {readOnly ? (
              lists.length === 0 && (
                <p className="board-canvas__empty">This board has no lists yet.</p>
              )
            ) : (
              <div className="board-canvas__add">
                <Composer
                  variant="column"
                  triggerLabel={lists.length === 0 ? 'Add your first list' : 'Add another list'}
                  inputLabel="Name of the new list"
                  placeholder="Enter a list name"
                  submitLabel="Add list"
                  onSubmit={onAddList}
                />
                <button type="button" className="board-canvas__block" onClick={onAddBlock}>
                  <PlusIcon size={16} />
                  Add a block
                  <span className="board-canvas__block-hint">
                    Calendar, agenda, note, counter, progress
                  </span>
                </button>
              </div>
            )}
            {marquee && (
              <div
                className="marquee"
                aria-hidden="true"
                style={{
                  left: marquee.left,
                  top: marquee.top,
                  width: marquee.width,
                  height: marquee.height,
                }}
              />
            )}
          </div>
        </div>
      )}
      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {activeCard && (
          <div className="board-card-overlay">
            <div className="board-card__open">
              <CardFace
                card={activeCard}
                labels={activeCard.label_ids
                  .map((id) => labelsById.get(id))
                  .filter((label): label is Label => label !== undefined)}
              />
            </div>
          </div>
        )}
        {activeList && <ListFace list={activeList} count={activeList.cards.length} />}
      </DragOverlay>
    </DndContext>
  );
}
