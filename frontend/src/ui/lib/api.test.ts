import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, getCurrentUser, loginUser, logoutUser, registerUser } from './api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends credentials and a JSON content type on every request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}));

    await registerUser('mathéo@example.com', 'matheo', 'test-fixture-password');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/register'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }) as unknown,
        body: JSON.stringify({
          email: 'mathéo@example.com',
          username: 'matheo',
          password: 'test-fixture-password',
        }),
      })
    );
  });

  it('posts to the login endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}));

    await loginUser('mathéo@example.com', 'test-fixture-password');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/login'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('posts to the logout endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}));

    await logoutUser();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/logout'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns the current user on success', async () => {
    const user = { id: '1', email: 'mathéo@example.com', username: 'matheo' };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, user));

    await expect(getCurrentUser()).resolves.toEqual(user);
  });

  it('throws an ApiError carrying the server message on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401, { message: 'invalid credentials' }));

    await expect(loginUser('mathéo@example.com', 'wrong')).rejects.toMatchObject({
      status: 401,
      message: 'invalid credentials',
    });
  });

  it('falls back to a generic message when the error body has no message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));

    const error = await loginUser('mathéo@example.com', 'wrong').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain('500');
  });
});
