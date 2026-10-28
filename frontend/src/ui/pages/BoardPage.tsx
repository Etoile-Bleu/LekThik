import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { BoardMetaProvider } from '@hooks/useBoardMeta';
import { useEffectiveTheme } from '@hooks/useEffectiveTheme';
import { useDocumentTitle } from '@hooks/useDocumentTitle';
import { useUndoShortcuts } from '@hooks/useUndoShortcuts';
import { useToday } from '@hooks/useToday';
import { announce } from '@lib/announcer';
import { notifyError } from '@lib/toastStore';
import { useAuthStore } from '@lib/authStore';
import { type CardFilter, EMPTY_FILTER, cardMatches } from '@lib/boardModel';
import { indexValues } from '@lib/fields';
import { DEFAULT_POLL } from '@lib/polls';
import type { CardSummary } from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';
import { lookStyle } from '@lib/boardLooks';
import {
  DEFAULT_AGENDA,
  DEFAULT_CALENDAR,
  DEFAULT_CHART,
  DEFAULT_CLOCKS,
  DEFAULT_COUNTER,
  DEFAULT_NOTE,
  DEFAULT_OVERDUE,
  DEFAULT_PROGRESS,
  DEFAULT_SNIPPET,
  DEFAULT_TABLE,
  DEFAULT_TIMER,
  KIND_LABEL,
  guessDoneList,
  isCardList,
} from '@lib/blocks';
import { type PanelConfig, type PanelKind, uploadBlockImage } from '@lib/boardsApi';
import { fitLayout, resolveLayout, settle } from '@lib/grid';
import { type BoardViewKind, boardPrefsFor, cardDisplayFor } from '@lib/prefs';
import { usePrefsStore } from '@lib/prefsStore';
import { canEdit, canManage } from '@lib/roles';
import { useCanvasToolStore } from '@lib/canvasToolStore';
import { setPresenceCard, startPresence, stopPresence } from '@lib/presenceStore';
import { useCommandStore } from '@lib/commandStore';
import { useFullscreenStore } from '@lib/fullscreenStore';
import { useSelectionStore } from '@lib/selectionStore';
import { notifySuccess } from '@lib/toastStore';
import { useWorkspaceStore } from '@lib/workspaceStore';
import { useBoardBulk } from '@hooks/useBoardBulk';
import { useCanvasToolKeys } from '@hooks/useCanvasToolKeys';

import { AddBlockDialog } from '../components/board/AddBlockDialog';
import { type MediaInput, type MediaKind, MediaDialog } from '../components/board/MediaDialog';
import { BlockSettingsDialog } from '../components/board/BlockSettingsDialog';
import { BoardCalendar } from '../components/board/BoardCalendar';
import { BoardCanvas } from '../components/board/BoardCanvas';
import { BoardContextHost } from '../components/board/BoardContextHost';
import { CanvasTools } from '../components/board/CanvasTools';
import { SelectionBar } from '../components/board/SelectionBar';
import { PresenceStack } from '../components/collab/PresenceStack';
import { BoardTable } from '../components/board/BoardTable';
import { TilePositionDialog } from '../components/board/TilePositionDialog';
import { BoardCommandSource } from '../components/command/BoardCommandSource';
import { CardDialog } from '../components/board/CardDialog';
import { FilterBar } from '../components/board/FilterBar';
import { FieldsDialog } from '../components/board/FieldsDialog';
import { LabelsDialog } from '../components/board/LabelsDialog';
import { UndoRedoButtons } from '../components/board/UndoRedoButtons';
import { ViewSwitcher } from '../components/board/ViewSwitcher';
import { WipLimitDialog } from '../components/board/WipLimitDialog';
import { DisplayMenu } from '../components/appearance/DisplayMenu';
import { MembersDialog } from '../components/collab/MembersDialog';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ArrowLeftIcon, SlidersIcon, TagIcon, TrashIcon, UsersIcon } from '../components/ui/Icons';
import { InlineEdit } from '../components/ui/InlineEdit';
import { Menu } from '../components/ui/Menu';
import './BoardPage.css';

