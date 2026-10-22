import type {
  AgendaConfig,
  BoardList,
  CalendarConfig,
  CardSummary,
  CounterConfig,
  EmbedConfig,
  ImageConfig,
  LinkConfig,
  NoteConfig,
  PanelKind,
} from './boardsApi';
import { daysUntil, shortDue } from './dueDate';

/** Only a list holds cards, every other kind of panel shows something about them. */
export function isCardList(panel: BoardList): boolean {
  return panel.kind === 'list';
}

export const DEFAULT_CALENDAR: CalendarConfig = { size: 'normal' };
export const DEFAULT_AGENDA: AgendaConfig = { size: 'normal', range: 'week', mine_only: false };
export const DEFAULT_NOTE: NoteConfig = { size: 'normal', text: '' };
/** Pictures and videos want room, so they start wide. */
export const DEFAULT_IMAGE: ImageConfig = { size: 'wide', alt: '', caption: '' };
export const DEFAULT_LINK: LinkConfig = { size: 'normal', url: '', title: '' };
export const DEFAULT_COUNTER: CounterConfig = {
  size: 'normal',
  metric: 'overdue',
  label: '',
  done_list_id: null,
  date: null,
};

/** The settings of a block, filled in with defaults so a missing field never breaks the drawing. */
export function calendarConfig(panel: BoardList): CalendarConfig {
  return { ...DEFAULT_CALENDAR, ...(panel.config as Partial<CalendarConfig>) };
}
export function agendaConfig(panel: BoardList): AgendaConfig {
  return { ...DEFAULT_AGENDA, ...(panel.config as Partial<AgendaConfig>) };
}
export function noteConfig(panel: BoardList): NoteConfig {
  return { ...DEFAULT_NOTE, ...(panel.config as Partial<NoteConfig>) };
}
export function imageConfig(panel: BoardList): ImageConfig {
  return { ...DEFAULT_IMAGE, ...(panel.config as Partial<ImageConfig>) };
}
export function linkConfig(panel: BoardList): LinkConfig {
  return { ...DEFAULT_LINK, ...(panel.config as Partial<LinkConfig>) };
}
/** An embed has no sensible defaults: without a provider and an identifier there is nothing to show. */
export function embedConfig(panel: BoardList): EmbedConfig | null {
  const config = panel.config as Partial<EmbedConfig>;
  if (!config.provider || !config.id) return null;
  return {
    size: config.size ?? 'wide',
    provider: config.provider,
    id: config.id,
    title: config.title ?? '',
  };
}
export function counterConfig(panel: BoardList): CounterConfig {
  return { ...DEFAULT_COUNTER, ...(panel.config as Partial<CounterConfig>) };
}

export function sizeOf(panel: BoardList): 'normal' | 'wide' {
  return (panel.config as { size?: string }).size === 'wide' ? 'wide' : 'normal';
}

export interface PanelKindInfo {
  kind: Exclude<PanelKind, 'list'>;
  label: string;
  /** One sentence on what it shows, for the picker. */
  description: string;
}

export const BLOCK_KINDS: PanelKindInfo[] = [
  {
    kind: 'calendar',
    label: 'Calendar',
    description: 'A month with a dot on every day that has cards due.',
  },
  {
    kind: 'agenda',
    label: 'Agenda',
    description: 'What is due today or over the next days, with late cards first.',
  },
  {
    kind: 'note',
    label: 'Note',
    description: 'Plain text for rules, links and reminders.',
  },
  {
    kind: 'counter',
    label: 'Counter',
    description: 'One number: late cards, progress, days left or a total.',
  },
  {
    kind: 'image',
    label: 'Picture',
    description: 'A moodboard, a plan or a logo, with a description for people who cannot see it.',
  },
  {
    kind: 'embed',
    label: 'Video or calendar',
    description: 'YouTube, Vimeo or a Google Calendar. Nothing loads until someone presses play.',
  },
  {
    kind: 'link',
    label: 'Link',
    description: 'A card for a page, with its site shown and nothing fetched from it.',
  },
];

export const KIND_LABEL: Record<PanelKind, string> = {
  list: 'List',
  calendar: 'Calendar',
  agenda: 'Agenda',
  note: 'Note',
  counter: 'Counter',
  image: 'Picture',
  embed: 'Video or calendar',
  link: 'Link',
};

export function cardsOf(panels: BoardList[]): CardSummary[] {
  return panels.flatMap((panel) => (isCardList(panel) ? panel.cards : []));
}

export interface AgendaGroup {
  key: string;
  label: string;
  /** The day, or `null` for the group of cards that are already late. */
  day: string | null;
  cards: Array<{ card: CardSummary; listName: string }>;
}

/**
 * What is due soon, grouped by day. Cards that are already late come first
 * whatever the range, because an agenda that hides them is how deadlines slip.
 * Days with nothing due are left out.
 */
