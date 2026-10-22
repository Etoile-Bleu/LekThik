import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleCatalogue, sampleWorkspaces } from '../../test/fixtures';

vi.mock('@lib/boardsApi', () => ({
  fetchTemplates: vi.fn(),
  fetchWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  createBoard: vi.fn(),
}));

import * as api from '@lib/boardsApi';
import { useTemplateStore } from '@lib/templateStore';
import { useWorkspaceStore } from '@lib/workspaceStore';

import { WorkspacesPage } from './WorkspacesPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <WorkspacesPage />
    </MemoryRouter>
  );
}

describe('WorkspacesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
    useTemplateStore.setState({ catalogue: null, status: 'idle' });
    vi.mocked(api.fetchTemplates).mockResolvedValue(sampleCatalogue());
  });

  it('invites the user to create a first workspace when there is none', () => {
    useWorkspaceStore.setState({ workspaces: [], status: 'ready' });

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Workspaces' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Start with a workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create your first workspace/ })).toBeInTheDocument();
  });

  it('shows a loading state before the first response', () => {
    renderPage();

    expect(screen.getByText('Loading your workspaces…')).toBeInTheDocument();
  });

  it('creates a workspace from the dialog', async () => {
    useWorkspaceStore.setState({ workspaces: [], status: 'ready' });
    vi.mocked(api.createWorkspace).mockResolvedValueOnce({
      id: 'w9',
      name: 'Marketing',
      boards: [],
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Create your first workspace/ }));
    const dialog = screen.getByRole('dialog', { name: 'New workspace' });
    fireEvent.change(within(dialog).getByLabelText('Workspace name'), {
      target: { value: 'Marketing' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => expect(api.createWorkspace).toHaveBeenCalledWith('Marketing', null));
    expect(await screen.findByRole('heading', { level: 2, name: 'Marketing' })).toBeInTheDocument();
  });

  it('lists every workspace with its boards as links', () => {
    useWorkspaceStore.setState({ workspaces: sampleWorkspaces(), status: 'ready' });

    renderPage();

    expect(screen.getByRole('heading', { level: 2, name: 'Design team' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Side project' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Roadmap' })).toHaveAttribute('href', '/b/b1');
    expect(screen.getByRole('link', { name: 'Bugs' })).toHaveAttribute('href', '/b/b2');
    expect(screen.getAllByRole('button', { name: /New board/ })).toHaveLength(2);
  });

  it('adds a board to the chosen workspace', async () => {
    useWorkspaceStore.setState({ workspaces: sampleWorkspaces(), status: 'ready' });
    vi.mocked(api.createBoard).mockResolvedValueOnce({
      id: 'b9',
      workspace_id: 'w2',
      name: 'Launch',
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New board in Side project' }));
    const dialog = screen.getByRole('dialog', { name: 'New board' });
    fireEvent.change(within(dialog).getByLabelText('Board name'), { target: { value: 'Launch' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create board' }));

    await waitFor(() => expect(api.createBoard).toHaveBeenCalledWith('w2', 'Launch', null));
  });

  it('renames a workspace from its menu', async () => {
    useWorkspaceStore.setState({ workspaces: sampleWorkspaces(), status: 'ready' });
    vi.mocked(api.renameWorkspace).mockResolvedValueOnce({ id: 'w2', name: 'Hobby' });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for workspace Side project' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename workspace' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename workspace' });
    fireEvent.change(within(dialog).getByLabelText('Workspace name'), {
      target: { value: 'Hobby' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save name' }));

    await waitFor(() => expect(api.renameWorkspace).toHaveBeenCalledWith('w2', 'Hobby'));
  });

  it('asks for confirmation before deleting a workspace', async () => {
    useWorkspaceStore.setState({ workspaces: sampleWorkspaces(), status: 'ready' });
    vi.mocked(api.deleteWorkspace).mockResolvedValueOnce(undefined);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for workspace Side project' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete workspace' }));
    expect(api.deleteWorkspace).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog', { name: 'Delete this workspace?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete workspace' }));

    await waitFor(() => expect(api.deleteWorkspace).toHaveBeenCalledWith('w2'));
  });
});
