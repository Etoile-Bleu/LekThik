import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/accountApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/accountApi')>();
  return { ...actual, deleteAccount: vi.fn(), downloadMyData: vi.fn(), saveAsFile: vi.fn() };
});

import * as account from '@lib/accountApi';
import { ApiError } from '@lib/api';
import { useAuthStore } from '@lib/authStore';

import { DeleteAccountDialog } from './DeleteAccountDialog';
import { YourDataSection } from './YourDataSection';

function setup() {
  render(
    <MemoryRouter>
      <DeleteAccountDialog open onClose={vi.fn()} />
    </MemoryRouter>
  );
  return screen.getByRole('dialog', { name: 'Delete my account' });
}

function fill(dialog: HTMLElement, username: string, password: string) {
  fireEvent.change(within(dialog).getByLabelText(/Type your username/), {
    target: { value: username },
  });
  fireEvent.change(within(dialog).getByLabelText('Your password'), {
    target: { value: password },
  });
}

describe('DeleteAccountDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({
      user: { id: 'u1', email: 'a@example.com', username: 'alice' },
      status: 'authenticated',
    });
  });

  it('stays disabled until the username and the password are given', () => {
    const dialog = setup();
    const button = within(dialog).getByRole('button', { name: 'Delete my account' });

    expect(button).toBeDisabled();
    fill(dialog, 'alic', 'secret');
    expect(button).toBeDisabled();
    fill(dialog, 'alice', 'secret');
    expect(button).toBeEnabled();
  });

  it('deletes, signs out locally and leaves', async () => {
    vi.mocked(account.deleteAccount).mockResolvedValueOnce(undefined);
    const dialog = setup();

    fill(dialog, ' alice ', 'secret');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }));

    await waitFor(() =>
      expect(account.deleteAccount).toHaveBeenCalledWith({
        password: 'secret',
        confirmation: 'alice',
        delete_owned_workspaces: false,
      })
    );
    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
  });

  it('says so when the password is wrong and keeps the account', async () => {
    vi.mocked(account.deleteAccount).mockRejectedValueOnce(new ApiError(403, 'wrong password'));
    const dialog = setup();

    fill(dialog, 'alice', 'nope');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }));

    expect(await within(dialog).findByText('That password is not right.')).toBeInTheDocument();
    expect(useAuthStore.getState().user).not.toBeNull();
  });

  it('lists the workspaces that block it and asks before deleting them', async () => {
    vi.mocked(account.deleteAccount)
      .mockRejectedValueOnce(
        new ApiError(409, 'some workspaces', {
          message: 'some workspaces',
          workspaces: [{ id: 'w1', name: 'Team', other_members: 2 }],
        })
      )
      .mockResolvedValueOnce(undefined);
    const dialog = setup();

    fill(dialog, 'alice', 'secret');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }));

    expect(await within(dialog).findByText(/Team, with 2 other members/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Delete my account' });
    expect(confirm).toBeDisabled();

    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(account.deleteAccount).toHaveBeenLastCalledWith({
        password: 'secret',
        confirmation: 'alice',
        delete_owned_workspaces: true,
      })
    );
  });
});

describe('YourDataSection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('downloads the data as a file', async () => {
    const blob = new Blob(['{}'], { type: 'application/json' });
    vi.mocked(account.downloadMyData).mockResolvedValueOnce(blob);
    render(
      <MemoryRouter>
        <YourDataSection />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));

    await waitFor(() =>
      expect(account.saveAsFile).toHaveBeenCalledWith(blob, 'lekthik-my-data.json')
    );
  });
});
