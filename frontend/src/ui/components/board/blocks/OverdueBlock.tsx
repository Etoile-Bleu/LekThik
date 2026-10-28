import { useMemo, useState } from 'react';

import { useBoardMeta } from '@hooks/useBoardMeta';
import { lateCardsOf, lateLabel } from '@lib/blocks';
import type { BoardList } from '@lib/boardsApi';
import { shortDue } from '@lib/dueDate';

import { AlertIcon, CheckCircleIcon } from '../../ui/Icons';
import './OverdueBlock.css';

interface OverdueBlockProps {
  panels: BoardList[];
  onOpenCard: (cardId: string) => void;
}

const VISIBLE = 5;

export function OverdueBlock({ panels, onOpenCard }: OverdueBlockProps) {
  const { today, meId } = useBoardMeta();
  const [expanded, setExpanded] = useState(false);
  const late = useMemo(() => lateCardsOf(panels, meId, today), [panels, meId, today]);

  if (late.length === 0) {
    return (
      <div className="overdue-block overdue-block--clear">
        <CheckCircleIcon size={22} />
        <p className="overdue-block__clear-title">Nothing is late</p>
        <p>None of your cards is past its date.</p>
      </div>
    );
  }

  const shown = expanded ? late : late.slice(0, VISIBLE);
  const hidden = late.length - shown.length;
  const summary = `${late.length} of your ${late.length === 1 ? 'card is' : 'cards are'} late.`;

  return (
    <div className="overdue-block">
      <p className="sr-only" role="status">
        {summary}
      </p>
      <div className="overdue-block__figure" aria-hidden="true">
        <AlertIcon size={22} />
        <span className="overdue-block__count">{late.length}</span>
        <span className="overdue-block__caption">late for you</span>
      </div>
      <ul className="overdue-block__list">
        {shown.map(({ card, listName, daysLate, severity }, index) => (
          <li
            key={card.id}
            style={{ '--row-index': Math.min(index, 8) } as React.CSSProperties}
            data-severity={severity}
          >
            <button
              type="button"
              className="overdue-block__card"
              onClick={() => onOpenCard(card.id)}
            >
              <span className="overdue-block__title">{card.title}</span>
              <span className="overdue-block__meta">
                <time
                  dateTime={card.due_date ?? undefined}
                  title={shortDue(card.due_date ?? today, today)}
                >
                  {lateLabel(daysLate)}
                </time>
                <span aria-hidden="true"> · </span>
                <span className="sr-only">, in </span>
                {listName}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {late.length > VISIBLE && (
        <button
          type="button"
          className="overdue-block__more"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  );
}
