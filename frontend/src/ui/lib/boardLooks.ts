export type BoardBackground =
  'default' | 'mist' | 'sage' | 'sand' | 'blush' | 'lilac' | 'slate' | 'dusk';

export type BoardAccent = 'teal' | 'blue' | 'violet' | 'rose' | 'orange' | 'graphite';

export interface BoardLook {
  background: BoardBackground;
  accent: BoardAccent;
}

export const DEFAULT_LOOK: BoardLook = { background: 'default', accent: 'teal' };

export interface BackgroundOption {
  key: BoardBackground;
  label: string;
  /** The hue mixed into the theme's canvas. `null` leaves the canvas alone. */
  hue: string | null;
}

export const BACKGROUNDS: BackgroundOption[] = [
  { key: 'default', label: 'Plain', hue: null },
  { key: 'mist', label: 'Mist', hue: '#6f9fe0' },
  { key: 'sage', label: 'Sage', hue: '#6fb384' },
  { key: 'sand', label: 'Sand', hue: '#d6a95c' },
  { key: 'blush', label: 'Blush', hue: '#e68aa4' },
  { key: 'lilac', label: 'Lilac', hue: '#9b84e3' },
  { key: 'slate', label: 'Slate', hue: '#8791a6' },
  { key: 'dusk', label: 'Dusk', hue: '#5566c2' },
];

/** The tokens an accent sets. Checked against WCAG in boardLooks.test.ts. */
export interface AccentTokens {
  /** Brand fill, used behind `ink`. */
  accent: string;
  /** Focus rings and other indicators, needs 3:1 against the surfaces. */
  focus: string;
  /** Text and icons on cards and on `tint`, needs 4.5:1. */
  text: string;
  tint: string;
  /** Text on `accent`, needs 4.5:1. */
  ink: string;
}

export interface AccentOption {
  key: BoardAccent;
  label: string;
  light: AccentTokens;
  dark: AccentTokens;
}

export const ACCENTS: AccentOption[] = [
  {
    key: 'teal',
    label: 'Teal',
    light: {
      accent: '#14c9a0',
      focus: '#0a806a',
      text: '#0f6b57',
      tint: '#eafbf6',
      ink: '#0b2a22',
    },
    dark: { accent: '#2fe0b8', focus: '#55e8c6', text: '#55e8c6', tint: '#10302a', ink: '#04201a' },
  },
  {
    key: 'blue',
    label: 'Blue',
    light: {
      accent: '#2f6fe4',
      focus: '#1d5fd6',
      text: '#1b49b4',
      tint: '#e8f0fe',
      ink: '#ffffff',
    },
    dark: { accent: '#6b9cf0', focus: '#8db4f6', text: '#9dbcf7', tint: '#16284a', ink: '#06142e' },
  },
  {
    key: 'violet',
    label: 'Violet',
    light: {
      accent: '#6d49d6',
      focus: '#6340c8',
      text: '#5333b3',
      tint: '#eeeafd',
      ink: '#ffffff',
    },
    dark: { accent: '#9a82ee', focus: '#b4a1f4', text: '#bfb0f6', tint: '#231d44', ink: '#150d36' },
  },
  {
    key: 'rose',
    label: 'Rose',
    light: {
      accent: '#c93468',
      focus: '#c02d60',
      text: '#a5224f',
      tint: '#fde8f0',
      ink: '#ffffff',
    },
    dark: { accent: '#ec6fa6', focus: '#f290bb', text: '#f4a3c6', tint: '#3d1b2b', ink: '#3a0b1d' },
  },
  {
    key: 'orange',
    label: 'Orange',
    light: {
      accent: '#e8802a',
      focus: '#b45309',
      text: '#92400e',
      tint: '#fdeedd',
      ink: '#2a1500',
    },
    dark: { accent: '#f0954d', focus: '#f4ad72', text: '#f7b987', tint: '#3a2412', ink: '#2a1500' },
  },
  {
    key: 'graphite',
    label: 'Graphite',
    light: {
      accent: '#4b5365',
      focus: '#4b5365',
      text: '#2f3646',
      tint: '#eceef2',
      ink: '#ffffff',
    },
    dark: { accent: '#aab2c3', focus: '#c0c7d4', text: '#c0c7d4', tint: '#262a35', ink: '#0f1116' },
  },
];

export function backgroundHue(key: BoardBackground): string | null {
  return BACKGROUNDS.find((option) => option.key === key)?.hue ?? null;
}

export function accentTokens(key: BoardAccent, mode: 'light' | 'dark'): AccentTokens {
  const option = ACCENTS.find((candidate) => candidate.key === key) ?? ACCENTS[0];
  return option[mode];
}

/**
 * Inline custom properties for a board's look. The default look sets nothing,
 * so the theme's own tokens apply. The high contrast theme ignores accents,
 * its colours are chosen for legibility first.
 */
export function lookStyle(
  look: BoardLook,
  theme: 'light' | 'dark' | 'contrast'
): Record<string, string> {
  const style: Record<string, string> = {};
  const hue = backgroundHue(look.background);
  if (hue) {
    style['--board-hue'] = hue;
  }
  if (look.accent !== 'teal' && theme !== 'contrast') {
    const tokens = accentTokens(look.accent, theme);
    style['--color-accent'] = tokens.accent;
    style['--color-focus'] = tokens.focus;
    style['--color-accent-text'] = tokens.text;
    style['--color-accent-tint'] = tokens.tint;
    style['--color-accent-ink'] = tokens.ink;
  }
  return style;
}
