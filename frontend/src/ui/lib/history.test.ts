import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HISTORY_LIMIT,
  alias,
  isReplaying,
  record,
  redoLast,
  resolveId,
  retireEntry,
  undoLast,
  useHistoryStore,
} from './history';
import { useAnnouncer } from './announcer';
import { useToastStore } from './toastStore';

function entry(label: string, log: string[] = []) {
  return {
    label,
    undo: vi.fn(async () => {
      log.push(`undo ${label}`);
    }),
    redo: vi.fn(async () => {
      log.push(`redo ${label}`);
    }),
  };
}

describe('history', () => {
  beforeEach(() => {
    useHistoryStore.getState().clear();
    useToastStore.setState({ toasts: [] });
  });

  it('undoes the latest change first and redoes it afterwards', async () => {
    const log: string[] = [];
    record(entry('one', log));
    record(entry('two', log));

    expect(await useHistoryStore.getState().undo()).toBe('two');
    expect(await useHistoryStore.getState().undo()).toBe('one');
    expect(await useHistoryStore.getState().redo()).toBe('one');

    expect(log).toEqual(['undo two', 'undo one', 'redo one']);
    expect(useHistoryStore.getState().past.map((item) => item.label)).toEqual(['one']);
    expect(useHistoryStore.getState().future.map((item) => item.label)).toEqual(['two']);
  });

  it('forgets what could be redone as soon as something new is done', async () => {
    record(entry('one'));
    await useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().future).toHaveLength(1);

    record(entry('two'));

    expect(useHistoryStore.getState().future).toHaveLength(0);
  });

  it('does nothing with nothing to undo or redo', async () => {
    expect(await useHistoryStore.getState().undo()).toBeNull();
    expect(await useHistoryStore.getState().redo()).toBeNull();
  });

  it('keeps only the latest hundred changes', () => {
    for (let index = 0; index < HISTORY_LIMIT + 20; index += 1) record(entry(`n${index}`));

    const { past } = useHistoryStore.getState();
    expect(past).toHaveLength(HISTORY_LIMIT);
    expect(past[0].label).toBe('n20');
  });

  it('does not record what the replay itself changes', async () => {
    const inner = entry('inner');
    const outer = {
      label: 'outer',
      undo: async () => {
        expect(isReplaying()).toBe(true);
        record(inner);
      },
      redo: async () => undefined,
    };
    record(outer);

    await useHistoryStore.getState().undo();

    expect(isReplaying()).toBe(false);
    expect(useHistoryStore.getState().past).toHaveLength(0);
    expect(useHistoryStore.getState().future).toHaveLength(1);
  });

  it('drops a change that cannot be replayed and says so', async () => {
    record({
      label: 'broken',
      undo: async () => {
        throw new Error('gone');
      },
      redo: async () => undefined,
    });

    expect(await useHistoryStore.getState().undo()).toBeNull();

    expect(useHistoryStore.getState().past).toHaveLength(0);
    expect(useHistoryStore.getState().future).toHaveLength(0);
    expect(useToastStore.getState().toasts.length).toBeGreaterThan(0);
    expect(useHistoryStore.getState().busy).toBe(false);
  });

  it('counts a revision for every replay, so open dialogs can read again', async () => {
    record(entry('one'));
    const before = useHistoryStore.getState().revision;

    await useHistoryStore.getState().undo();

    expect(useHistoryStore.getState().revision).toBe(before + 1);
  });

  it('follows an id through the things that were recreated', () => {
    alias('a', 'b');
    alias('b', 'c');

    expect(resolveId('a')).toBe('c');
    expect(resolveId('other')).toBe('other');

    useHistoryStore.getState().clear();
    expect(resolveId('a')).toBe('a');
  });

  it('drops a change by the id record gave it, without running it', async () => {
    const log: string[] = [];
    const id = record(entry('one', log));
    record(entry('two', log));

    retireEntry(id);

    expect(useHistoryStore.getState().past.map((item) => item.label)).toEqual(['two']);
    expect(await useHistoryStore.getState().undo()).toBe('two');
    expect(log).toEqual(['undo two']);
  });

  it('does nothing when asked to retire an id that was never recorded', () => {
    record(entry('one'));
    expect(() => retireEntry(0)).not.toThrow();
    expect(useHistoryStore.getState().past).toHaveLength(1);
  });

  it('tells screen readers what was undone and redone', async () => {
    record(entry('Rename card'));

    await undoLast();
    expect(useAnnouncer.getState().message).toBe('Undone: Rename card.');
    await redoLast();
    expect(useAnnouncer.getState().message).toBe('Redone: Rename card.');
    await redoLast();
    expect(useAnnouncer.getState().message).toBe('Nothing to redo.');
  });
});
