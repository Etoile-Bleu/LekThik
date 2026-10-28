import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLeaving } from '@hooks/useLeaving';
import { usePresenceStore } from '@lib/presenceStore';

import { PresenceHere, PresenceOnCard } from './PresenceOnCard';
import { PresenceStack } from './PresenceStack';

const wen = { user_id: 'u-wen', username: 'Wen', card_id: null };
const rita = { user_id: 'u-rita', username: 'Rita', card_id: 'c1' };

function show(viewers: Array<{ user_id: string; username: string; card_id: string | null }>) {
  act(() => usePresenceStore.getState().apply(viewers));
}

describe('PresenceStack', () => {
  beforeEach(() => usePresenceStore.getState().reset());

  function setup() {
    const onOpenCard = vi.fn();
    render(
      <MemoryRouter>
        <PresenceStack
          cardTitle={(id) => (id === 'c1' ? 'Write the spec' : undefined)}
          onOpenCard={onOpenCard}
        />
      </MemoryRouter>
    );
    return { onOpenCard };
  }

  it('draws nothing while nobody else is here', () => {
    setup();

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says in words who is here, for people who cannot see the avatars', () => {
    setup();

    show([wen]);
    expect(screen.getByRole('button', { name: /Wen is on this board/ })).toBeInTheDocument();

    show([wen, rita]);
    expect(
      screen.getByRole('button', { name: /Wen and Rita are on this board/ })
    ).toBeInTheDocument();
  });

  it('opens a list with each person and the card they have open, and opens that card', () => {
    const { onOpenCard } = setup();
    show([wen, rita]);

    fireEvent.click(screen.getByRole('button', { name: /on this board/ }));
    const panel = screen.getByRole('dialog', { name: 'Who is on this board' });

    expect(panel).toHaveTextContent('Wen');
    expect(panel).toHaveTextContent('On this board');
    fireEvent.click(screen.getByRole('button', { name: 'Looking at Write the spec' }));
    expect(onOpenCard).toHaveBeenCalledWith('c1');
  });

  it('keeps a short stack and counts the rest', () => {
    setup();
    show(
      Array.from({ length: 7 }, (_, index) => ({
        user_id: `u${index}`,
        username: `Person ${index}`,
        card_id: null,
      }))
    );

    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Person 0, Person 1 and 5 others are on this board/ })
    ).toBeInTheDocument();
  });

  it('points to the privacy settings, where a person can hide', () => {
    setup();
    show([wen]);

    fireEvent.click(screen.getByRole('button', { name: /on this board/ }));

    expect(screen.getByRole('link', { name: 'privacy settings' })).toHaveAttribute(
      'href',
      '/settings/privacy'
    );
  });
});

describe('PresenceOnCard and PresenceHere', () => {
  beforeEach(() => usePresenceStore.getState().reset());

  it('names who is looking at a card, in text, on the card', () => {
    render(<PresenceOnCard cardId="c1" />);

    expect(document.querySelector('.presence-card')).toBeNull();
    show([rita]);

    expect(screen.getByText('Rita is looking at this card')).toBeInTheDocument();
  });

  it('shows nothing on a card nobody has open', () => {
    render(<PresenceOnCard cardId="c2" />);
    show([rita]);

    expect(document.querySelector('.presence-card')).toBeNull();
  });

  it('says in the card dialog that someone else is there too', () => {
    render(<PresenceHere cardId="c1" />);
    show([rita]);

    expect(screen.getByText('Rita is also here')).toBeInTheDocument();
  });
});

describe('useLeaving', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps what left on screen for a moment, flagged, then lets it go', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ items }) => useLeaving(items, (item) => item, 200), {
      initialProps: { items: ['a', 'b'] },
    });

    rerender({ items: ['a'] });
    expect(result.current).toEqual([
      { item: 'a', leaving: false },
      { item: 'b', leaving: true },
    ]);

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toEqual([{ item: 'a', leaving: false }]);
  });

  it('does not keep anything when motion is reduced', () => {
    document.documentElement.dataset.motion = 'reduce';
    const { result, rerender } = renderHook(({ items }) => useLeaving(items, (item) => item), {
      initialProps: { items: ['a', 'b'] },
    });

    rerender({ items: ['a'] });

    expect(result.current).toEqual([{ item: 'a', leaving: false }]);
    delete document.documentElement.dataset.motion;
  });

  it('takes back what returns before it was gone', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ items }) => useLeaving(items, (item) => item, 200), {
      initialProps: { items: ['a', 'b'] },
    });

    rerender({ items: ['a'] });
    rerender({ items: ['a', 'b'] });

    expect(result.current).toEqual([
      { item: 'a', leaving: false },
      { item: 'b', leaving: false },
    ]);
  });
});
