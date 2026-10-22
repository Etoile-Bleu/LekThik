export type Theme = 'system' | 'light' | 'dark' | 'contrast';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type TextSize = 'normal' | 'large' | 'larger' | 'largest';
export type Motion = 'system' | 'reduce';
export type ColorVision = 'standard' | 'redgreen' | 'blueyellow';
export type ReadingFont = 'standard' | 'hyperlegible' | 'lexend';
export type LetterSpacing = 'normal' | 'wide' | 'wider';

/** What a card shows on the board. */
export interface CardDisplay {
  labels: boolean;
  due_date: boolean;
  assignees: boolean;
  description_marker: boolean;
  description_preview: boolean;
}

/** Settings that only make sense for one board, for one person. */
export interface BoardPreferences {
  card_display: CardDisplay | null;
}

export interface Preferences {
  theme: Theme;
  density: Density;
  text_size: TextSize;
  motion: Motion;
  color_vision: ColorVision;
  /** Marks label colours with a shape, so colour is never the only cue. */
  label_shapes: boolean;
  reading_font: ReadingFont;
  letter_spacing: LetterSpacing;
  strong_focus: boolean;
  large_targets: boolean;
  /** No tint behind boards, only the plain theme background. */
  flat_backgrounds: boolean;
  /** Tell screen readers when teammates change the board. */
  announce_changes: boolean;
  card_display: CardDisplay;
  boards: Record<string, BoardPreferences>;
}

export const DEFAULT_CARD_DISPLAY: CardDisplay = {
  labels: true,
  due_date: true,
  assignees: true,
  description_marker: true,
  description_preview: false,
};

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  density: 'comfortable',
  text_size: 'normal',
  motion: 'system',
  color_vision: 'standard',
  label_shapes: false,
  reading_font: 'standard',
  letter_spacing: 'normal',
  strong_focus: false,
  large_targets: false,
  flat_backgrounds: false,
  announce_changes: false,
  card_display: DEFAULT_CARD_DISPLAY,
  boards: {},
};

/** The board's own setting when it has one, the general one otherwise. */
export function cardDisplayFor(preferences: Preferences, boardId: string | undefined): CardDisplay {
  const own = boardId ? preferences.boards[boardId]?.card_display : null;
  return own ?? preferences.card_display;
}

export function hasBoardDisplay(preferences: Preferences, boardId: string | undefined): boolean {
  return Boolean(boardId && preferences.boards[boardId]?.card_display);
}
