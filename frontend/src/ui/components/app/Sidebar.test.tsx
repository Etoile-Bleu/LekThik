import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleCatalogue, sampleWorkspaces } from '../../../test/fixtures';

vi.mock('@lib/boardsApi', () => ({
  fetchTemplates: vi.fn(),
  createWorkspace: vi.fn(),
  createBoard: vi.fn(),
}));

import * as api from '@lib/boardsApi';
import { useTemplateStore } from '@lib/templateStore';
import { useWorkspaceStore } from '@lib/workspaceStore';

import { Sidebar } from './Sidebar';

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/b/b1']}>
      <Routes>
        <Route path="/b/:boardId" element={<Sidebar />} />
        <Route path="/dashboard" element={<p>overview page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({ workspaces: sampleWorkspaces(), status: 'ready' });
    useTemplateStore.setState({ catalogue: null, status: 'idle' });
    vi.mocked(api.fetchTemplates).mockResolvedValue(sampleCatalogue());
  });

  it('links every board and marks the current one', () => {
    renderSidebar();

    expect(screen.getByRole('navigation', { name: 'Workspaces and boards' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Roadmap' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Bugs' })).not.toHaveAttribute('aria-current');
  });

  it('collapses and expands a workspace', () => {
    renderSidebar();
    const toggle = screen.getByRole('button', { name: 'Design team' });

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('creates a workspace and goes to the overview', async () => {
    vi.mocked(api.createWorkspace).mockResolvedValueOnce({ id: 'w3', name: 'Ops', boards: [] });
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'New workspace' }));
    const dialog = screen.getByRole('dialog', { name: 'New workspace' });
    fireEvent.change(within(dialog).getByLabelText('Workspace name'), { target: { value: 'Ops' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => expect(api.createWorkspace).toHaveBeenCalledWith('Ops', null));
    expect(await screen.findByText('overview page')).toBeInTheDocument();
  });
});
