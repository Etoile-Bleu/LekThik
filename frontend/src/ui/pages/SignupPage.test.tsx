import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/api')>();
  return { ...actual, registerUser: vi.fn() };
});

import { registerUser } from '@lib/api';

import { SignupPage } from './SignupPage';

function fillForm(
  overrides: Partial<Record<'email' | 'username' | 'password' | 'confirm', string>> = {}
) {
  const values = {
    email: 'matheo@example.com',
    username: 'matheo',
    password: 'a-strong-password',
    confirm: 'a-strong-password',
    ...overrides,
  };

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: values.email } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: values.username } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: values.password } });
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: values.confirm },
  });
}

describe('SignupPage', () => {
  beforeEach(() => {
    vi.mocked(registerUser).mockReset();
  });

  it('rejects submission when the passwords do not match, without calling the API', () => {
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>
    );

    fillForm({ confirm: 'a-different-password' });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(registerUser).not.toHaveBeenCalled();
  });

  it('registers the account with the email, username and password', async () => {
    vi.mocked(registerUser).mockResolvedValueOnce(undefined);

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>
    );

    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(registerUser).toHaveBeenCalledWith('matheo@example.com', 'matheo', 'a-strong-password');
    expect(await screen.findByText('Account created')).toBeInTheDocument();
  });
});
