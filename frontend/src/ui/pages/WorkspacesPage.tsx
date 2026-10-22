import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useDocumentTitle } from '@hooks/useDocumentTitle';
import type { Workspace } from '@lib/boardsApi';
import { useWorkspaceStore } from '@lib/workspaceStore';

import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PencilIcon, PlusIcon, TrashIcon } from '../components/ui/Icons';
import { Menu } from '../components/ui/Menu';
import { TemplatePicker } from '../components/templates/TemplatePicker';
import { NameDialog } from '../components/ui/NameDialog';
import './WorkspacesPage.css';

export function WorkspacesPage() {
  useDocumentTitle('Workspaces');
  const navigate = useNavigate();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const status = useWorkspaceStore((state) => state.status);
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
  const renameWorkspace = useWorkspaceStore((state) => state.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace);
  const createBoard = useWorkspaceStore((state) => state.createBoard);

  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [renaming, setRenaming] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState<Workspace | null>(null);
  const [boardTarget, setBoardTarget] = useState<Workspace | null>(null);

  const isLoading = status === 'idle' || status === 'loading';

  return (
    <div className="workspaces">
      <header className="workspaces__header">
        <div>
          <h1 className="workspaces__title">Workspaces</h1>
          <p className="workspaces__subtitle">
            A workspace groups the boards of one team or project.
          </p>
        </div>
        {workspaces.length > 0 && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setCreatingWorkspace(true)}
          >
            <PlusIcon /> New workspace
          </button>
        )}
      </header>

      {isLoading && (
        <div className="workspaces__skeleton" role="status" aria-busy="true">
          <span className="sr-only">Loading your workspaces…</span>
          <div />
          <div />
          <div />
        </div>
      )}

      {!isLoading && workspaces.length === 0 && (
        <section className="workspaces__empty" aria-labelledby="empty-title">
          <h2 id="empty-title">Start with a workspace</h2>
          <p>
            Create one for each team or project, then add boards, lists and cards inside it. You can
            have as many as you need.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setCreatingWorkspace(true)}
          >
            <PlusIcon /> Create your first workspace
          </button>
        </section>
      )}

      {workspaces.map((workspace) => (
        <section
          key={workspace.id}
          className="workspace"
          aria-labelledby={`workspace-${workspace.id}`}
        >
          <div className="workspace__header">
            <h2 id={`workspace-${workspace.id}`} className="workspace__name">
              {workspace.name}
            </h2>
            <Menu
              label={`Actions for workspace ${workspace.name}`}
              items={[
                {
                  label: 'Rename workspace',
                  icon: <PencilIcon />,
                  onSelect: () => setRenaming(workspace),
                },
                {
                  label: 'Delete workspace',
                  icon: <TrashIcon />,
                  tone: 'danger',
                  onSelect: () => setDeleting(workspace),
                },
              ]}
            />
          </div>

          <ul className="board-grid">
            {workspace.boards.map((board) => (
              <li key={board.id}>
                <Link className="board-tile" to={`/b/${board.id}`}>
                  <span className="board-tile__name">{board.name}</span>
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="board-tile board-tile--new"
                onClick={() => setBoardTarget(workspace)}
              >
                <PlusIcon />
                <span>
                  New board<span className="sr-only"> in {workspace.name}</span>
                </span>
              </button>
            </li>
          </ul>
        </section>
      ))}

      <TemplatePicker
        open={creatingWorkspace}
        mode="workspace"
        onClose={() => setCreatingWorkspace(false)}
        onSubmit={async ({ name, templateId }) =>
          (await createWorkspace(name, templateId)) !== null
        }
      />

      <NameDialog
        open={renaming !== null}
        title="Rename workspace"
        fieldLabel="Workspace name"
        submitLabel="Save name"
        initialValue={renaming?.name ?? ''}
        onClose={() => setRenaming(null)}
        onSubmit={async (name) => {
          if (renaming) {
            await renameWorkspace(renaming.id, name);
          }
          return true;
        }}
      />

      <TemplatePicker
        open={boardTarget !== null}
        mode="board"
        onClose={() => setBoardTarget(null)}
        onSubmit={async ({ name, templateId }) => {
          if (!boardTarget) return false;
          const board = await createBoard(boardTarget.id, name, templateId);
          if (board) {
            navigate(`/b/${board.id}`);
          }
          return board !== null;
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this workspace?"
        message={
          deleting
            ? `“${deleting.name}” and every board, list and card inside it will be removed for good.`
            : ''
        }
        confirmLabel="Delete workspace"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            void deleteWorkspace(deleting.id);
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}
