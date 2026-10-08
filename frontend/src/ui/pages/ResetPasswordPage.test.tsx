import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/api')>();
  return { ...actual, resetPassword: vi.fn(), requestPasswordReset: vi.fn() };
});

import { ApiError, resetPassword } from '@lib/api';

import { ResetPasswordPage } from './ResetPasswordPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reset-password?email=matheo%40example.com']}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function fillForm(confirm = 'a-new-strong-password') {
  fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: 'a-new-strong-password' },
  });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.mocked(resetPassword).mockReset();
  });

  it('rejects mismatching passwords without calling the API', () => {
    renderPage();

    fillForm('something-else-entirely');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('updates the password and goes to the login page', async () => {
    vi.mocked(resetPassword).mockResolvedValueOnce(undefined);
    renderPage();

    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(resetPassword).toHaveBeenCalledWith(
      'matheo@example.com',
      '123456',
      'a-new-strong-password'
    );
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('shows the server message when the code is rejected', async () => {
    vi.mocked(resetPassword).mockRejectedValueOnce(new ApiError(400, 'invalid or expired code'));
    renderPage();

    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByText('invalid or expired code')).toBeInTheDocument();
  });
});
