import type { Role } from './boardsApi';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  writer: 'Writer',
  reader: 'Reader',
};

export const ROLE_SUMMARY: Record<Role, string> = {
  owner: 'Everything, including deleting the workspace',
  admin: 'Edits boards and manages members',
  writer: 'Creates and edits lists, cards and labels',
  reader: 'Can look, cannot change anything',
};

const RANK: Record<Role, number> = { reader: 0, writer: 1, admin: 2, owner: 3 };

export function canEdit(role: Role | undefined): boolean {
  return role !== undefined && RANK[role] >= RANK.writer;
}

export function canManage(role: Role | undefined): boolean {
  return role !== undefined && RANK[role] >= RANK.admin;
}

export function canDeleteWorkspace(role: Role | undefined): boolean {
  return role === 'owner';
}

/** An actor only manages members strictly below their own rank. */
export function canManageMember(actor: Role | undefined, target: Role): boolean {
  return actor !== undefined && canManage(actor) && RANK[actor] > RANK[target];
}

/** Roles the actor may hand out: below their own, and never owner. */
export function assignableRoles(actor: Role | undefined): Role[] {
  if (actor === undefined || !canManage(actor)) {
    return [];
  }
  return (['admin', 'writer', 'reader'] as Role[]).filter((role) => RANK[role] < RANK[actor]);
}
