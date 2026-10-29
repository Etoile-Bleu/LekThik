import { API_URL, request } from './api';

/** The .ics address itself, built from a token the way the server expects it. */
export function calendarFeedUrl(token: string): string {
  return `${API_URL}/api/calendar/${token}.ics`;
}

/** `null` when the feed was never turned on, or was turned off since. Never turns it on. */
export async function fetchCalendarToken(): Promise<string | null> {
  const response = await request('/api/users/me/calendar-token');
  const body = (await response.json()) as { token: string | null };
  return body.token;
}

export async function regenerateCalendarToken(): Promise<string> {
  const response = await request('/api/users/me/calendar-token', { method: 'POST' });
  const body = (await response.json()) as { token: string };
  return body.token;
}

export async function revokeCalendarToken(): Promise<void> {
  await request('/api/users/me/calendar-token', { method: 'DELETE' });
}
