import type {
  ColorVision,
  Density,
  LetterSpacing,
  Motion,
  Preferences,
  ReadingFont,
  TextSize,
  Theme,
} from './prefs';

export type EffectiveTheme = 'light' | 'dark' | 'contrast';

export interface Appearance {
  theme: Theme;
  density: Density;
  text_size: TextSize;
  motion: Motion;
  color_vision: ColorVision;
  label_shapes: boolean;
  reading_font: ReadingFont;
  letter_spacing: LetterSpacing;
  strong_focus: boolean;
  large_targets: boolean;
  flat_backgrounds: boolean;
}

export interface SystemSettings {
  prefersDark: boolean;
  prefersContrast: boolean;
}

/** Kept under this key so the very first paint can already use it (see index.html). */
export const APPEARANCE_CACHE_KEY = 'lekthik.appearance.v1';

/**
 * "System" follows the operating system, and an explicit choice always wins
 * over it. A system that asks for more contrast gets the high contrast theme.
 */
export function effectiveTheme(theme: Theme, system: SystemSettings): EffectiveTheme {
  if (theme === 'light' || theme === 'dark' || theme === 'contrast') {
    return theme;
  }
  if (system.prefersContrast) {
    return 'contrast';
  }
  return system.prefersDark ? 'dark' : 'light';
}

const FONT_URLS: Partial<Record<ReadingFont, string>> = {
  hyperlegible:
    'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap',
  lexend: 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap',
};

/** Fetches a reading font only when someone picks it, so nobody else pays for it. */
export function ensureFont(font: ReadingFont): void {
  const url = FONT_URLS[font];
  if (!url || document.querySelector(`link[data-reading-font="${font}"]`)) {
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.dataset.readingFont = font;
  document.head.appendChild(link);
}

function setFlag(root: HTMLElement, name: string, value: string | null): void {
  if (value === null) {
    delete root.dataset[name];
  } else {
    root.dataset[name] = value;
  }
}

export function readSystemSettings(): SystemSettings {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { prefersDark: false, prefersContrast: false };
  }
  return {
    prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    prefersContrast: window.matchMedia('(prefers-contrast: more)').matches,
  };
}

export function applyAppearance(
  appearance: Appearance,
  system: SystemSettings = readSystemSettings(),
  root: HTMLElement = document.documentElement
): EffectiveTheme {
  const resolved = effectiveTheme(appearance.theme, system);
  const changed = root.dataset.theme !== undefined && root.dataset.theme !== resolved;

  if (changed) {
    root.classList.add('theme-fade');
    window.setTimeout(() => root.classList.remove('theme-fade'), 320);
  }

  root.dataset.theme = resolved;
  root.dataset.density = appearance.density;
  root.dataset.text = appearance.text_size;
  root.dataset.motion = appearance.motion;
  root.dataset.cvd = appearance.color_vision;
  root.dataset.font = appearance.reading_font;
  root.dataset.spacing = appearance.letter_spacing;
  setFlag(root, 'shapes', appearance.label_shapes ? 'on' : null);
  setFlag(root, 'focus', appearance.strong_focus ? 'strong' : null);
  setFlag(root, 'targets', appearance.large_targets ? 'large' : null);
  setFlag(root, 'flat', appearance.flat_backgrounds ? 'on' : null);
  ensureFont(appearance.reading_font);
  return resolved;
}

export function cacheAppearance(appearance: Appearance): void {
  try {
    window.localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify(appearance));
  } catch {
    // Storage can be blocked, the server copy still applies after sign in.
  }
}

export function pickAppearance(preferences: Preferences): Appearance {
  return {
    theme: preferences.theme,
    density: preferences.density,
    text_size: preferences.text_size,
    motion: preferences.motion,
    color_vision: preferences.color_vision,
    label_shapes: preferences.label_shapes,
    reading_font: preferences.reading_font,
    letter_spacing: preferences.letter_spacing,
    strong_focus: preferences.strong_focus,
    large_targets: preferences.large_targets,
    flat_backgrounds: preferences.flat_backgrounds,
  };
}

/** Calls back when the system theme or contrast setting changes. Returns a stop function. */
export function watchSystemSettings(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const queries = [
    window.matchMedia('(prefers-color-scheme: dark)'),
    window.matchMedia('(prefers-contrast: more)'),
  ];
  queries.forEach((query) => query.addEventListener('change', onChange));
  return () => queries.forEach((query) => query.removeEventListener('change', onChange));
}
