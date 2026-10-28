import { afterEach, describe, expect, it } from 'vitest';

import {
  type ActivityItem,
  type CommentItem,
  type Person,
  absoluteTime,
  describeEvent,
  describeGroup,
  draftKey,
  emphasiseMentions,
  groupTimeline,
  insertMention,
  matchPeople,
  mentionQuery,
  nameOf,
  readDraft,
  relativeTime,
  writeDraft,
} from './timeline';

const wen: Person = { id: 'wen', username: 'wen' };
const maya: Person = { id: 'maya', username: 'maya' };

function event(
  id: string,
  at: string,
  extra: Partial<ActivityItem> & Pick<ActivityItem, 'kind'>,
  actor: Person | null = wen
): ActivityItem {
  return {
    type: 'activity',
    id,
    actor,
    subject: null,
    from: null,
    to: null,
    created_at: at,
    ...extra,
  };
}

function comment(id: string, at: string, author: Person | null = wen): CommentItem {
  return {
    type: 'comment',
    id,
    card_id: 'card',
    author,
    body: 'Hello',
    created_at: at,
    edited_at: null,
  };
}

describe('groupTimeline', () => {
  it('groups consecutive events by the same person within five minutes', () => {
    const entries = groupTimeline([
      event('1', '2026-10-28T10:00:00Z', { kind: 'moved', from: 'A', to: 'B' }),
      event('2', '2026-10-28T10:03:00Z', { kind: 'label_added', to: 'Bug' }),
      event('3', '2026-10-28T10:07:30Z', { kind: 'due_cleared' }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: 'events' });
    expect(entries[0].type === 'events' && entries[0].events).toHaveLength(3);
  });

  it('starts a new group after a gap, for another person, and across a comment', () => {
    const entries = groupTimeline([
      event('1', '2026-10-28T10:00:00Z', { kind: 'moved', from: 'A', to: 'B' }),
      event('2', '2026-10-28T10:20:00Z', { kind: 'due_cleared' }),
      event('3', '2026-10-28T10:21:00Z', { kind: 'due_cleared' }, maya),
      comment('4', '2026-10-28T10:22:00Z'),
      event('5', '2026-10-28T10:23:00Z', { kind: 'due_cleared' }, maya),
    ]);

    expect(entries.map((entry) => entry.type)).toEqual([
      'events',
      'events',
      'events',
      'comment',
      'events',
    ]);
  });

  it('groups the events of a person who left together, but not with anyone else', () => {
    const entries = groupTimeline([
      event('1', '2026-10-28T10:00:00Z', { kind: 'due_cleared' }, null),
      event('2', '2026-10-28T10:01:00Z', { kind: 'described' }, null),
      event('3', '2026-10-28T10:02:00Z', { kind: 'described' }, wen),
    ]);

    expect(entries).toHaveLength(2);
  });

  it('keeps what was said in order and returns nothing for nothing', () => {
    expect(groupTimeline([])).toEqual([]);
    const entries = groupTimeline([
      comment('a', '2026-10-28T10:00:00Z'),
      comment('b', '2026-10-28T10:00:01Z', maya),
    ]);
    expect(entries.map((entry) => entry.key)).toEqual(['a', 'b']);
  });
});

describe('sentences', () => {
  it('say what happened, for every kind of event', () => {
    const cases: Array<[Partial<ActivityItem> & Pick<ActivityItem, 'kind'>, string]> = [
      [{ kind: 'created', to: 'To do' }, 'created this card in To do'],
      [{ kind: 'created', from: 'Plan' }, 'created this card as a copy of “Plan”'],
      [{ kind: 'renamed', from: 'A', to: 'B' }, 'renamed this card from “A” to “B”'],
      [{ kind: 'described' }, 'edited the description'],
      [{ kind: 'due_cleared' }, 'removed the due date'],
      [{ kind: 'moved', from: 'To do', to: 'Done' }, 'moved this card from To do to Done'],
      [{ kind: 'label_added', to: 'Bug' }, 'added the label Bug'],
      [{ kind: 'label_removed', to: 'Bug' }, 'removed the label Bug'],
    ];
    for (const [partial, sentence] of cases) {
      expect(describeEvent(event('x', '2026-10-28T10:00:00Z', partial))).toBe(sentence);
    }
    expect(
      describeEvent(event('x', '2026-10-28T10:00:00Z', { kind: 'due_set', to: '2026-11-02' }))
    ).toMatch(/^set the due date to .*2.*$/);
  });

  it('tell self assignment from assigning somebody else', () => {
    expect(
      describeEvent(event('1', '2026-10-28T10:00:00Z', { kind: 'assigned', subject: wen }))
    ).toBe('assigned themself');
    expect(
      describeEvent(event('2', '2026-10-28T10:00:00Z', { kind: 'assigned', subject: maya }))
    ).toBe('assigned maya');
    expect(
      describeEvent(event('3', '2026-10-28T10:00:00Z', { kind: 'unassigned', subject: null }))
    ).toBe('unassigned themself');
    expect(
      describeEvent(event('4', '2026-10-28T10:00:00Z', { kind: 'unassigned', subject: null }, maya))
    ).toBe('unassigned themself');
  });

  it('read as one sentence for a group, and name a person who left', () => {
    const group = [
      event('1', '2026-10-28T10:00:00Z', { kind: 'moved', from: 'A', to: 'B' }),
      event('2', '2026-10-28T10:01:00Z', { kind: 'label_added', to: 'Bug' }),
    ];

    expect(describeGroup(wen, group)).toBe('wen moved this card from A to B, added the label Bug.');
    expect(describeGroup(null, group.slice(1))).toBe('A deleted user added the label Bug.');
    expect(nameOf(null)).toBe('A deleted user');
  });
});

describe('time', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');

  it('is relative for a day and absolute after', () => {
    expect(relativeTime('2026-10-28T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-10-28T11:55:00Z', now)).toBe('5 min ago');
    expect(relativeTime('2026-10-28T09:00:00Z', now)).toBe('3 h ago');
    expect(relativeTime('2026-10-20T09:00:00Z', now)).toBe(absoluteTime('2026-10-20T09:00:00Z'));
    expect(relativeTime('not a time', now)).toBe('');
  });
});

