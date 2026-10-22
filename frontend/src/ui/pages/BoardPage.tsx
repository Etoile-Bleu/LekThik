import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { BoardMetaProvider } from '@hooks/useBoardMeta';
import { useEffectiveTheme } from '@hooks/useEffectiveTheme';
import { useDocumentTitle } from '@hooks/useDocumentTitle';
import { useToday } from '@hooks/useToday';
import { announce } from '@lib/announcer';
import { useAuthStore } from '@lib/authStore';
import { type CardFilter, EMPTY_FILTER, cardMatches } from '@lib/boardModel';
import type { CardSummary } from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';
import { lookStyle } from '@lib/boardLooks';
import {
  DEFAULT_AGENDA,
  DEFAULT_CALENDAR,
  DEFAULT_COUNTER,
  DEFAULT_NOTE,
  KIND_LABEL,
  isCardList,
} from '@lib/blocks';
import type { PanelConfig, PanelKind } from '@lib/boardsApi';
import { type BoardViewKind, boardPrefsFor, cardDisplayFor } from '@lib/prefs';
import { usePrefsStore } from '@lib/prefsStore';
import { canEdit, canManage } from '@lib/roles';
import { useWorkspaceStore } from '@lib/workspaceStore';

import { AddBlockDialog } from '../components/board/AddBlockDialog';
import { BlockSettingsDialog } from '../components/board/BlockSettingsDialog';
import { BoardCalendar } from '../components/board/BoardCalendar';
import { BoardCanvas } from '../components/board/BoardCanvas';
import { BoardTable } from '../components/board/BoardTable';
import { CardDialog } from '../components/board/CardDialog';
import { FilterBar } from '../components/board/FilterBar';
import { LabelsDialog } from '../components/board/LabelsDialog';
import { ViewSwitcher } from '../components/board/ViewSwitcher';
import { WipLimitDialog } from '../components/board/WipLimitDialog';
import { DisplayMenu } from '../components/appearance/DisplayMenu';
import { MembersDialog } from '../components/collab/MembersDialog';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ArrowLeftIcon, TagIcon, TrashIcon, UsersIcon } from '../components/ui/Icons';
import { InlineEdit } from '../components/ui/InlineEdit';
import { Menu } from '../components/ui/Menu';
import './BoardPage.css';

export function BoardPage() {
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
  const renameList = useBoardStore((state) => state.renameList);
  const moveList = useBoardStore((state) => state.moveList);
  const setListWipLimit = useBoardStore((state) => state.setListWipLimit);
  const setCardDueDate = useBoardStore((state) => state.setCardDueDate);
  const deleteList = useBoardStore((state) => state.deleteList);
  const createCard = useBoardStore((state) => state.createCard);
  const moveCard = useBoardStore((state) => state.moveCard);
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [filter, setFilter] = useState<CardFilter>(EMPTY_FILTER);
  const meId = useAuthStore((state) => state.user?.id);
  const today = useToday();
  const [deletingBoard, setDeletingBoard] = useState(false);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const [limitListId, setLimitListId] = useState<string | null>(null);
  const [pickingBlock, setPickingBlock] = useState(false);
  const [blockSettingsId, setBlockSettingsId] = useState<string | null>(null);

  useDocumentTitle(view?.board.name ?? 'Board');

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

  const matches = useCallback(
    (card: CardSummary) => cardMatches(card, filter, { meId, today }),
    [filter, meId, today]
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
  const own = boardPrefsFor(prefs, view.board.id);

  const boardId_ = view.board.id;

  const DEFAULTS: Record<Exclude<PanelKind, 'list'>, PanelConfig> = {
    calendar: DEFAULT_CALENDAR,
    agenda: DEFAULT_AGENDA,
    note: DEFAULT_NOTE,
    counter: DEFAULT_COUNTER,
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

  async function addBlock(kind: Exclude<PanelKind, 'list'>) {
    const block = await createBlock(kind, uniqueName(KIND_LABEL[kind]), DEFAULTS[kind]);
    if (!block) return;
    announce(`${KIND_LABEL[kind]} block added.`);
    // A counter needs to be pointed at something before it says anything useful.
    if (kind === 'counter') setBlockSettingsId(block.id);
  }

  function changeView(next: BoardViewKind) {
    updateBoardPrefs(boardId_, { view: next });
    announce(`${next === 'board' ? 'Board' : next === 'list' ? 'List' : 'Calendar'} view.`);
  }
  const editable = canEdit(view.role);
  const workspace = workspaces.find((candidate) => candidate.id === view.board.workspace_id);

  return (
    <BoardMetaProvider
      members={view.members}
      meId={meId}
      today={today}
      display={cardDisplayFor(prefs, view.board.id)}
    >
      <div className="board-page" style={lookStyle(view.look, theme)}>
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
          filter={filter}
          onChange={setFilter}
          matchCount={counts.matching}
          totalCount={counts.total}
          leading={<ViewSwitcher value={own.view} onChange={changeView} />}
        />

        <div className="board-page__canvas" key={own.view}>
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
          {own.view === 'board' && (
            <BoardCanvas
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
          onPick={(kind) => void addBlock(kind)}
          onClose={() => setPickingBlock(false)}
        />
        <BlockSettingsDialog
          block={editable ? settingsBlock : null}
          panels={view.lists}
          onSave={(blockId, kind, config) =>
            void setBlockConfig(blockId, kind as Exclude<PanelKind, 'list'>, config)
          }
          onClose={() => setBlockSettingsId(null)}
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
        <MembersDialog
          workspace={membersOpen ? (workspace ?? null) : null}
          onClose={() => setMembersOpen(false)}
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
