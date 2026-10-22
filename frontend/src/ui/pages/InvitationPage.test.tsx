import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/collabApi');
vi.mock('@lib/boardsApi');

import { ApiError } from '@lib/api';
import { useAuthStore } from '@lib/authStore';
import * as collab from '@lib/collabApi';
import type { Invitation } from '@lib/collabApi';

import { InvitationPage } from './InvitationPage';

const invitation: Invitation = {
  id: 'i1',
  workspace_id: 'w1',
  workspace_name: 'Design team',
  email: 'amir@example.com',
  role: 'writer',
  invited_by: 'olga',
  status: 'pending',
  created_at: '2026-10-04T10:00:00Z',
  expires_at: '2026-10-11T10:00:00Z',
  expired: false,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/invitations/i1']}>
      <Routes>
        <Route path="/invitations/:invitationId" element={<InvitationPage />} />
        <Route path="/dashboard" element={<p>dashboard page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('InvitationPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({
      user: { id: 'u-me', email: 'amir@example.com', username: 'amir' },
      status: 'authenticated',
    });
  });

  it('shows who invited you, with which role, and joins on accept', async () => {
    vi.mocked(collab.fetchInvitation).mockResolvedValue(invitation);
    vi.mocked(collab.acceptInvitation).mockResolvedValue({ ...invitation, status: 'accepted' });
    vi.mocked(collab.fetchMyInvitations).mockResolvedValue([]);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Design team' })).toBeInTheDocument();
    expect(screen.getByText(/olga invited you as/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(collab.acceptInvitation).toHaveBeenCalledWith('i1'));
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
  });

  it('explains when the invitation belongs to another address', async () => {
    vi.mocked(collab.fetchInvitation).mockRejectedValue(new ApiError(404, 'not found'));

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'This invitation is not for this account' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('closes expired or answered invitations', async () => {
    vi.mocked(collab.fetchInvitation).mockResolvedValue({ ...invitation, expired: true });

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'This invitation is closed' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });
});