describe('mentions', () => {
  it('are found when an @ starts a word right before the caret', () => {
    expect(mentionQuery('Hello @ma', 9)).toEqual({ start: 6, query: 'ma' });
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' });
    expect(mentionQuery('first\n@wen', 10)).toEqual({ start: 6, query: 'wen' });
    expect(mentionQuery('mail me@home', 12)).toBeNull();
    expect(mentionQuery('Hello @ma and more', 9)).toEqual({ start: 6, query: 'ma' });
    expect(mentionQuery('Hello @ma and more', 18)).toBeNull();
    expect(mentionQuery('no mention', 10)).toBeNull();
  });

  it('are completed in place and leave the caret after them', () => {
    const match = mentionQuery('Hi @ma, see', 6);

    expect(match).not.toBeNull();
    expect(insertMention('Hi @ma, see', 6, match!, 'maya')).toEqual({
      text: 'Hi @maya , see',
      caret: 9,
    });
  });

  it('are suggested by the start of the name, in order, a few at a time', () => {
    const people = ['Maya', 'max', 'wen', 'mia', 'mo', 'mu', 'ma', 'mi'].map((username) => ({
      id: username,
      username,
    }));

    expect(matchPeople(people, 'ma').map((p) => p.username)).toEqual(['ma', 'max', 'Maya']);
    expect(matchPeople(people, '', 3)).toHaveLength(3);
    expect(matchPeople(people, 'zz')).toEqual([]);
  });

  it('are highlighted in a body without touching code blocks or half matches', () => {
    expect(emphasiseMentions('Thanks @wen and @maya!', ['wen', 'maya'])).toBe(
      'Thanks **@wen** and **@maya**!'
    );
    expect(emphasiseMentions('mail me@wen.dev and @wenzel', ['wen'])).toBe(
      'mail me@wen.dev and @wenzel'
    );
    expect(emphasiseMentions('```\n@wen\n```\n@wen', ['wen'])).toBe('```\n@wen\n```\n**@wen**');
    expect(emphasiseMentions('@a.b ok', ['a.b'])).toBe('**@a.b** ok');
    expect(emphasiseMentions('@wen', [])).toBe('@wen');
  });
});

describe('drafts', () => {
  afterEach(() => window.localStorage.clear());

  it('are kept per card and forgotten once empty', () => {
    writeDraft('c1', 'half a thought');
    writeDraft('c2', 'another');

    expect(readDraft('c1')).toBe('half a thought');
    expect(readDraft('c2')).toBe('another');
    expect(window.localStorage.getItem(draftKey('c1'))).toBe('half a thought');

    writeDraft('c1', '');
    expect(readDraft('c1')).toBe('');
    expect(window.localStorage.getItem(draftKey('c1'))).toBeNull();
  });
});
