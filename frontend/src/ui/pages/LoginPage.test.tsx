import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/api')>();
  return { ...actual, loginUser: vi.fn() };
});

import { ApiError, loginUser } from '@lib/api';

import { LoginPage } from './LoginPage';

function renderPage(state?: { notice: string }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <LoginPage />
    </MemoryRouter>
  );
}

function submit() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'matheo@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-strong-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(loginUser).mockReset();
  });

  it('links to the password reset flow', () => {
    renderPage();

    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute(
      'href',
      '/forgot-password'
    );
  });

  it('shows the notice passed by the previous page', () => {
    renderPage({ notice: 'Email verified. You can sign in now.' });

    expect(screen.getByText('Email verified. You can sign in now.')).toBeInTheDocument();
  });

  it('offers the verification page when the email is not verified yet', async () => {
    vi.mocked(loginUser).mockRejectedValueOnce(new ApiError(403, 'email not verified'));
    renderPage();

    submit();

    expect(await screen.findByText('email not verified')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Enter your verification code' })).toHaveAttribute(
      'href',
      '/verify-email?email=matheo%40example.com'
    );
  });

  it('does not offer the verification page for wrong credentials', async () => {
    vi.mocked(loginUser).mockRejectedValueOnce(new ApiError(401, 'invalid email or password'));
    renderPage();

    submit();

    expect(await screen.findByText('invalid email or password')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Enter your verification code' })
    ).not.toBeInTheDocument();
  });
});
