import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/api')>();
  return { ...actual, requestPasswordReset: vi.fn() };
});

import { requestPasswordReset } from '@lib/api';

import { ForgotPasswordPage } from './ForgotPasswordPage';

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.mocked(requestPasswordReset).mockReset();
  });

  it('requests a code and moves on to the reset page', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValueOnce(undefined);

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<p>reset page</p>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'matheo@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));

    expect(requestPasswordReset).toHaveBeenCalledWith('matheo@example.com');
    expect(await screen.findByText('reset page')).toBeInTheDocument();
  });
});
