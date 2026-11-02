/**
 * Talks to LekThik's own HTTP API the way the web app does: log in once with an email and
 * password, keep the session cookie in memory, and send it on every call after. Nothing is
 * written to disk and the password is never logged.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env, fill it in, and point your MCP client at it (see README.md).`
    );
  }
  return value;
}

export class LekThikApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'LekThikApiError';
  }
}

async function readMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (body && typeof body.message === 'string') {
      return body.message;
    }
  } catch {
    // No JSON body, or not the shape we expect: fall through to the generic message.
  }
  return `Request failed with status ${response.status}`;
}

export class LekThikClient {
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly password: string;
  private cookie: string | null = null;
  private loggingIn: Promise<void> | null = null;

  constructor() {
    this.baseUrl = (process.env.LEKTHIK_API_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
    this.email = requireEnv('LEKTHIK_EMAIL');
    this.password = requireEnv('LEKTHIK_PASSWORD');
  }

  /** One login in flight at a time, even if several tool calls race into it together. */
  private async login(): Promise<void> {
    if (this.loggingIn) {
      return this.loggingIn;
    }
    this.loggingIn = this.doLogin();
    try {
      await this.loggingIn;
    } finally {
      this.loggingIn = null;
    }
  }

  private async doLogin(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!response.ok) {
      throw new LekThikApiError(
        response.status,
        `Could not sign in as ${this.email}: ${await readMessage(response)}`
      );
    }
    const cookies = response.headers.getSetCookie?.() ?? [];
    const session = cookies.find((c) => c.startsWith('session=')) ?? cookies[0];
    if (!session) {
      throw new Error('Signed in, but the server set no session cookie.');
    }
    this.cookie = session.split(';')[0] ?? session;
  }

  /**
   * One request against `/api{path}`. Logs in first if nothing is cached yet, and once more,
   * transparently, if the server says the session is no longer valid.
   */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.cookie) {
      await this.login();
    }

    const send = () =>
      fetch(`${this.baseUrl}/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Cookie: this.cookie ?? '',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    let response = await send();
    if (response.status === 401) {
      this.cookie = null;
      await this.login();
      response = await send();
    }

    if (!response.ok) {
      throw new LekThikApiError(response.status, await readMessage(response));
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}
