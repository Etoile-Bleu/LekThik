import { describe, expect, it } from 'vitest';

import { assignableRoles, canDeleteWorkspace, canEdit, canManage, canManageMember } from './roles';

describe('roles', () => {
  it('lets writers and above edit, and only admins and the owner manage', () => {
    expect(canEdit('reader')).toBe(false);
    expect(canEdit('writer')).toBe(true);
    expect(canManage('writer')).toBe(false);
    expect(canManage('admin')).toBe(true);
    expect(canEdit(undefined)).toBe(false);
  });

  it('only lets the owner delete the workspace', () => {
    expect(canDeleteWorkspace('owner')).toBe(true);
    expect(canDeleteWorkspace('admin')).toBe(false);
  });

  it('only manages members ranked strictly below', () => {
    expect(canManageMember('owner', 'admin')).toBe(true);
    expect(canManageMember('admin', 'writer')).toBe(true);
    expect(canManageMember('admin', 'admin')).toBe(false);
    expect(canManageMember('admin', 'owner')).toBe(false);
    expect(canManageMember('writer', 'reader')).toBe(false);
  });

  it('never offers the owner role and nothing at or above the actor', () => {
    expect(assignableRoles('owner')).toEqual(['admin', 'writer', 'reader']);
    expect(assignableRoles('admin')).toEqual(['writer', 'reader']);
    expect(assignableRoles('writer')).toEqual([]);
  });
});
