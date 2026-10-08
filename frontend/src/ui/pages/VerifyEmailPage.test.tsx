import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/api')>();
  return { ...actual, verifyEmail: vi.fn(), resendVerification: vi.fn() };
});

import { ApiError, resendVerification, verifyEmail } from '@lib/api';

import { VerifyEmailPage } from './VerifyEmailPage';

function renderPage(initialEntry = '/verify-email?email=matheo%40example.com') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.mocked(verifyEmail).mockReset();
    vi.mocked(resendVerification).mockReset();
  });

  it('prefills the email from the query string', () => {
    renderPage();

    expect(screen.getByLabelText('Email')).toHaveValue('matheo@example.com');
  });

  it('keeps only digits in the code field', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '12ab34' } });

    expect(screen.getByLabelText('Verification code')).toHaveValue('1234');
  });

  it('submits the code and goes to the login page', async () => {
    vi.mocked(verifyEmail).mockResolvedValueOnce(undefined);
    renderPage();

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));

    expect(verifyEmail).toHaveBeenCalledWith('matheo@example.com', '123456');
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('shows the server message when the code is rejected', async () => {
    vi.mocked(verifyEmail).mockRejectedValueOnce(new ApiError(400, 'invalid or expired code'));
    renderPage();

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByText('invalid or expired code')).toBeInTheDocument();
  });

  it('asks for a new code', async () => {
    vi.mocked(resendVerification).mockResolvedValueOnce(undefined);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));

    expect(resendVerification).toHaveBeenCalledWith('matheo@example.com');
    expect(await screen.findByText(/a new code is on its way/)).toBeInTheDocument();
  });
});
