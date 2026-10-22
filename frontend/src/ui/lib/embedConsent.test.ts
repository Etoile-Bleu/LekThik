import { beforeEach, describe, expect, it } from 'vitest';

import { useEmbedConsent } from './embedConsent';

describe('embed consent', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useEmbedConsent.setState({ allowed: {} });
  });

  it('starts with nothing allowed', () => {
    expect(useEmbedConsent.getState().allowed.youtube).toBeUndefined();
  });

  it('remembers a choice for one provider only, in this browser', () => {
    useEmbedConsent.getState().allow('youtube');

    expect(useEmbedConsent.getState().allowed).toEqual({ youtube: true });
    expect(JSON.parse(window.localStorage.getItem('lekthik.embeds.v1') ?? '{}')).toEqual({
      youtube: true,
    });
  });

  it('takes a choice back as easily as it was given', () => {
    useEmbedConsent.getState().allow('vimeo');
    useEmbedConsent.getState().withdraw('vimeo');

    expect(useEmbedConsent.getState().allowed.vimeo).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('lekthik.embeds.v1') ?? '{}')).toEqual({
      vimeo: false,
    });
  });

  it('can withdraw everything at once', () => {
    useEmbedConsent.getState().allow('youtube');
    useEmbedConsent.getState().allow('google_calendar');

    useEmbedConsent.getState().withdrawAll();

    expect(useEmbedConsent.getState().allowed).toEqual({});
    expect(window.localStorage.getItem('lekthik.embeds.v1')).toBe('{}');
  });

  it('keeps working when storage is blocked', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      useEmbedConsent.getState().allow('youtube');
      expect(useEmbedConsent.getState().allowed.youtube).toBe(true);
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('ignores a damaged record', () => {
    window.localStorage.setItem('lekthik.embeds.v1', '{not json');

    expect(() => useEmbedConsent.getState().allow('youtube')).not.toThrow();
  });
});
