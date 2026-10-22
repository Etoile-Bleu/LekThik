import { create } from 'zustand';

import type { Role } from './boardsApi';
import * as api from './collabApi';
import type { MembersOverview } from './collabApi';
import { notifyError, notifySuccess } from './toastStore';
import { useWorkspaceStore } from './workspaceStore';

type MembersStatus = 'idle' | 'loading' | 'ready' | 'error';

interface MembersState {
  workspaceId: string | null;
  overview: MembersOverview | null;
  status: MembersStatus;
  /** Follow this workspace; the live stream keeps it fresh. */
  open: (workspaceId: string) => Promise<void>;
  refresh: () => Promise<void>;
  close: () => void;
  invite: (email: string, role: Exclude<Role, 'owner'>) => Promise<boolean>;
  revoke: (invitationId: string) => Promise<void>;
  changeRole: (userId: string, role: Role) => Promise<void>;
  remove: (userId: string) => Promise<boolean>;
}

export const useMembersStore = create<MembersState>((set, get) => {
  const fetchCurrent = async () => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;
    try {
      const overview = await api.fetchMembers(workspaceId);
      if (get().workspaceId === workspaceId) {
        set({ overview, status: 'ready' });
      }
    } catch (error) {
      if (get().workspaceId === workspaceId) {
        set({ status: 'error' });
        notifyError(error, 'Could not load the members.');
      }
    }
  };

  return {
    workspaceId: null,
    overview: null,
    status: 'idle',

    open: async (workspaceId) => {
      set({ workspaceId, overview: null, status: 'loading' });
      await fetchCurrent();
    },

    refresh: fetchCurrent,

    close: () => set({ workspaceId: null, overview: null, status: 'idle' }),

    invite: async (email, role) => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) return false;
      try {
        const invitation = await api.inviteMember(workspaceId, email, role);
        notifySuccess(`Invitation sent to ${invitation.email}.`);
        await fetchCurrent();
        return true;
      } catch (error) {
        notifyError(error);
        return false;
      }
    },

    revoke: async (invitationId) => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) return;
      try {
        await api.revokeInvitation(workspaceId, invitationId);
      } catch (error) {
        notifyError(error);
      }
      await fetchCurrent();
    },

    changeRole: async (userId, role) => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) return;
      try {
        await api.changeMemberRole(workspaceId, userId, role);
      } catch (error) {
        notifyError(error);
      }
      await fetchCurrent();
    },

    remove: async (userId) => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) return false;
      try {
        await api.removeMember(workspaceId, userId);
        await fetchCurrent();
        void useWorkspaceStore.getState().load();
        return true;
      } catch (error) {
        notifyError(error);
        return false;
      }
    },
  };
});