export function agendaGroups(
  panels: BoardList[],
  config: AgendaConfig,
  today: string,
  meId: string | undefined
): AgendaGroup[] {
  const last = config.range === 'today' ? 0 : 6;
  const wanted = new Map<string, AgendaGroup>();
  const late: AgendaGroup = { key: 'late', label: 'Overdue', day: null, cards: [] };

  for (const panel of panels) {
    if (!isCardList(panel)) continue;
    for (const card of panel.cards) {
      if (!card.due_date) continue;
      if (config.mine_only && (!meId || !card.assignee_ids.includes(meId))) continue;
      const distance = daysUntil(card.due_date, today);
      if (distance < 0) {
        late.cards.push({ card, listName: panel.name });
      } else if (distance <= last) {
        const group = wanted.get(card.due_date) ?? {
          key: card.due_date,
          label: shortDue(card.due_date, today),
          day: card.due_date,
          cards: [],
        };
        group.cards.push({ card, listName: panel.name });
        wanted.set(card.due_date, group);
      }
    }
  }

  const days = [...wanted.values()].sort((a, b) => (a.day ?? '').localeCompare(b.day ?? ''));
  late.cards.sort((a, b) => (a.card.due_date ?? '').localeCompare(b.card.due_date ?? ''));
  return late.cards.length > 0 ? [late, ...days] : days;
}

export type CounterTone = 'calm' | 'good' | 'warn' | 'late';

export interface CounterReading {
  /** The big number, already formatted. */
  value: string;
  /** What the number counts, a short phrase. */
  caption: string;
  /** A second line with the detail, or an empty string. */
  detail: string;
  /** 0 to 100 for a progress bar, `null` when the number is not a share. */
  percent: number | null;
  tone: CounterTone;
  /** The whole thing said as one sentence, for a screen reader. */
  spoken: string;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Works out what a counter should show from the cards of the board. */
export function readCounter(
  config: CounterConfig,
  panels: BoardList[],
  today: string
): CounterReading {
  const cards = cardsOf(panels);
  const named = config.label.trim();

  switch (config.metric) {
    case 'overdue': {
      const late = cards.filter((card) => card.due_date && daysUntil(card.due_date, today) < 0);
      const caption = named || 'Overdue cards';
      const detail = late.length === 0 ? 'Nothing is late.' : 'Past their due date.';
      return {
        value: String(late.length),
        caption,
        detail,
        percent: null,
        tone: late.length === 0 ? 'good' : 'late',
        spoken: `${caption}: ${late.length}. ${detail}`,
      };
    }
    case 'done_percent': {
      const done = panels.find((panel) => panel.id === config.done_list_id);
      const caption = named || 'Done';
      if (!done || !isCardList(done)) {
        return {
          value: '–',
          caption,
          detail: 'Choose the list that means done, in the settings of this block.',
          percent: null,
          tone: 'calm',
          spoken: `${caption}: no done list chosen.`,
        };
      }
      const total = cards.length;
      const count = done.cards.length;
      const percent = total === 0 ? 0 : Math.round((count / total) * 100);
      const detail = `${count} of ${plural(total, 'card')} in ${done.name}`;
      return {
        value: `${percent}%`,
        caption,
        detail,
        percent,
        tone: total > 0 && percent === 100 ? 'good' : 'calm',
        spoken: `${caption}: ${percent} percent. ${detail}.`,
      };
    }
    case 'days_left': {
      const caption = named || 'Until the date';
      if (!config.date) {
        return {
          value: '–',
          caption,
          detail: 'Choose the date, in the settings of this block.',
          percent: null,
          tone: 'calm',
          spoken: `${caption}: no date chosen.`,
        };
      }
      const distance = daysUntil(config.date, today);
      const detail = shortDue(config.date, today);
      if (distance < 0) {
        return {
          value: String(-distance),
          caption: named || (distance === -1 ? 'Day since' : 'Days since'),
          detail,
          percent: null,
          tone: 'late',
          spoken: `${named || 'Date'}: passed ${plural(-distance, 'day')} ago.`,
        };
      }
      if (distance === 0) {
        return {
          value: 'Today',
          caption,
          detail: '',
          percent: null,
          tone: 'warn',
          spoken: `${caption}: today.`,
        };
      }
      return {
        value: String(distance),
        caption: named || (distance === 1 ? 'Day left' : 'Days left'),
        detail,
        percent: null,
        tone: distance <= 3 ? 'warn' : 'calm',
        spoken: `${named || 'Date'}: ${plural(distance, 'day')} left, ${detail}.`,
      };
    }
    case 'total_cards': {
      const caption = named || (cards.length === 1 ? 'Card' : 'Cards');
      return {
        value: String(cards.length),
        caption,
        detail: `On ${plural(panels.filter(isCardList).length, 'list')}.`,
        percent: null,
        tone: 'calm',
        spoken: `${caption}: ${cards.length}.`,
      };
    }
  }
}

/** A calendar block marks the days that have cards due, with how many. */
export function dueByDay(panels: BoardList[]): Map<string, CardSummary[]> {
  const byDay = new Map<string, CardSummary[]>();
  for (const card of cardsOf(panels)) {
    if (card.due_date) byDay.set(card.due_date, [...(byDay.get(card.due_date) ?? []), card]);
  }
  return byDay;
}
