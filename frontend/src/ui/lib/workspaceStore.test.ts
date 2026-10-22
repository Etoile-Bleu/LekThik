import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./boardsApi', () => ({
  fetchWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  createBoard: vi.fn(),
}));

import * as api from './boardsApi';
import { useToastStore } from './toastStore';
import { useWorkspaceStore } from './workspaceStore';

const team = {
  id: 'w1',
  name: 'Team',
  role: 'owner' as const,
  boards: [{ id: 'b1', workspace_id: 'w1', name: 'Roadmap' }],
};

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
    useToastStore.setState({ toasts: [] });
  });

  it('loads the workspaces with their boards', async () => {
    vi.mocked(api.fetchWorkspaces).mockResolvedValueOnce([team]);

    await useWorkspaceStore.getState().load();

    expect(useWorkspaceStore.getState()).toMatchObject({ workspaces: [team], status: 'ready' });
  });

  it('reports a failed load without crashing', async () => {
    vi.mocked(api.fetchWorkspaces).mockRejectedValueOnce(new Error('offline'));

    await useWorkspaceStore.getState().load();

    expect(useWorkspaceStore.getState().status).toBe('error');
    expect(useToastStore.getState().toasts[0]?.message).toBe('offline');
  });

  it('adds a created workspace with no boards', async () => {
    vi.mocked(api.createWorkspace).mockResolvedValueOnce({
      id: 'w2',
      name: 'Design',
      role: 'owner',
      boards: [],
    });

    const created = await useWorkspaceStore.getState().createWorkspace('Design');

    expect(created).toEqual({ id: 'w2', name: 'Design', role: 'owner', boards: [] });
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(1);
  });

  it('passes the chosen template on and keeps the boards it created', async () => {
    const board = { id: 'b9', workspace_id: 'w3', name: 'Sprint planning' };
    vi.mocked(api.createWorkspace).mockResolvedValueOnce({
      id: 'w3',
      name: 'Platform',
      role: 'owner',
      boards: [board],
    });

    const created = await useWorkspaceStore.getState().createWorkspace('Platform', 'software-team');

    expect(api.createWorkspace).toHaveBeenCalledWith('Platform', 'software-team');
    expect(created?.boards).toEqual([board]);
    expect(useWorkspaceStore.getState().workspaces[0].boards).toEqual([board]);
  });

  it('returns null and toasts when creation fails', async () => {
    vi.mocked(api.createWorkspace).mockRejectedValueOnce(new Error('you have reached the limit'));

    const created = await useWorkspaceStore.getState().createWorkspace('Design');

    expect(created).toBeNull();
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('renames optimistically and reloads when the server refuses', async () => {
    useWorkspaceStore.setState({ workspaces: [team], status: 'ready' });
    vi.mocked(api.renameWorkspace).mockRejectedValueOnce(new Error('nope'));
    vi.mocked(api.fetchWorkspaces).mockResolvedValueOnce([team]);

    const pending = useWorkspaceStore.getState().renameWorkspace('w1', 'Renamed');
    expect(useWorkspaceStore.getState().workspaces[0].name).toBe('Renamed');
    await pending;

    expect(useWorkspaceStore.getState().workspaces[0].name).toBe('Team');
  });

  it('adds a created board to its workspace', async () => {
    useWorkspaceStore.setState({ workspaces: [team], status: 'ready' });
    vi.mocked(api.createBoard).mockResolvedValueOnce({
      id: 'b2',
      workspace_id: 'w1',
      name: 'Bugs',
    });

    await useWorkspaceStore.getState().createBoard('w1', 'Bugs');

    expect(useWorkspaceStore.getState().workspaces[0].boards.map((board) => board.name)).toEqual([
      'Roadmap',
      'Bugs',
    ]);
  });

  it('removes a deleted workspace only after the server confirms', async () => {
    useWorkspaceStore.setState({ workspaces: [team], status: 'ready' });
    vi.mocked(api.deleteWorkspace).mockResolvedValueOnce(undefined);

    const deleted = await useWorkspaceStore.getState().deleteWorkspace('w1');

    expect(deleted).toBe(true);
    expect(useWorkspaceStore.getState().workspaces).toEqual([]);
  });

  it('keeps the workspace when deletion fails', async () => {
    useWorkspaceStore.setState({ workspaces: [team], status: 'ready' });
    vi.mocked(api.deleteWorkspace).mockRejectedValueOnce(new Error('nope'));

    const deleted = await useWorkspaceStore.getState().deleteWorkspace('w1');

    expect(deleted).toBe(false);
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(1);
  });

  it('keeps board names in sync and forgets deleted boards', () => {
    useWorkspaceStore.setState({ workspaces: [team], status: 'ready' });

    useWorkspaceStore.getState().syncBoardName('b1', 'Q4 plan');
    expect(useWorkspaceStore.getState().workspaces[0].boards[0].name).toBe('Q4 plan');

    useWorkspaceStore.getState().forgetBoard('b1');
    expect(useWorkspaceStore.getState().workspaces[0].boards).toEqual([]);
  });
});
