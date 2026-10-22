import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useDocumentTitle } from '@hooks/useDocumentTitle';
import { matchesFilter } from '@lib/boardModel';
import { useBoardStore } from '@lib/boardStore';
import { canEdit, canManage } from '@lib/roles';
import { useWorkspaceStore } from '@lib/workspaceStore';

import { BoardCanvas } from '../components/board/BoardCanvas';
import { CardDialog } from '../components/board/CardDialog';
import { LabelFilterBar } from '../components/board/LabelFilterBar';
import { LabelsDialog } from '../components/board/LabelsDialog';
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
  const deleteBoard = useBoardStore((state) => state.deleteBoard);
  const createList = useBoardStore((state) => state.createList);
  const renameList = useBoardStore((state) => state.renameList);
  const moveList = useBoardStore((state) => state.moveList);
  const deleteList = useBoardStore((state) => state.deleteList);
  const createCard = useBoardStore((state) => state.createCard);
  const moveCard = useBoardStore((state) => state.moveCard);
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [filter, setFilter] = useState<string[]>([]);
  const [deletingBoard, setDeletingBoard] = useState(false);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);

  useDocumentTitle(view?.board.name ?? 'Board');

  useEffect(() => {
    setFilter([]);
    setOpenCardId(null);
    void load(boardId);
    return () => reset();
  }, [boardId, load, reset]);

  const workspaceName = useMemo(
    () => workspaces.find((workspace) => workspace.id === view?.board.workspace_id)?.name,
    [workspaces, view?.board.workspace_id]
  );

  const counts = useMemo(() => {
    const cards = view?.lists.flatMap((list) => list.cards) ?? [];
    return {
      total: cards.length,
      matching: cards.filter((card) => matchesFilter(card, filter)).length,
    };
  }, [view, filter]);

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
  const editable = canEdit(view.role);
  const workspace = workspaces.find((candidate) => candidate.id === view.board.workspace_id);

  function toggleFilter(labelId: string) {
    setFilter((current) =>
      current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId]
    );
  }

  return (
    <div className="board-page">
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

      <LabelFilterBar
        labels={view.labels}
        selected={filter}
        onToggle={toggleFilter}
        onClear={() => setFilter([])}
        matchCount={counts.matching}
        totalCount={counts.total}
      />

      <div className="board-page__canvas">
        <BoardCanvas
          lists={view.lists}
          labels={view.labels}
          filter={filter}
          freshIds={freshIds}
          onRenameList={(listId, name) => void renameList(listId, name)}
          onMoveList={(listId, index) => void moveList(listId, index)}
          onDeleteList={(listId) => setDeletingListId(listId)}
          onAddList={createList}
          onAddCard={createCard}
          onMoveCard={(cardId, listId, index) => void moveCard(cardId, listId, index)}
          onOpenCard={setOpenCardId}
          readOnly={!editable}
        />
      </div>

      <CardDialog
        cardId={openCardId}
        onClose={() => setOpenCardId(null)}
        onManageLabels={() => setLabelsOpen(true)}
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
        title="Delete this list?"
        message={
          deletingList
            ? `“${deletingList.name}” and its ${deletingList.cards.length} card${deletingList.cards.length === 1 ? '' : 's'} will be removed for good.`
            : ''
        }
        confirmLabel="Delete list"
        onCancel={() => setDeletingListId(null)}
        onConfirm={() => {
          if (deletingListId) {
            void deleteList(deletingListId);
          }
          setDeletingListId(null);
        }}
      />
    </div>
  );
}
