import { describe, expect, it } from 'vitest';

import { safeNext, withNext } from './nextPath';

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/invitations/abc')).toBe('/invitations/abc');
  });

  it('rejects anything that could leave the site', () => {
    for (const value of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      'invitations',
      '',
      null,
    ]) {
      expect(safeNext(value)).toBeNull();
    }
  });
});

describe('withNext', () => {
  it('appends the destination to a path, with the right separator', () => {
    expect(withNext('/login', '/invitations/abc')).toBe('/login?next=%2Finvitations%2Fabc');
    expect(withNext('/verify-email?email=a%40b.c', '/x')).toBe(
      '/verify-email?email=a%40b.c&next=%2Fx'
    );
    expect(withNext('/login', null)).toBe('/login');
  });
});
