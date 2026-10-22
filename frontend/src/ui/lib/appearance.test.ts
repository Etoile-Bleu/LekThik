import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Appearance,
  applyAppearance,
  effectiveTheme,
  ensureFont,
  pickAppearance,
} from './appearance';
import { DEFAULT_PREFERENCES } from './prefs';

const calm = { prefersDark: false, prefersContrast: false };

function appearance(changes: Partial<Appearance> = {}): Appearance {
  return { ...pickAppearance(DEFAULT_PREFERENCES), ...changes };
}

describe('effectiveTheme', () => {
  it('follows the system when asked to', () => {
    expect(effectiveTheme('system', calm)).toBe('light');
    expect(effectiveTheme('system', { ...calm, prefersDark: true })).toBe('dark');
  });

  it('gives high contrast to a system that asks for more contrast', () => {
    expect(effectiveTheme('system', { prefersDark: true, prefersContrast: true })).toBe('contrast');
  });

  it('lets an explicit choice win over the system', () => {
    const loud = { prefersDark: true, prefersContrast: true };

    expect(effectiveTheme('light', loud)).toBe('light');
    expect(effectiveTheme('dark', calm)).toBe('dark');
    expect(effectiveTheme('contrast', calm)).toBe('contrast');
  });
});

describe('applyAppearance', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('html');
    document.head.querySelectorAll('link[data-reading-font]').forEach((link) => link.remove());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes every setting as an attribute', () => {
    applyAppearance(
      appearance({
        theme: 'dark',
        density: 'compact',
        text_size: 'larger',
        motion: 'reduce',
        color_vision: 'redgreen',
        reading_font: 'lexend',
        letter_spacing: 'wide',
      }),
      calm,
      root
    );

    expect(root.dataset).toMatchObject({
      theme: 'dark',
      density: 'compact',
      text: 'larger',
      motion: 'reduce',
      cvd: 'redgreen',
      font: 'lexend',
      spacing: 'wide',
    });
  });

  it('adds and removes the on or off flags', () => {
    applyAppearance(
      appearance({
        label_shapes: true,
        strong_focus: true,
        large_targets: true,
        flat_backgrounds: true,
      }),
      calm,
      root
    );
    expect(root.dataset).toMatchObject({
      shapes: 'on',
      focus: 'strong',
      targets: 'large',
      flat: 'on',
    });

    applyAppearance(appearance(), calm, root);
    expect(root.dataset.shapes).toBeUndefined();
    expect(root.dataset.focus).toBeUndefined();
    expect(root.dataset.targets).toBeUndefined();
    expect(root.dataset.flat).toBeUndefined();
  });

  it('cross fades a theme change but not the first paint', () => {
    applyAppearance(appearance({ theme: 'light' }), calm, root);
    expect(root.classList.contains('theme-fade')).toBe(false);

    applyAppearance(appearance({ theme: 'dark' }), calm, root);
    expect(root.classList.contains('theme-fade')).toBe(true);

    vi.advanceTimersByTime(400);
    expect(root.classList.contains('theme-fade')).toBe(false);
  });

  it('never asks another company for a font', async () => {
    applyAppearance(appearance({ reading_font: 'hyperlegible' }), calm, root);
    applyAppearance(appearance({ reading_font: 'lexend' }), calm, root);
    await ensureFont('hyperlegible');

    expect(document.querySelector('link[href*="googleapis"], link[href*="gstatic"]')).toBeNull();
    expect(document.head.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(0);
  });

  it('loads a reading font only when it is chosen, and only once', async () => {
    const first = ensureFont('hyperlegible');
    const second = ensureFont('hyperlegible');

    expect(second).toBe(first);
    await expect(first).resolves.toBeUndefined();
    await expect(ensureFont('standard')).resolves.toBeUndefined();
  });
});
