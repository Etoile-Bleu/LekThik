import { request } from './api';
import type { Role } from './boardsApi';

export interface Member {
  user_id: string;
  username: string;
  email: string;
  role: Role;
  joined_at: string;
}

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface Invitation {
  id: string;
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: Exclude<Role, 'owner'>;
  invited_by: string;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
  expired: boolean;
}

export interface MembersOverview {
  role: Role;
  members: Member[];
  invitations: Invitation[];
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await request(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return (await response.json()) as T;
}

async function sendWithoutResult(path: string, method: string, body?: unknown): Promise<void> {
  await request(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function fetchMembers(workspaceId: string): Promise<MembersOverview> {
  return send<MembersOverview>(`/api/workspaces/${workspaceId}/members`, 'GET');
}

export function inviteMember(
  workspaceId: string,
  email: string,
  role: Exclude<Role, 'owner'>
): Promise<Invitation> {
  return send<Invitation>(`/api/workspaces/${workspaceId}/invitations`, 'POST', { email, role });
}

export function revokeInvitation(workspaceId: string, invitationId: string): Promise<void> {
  return sendWithoutResult(`/api/workspaces/${workspaceId}/invitations/${invitationId}`, 'DELETE');
}

export function changeMemberRole(workspaceId: string, userId: string, role: Role): Promise<Member> {
  return send<Member>(`/api/workspaces/${workspaceId}/members/${userId}`, 'PATCH', { role });
}

export function removeMember(workspaceId: string, userId: string): Promise<void> {
  return sendWithoutResult(`/api/workspaces/${workspaceId}/members/${userId}`, 'DELETE');
}

export function fetchMyInvitations(): Promise<Invitation[]> {
  return send<Invitation[]>('/api/invitations', 'GET');
}

export function fetchInvitation(id: string): Promise<Invitation> {
  return send<Invitation>(`/api/invitations/${id}`, 'GET');
}

export function acceptInvitation(id: string): Promise<Invitation> {
  return send<Invitation>(`/api/invitations/${id}/accept`, 'POST');
}

export function declineInvitation(id: string): Promise<Invitation> {
  return send<Invitation>(`/api/invitations/${id}/decline`, 'POST');
}
