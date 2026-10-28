export interface Person {
  id: string;
  username: string;
}

export type ActivityKind =
  | 'created'
  | 'renamed'
  | 'described'
  | 'due_set'
  | 'due_cleared'
  | 'moved'
  | 'label_added'
  | 'label_removed'
  | 'assigned'
  | 'unassigned';

export interface CommentItem {
  type: 'comment';
  id: string;
  card_id: string;
  author: Person | null;
  body: string;
  created_at: string;
  edited_at: string | null;
}

export interface ActivityItem {
  type: 'activity';
  id: string;
  actor: Person | null;
  kind: ActivityKind;
  subject: Person | null;
  from: string | null;
  to: string | null;
  created_at: string;
}

export type TimelineItem = CommentItem | ActivityItem;

export type Entry =
  | { type: 'comment'; key: string; comment: CommentItem }
  | { type: 'events'; key: string; actor: Person | null; events: ActivityItem[]; at: string };

export const GROUP_WINDOW_MS = 5 * 60_000;
export const COMMENT_MAX_CHARS = 5_000;
export const REMOVED_ACCOUNT = 'A deleted user';

export function nameOf(person: Person | null): string {
  return person ? person.username : REMOVED_ACCOUNT;
}

export function groupTimeline(items: TimelineItem[]): Entry[] {
  const entries: Entry[] = [];
  for (const item of items) {
    if (item.type === 'comment') {
      entries.push({ type: 'comment', key: item.id, comment: item });
      continue;
    }
    const last = entries[entries.length - 1];
    const sameActor =
      last?.type === 'events' && (last.actor?.id ?? null) === (item.actor?.id ?? null);
    const close =
      last?.type === 'events' &&
      Date.parse(item.created_at) - Date.parse(last.at) <= GROUP_WINDOW_MS;
    if (last?.type === 'events' && sameActor && close) {
      last.events.push(item);
      last.at = item.created_at;
    } else {
      entries.push({
        type: 'events',
        key: item.id,
        actor: item.actor,
        events: [item],
        at: item.created_at,
      });
    }
  }
  return entries;
}

function day(value: string | null): string {
  if (!value) return '';
  const [year, month, date] = value.split('-').map(Number);
  if (!year || !month || !date) return value;
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

export function describeEvent(event: ActivityItem): string {
  const who = event.subject && event.subject.id === event.actor?.id ? null : event.subject;
  switch (event.kind) {
    case 'created':
      return event.from
        ? `created this card as a copy of “${event.from}”`
        : `created this card in ${event.to ?? 'a list'}`;
    case 'renamed':
      return `renamed this card from “${event.from ?? ''}” to “${event.to ?? ''}”`;
    case 'described':
      return 'edited the description';
    case 'due_set':
      return `set the due date to ${day(event.to)}`;
    case 'due_cleared':
      return 'removed the due date';
    case 'moved':
      return `moved this card from ${event.from ?? 'a list'} to ${event.to ?? 'a list'}`;
    case 'label_added':
      return `added the label ${event.to ?? ''}`;
    case 'label_removed':
      return `removed the label ${event.to ?? ''}`;
    case 'assigned':
      return who ? `assigned ${nameOf(who)}` : 'assigned themself';
    case 'unassigned':
      return who ? `unassigned ${nameOf(who)}` : 'unassigned themself';
  }
}

export function describeGroup(actor: Person | null, events: ActivityItem[]): string {
  return `${nameOf(actor)} ${events.map(describeEvent).join(', ')}.`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const age = now - Date.parse(iso);
  if (!Number.isFinite(age)) return '';
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)} h ago`;
  return absoluteTime(iso);
}

export interface MentionMatch {
  start: number;
  query: string;
}

export function mentionQuery(text: string, caret: number): MentionMatch | null {
  const before = text.slice(0, caret);
  const found = /(?:^|\s)@([\w.-]{0,32})$/.exec(before);
  if (!found) return null;
  return { start: caret - found[1].length - 1, query: found[1] };
}

export function insertMention(
  text: string,
  caret: number,
  match: MentionMatch,
  username: string
): { text: string; caret: number } {
  const insertion = `@${username} `;
  const next = `${text.slice(0, match.start)}${insertion}${text.slice(caret)}`;
  return { text: next, caret: match.start + insertion.length };
}

export function matchPeople(people: Person[], query: string, limit = 6): Person[] {
  const wanted = query.toLowerCase();
  return people
    .filter((person) => person.username.toLowerCase().startsWith(wanted))
    .sort((a, b) => a.username.localeCompare(b.username))
    .slice(0, limit);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function emphasiseMentions(body: string, usernames: string[]): string {
  if (usernames.length === 0) return body;
  const names = [...usernames].sort((a, b) => b.length - a.length).map(escapeRegex);
  const pattern = new RegExp(`(^|[\\s(])@(${names.join('|')})(?![\\w.-])`, 'g');
  return body
    .split(/(```[\s\S]*?```)/g)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(pattern, '$1**@$2**')))
    .join('');
}

export function draftKey(cardId: string): string {
  return `lekthik.comment-draft.${cardId}`;
}

export function readDraft(cardId: string): string {
  try {
    return window.localStorage.getItem(draftKey(cardId)) ?? '';
  } catch {
    return '';
  }
}

export function writeDraft(cardId: string, text: string): void {
  try {
    if (text === '') window.localStorage.removeItem(draftKey(cardId));
    else window.localStorage.setItem(draftKey(cardId), text);
  } catch {
    return;
  }
}
