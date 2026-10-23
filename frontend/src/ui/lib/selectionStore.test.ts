import { beforeEach, describe, expect, it } from 'vitest';

import { useAnnouncer } from './announcer';
import { describeSelection, hasSelection, useSelectionStore } from './selectionStore';

describe('selection', () => {
  beforeEach(() => {
    useSelectionStore.setState({ cards: [], panels: [] });
    useAnnouncer.setState({ message: '', tick: 0 });
  });

  it('says what is picked in words', () => {
    expect(describeSelection(0, 0)).toBe('Nothing selected');
    expect(describeSelection(1, 0)).toBe('1 card selected');
    expect(describeSelection(3, 2)).toBe('3 cards and 2 lists and blocks selected');
  });

  it('toggles cards and panels and announces the result', () => {
    useSelectionStore.getState().toggleCard('a');
    useSelectionStore.getState().toggleCard('b');
    useSelectionStore.getState().togglePanel('p');
    useSelectionStore.getState().toggleCard('a');

    expect(useSelectionStore.getState().cards).toEqual(['b']);
    expect(useSelectionStore.getState().panels).toEqual(['p']);
    expect(hasSelection()).toBe(true);
    expect(useAnnouncer.getState().message).toBe('1 card and 1 list or block selected.');
  });

  it('stays quiet while a rectangle is still being drawn', () => {
    useSelectionStore.getState().setSelection(['a'], [], false);

    expect(useSelectionStore.getState().cards).toEqual(['a']);
    expect(useAnnouncer.getState().message).toBe('');
  });

  it('does not announce a change that changed nothing', () => {
    useSelectionStore.getState().setSelection(['a'], []);
    const tick = useAnnouncer.getState().tick;

    useSelectionStore.getState().setSelection(['a'], []);

    expect(useAnnouncer.getState().tick).toBe(tick);
  });

  it('puts the selection down', () => {
    useSelectionStore.getState().setSelection(['a'], ['p']);

    useSelectionStore.getState().clear();

    expect(hasSelection()).toBe(false);
    expect(useAnnouncer.getState().message).toBe('Selection cleared.');
  });
});
