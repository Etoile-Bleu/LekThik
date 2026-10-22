import { describe, expect, it } from 'vitest';

import { PICTURE_MAX_BYTES, checkPicture, checkWebAddress } from './media';

describe('choosing a picture', () => {
  const ok = { name: 'plan.png', type: 'image/png', size: 1000 };

  it('accepts PNG, JPEG and WebP up to five megabytes', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(checkPicture({ ...ok, type })).toBeNull();
    }
    expect(checkPicture({ ...ok, size: PICTURE_MAX_BYTES })).toBeNull();
  });

  it('says why a file cannot be used', () => {
    expect(checkPicture(null)).toBe('Choose a picture.');
    expect(checkPicture({ ...ok, type: 'image/svg+xml' })).toContain('PNG, JPEG and WebP');
    expect(checkPicture({ ...ok, type: 'image/gif' })).toContain('PNG, JPEG and WebP');
    expect(checkPicture({ ...ok, type: 'application/pdf' })).toContain('PNG, JPEG and WebP');
    expect(checkPicture({ ...ok, size: PICTURE_MAX_BYTES + 1 })).toContain('5 MB');
    expect(checkPicture({ ...ok, size: 0 })).toContain('empty');
  });
});

describe('the address of a link', () => {
  it('accepts web addresses', () => {
    expect(checkWebAddress('https://example.com/docs')).toBeNull();
    expect(checkWebAddress('  http://example.com  ')).toBeNull();
  });

  it('refuses what is not one, and says what is expected', () => {
    expect(checkWebAddress('')).toContain('Paste');
    expect(checkWebAddress('example.com')).toContain('https://');
    expect(checkWebAddress('javascript:alert(1)')).toContain('https://');
    expect(checkWebAddress('ftp://example.com')).toContain('https://');
    expect(checkWebAddress('https://user:pw@example.com')).toContain('password');
    expect(checkWebAddress(`https://example.com/${'a'.repeat(2100)}`)).toContain('too long');
  });
});
