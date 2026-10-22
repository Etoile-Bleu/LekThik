import { create } from 'zustand';

import * as api from './collabApi';
import type { Invitation } from './collabApi';
import { notifyError, notifySuccess } from './toastStore';
import { useWorkspaceStore } from './workspaceStore';

interface InvitationState {
  invitations: Invitation[];
  load: () => Promise<void>;
  accept: (invitation: Invitation) => Promise<boolean>;
  decline: (invitation: Invitation) => Promise<boolean>;
  reset: () => void;
}

export const useInvitationStore = create<InvitationState>((set, get) => ({
  invitations: [],

  load: async () => {
    try {
      set({ invitations: await api.fetchMyInvitations() });
    } catch {
      // The inbox is a convenience; the sidebar stays usable without it.
    }
  },

  accept: async (invitation) => {
    try {
      await api.acceptInvitation(invitation.id);
      set((state) => ({
        invitations: state.invitations.filter((item) => item.id !== invitation.id),
      }));
      notifySuccess(`You joined ${invitation.workspace_name}.`);
      await useWorkspaceStore.getState().load();
      return true;
    } catch (error) {
      notifyError(error);
      await get().load();
      return false;
    }
  },

  decline: async (invitation) => {
    try {
      await api.declineInvitation(invitation.id);
      set((state) => ({
        invitations: state.invitations.filter((item) => item.id !== invitation.id),
      }));
      return true;
    } catch (error) {
      notifyError(error);
      await get().load();
      return false;
    }
  },

  reset: () => set({ invitations: [] }),
}));
