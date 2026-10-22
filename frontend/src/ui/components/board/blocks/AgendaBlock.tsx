import { useMemo } from 'react';

import { useBoardMeta } from '@hooks/useBoardMeta';
import { agendaConfig, agendaGroups } from '@lib/blocks';
import type { BoardList } from '@lib/boardsApi';
import { shortDue } from '@lib/dueDate';

import { AlertIcon, CheckCircleIcon } from '../../ui/Icons';
import './AgendaBlock.css';

interface AgendaBlockProps {
  block: BoardList;
  panels: BoardList[];
  onOpenCard: (cardId: string) => void;
}

/**
 * What is due soon, day by day, with what is already late on top. Each card
 * opens from here. An empty agenda says so kindly: nothing due is good news.
 */
export function AgendaBlock({ block, panels, onOpenCard }: AgendaBlockProps) {
  const { today, meId } = useBoardMeta();
  const config = agendaConfig(block);
  const groups = useMemo(
    () => agendaGroups(panels, config, today, meId),
    [panels, config.range, config.mine_only, today, meId] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const total = groups.reduce((sum, group) => sum + group.cards.length, 0);

  const scope = `${config.range === 'today' ? 'today' : 'in the next 7 days'}${config.mine_only ? ', mine only' : ''}`;

  if (groups.length === 0) {
    return (
      <div className="agenda-block agenda-block--empty">
        <CheckCircleIcon size={22} />
        <p className="agenda-block__empty-title">Nothing due</p>
        <p>{`No cards are due ${scope}.`}</p>
      </div>
    );
  }

  return (
    <div className="agenda-block">
      <p className="sr-only" role="status">
        {`${total} card${total === 1 ? '' : 's'} due ${scope}.`}
      </p>
      {groups.map((group, groupIndex) => (
        <div
          key={group.key}
          role="group"
          className="agenda-block__group"
          data-late={group.day === null || undefined}
          aria-labelledby={`${block.id}-${group.key}`}
          style={{ '--group-index': groupIndex } as React.CSSProperties}
        >
          <h3 id={`${block.id}-${group.key}`} className="agenda-block__heading">
            {group.day === null && <AlertIcon size={13} />}
            {group.label}
            <span className="agenda-block__count">
              <span aria-hidden="true">{group.cards.length}</span>
              <span className="sr-only">{`${group.cards.length} cards`}</span>
            </span>
          </h3>
          <ul className="agenda-block__list">
            {group.cards.map(({ card, listName }) => (
              <li key={card.id}>
                <button
                  type="button"
                  className="agenda-block__card"
                  onClick={() => onOpenCard(card.id)}
                >
                  <span className="agenda-block__title">{card.title}</span>
                  <span className="agenda-block__meta">
                    {listName}
                    {group.day === null && card.due_date
                      ? `, due ${shortDue(card.due_date, today)}`
                      : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