/** A day written `YYYY-MM-DD`, some days later, counted on the calendar and not in hours. */
function addDaysTo(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(year, month - 1, date + amount);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

type PlainBlockKind = Exclude<PanelKind, 'list' | 'image' | 'embed' | 'link'>;

export function BoardPage() {
  useUndoShortcuts();
  const { boardId = '' } = useParams();
  const navigate = useNavigate();

  const view = useBoardStore((state) => state.view);
  const status = useBoardStore((state) => state.status);
  const freshIds = useBoardStore((state) => state.freshIds);
  const load = useBoardStore((state) => state.load);
  const reset = useBoardStore((state) => state.reset);
  const renameBoard = useBoardStore((state) => state.renameBoard);
  const setLook = useBoardStore((state) => state.setLook);
  const prefs = usePrefsStore((state) => state.prefs);
  const updateBoardPrefs = usePrefsStore((state) => state.updateBoard);
  const toggleListCollapsed = usePrefsStore((state) => state.toggleListCollapsed);
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedCard = useRef<string | null>(null);
  linkedCard.current = searchParams.get('card');
  const theme = useEffectiveTheme();
  const deleteBoard = useBoardStore((state) => state.deleteBoard);
  const createList = useBoardStore((state) => state.createList);
  const createBlock = useBoardStore((state) => state.createBlock);
  const setBlockConfig = useBoardStore((state) => state.setBlockConfig);
  const setImageVersion = useBoardStore((state) => state.setImageVersion);
  const renameList = useBoardStore((state) => state.renameList);
  const moveList = useBoardStore((state) => state.moveList);
  const setLayout = useBoardStore((state) => state.setLayout);
  const setListWipLimit = useBoardStore((state) => state.setListWipLimit);
  const setCardDueDate = useBoardStore((state) => state.setCardDueDate);
  const setCardAssignees = useBoardStore((state) => state.setCardAssignees);
  const deleteList = useBoardStore((state) => state.deleteList);
  const createCard = useBoardStore((state) => state.createCard);
  const moveCard = useBoardStore((state) => state.moveCard);
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [filter, setFilter] = useState<CardFilter>(EMPTY_FILTER);
  const meId = useAuthStore((state) => state.user?.id);
  const today = useToday();
  const [deletingBoard, setDeletingBoard] = useState(false);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const [bulkDelete, setBulkDelete] = useState<{ cards: string[]; panels: string[] } | null>(null);
  const [workArea, setWorkArea] = useState<HTMLDivElement | null>(null);
  const bulk = useBoardBulk();
  const pickedCards = useSelectionStore((state) => state.cards);
  const pickedPanels = useSelectionStore((state) => state.panels);
  const tool = useCanvasToolStore((state) => state.tool);
  const [limitListId, setLimitListId] = useState<string | null>(null);
  const [pickingBlock, setPickingBlock] = useState(false);
  const [blockSettingsId, setBlockSettingsId] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
  const [positionId, setPositionId] = useState<string | null>(null);

  useDocumentTitle(view?.board.name ?? 'Board');

  const boardKey = view?.board.id;
  const viewKind = view ? boardPrefsFor(prefs, view.board.id).view : null;
  useEffect(() => {
    useSelectionStore.getState().clear();
  }, [boardKey, viewKind]);

  // Being on the board: the others see this person, and the card they have open.
  useEffect(() => {
    if (!boardKey || !meId) return undefined;
    startPresence(boardKey, meId);
    return () => stopPresence();
  }, [boardKey, meId]);

  useEffect(() => {
    setPresenceCard(openCardId);
  }, [openCardId]);

  function allCardIds(): string[] {
    return (view?.lists ?? [])
      .filter(isCardList)
      .flatMap((list) => list.cards.map((card) => card.id));
  }

  function askDeleteSelection() {
    const { cards, panels } = useSelectionStore.getState();
    if (cards.length + panels.length > 0) setBulkDelete({ cards, panels });
  }

  useCanvasToolKeys({
    enabled: view !== null,
    selectAll: () => useSelectionStore.getState().setSelection(allCardIds(), []),
    onDelete: askDeleteSelection,
    onDuplicate: () => {
      const { cards, panels } = useSelectionStore.getState();
      if (cards.length > 0) void bulk.duplicateCards(cards);
      else if (panels.length > 0) void bulk.duplicatePanels(panels);
    },
  });

  useEffect(() => {
    setFilter(EMPTY_FILTER);
    // A link from "my cards" arrives with the card to open, once.
    setOpenCardId(linkedCard.current);
    void load(boardId);
    return () => reset();
  }, [boardId, load, reset]);

  useEffect(() => {
    if (searchParams.has('card')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const workspaceName = useMemo(
    () => workspaces.find((workspace) => workspace.id === view?.board.workspace_id)?.name,
    [workspaces, view?.board.workspace_id]
  );

  const fieldValueIndex = useMemo(() => indexValues(view?.field_values), [view?.field_values]);
  const matches = useCallback(
    (card: CardSummary) => cardMatches(card, filter, { meId, today, fieldValues: fieldValueIndex }),
    [filter, meId, today, fieldValueIndex]
  );

  const counts = useMemo(() => {
    const cards = view?.lists.flatMap((list) => list.cards) ?? [];
    return {
      total: cards.length,
      matching: cards.filter(matches).length,
    };
  }, [view, matches]);

  if (status === 'notfound') {
    return (
      <div className="board-page board-page--message">
        <h1>This board is not available</h1>
        <p>It may have been deleted, or you may no longer have access to it.</p>
        <Link className="btn btn--primary" to="/dashboard">
          Back to your workspaces
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="board-page board-page--message">
        <h1>Could not load this board</h1>
        <p>Check your connection and try again.</p>
        <button type="button" className="btn btn--primary" onClick={() => void load(boardId)}>
          Try again
        </button>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="board-page" role="status" aria-busy="true">
        <span className="sr-only">Loading the board…</span>
        <div className="board-page__skeleton">
          <div className="board-page__skeleton-title" />
          <div className="board-page__skeleton-lists">
            <div />
            <div />
            <div />
          </div>
        </div>
      </div>
    );
  }

  const deletingList = view.lists.find((list) => list.id === deletingListId);
  const limitList = view.lists.find((list) => list.id === limitListId);
  const settingsBlock = view.lists.find((list) => list.id === blockSettingsId) ?? null;
  const positionPanel = view.lists.find((list) => list.id === positionId) ?? null;
  const own = boardPrefsFor(prefs, view.board.id);

  const boardId_ = view.board.id;

  const DEFAULTS: Record<PlainBlockKind, PanelConfig> = {
    calendar: DEFAULT_CALENDAR,
    agenda: DEFAULT_AGENDA,
    note: DEFAULT_NOTE,
    counter: DEFAULT_COUNTER,
    progress: DEFAULT_PROGRESS,
    overdue: DEFAULT_OVERDUE,
    chart: DEFAULT_CHART,
    snippet: DEFAULT_SNIPPET,
    table: DEFAULT_TABLE,
    clocks: DEFAULT_CLOCKS,
    timer: DEFAULT_TIMER,
    poll: DEFAULT_POLL,
  };

  function saveNote(blockId: string, text: string) {
    const current = view?.lists.find((list) => list.id === blockId)?.config as
      { size?: 'normal' | 'wide' } | undefined;
    void setBlockConfig(blockId, 'note', { size: current?.size ?? 'normal', text });
  }

  /** "Note", then "Note 2" and so on, so two blocks never share a name a screen reader would read twice. */
  function uniqueName(base: string): string {
    const taken = new Set(view?.lists.map((list) => list.name) ?? []);
    if (!taken.has(base)) return base;
    let count = 2;
    while (taken.has(`${base} ${count}`)) count += 1;
    return `${base} ${count}`;
  }

  function pickBlock(kind: Exclude<PanelKind, 'list'>) {
    // Pictures, videos and links need something from the person before there is a block.
    if (kind === 'image' || kind === 'embed' || kind === 'link') {
      setMediaKind(kind);
      return;
    }
    void addBlock(kind);
  }

  /** Adds a picture, video or link block. A picture that cannot be kept takes its block with it. */
  async function addMedia(input: MediaInput): Promise<boolean> {
    const block = await createBlock(input.kind, uniqueName(input.name), input.config);
    if (!block) return false;
    if (input.file) {
      try {
        const saved = await uploadBlockImage(block.id, input.file);
        setImageVersion(block.id, saved.image_version);
      } catch (error) {
        notifyError(error, 'The picture could not be added.');
        await deleteList(block.id);
        return false;
      }
    }
    announce(`${KIND_LABEL[input.kind]} added.`);
    return true;
  }

  async function replacePicture(blockId: string, file: File): Promise<boolean> {
    try {
      const saved = await uploadBlockImage(blockId, file);
      setImageVersion(blockId, saved.image_version);
      announce('Picture replaced.');
      return true;
    } catch (error) {
      notifyError(error, 'The picture could not be added.');
      return false;
    }
  }

  async function addBlock(kind: PlainBlockKind) {
    const config =
      kind === 'progress'
        ? { ...DEFAULT_PROGRESS, done_list_id: guessDoneList(view?.lists ?? [])?.id ?? null }
        : DEFAULTS[kind];
    const block = await createBlock(kind, uniqueName(KIND_LABEL[kind]), config);
    if (!block) return;
    announce(`${KIND_LABEL[kind]} block added.`);
    // A counter needs to be pointed at something before it says anything useful.
    if (kind === 'counter' || kind === 'snippet' || kind === 'clocks' || kind === 'poll') {
      setBlockSettingsId(block.id);
    }
    if (kind === 'progress' && !(config as { done_list_id: string | null }).done_list_id) {
      setBlockSettingsId(block.id);
    }
  }

  function changeView(next: BoardViewKind) {
    updateBoardPrefs(boardId_, { view: next });
    const names: Record<BoardViewKind, string> = {
      board: 'Board',
      canvas: 'Canvas',
      list: 'List',
      calendar: 'Calendar',
    };
    announce(`${names[next]} view.`);
  }
  const editable = canEdit(view.role);

  function fitEverything() {
    const current = resolveLayout(view?.lists ?? []);
    if (own.view !== 'canvas') changeView('canvas');
    void setLayout(fitLayout(view?.lists ?? [], current));
    announce('Panels arranged to fit the board.');
  }
  const workspace = workspaces.find((candidate) => candidate.id === view.board.workspace_id);

  return (
    <BoardMetaProvider
      members={view.members}
      labels={view.labels}
      fields={view.fields}
      fieldValues={view.field_values}
      meId={meId}
      today={today}
      display={cardDisplayFor(prefs, view.board.id)}
    >
      <div className="board-page" style={lookStyle(view.look, theme)}>
        <BoardCommandSource
          context={{
            view,
            meId,
            editable,
            canManage: canManage(view.role),
            currentView: own.view,
            filter,
            setFilter,
            changeView,
            fit: fitEverything,
            openCard: setOpenCardId,
            openMembers: () => setMembersOpen(true),
            openLabels: () => setLabelsOpen(true),
            openLimit: setLimitListId,
            openBlockSettings: setBlockSettingsId,
            openPosition: setPositionId,
            askDelete: setDeletingListId,
            askDeleteBoard: () => setDeletingBoard(true),
            addBlock: pickBlock,
            actions: {
              createCard,
              createList,
              renameBoard,
              renameList,
              moveCard,
              setCardDueDate,
              setCardAssignees,
            },
          }}
        />
        <header className="board-header">
          <div className="board-header__main">
            <Link className="board-header__back" to="/dashboard">
              <ArrowLeftIcon size={16} />
              <span>{workspaceName ?? 'Workspaces'}</span>
            </Link>
            <InlineEdit
              as="h1"
              className="board-header__title"
              value={view.board.name}
              label="board name"
              readOnly={!editable}
              onCommit={(name) => void renameBoard(name)}
            />
          </div>
          <div className="board-header__actions">
            {!editable && <span className="board-header__readonly">View only</span>}
            <UndoRedoButtons />
            <PresenceStack
              cardTitle={(cardId) =>
                view.lists.flatMap((list) => list.cards).find((card) => card.id === cardId)?.title
              }
              onOpenCard={setOpenCardId}
            />
            <DisplayMenu
              boardId={view.board.id}
              look={view.look}
              view={own.view}
              listIds={view.lists.map((list) => list.id)}
              canStyle={editable}
              onLookChange={(look) => void setLook(look)}
            />
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => setMembersOpen(true)}
            >
              <UsersIcon /> Members
            </button>
            {editable && (
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => setLabelsOpen(true)}
              >
                <TagIcon /> Labels
              </button>
            )}
            {canManage(view.role) && (
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => setFieldsOpen(true)}
              >
                <SlidersIcon /> Fields
              </button>
            )}
            {canManage(view.role) && (
              <Menu
                label={`Actions for board ${view.board.name}`}
                items={[
                  {
                    label: 'Delete board',
                    icon: <TrashIcon />,
                    tone: 'danger',
                    onSelect: () => setDeletingBoard(true),
                  },
                ]}
              />
            )}
          </div>
        </header>

        <FilterBar
          labels={view.labels}
          fields={view.fields}
          filter={filter}
          onChange={setFilter}
          matchCount={counts.matching}
          totalCount={counts.total}
          leading={<ViewSwitcher value={own.view} onChange={changeView} />}
        />

        <BoardContextHost
          container={workArea}
          context={{
            view,
            meId,
            editable,
            canManage: canManage(view.role),
            currentView: own.view,
            tool,
            selectedCards: pickedCards,
            selectedPanels: pickedPanels,
            today,
            openCard: setOpenCardId,
            copyLink: (cardId) => {
              const link = `${window.location.origin}/b/${view.board.id}?card=${cardId}`;
              void navigator.clipboard
                ?.writeText(link)
                .then(() => notifySuccess('Link copied.'))
                .catch(() => notifyError(new Error('The link could not be copied.')));
            },
            select: (cards, panels) => useSelectionStore.getState().setSelection(cards, panels),
            clearSelection: () => useSelectionStore.getState().clear(),
            askDeleteCards: (ids) => setBulkDelete({ cards: ids, panels: [] }),
            askDeletePanels: (ids) =>
              ids.length === 1
                ? setDeletingListId(ids[0])
                : setBulkDelete({ cards: [], panels: ids }),
            openLimit: setLimitListId,
            openBlockSettings: setBlockSettingsId,
            openPosition: setPositionId,
            renamePanel: (panelId) =>
              document
                .querySelector<HTMLElement>(
                  `[data-panel-id="${CSS.escape(panelId)}"] .board-list__title button`
                )
                ?.click(),
            addCardIn: (listId) =>
              document
                .querySelector<HTMLElement>(
                  `[data-panel-id="${CSS.escape(listId)}"] .board-list__footer button`
                )
                ?.click(),
            addList: () =>
              document
                .querySelector<HTMLElement>('.canvas__add-list button, .board-canvas__add button')
                ?.click(),
            addBlock: pickBlock,
            fit: fitEverything,
            changeView,
            setTool: (next) => useCanvasToolStore.getState().setTool(next),
            enterFullscreen: () => void useFullscreenStore.getState().enter(),
            openPalette: () => useCommandStore.getState().openPalette(),
            actions: {
              duplicateCards: (ids) => void bulk.duplicateCards(ids),
              duplicatePanels: (ids) => void bulk.duplicatePanels(ids),
              moveCards: (ids, listId, index) => void bulk.moveCards(ids, listId, index),
              setDueDate: (ids, day) => void bulk.setDueDate(ids, day),
              setLabel: (ids, labelId, on) => void bulk.setLabel(ids, labelId, on),
              setAssignee: (ids, userId, on) => void bulk.setAssignee(ids, userId, on),
              movePanel: (panelId, index) => void moveList(panelId, index),
            },
          }}
        />
        {(own.view === 'board' || own.view === 'canvas') && <CanvasTools />}
        <SelectionBar
          panels={view.lists}
          meId={meId}
          today={today}
          tomorrow={addDaysTo(today, 1)}
          nextWeek={addDaysTo(today, 7)}
          editable={editable}
          onDuplicate={() => {
            const { cards, panels } = useSelectionStore.getState();
            if (cards.length > 0) void bulk.duplicateCards(cards);
            else void bulk.duplicatePanels(panels);
          }}
          onDelete={askDeleteSelection}
          onMoveTo={(listId) => void bulk.moveCards(useSelectionStore.getState().cards, listId)}
          onDueDate={(day) => void bulk.setDueDate(useSelectionStore.getState().cards, day)}
          onAssignMe={() => {
            if (meId) void bulk.setAssignee(useSelectionStore.getState().cards, meId, true);
          }}
        />

        <div className="board-page__canvas" key={own.view} ref={setWorkArea}>
          {own.view === 'list' && (
            <BoardTable
              boardName={view.board.name}
              lists={view.lists}
              labels={view.labels}
              members={view.members}
              matches={matches}
              freshIds={freshIds}
              editable={editable}
              onOpenCard={setOpenCardId}
              onMoveCard={(cardId, listId, index) => void moveCard(cardId, listId, index)}
            />
          )}
          {own.view === 'calendar' && (
            <BoardCalendar
              lists={view.lists}
              labels={view.labels}
              members={view.members}
              matches={matches}
              editable={editable}
              onOpenCard={setOpenCardId}
              onSetDueDate={(cardId, day) => void setCardDueDate(cardId, day)}
            />
          )}
          {(own.view === 'board' || own.view === 'canvas') && (
            <BoardCanvas
              freeLayout={own.view === 'canvas'}
              onLayout={(layout) => void setLayout(layout)}
              onPositionPanel={setPositionId}
              lists={view.lists}
              labels={view.labels}
              matches={matches}
              freshIds={freshIds}
              columnWidth={own.column_width}
              collapsedIds={own.collapsed_lists}
              onToggleCollapsed={(listId) => toggleListCollapsed(view.board.id, listId)}
              onEditLimit={setLimitListId}
              onBlockSettings={setBlockSettingsId}
              onSaveNote={saveNote}
              onSaveConfig={(blockId, kind, config) =>
                void setBlockConfig(blockId, kind as Exclude<PanelKind, 'list'>, config)
              }
              onAddBlock={() => setPickingBlock(true)}
              onRenameList={(listId, name) => void renameList(listId, name)}
              onMoveList={(listId, index) => void moveList(listId, index)}
              onDeleteList={(listId) => setDeletingListId(listId)}
              onAddList={createList}
              onAddCard={createCard}
              onMoveCard={(cardId, listId, index) => void moveCard(cardId, listId, index)}
              onOpenCard={setOpenCardId}
              readOnly={!editable}
            />
          )}
        </div>

        <CardDialog
          cardId={openCardId}
          onClose={() => setOpenCardId(null)}
          onManageLabels={() => setLabelsOpen(true)}
          onCustomize={() => navigate('/settings/card')}
        />
        <AddBlockDialog
          open={pickingBlock && editable}
          onPick={pickBlock}
          onClose={() => setPickingBlock(false)}
        />
        <MediaDialog
          kind={editable ? mediaKind : null}
          onSubmit={addMedia}
          onClose={() => setMediaKind(null)}
        />
        <BlockSettingsDialog
          block={editable ? settingsBlock : null}
          panels={view.lists}
          onReplacePicture={replacePicture}
          onSave={(blockId, kind, config) =>
            void setBlockConfig(blockId, kind as Exclude<PanelKind, 'list'>, config)
          }
          onClose={() => setBlockSettingsId(null)}
        />
        <TilePositionDialog
          open={positionId !== null && editable}
          name={positionPanel?.name ?? ''}
          kind={positionPanel?.kind ?? 'list'}
          rect={positionPanel ? (resolveLayout(view.lists)[positionPanel.id] ?? null) : null}
          onSave={(rect) => {
            if (!positionPanel) return;
            const layout = resolveLayout(view.lists);
            void setLayout(settle({ ...layout, [positionPanel.id]: rect }, positionPanel.id));
          }}
          onClose={() => setPositionId(null)}
        />
        <WipLimitDialog
          open={limitList !== undefined && editable}
          listName={limitList?.name ?? ''}
          current={limitList?.wip_limit ?? null}
          cardCount={limitList?.cards.length ?? 0}
          onSave={(limit) => {
            if (limitListId) void setListWipLimit(limitListId, limit);
          }}
          onClose={() => setLimitListId(null)}
        />
        <LabelsDialog open={labelsOpen && editable} onClose={() => setLabelsOpen(false)} />
        <FieldsDialog
          open={fieldsOpen && canManage(view.role)}
          onClose={() => setFieldsOpen(false)}
        />
        <MembersDialog
          workspace={membersOpen ? (workspace ?? null) : null}
          onClose={() => setMembersOpen(false)}
        />

        <ConfirmDialog
          open={bulkDelete !== null}
          title={
            bulkDelete && bulkDelete.panels.length > 0
              ? 'Delete the selection?'
              : 'Delete these cards?'
          }
          message={
            bulkDelete
              ? `${[
                  bulkDelete.cards.length > 0
                    ? `${bulkDelete.cards.length} card${bulkDelete.cards.length === 1 ? '' : 's'}`
                    : null,
                  bulkDelete.panels.length > 0
                    ? `${bulkDelete.panels.length} list${bulkDelete.panels.length === 1 ? '' : 's'} or block${bulkDelete.panels.length === 1 ? '' : 's'} with everything inside`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' and ')} will be removed for good.`
              : ''
          }
          confirmLabel="Delete"
          onCancel={() => setBulkDelete(null)}
          onConfirm={() => {
            const chosen = bulkDelete;
            setBulkDelete(null);
            if (!chosen) return;
            void (async () => {
              if (chosen.cards.length > 0) await bulk.deleteCards(chosen.cards);
              if (chosen.panels.length > 0) await bulk.deletePanels(chosen.panels);
            })();
          }}
        />

        <ConfirmDialog
          open={deletingBoard}
          title="Delete this board?"
          message={`“${view.board.name}” and all of its lists and cards will be removed for good.`}
          confirmLabel="Delete board"
          onCancel={() => setDeletingBoard(false)}
          onConfirm={async () => {
            setDeletingBoard(false);
            if (await deleteBoard()) {
              navigate('/dashboard');
            }
          }}
        />

        <ConfirmDialog
          open={deletingList !== undefined}
          title={
            deletingList && !isCardList(deletingList) ? 'Delete this block?' : 'Delete this list?'
          }
          message={
            deletingList
              ? isCardList(deletingList)
                ? `“${deletingList.name}” and its ${deletingList.cards.length} card${deletingList.cards.length === 1 ? '' : 's'} will be removed for good.`
                : `“${deletingList.name}” will be removed. The cards on this board are not affected.`
              : ''
          }
          confirmLabel={deletingList && !isCardList(deletingList) ? 'Delete block' : 'Delete list'}
          onCancel={() => setDeletingListId(null)}
          onConfirm={() => {
            if (deletingListId) {
              void deleteList(deletingListId);
            }
            setDeletingListId(null);
          }}
        />
      </div>
    </BoardMetaProvider>
  );
}
