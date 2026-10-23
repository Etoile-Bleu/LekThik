import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type Command,
  collectCommands,
  forgetRecent,
  parseQuickDate,
  rankCommands,
  readRecent,
  rememberCommand,
  useCommandStore,
} from './commandStore';

function command(id: string, title: string, extra: Partial<Command> = {}): Command {
  return { id, title, group: 'This board', ...extra };
}

describe('rankCommands', () => {
  const all = [
    command('fit', 'Fit the layout', { keywords: ['arrange', 'tidy'], group: 'This board' }),
    command('card', 'Add a card…', { group: 'Create' }),
    command('list', 'Add a list…', { group: 'Create' }),
    command('open', 'Broadcast with sound direction', { group: 'Cards', searchOnly: true }),
    command('theme', 'Theme: Dark', { group: 'Appearance', searchOnly: true }),
  ];

  it('lists suggestions first and hides search only commands when nothing is typed', () => {
    const items = rankCommands(
      [...all, command('sugg', 'Clear filters', { suggested: true, group: 'View' })],
      '',
      []
    );

    expect(items[0].command.id).toBe('sugg');
    expect(items.map((item) => item.command.id)).not.toContain('open');
    expect(items.map((item) => item.command.id)).not.toContain('theme');
  });

  it('puts recent commands on top under their own heading', () => {
    const items = rankCommands(all, '', ['list']);

    expect(items[0].command.id).toBe('list');
    expect(items[0].command.group).toBe('Recent');
    expect(items.filter((item) => item.command.id === 'list')).toHaveLength(1);
  });

  it('forgets recent ids that no longer exist', () => {
    expect(rankCommands(all, '', ['gone']).map((item) => item.command.id)).not.toContain('gone');
  });

  it('finds a command by its title or by a keyword', () => {
    expect(rankCommands(all, 'adc', [])[0].command.id).toBe('open');
    expect(rankCommands(all, 'tidy', []).map((item) => item.command.id)).toEqual(['fit']);
    expect(rankCommands(all, 'zzz', [])).toEqual([]);
  });

  it('ranks the better title match first', () => {
    const ids = rankCommands(all, 'add', []).map((item) => item.command.id);

    expect(ids.slice(0, 2).sort()).toEqual(['card', 'list']);
  });

  it('returns where the title matched, for highlighting', () => {
    const [first] = rankCommands(all, 'fit', []);

    expect(first.indexes).toEqual([0, 1, 2]);
  });

  it('lets a recently used command win a tie', () => {
    const items = rankCommands(
      [command('a', 'Open board alpha'), command('b', 'Open board beta')],
      'open board',
      ['b']
    );

    expect(items[0].command.id).toBe('b');
  });

  it('never lists more than the cap', () => {
    const many = Array.from({ length: 200 }, (_, index) =>
      command(`c${index}`, `Card number ${index}`)
    );

    expect(rankCommands(many, 'card', []).length).toBeLessThanOrEqual(60);
  });
});

describe('recent commands', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('remembers the latest first, once each, up to six', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'a']) rememberCommand(id);

    expect(readRecent()).toEqual(['a', 'g', 'f', 'e', 'd', 'c']);
  });

  it('forgets everything on request', () => {
    rememberCommand('a');
    forgetRecent();

    expect(readRecent()).toEqual([]);
  });

  it('survives storage that holds nonsense', () => {
    window.localStorage.setItem('lekthik.commands.recent.v1', '{"not":"a list"}');

    expect(readRecent()).toEqual([]);
  });
});

describe('sources', () => {
  it('collects the commands of every screen, once each', () => {
    useCommandStore.setState({
      sources: new Map([
        [1, () => [command('x', 'One')]],
        [2, () => [command('x', 'Duplicate'), command('y', 'Two')]],
      ]),
    });

    expect(collectCommands().map((item) => item.title)).toEqual(['One', 'Two']);
    useCommandStore.setState({ sources: new Map() });
  });
});

describe('parseQuickDate', () => {
  const wednesday = new Date(2026, 2, 11);

  it('reads the words people use', () => {
    expect(parseQuickDate('today', wednesday)).toBe('2026-03-11');
    expect(parseQuickDate('Tomorrow', wednesday)).toBe('2026-03-12');
    expect(parseQuickDate('next week', wednesday)).toBe('2026-03-18');
    expect(parseQuickDate('friday', wednesday)).toBe('2026-03-13');
    expect(parseQuickDate('fri', wednesday)).toBe('2026-03-13');
  });

  it('never picks today for a weekday that is today', () => {
    expect(parseQuickDate('wednesday', wednesday)).toBe('2026-03-18');
  });

  it('reads offsets', () => {
    expect(parseQuickDate('+3d', wednesday)).toBe('2026-03-14');
    expect(parseQuickDate('+2w', wednesday)).toBe('2026-03-25');
  });

  it('reads a full date and refuses days that do not exist', () => {
    expect(parseQuickDate('2026-03-14', wednesday)).toBe('2026-03-14');
    expect(parseQuickDate('2026-02-30', wednesday)).toBeUndefined();
    expect(parseQuickDate('2026-13-01', wednesday)).toBeUndefined();
  });

  it('means no date by none or clear, and nothing for nonsense', () => {
    expect(parseQuickDate('none', wednesday)).toBeNull();
    expect(parseQuickDate('clear', wednesday)).toBeNull();
    expect(parseQuickDate('soon', wednesday)).toBeUndefined();
  });
});
