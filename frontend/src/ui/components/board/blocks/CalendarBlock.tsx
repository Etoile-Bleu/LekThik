import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useBoardMeta } from '@hooks/useBoardMeta';
import { announce } from '@lib/announcer';
import { dueByDay } from '@lib/blocks';
import type { BoardList } from '@lib/boardsApi';
import {
  dayTitle,
  firstDayOfWeek,
  monthGrid,
  monthTitle,
  moveFocus,
  shiftMonth,
  startOfMonth,
  weekdayNames,
} from '@lib/calendar';
import { dueState } from '@lib/dueDate';

import { ChevronLeftIcon, ChevronRightIcon } from '../../ui/Icons';
import './CalendarBlock.css';

interface CalendarBlockProps {
  panels: BoardList[];
  onOpenCard: (cardId: string) => void;
}

const SHOWN = 4;

/**
 * A small month for the corner of a board. Days with cards due carry a dot,
 * and picking a day lists its cards underneath, where they open. The grid is
 * one tab stop and moves with the arrow keys, like the full calendar.
 */
export function CalendarBlock({ panels, onOpenCard }: CalendarBlockProps) {
  const { today } = useBoardMeta();
  const firstDay = useMemo(() => firstDayOfWeek(), []);
  const names = useMemo(() => weekdayNames(firstDay), [firstDay]);
  const byDay = useMemo(() => dueByDay(panels), [panels]);

  const [focusDay, setFocusDay] = useState(today);
  const [selected, setSelected] = useState(today);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const cells = useRef(new Map<string, HTMLDivElement>());
  const wantsFocus = useRef(false);
  const titleId = useId();

  const weeks = useMemo(() => monthGrid(focusDay, firstDay), [focusDay, firstDay]);
  const monthKey = startOfMonth(focusDay);
  const dayCards = byDay.get(selected) ?? [];

  useEffect(() => {
    if (wantsFocus.current) {
      wantsFocus.current = false;
      cells.current.get(focusDay)?.focus();
    }
  }, [focusDay]);

  function goTo(day: string, focus: boolean) {
    if (startOfMonth(day) !== monthKey) setDirection(day > focusDay ? 'next' : 'prev');
    wantsFocus.current = focus;
    setFocusDay(day);
  }

  function pick(day: string) {
    setSelected(day);
    const count = byDay.get(day)?.length ?? 0;
    announce(`${dayTitle(day)}, ${count === 0 ? 'no cards due' : `${count} due`}.`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, day: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(day);
      return;
    }
    const target = moveFocus(day, event.key, firstDay, event.shiftKey);
    if (target) {
      event.preventDefault();
      goTo(target, true);
    }
  }

  return (
    <div className="cal-block">
      <header className="cal-block__bar">
        <h3 id={titleId} className="cal-block__title" aria-live="polite">
          {monthTitle(focusDay)}
        </h3>
        <div className="cal-block__nav">
          <button
            type="button"
            className="cal-block__step"
            aria-label="Previous month"
            onClick={() => goTo(shiftMonth(focusDay, -1), false)}
          >
            <ChevronLeftIcon size={16} />
          </button>
          <button
            type="button"
            className="cal-block__step"
            aria-label="Next month"
            onClick={() => goTo(shiftMonth(focusDay, 1), false)}
          >
            <ChevronRightIcon size={16} />
          </button>
        </div>
      </header>

      <div className="cal-block__grid" role="grid" aria-labelledby={titleId}>
        <div className="cal-block__row cal-block__row--head" role="row">
          {names.map((name) => (
            <span key={name.long} role="columnheader" className="cal-block__weekday">
              <abbr title={name.long}>{name.narrow}</abbr>
            </span>
          ))}
        </div>
        <div className="cal-block__weeks" key={monthKey} data-direction={direction}>
          {weeks.map((week) => (
            <div key={week[0].day} role="row" className="cal-block__row">
              {week.map((cell) => {
                const due = byDay.get(cell.day) ?? [];
                const late = due.length > 0 && dueState(cell.day, today) === 'overdue';
                const spoken = [
                  dayTitle(cell.day),
                  cell.day === today ? 'today' : null,
                  due.length === 0 ? null : `${due.length} card${due.length === 1 ? '' : 's'} due`,
                ]
                  .filter(Boolean)
                  .join(', ');
                return (
                  <div
                    key={cell.day}
                    ref={(node) => {
                      if (node) cells.current.set(cell.day, node);
                      else cells.current.delete(cell.day);
                    }}
                    role="gridcell"
                    aria-selected={cell.day === selected}
                    tabIndex={cell.day === focusDay ? 0 : -1}
                    className="cal-block__cell"
                    data-outside={!cell.inMonth || undefined}
                    data-today={cell.day === today || undefined}
                    data-selected={cell.day === selected || undefined}
                    onClick={() => {
                      setFocusDay(cell.day);
                      pick(cell.day);
                    }}
                    onKeyDown={(event) => onKeyDown(event, cell.day)}
                  >
                    <span className="cal-block__date" aria-hidden="true">
                      {Number(cell.day.slice(8))}
                    </span>
                    <span className="sr-only">{spoken}</span>
                    {due.length > 0 && (
                      <span
                        className="cal-block__mark"
                        data-late={late || undefined}
                        aria-hidden="true"
                      >
                        {due.length > 1 ? due.length : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div role="group" className="cal-block__day" aria-label={`Cards due ${dayTitle(selected)}`}>
        <h4 className="cal-block__day-title">{dayTitle(selected)}</h4>
        {dayCards.length === 0 ? (
          <p className="cal-block__none">Nothing due.</p>
        ) : (
          <ul className="cal-block__list">
            {dayCards.slice(0, SHOWN).map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  className="cal-block__card"
                  onClick={() => onOpenCard(card.id)}
                >
                  {card.title}
                </button>
              </li>
            ))}
            {dayCards.length > SHOWN && (
              <li className="cal-block__more">
                +{dayCards.length - SHOWN} more, in the full calendar
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
