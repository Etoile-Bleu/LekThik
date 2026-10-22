import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/collabApi');
vi.mock('@lib/boardsApi');

import { useAuthStore } from '@lib/authStore';
import type { Workspace } from '@lib/boardsApi';
import * as collab from '@lib/collabApi';
import type { MembersOverview } from '@lib/collabApi';

import { MembersDialog } from './MembersDialog';

const workspace: Workspace = { id: 'w1', name: 'Design team', role: 'admin', boards: [] };

function overview(role: MembersOverview['role']): MembersOverview {
  return {
    role,
    members: [
      {
        user_id: 'u-owner',
        username: 'olga',
        email: 'olga@example.com',
        role: 'owner',
        joined_at: '2026-10-01T10:00:00Z',
      },
      {
        user_id: 'u-me',
        username: 'amir',
        email: 'amir@example.com',
        role,
        joined_at: '2026-10-02T10:00:00Z',
      },
      {
        user_id: 'u-w',
        username: 'wen',
        email: 'wen@example.com',
        role: 'writer',
        joined_at: '2026-10-03T10:00:00Z',
      },
    ],
    invitations: [
      {
        id: 'i1',
        workspace_id: 'w1',
        workspace_name: 'Design team',
        email: 'new@example.com',
        role: 'reader',
        invited_by: 'amir',
        status: 'pending',
        created_at: '2026-10-04T10:00:00Z',
        expires_at: '2026-10-11T10:00:00Z',
        expired: false,
      },
    ],
  };
}

function renderDialog(target: Workspace | null = workspace) {
  return render(
    <MemoryRouter>
      <MembersDialog workspace={target} onClose={() => undefined} />
    </MemoryRouter>
  );
}

describe('MembersDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({
      user: { id: 'u-me', email: 'amir@example.com', username: 'amir' },
      status: 'authenticated',
    });
  });

  it('lets an admin invite, change roles of lower members and revoke invitations', async () => {
    vi.mocked(collab.fetchMembers).mockResolvedValue(overview('admin'));
    vi.mocked(collab.inviteMember).mockResolvedValue(overview('admin').invitations[0]);
    vi.mocked(collab.changeMemberRole).mockResolvedValue(overview('admin').members[2]);
    vi.mocked(collab.revokeInvitation).mockResolvedValue(undefined);

    renderDialog();

    expect(await screen.findByText('wen')).toBeInTheDocument();
    expect(screen.getByText('(you)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Invite by email'), {
      target: { value: 'sam@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send invite/ }));
    await waitFor(() =>
      expect(collab.inviteMember).toHaveBeenCalledWith('w1', 'sam@example.com', 'writer')
    );

    fireEvent.change(screen.getByLabelText('Role of wen'), { target: { value: 'reader' } });
    await waitFor(() =>
      expect(collab.changeMemberRole).toHaveBeenCalledWith('w1', 'u-w', 'reader')
    );

    fireEvent.click(screen.getByRole('button', { name: /Revoke/ }));
    await waitFor(() => expect(collab.revokeInvitation).toHaveBeenCalledWith('w1', 'i1'));
  });

  it('never offers controls on the owner, on peers or on yourself', async () => {
    vi.mocked(collab.fetchMembers).mockResolvedValue(overview('admin'));

    renderDialog();
    await screen.findByText('wen');

    expect(screen.queryByLabelText('Role of olga')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Role of amir')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove olga' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove wen' })).toBeInTheDocument();
  });

  it('shows writers the list only, with a way to leave', async () => {
    vi.mocked(collab.fetchMembers).mockResolvedValue({ ...overview('writer'), invitations: [] });

    renderDialog({ ...workspace, role: 'writer' });
    await screen.findByText('wen');

    expect(screen.queryByLabelText('Invite by email')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending invitations')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Leave workspace/ })).toBeInTheDocument();
  });

  it('does not offer to leave to the owner', async () => {
    vi.mocked(collab.fetchMembers).mockResolvedValue(overview('owner'));

    renderDialog({ ...workspace, role: 'owner' });
    await screen.findByText('wen');

    expect(screen.queryByRole('button', { name: /Leave workspace/ })).not.toBeInTheDocument();
  });
});
