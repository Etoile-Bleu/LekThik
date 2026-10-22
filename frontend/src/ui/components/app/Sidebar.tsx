import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import type { Workspace } from '@lib/boardsApi';
import { useWorkspaceStore } from '@lib/workspaceStore';

import { TemplatePicker } from '../templates/TemplatePicker';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ChevronDownIcon, PencilIcon, PlusIcon, TrashIcon } from '../ui/Icons';
import { Menu } from '../ui/Menu';
import { NameDialog } from '../ui/NameDialog';
import './Sidebar.css';

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const status = useWorkspaceStore((state) => state.status);
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
  const createBoard = useWorkspaceStore((state) => state.createBoard);
  const renameWorkspace = useWorkspaceStore((state) => state.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace);
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [boardTarget, setBoardTarget] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState<Workspace | null>(null);

  function toggle(workspaceId: string) {
    setCollapsed((current) =>
      current.includes(workspaceId)
        ? current.filter((id) => id !== workspaceId)
        : [...current, workspaceId]
    );
  }

  return (
    <nav className="sidebar" aria-label="Workspaces and boards">
      <div className="sidebar__header">
        <NavLink to="/dashboard" end className="sidebar__overview" onClick={onNavigate}>
          All workspaces
        </NavLink>
      </div>

      {status === 'loading' && (
        <div className="sidebar__skeleton" role="status" aria-label="Loading workspaces">
          <span />
          <span />
          <span />
        </div>
      )}

      <ul className="sidebar__groups">
        {workspaces.map((workspace) => {
          const isOpen = !collapsed.includes(workspace.id);
          const panelId = `sidebar-${workspace.id}`;
          return (
            <li key={workspace.id} className="sidebar__group" data-open={isOpen}>
              <div className="sidebar__row">
                <button
                  type="button"
                  className="sidebar__toggle"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(workspace.id)}
                >
                  <span className="sidebar__workspace-name">{workspace.name}</span>
                  <ChevronDownIcon className="sidebar__chevron" />
                </button>
                <Menu
                  label={`Actions for workspace ${workspace.name}`}
                  triggerClassName="sidebar__more"
                  items={[
                    {
                      label: 'New board',
                      icon: <PlusIcon />,
                      onSelect: () => setBoardTarget(workspace.id),
                    },
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
              <div
                id={panelId}
                className="sidebar__panel"
                {...(isOpen ? {} : ({ inert: '' } as Record<string, string>))}
              >
                <ul className="sidebar__boards">
                  {workspace.boards.map((board) => (
                    <li key={board.id}>
                      <NavLink
                        to={`/b/${board.id}`}
                        className="sidebar__board"
                        onClick={onNavigate}
                      >
                        {board.name}
                      </NavLink>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      className="sidebar__add"
                      onClick={() => setBoardTarget(workspace.id)}
                    >
                      <PlusIcon size={16} />
                      <span>New board</span>
                      <span className="sr-only"> in {workspace.name}</span>
                    </button>
                  </li>
                </ul>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__create"
          onClick={() => setCreatingWorkspace(true)}
        >
          <PlusIcon size={16} />
          New workspace
        </button>
      </div>

      <TemplatePicker
        open={creatingWorkspace}
        mode="workspace"
        onClose={() => setCreatingWorkspace(false)}
        onSubmit={async ({ name, templateId }) => {
          const created = await createWorkspace(name, templateId);
          if (created) {
            onNavigate?.();
            navigate('/dashboard');
          }
          return created !== null;
        }}
      />
      <TemplatePicker
        open={boardTarget !== null}
        mode="board"
        onClose={() => setBoardTarget(null)}
        onSubmit={async ({ name, templateId }) => {
          if (!boardTarget) return false;
          const board = await createBoard(boardTarget, name, templateId);
          if (board) {
            onNavigate?.();
            navigate(`/b/${board.id}`);
          }
          return board !== null;
        }}
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
        onConfirm={async () => {
          const target = deleting;
          setDeleting(null);
          if (!target) return;
          const boardIds = target.boards.map((board) => board.id);
          const deleted = await deleteWorkspace(target.id);
          if (deleted && boardIds.some((id) => location.pathname === `/b/${id}`)) {
            onNavigate?.();
            navigate('/dashboard');
          }
        }}
      />
    </nav>
  );
}
