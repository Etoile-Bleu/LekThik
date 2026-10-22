import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useWorkspaceStore } from '@lib/workspaceStore';

import { ChevronDownIcon, PlusIcon } from '../ui/Icons';
import { TemplatePicker } from '../templates/TemplatePicker';
import './Sidebar.css';

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const status = useWorkspaceStore((state) => state.status);
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
  const createBoard = useWorkspaceStore((state) => state.createBoard);
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [boardTarget, setBoardTarget] = useState<string | null>(null);

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
    </nav>
  );
}
