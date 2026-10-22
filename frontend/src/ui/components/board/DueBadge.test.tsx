import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BoardMetaProvider } from '@hooks/useBoardMeta';

import { AssigneeStack } from './AssigneeStack';
import { DueBadge } from './DueBadge';

function inBoard(ui: React.ReactNode) {
  return render(
    <BoardMetaProvider
      members={[
        { user_id: 'a', username: 'amir' },
        { user_id: 'b', username: 'wen' },
        { user_id: 'c', username: 'olga' },
        { user_id: 'd', username: 'sam' },
        { user_id: 'e', username: 'lea' },
      ]}
      meId="a"
      today="2026-10-22"
    >
      {ui}
    </BoardMetaProvider>
  );
}

describe('DueBadge', () => {
  it.each([
    ['2026-10-20', 'overdue', /^Overdue, /],
    ['2026-10-22', 'today', /^Due today, /],
    ['2026-10-24', 'soon', /^Due soon, /],
    ['2026-12-01', 'later', /^Due, /],
  ])('says %s is %s in words, not only in colour', (day, state, sentence) => {
    const { container } = inBoard(<DueBadge day={day} />);

    expect(container.querySelector('.due-badge')).toHaveAttribute('data-state', state);
    expect(screen.getByText(sentence)).toBeInTheDocument();
  });

  it('uses a different icon once overdue', () => {
    const { container, rerender } = inBoard(<DueBadge day="2026-10-20" />);
    const overdue = container.querySelector('svg')?.innerHTML;

    rerender(
      <BoardMetaProvider members={[]} meId="a" today="2026-10-22">
        <DueBadge day="2026-10-30" />
      </BoardMetaProvider>
    );

    expect(container.querySelector('svg')?.innerHTML).not.toBe(overdue);
  });
});

describe('AssigneeStack', () => {
  it('renders nothing for an unassigned card', () => {
    const { container } = inBoard(<AssigneeStack ids={[]} />);

    expect(container.querySelector('.assignees')).toBeNull();
  });

  it('names everyone for screen readers and shows at most three faces', () => {
    const { container } = inBoard(<AssigneeStack ids={['a', 'b', 'c', 'd', 'e']} />);

    expect(screen.getByText('Assigned to amir, wen, olga, sam, lea')).toBeInTheDocument();
    expect(container.querySelectorAll('.avatar')).toHaveLength(3);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('falls back gracefully for someone who left the workspace', () => {
    inBoard(<AssigneeStack ids={['gone']} />);

    expect(screen.getByText('Assigned to Former member')).toBeInTheDocument();
  });

  it('animates only people who join after the first paint', () => {
    const wrap = (ids: string[]) => (
      <BoardMetaProvider
        members={[
          { user_id: 'a', username: 'amir' },
          { user_id: 'b', username: 'wen' },
        ]}
        meId="a"
        today="2026-10-22"
      >
        <AssigneeStack ids={ids} />
      </BoardMetaProvider>
    );
    const { container, rerender } = render(wrap(['a']));
    expect(container.querySelector('[data-new]')).toBeNull();

    rerender(wrap(['a', 'b']));

    expect(container.querySelectorAll('[data-new]')).toHaveLength(1);
  });
});
