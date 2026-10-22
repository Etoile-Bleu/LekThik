import { create } from 'zustand';

import * as api from './boardsApi';
import type { BoardSummary, Workspace } from './boardsApi';
import { notifyError } from './toastStore';

type WorkspaceStatus = 'idle' | 'loading' | 'ready' | 'error';

interface WorkspaceState {
  workspaces: Workspace[];
  status: WorkspaceStatus;
  load: () => Promise<void>;
  createWorkspace: (name: string, templateId?: string | null) => Promise<Workspace | null>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<boolean>;
  createBoard: (
    workspaceId: string,
    name: string,
    templateId?: string | null
  ) => Promise<BoardSummary | null>;
  syncBoardName: (boardId: string, name: string) => void;
  forgetBoard: (boardId: string) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  status: 'idle',

  load: async () => {
    if (get().status === 'idle') {
      set({ status: 'loading' });
    }
    try {
      set({ workspaces: await api.fetchWorkspaces(), status: 'ready' });
    } catch (error) {
      set({ status: 'error' });
      notifyError(error, 'Could not load your workspaces.');
    }
  },

  createWorkspace: async (name, templateId) => {
    try {
      const workspace = await api.createWorkspace(name, templateId);
      set((state) => ({ workspaces: [...state.workspaces, workspace], status: 'ready' }));
      return workspace;
    } catch (error) {
      notifyError(error);
      return null;
    }
  },

  renameWorkspace: async (id, name) => {
    set((state) => ({
      workspaces: state.workspaces.map((workspace) =>
        workspace.id === id ? { ...workspace, name } : workspace
      ),
    }));
    try {
      await api.renameWorkspace(id, name);
    } catch (error) {
      notifyError(error);
      await get().load();
    }
  },

  deleteWorkspace: async (id) => {
    try {
      await api.deleteWorkspace(id);
      set((state) => ({ workspaces: state.workspaces.filter((workspace) => workspace.id !== id) }));
      return true;
    } catch (error) {
      notifyError(error);
      return false;
    }
  },

  createBoard: async (workspaceId, name, templateId) => {
    try {
      const board = await api.createBoard(workspaceId, name, templateId);
      set((state) => ({
        workspaces: state.workspaces.map((workspace) =>
          workspace.id === workspaceId
            ? { ...workspace, boards: [...workspace.boards, board] }
            : workspace
        ),
      }));
      return board;
    } catch (error) {
      notifyError(error);
      return null;
    }
  },

  syncBoardName: (boardId, name) =>
    set((state) => ({
      workspaces: state.workspaces.map((workspace) => ({
        ...workspace,
        boards: workspace.boards.map((board) =>
          board.id === boardId ? { ...board, name } : board
        ),
      })),
    })),

  forgetBoard: (boardId) =>
    set((state) => ({
      workspaces: state.workspaces.map((workspace) => ({
        ...workspace,
        boards: workspace.boards.filter((board) => board.id !== boardId),
      })),
    })),

  reset: () => set({ workspaces: [], status: 'idle' }),
}));
