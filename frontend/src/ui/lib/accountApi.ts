import { ApiError, request } from './api';

export interface BlockingWorkspace {
  id: string;
  name: string;
  other_members: number;
}

export interface DeleteAccountInput {
  password: string;
  confirmation: string;
  delete_owned_workspaces: boolean;
}

export async function downloadMyData(): Promise<Blob> {
  const response = await request('/api/users/me/export');
  return response.blob();
}

export async function deleteAccount(input: DeleteAccountInput): Promise<void> {
  await request('/api/users/me', { method: 'DELETE', body: JSON.stringify(input) });
}

export function blockingWorkspaces(error: unknown): BlockingWorkspace[] {
  if (!(error instanceof ApiError) || error.status !== 409) return [];
  const list = (error.body as { workspaces?: unknown } | undefined)?.workspaces;
  return Array.isArray(list)
    ? list.filter(
        (entry): entry is BlockingWorkspace =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as BlockingWorkspace).id === 'string' &&
          typeof (entry as BlockingWorkspace).name === 'string'
      )
    : [];
}

export function saveAsFile(blob: Blob, filename: string): void {
  const address = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = address;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(address);
}
