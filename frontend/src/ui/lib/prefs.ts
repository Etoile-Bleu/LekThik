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

/** How a board is shown: columns, a free canvas, a sortable table or a calendar of due dates. */
export type BoardViewKind = 'board' | 'canvas' | 'list' | 'calendar';
export type ColumnWidth = 'narrow' | 'default' | 'wide';

/** A property of the card dialog that can be moved or hidden. */
export type CardProperty = 'assignees' | 'due_date' | 'labels' | 'list';

export const CARD_PROPERTIES: CardProperty[] = ['assignees', 'due_date', 'labels', 'list'];

/** Which properties the card dialog shows, and in what order. */
export interface CardDialogLayout {
  order: CardProperty[];
  hidden: CardProperty[];
}

/** Settings that only make sense for one board, for one person. */
export interface BoardPreferences {
  card_display: CardDisplay | null;
  view: BoardViewKind;
  column_width: ColumnWidth;
  /** Lists folded into a slim rail on this board. */
  collapsed_lists: string[];
}

export const DEFAULT_BOARD_PREFERENCES: BoardPreferences = {
  card_display: null,
  view: 'board',
  column_width: 'default',
  collapsed_lists: [],
};

export const DEFAULT_CARD_DIALOG: CardDialogLayout = { order: [...CARD_PROPERTIES], hidden: [] };

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
  card_dialog: CardDialogLayout;
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
  card_dialog: DEFAULT_CARD_DIALOG,
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

/** What this person set for one board, filled in with the defaults. */
export function boardPrefsFor(
  preferences: Preferences,
  boardId: string | undefined
): BoardPreferences {
  const own = boardId ? preferences.boards[boardId] : undefined;
  return { ...DEFAULT_BOARD_PREFERENCES, ...own };
}

/** A board that only holds defaults needs no entry, which keeps the saved settings small. */
export function isDefaultBoardPrefs(own: BoardPreferences): boolean {
  return (
    own.card_display === null &&
    own.view === DEFAULT_BOARD_PREFERENCES.view &&
    own.column_width === DEFAULT_BOARD_PREFERENCES.column_width &&
    own.collapsed_lists.length === 0
  );
}

/**
 * The layout with every property accounted for exactly once, so a layout saved
 * before a property existed, or edited by hand, still draws a complete dialog.
 */
export function normalizeDialogLayout(layout: CardDialogLayout | undefined): CardDialogLayout {
  const seen = new Set<CardProperty>();
  const order: CardProperty[] = [];
  for (const property of [...(layout?.order ?? []), ...CARD_PROPERTIES]) {
    if (CARD_PROPERTIES.includes(property) && !seen.has(property)) {
      seen.add(property);
      order.push(property);
    }
  }
  const hidden = [...new Set(layout?.hidden ?? [])].filter((property) =>
    CARD_PROPERTIES.includes(property)
  );
  return { order, hidden };
}
