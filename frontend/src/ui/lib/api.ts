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

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseError(response));
  }

  return response;
}

export async function registerUser(
  email: string,
  username: string,
  password: string
): Promise<void> {
  await request('/api/users/register', {
    method: 'POST',
    body: JSON.stringify({ email, username, password }),
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
