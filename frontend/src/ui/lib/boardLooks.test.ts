import { describe, expect, it } from 'vitest';

import { ACCENTS, BACKGROUNDS, accentTokens, lookStyle } from './boardLooks';
import { contrastRatio } from './contrast';

// Surfaces the accents sit on, from styles/themes.css and index.css.
const SURFACES = {
  light: { card: '#ffffff', canvas: '#eceee7' },
  dark: { card: '#181b24', canvas: '#0b0d12' },
} as const;

describe('accent presets keep WCAG contrast in light and dark', () => {
  for (const option of ACCENTS) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${option.label} in ${mode}`, () => {
        const tokens = option[mode];
        const { card, canvas } = SURFACES[mode];

        expect(contrastRatio(tokens.text, card), 'text on card').toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tokens.text, tokens.tint), 'text on tint').toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tokens.ink, tokens.accent), 'ink on accent').toBeGreaterThanOrEqual(
          4.5
        );
        expect(contrastRatio(tokens.focus, card), 'focus on card').toBeGreaterThanOrEqual(3);
        expect(contrastRatio(tokens.focus, canvas), 'focus on canvas').toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe('lookStyle', () => {
  it('sets nothing for the default look so the theme applies', () => {
    expect(lookStyle({ background: 'default', accent: 'teal' }, 'light')).toEqual({});
  });

  it('sets the hue and the accent tokens for a custom look', () => {
    const style = lookStyle({ background: 'sage', accent: 'violet' }, 'dark');

    expect(style['--board-hue']).toBe(BACKGROUNDS.find((b) => b.key === 'sage')?.hue);
    expect(style['--color-accent']).toBe(accentTokens('violet', 'dark').accent);
    expect(style['--color-focus']).toBe(accentTokens('violet', 'dark').focus);
  });

  it('leaves the high contrast theme colours alone', () => {
    const style = lookStyle({ background: 'sage', accent: 'violet' }, 'contrast');

    expect(style['--color-accent']).toBeUndefined();
    expect(style['--board-hue']).toBeDefined();
  });
});
