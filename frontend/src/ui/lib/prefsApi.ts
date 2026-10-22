import { request } from './api';
import type { Preferences } from './prefs';

export async function fetchPreferences(): Promise<Preferences> {
  const response = await request('/api/users/me/preferences');
  return (await response.json()) as Preferences;
}

export async function savePreferences(preferences: Preferences): Promise<Preferences> {
  const response = await request('/api/users/me/preferences', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  });
  return (await response.json()) as Preferences;
}
