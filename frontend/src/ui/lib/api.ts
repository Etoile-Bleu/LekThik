import { observeServerDate } from './serverClock';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export interface CurrentUser {
  id: string;
  email: string;
  username: string;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
    }
  } catch {
    // Response had no JSON body, fall through to the generic message below.
  }
  return `Request failed with status ${response.status}`;
}

export const API_URL = API_BASE;

// Identifies this browser tab, so the server can tell the live stream which
// tab made a change and that tab can skip its own echo.
export const CLIENT_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

let writesInFlight = 0;
let settleWaiters: Array<() => void> = [];

function finishWrite() {
  writesInFlight -= 1;
  if (writesInFlight === 0) {
    const waiters = settleWaiters;
    settleWaiters = [];
    waiters.forEach((resolve) => resolve());
  }
}

/** Resolves once none of this tab's own writes is still on the wire. */
export function whenWritesSettle(): Promise<void> {
  if (writesInFlight === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => settleWaiters.push(resolve));
}

export async function request(path: string, init?: RequestInit): Promise<Response> {
  const isWrite = (init?.method ?? 'GET').toUpperCase() !== 'GET';
  if (isWrite) {
    writesInFlight += 1;
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': CLIENT_ID,
        ...init?.headers,
      },
    });
    observeServerDate(response.headers.get('date'));

    if (!response.ok) {
      throw new ApiError(response.status, await parseError(response));
    }

    return response;
  } finally {
    if (isWrite) {
      finishWrite();
    }
  }
}

export async function registerUser(
  email: string,
  password: string,
  username: string
): Promise<void> {
  await request('/api/users/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, username: username.trim() }),
  });
}

export async function loginUser(email: string, password: string): Promise<void> {
  await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logoutUser(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' });
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await request('/api/users/me');
  return (await response.json()) as CurrentUser;
}

export async function verifyEmail(email: string, code: string): Promise<void> {
  await request('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export async function resendVerification(email: string): Promise<void> {
  await request('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(email: string, code: string, password: string): Promise<void> {
  await request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, code, password }),
  });
}
