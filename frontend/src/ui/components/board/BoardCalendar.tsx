import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useBoardMeta } from '@hooks/useBoardMeta';
import { announce } from '@lib/announcer';
import { type TableRow, buildRows } from '@lib/boardViews';
import type { BoardList, BoardMember, CardSummary, Label } from '@lib/boardsApi';
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
import { daysUntil, dueState, shortDue } from '@lib/dueDate';

import { AlertIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon } from '../ui/Icons';
import './BoardCalendar.css';

interface BoardCalendarProps {
  lists: BoardList[];
  labels: Label[];
  members: BoardMember[];
  matches: (card: CardSummary) => boolean;
  editable: boolean;
  onOpenCard: (cardId: string) => void;
  onSetDueDate: (cardId: string, day: string | null) => void;
}

const CHIPS_PER_DAY = 3;

function countWords(count: number): string {
  if (count === 0) return 'no cards due';
  return `${count} card${count === 1 ? '' : 's'} due`;
}

/**
 * Cards on a month by due date. The grid is one tab stop, arrows move between
 * days, and picking a day lists its cards beside the grid, where they open.
 * The cards without a date wait in a tray with a button to give them the
 * picked day, so planning never needs a drag.
 */
export function BoardCalendar({
  lists,
  labels,
  members,
  matches,
  editable,
  onOpenCard,
  onSetDueDate,
}: BoardCalendarProps) {
  const { today } = useBoardMeta();
  const firstDay = useMemo(() => firstDayOfWeek(), []);
  const names = useMemo(() => weekdayNames(firstDay), [firstDay]);

  const [focusDay, setFocusDay] = useState(today);
  const [selected, setSelected] = useState(today);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const cells = useRef(new Map<string, HTMLDivElement>());
  const wantsFocus = useRef(false);

  const titleId = useId();
  const hintId = useId();

  const rows = useMemo(
    () => buildRows(lists, labels, members).filter((row) => matches(row.card)),
    [lists, labels, members, matches]
  );
  const byDay = useMemo(() => {
    const map = new Map<string, TableRow[]>();
    for (const row of rows) {
      if (row.card.due_date) {
        map.set(row.card.due_date, [...(map.get(row.card.due_date) ?? []), row]);
      }
    }
    return map;
  }, [rows]);
  const unscheduled = useMemo(() => rows.filter((row) => row.card.due_date === null), [rows]);

  const weeks = useMemo(() => monthGrid(focusDay, firstDay), [focusDay, firstDay]);
  const monthKey = startOfMonth(focusDay);

  useEffect(() => {
    if (wantsFocus.current) {
      wantsFocus.current = false;
      cells.current.get(focusDay)?.focus();
    }
  }, [focusDay]);

  function goTo(day: string, focus: boolean) {
    if (startOfMonth(day) !== monthKey) {
      setDirection(day > focusDay ? 'next' : 'prev');
    }
    wantsFocus.current = focus;
    setFocusDay(day);
  }

  function pick(day: string) {
    setSelected(day);
    announce(`${dayTitle(day)}, ${countWords(byDay.get(day)?.length ?? 0)}.`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, day: string) {
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

  function changeMonth(delta: number) {
    goTo(shiftMonth(focusDay, delta), false);
  }

  function goToday() {
    goTo(today, false);
    setSelected(today);
  }

  function schedule(row: TableRow) {
    onSetDueDate(row.card.id, selected);
    announce(`${row.card.title} is now due ${dayTitle(selected)}.`);
  }

  function unschedule(row: TableRow) {
    onSetDueDate(row.card.id, null);
    announce(`Removed the due date of ${row.card.title}.`);
  }

  const agenda = byDay.get(selected) ?? [];
  const showingToday = startOfMonth(today) === monthKey;

  return (
    <div className="calendar">
      <div className="calendar__layout">
        <section className="calendar__main" aria-labelledby={titleId}>
          <header className="calendar__bar">
            <h2 id={titleId} className="calendar__title" aria-live="polite">
              {monthTitle(focusDay)}
            </h2>
            <div className="calendar__nav">
              <button
                type="button"
                className="calendar__nav-button"
                aria-label="Previous month"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeftIcon size={18} />
              </button>
              <button
                type="button"
                className="calendar__today"
                disabled={showingToday && focusDay === today && selected === today}
                onClick={goToday}
              >
                Today
              </button>
              <button
                type="button"
                className="calendar__nav-button"
                aria-label="Next month"
                onClick={() => changeMonth(1)}
              >
                <ChevronRightIcon size={18} />
              </button>
            </div>
          </header>

          <div
            className="calendar__grid"
            role="grid"
            aria-labelledby={titleId}
            aria-describedby={hintId}
            aria-rowcount={weeks.length + 1}
            aria-colcount={7}
          >
            <div className="calendar__weekdays" role="row" aria-rowindex={1}>
              {names.map((name, index) => (
                <span
                  key={name.long}
                  role="columnheader"
                  aria-colindex={index + 1}
                  className="calendar__weekday"
                >
                  <abbr title={name.long}>{name.short}</abbr>
                </span>
              ))}
            </div>

            <div className="calendar__weeks" key={monthKey} data-direction={direction}>
              {weeks.map((week, weekIndex) => (
                <div
                  key={week[0].day}
                  role="row"
                  aria-rowindex={weekIndex + 2}
                  className="calendar__week"
                >
                  {week.map((cell, columnIndex) => {
                    const due = byDay.get(cell.day) ?? [];
                    const isToday = cell.day === today;
                    const spoken = [
                      dayTitle(cell.day),
                      isToday ? 'today' : null,
                      countWords(due.length),
                    ]
                      .filter(Boolean)
                      .join(', ');

                    return (
                      // A grid cell is the one focusable thing per day; Enter picks it.
                      <div
                        key={cell.day}
                        ref={(node) => {
                          if (node) cells.current.set(cell.day, node);
                          else cells.current.delete(cell.day);
                        }}
                        role="gridcell"
                        data-day={cell.day}
                        aria-colindex={columnIndex + 1}
                        aria-selected={cell.day === selected}
                        tabIndex={cell.day === focusDay ? 0 : -1}
                        className="calendar__cell"
                        data-outside={!cell.inMonth || undefined}
                        data-today={isToday || undefined}
                        data-selected={cell.day === selected || undefined}
                        data-busy={due.length > 0 || undefined}
                        onClick={() => {
                          setFocusDay(cell.day);
                          pick(cell.day);
                        }}
                        onKeyDown={(event) => handleKeyDown(event, cell.day)}
                      >
                        <span className="calendar__date" aria-hidden="true">
                          {Number(cell.day.slice(8))}
                        </span>
                        <span className="sr-only">{spoken}</span>
                        <span className="calendar__chips" aria-hidden="true">
                          {due.slice(0, CHIPS_PER_DAY).map((row) => (
                            <span
                              key={row.card.id}
                              className="calendar__chip"
                              data-state={dueState(cell.day, today)}
                            >
                              {dueState(cell.day, today) === 'overdue' && <AlertIcon size={11} />}
                              <span className="calendar__chip-text">{row.card.title}</span>
                            </span>
                          ))}
                          {due.length > CHIPS_PER_DAY && (
                            <span className="calendar__more">
                              +{due.length - CHIPS_PER_DAY} more
                            </span>
                          )}
                        </span>
                        {due.length > 0 && (
                          <span className="calendar__count" aria-hidden="true">
                            {due.length}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <p id={hintId} className="sr-only">
            Arrow keys move between days, Page Up and Page Down change month, Enter shows the cards
            of a day.
          </p>
        </section>

        <aside
          className="calendar__side"
          aria-label="Cards of the chosen day and cards without a date"
        >
          <section className="calendar__panel" aria-labelledby={`${titleId}-day`}>
            <h3 id={`${titleId}-day`} className="calendar__panel-title">
              {dayTitle(selected)}
              {selected === today && <span className="calendar__badge">Today</span>}
            </h3>
            {agenda.length === 0 ? (
              <p className="calendar__empty">
                {editable
                  ? 'Nothing is due. Give a card this day from the tray below.'
                  : 'Nothing is due this day.'}
              </p>
            ) : (
              <ul className="calendar__list">
                {agenda.map((row, index) => (
                  <li
                    key={row.card.id}
                    className="calendar__item"
                    style={{ '--item-index': Math.min(index, 8) } as React.CSSProperties}
                    data-state={dueState(selected, today)}
                  >
                    <button
                      type="button"
                      className="calendar__open"
                      onClick={() => onOpenCard(row.card.id)}
                    >
                      <span className="calendar__item-title">{row.card.title}</span>
                      <span className="calendar__item-meta">{row.listName}</span>
                    </button>
                    {editable && (
                      <button
                        type="button"
                        className="calendar__icon-button"
                        aria-label={`Remove the due date of ${row.card.title}`}
                        onClick={() => unschedule(row)}
                      >
                        <CloseIcon size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="calendar__panel" aria-labelledby={`${titleId}-tray`}>
            <h3 id={`${titleId}-tray`} className="calendar__panel-title">
              No due date
              <span className="calendar__badge">
                <span aria-hidden="true">{unscheduled.length}</span>
                <span className="sr-only">{`${unscheduled.length} cards`}</span>
              </span>
            </h3>
            {unscheduled.length === 0 ? (
              <p className="calendar__empty">Every card has a date.</p>
            ) : (
              <ul className="calendar__list calendar__list--tray">
                {unscheduled.map((row) => (
                  <li key={row.card.id} className="calendar__item" data-card-id={row.card.id}>
                    <button
                      type="button"
                      className="calendar__open"
                      id={`${titleId}-${row.card.id}`}
                      onClick={() => onOpenCard(row.card.id)}
                    >
                      <span className="calendar__item-title">{row.card.title}</span>
                      <span className="calendar__item-meta">{row.listName}</span>
                    </button>
                    {editable && (
                      <button
                        type="button"
                        className="calendar__schedule"
                        aria-describedby={`${titleId}-${row.card.id}`}
                        onClick={() => schedule(row)}
                      >
                        <PlusIcon size={13} />
                        {daysUntil(selected, today) === 0
                          ? 'Due today'
                          : `Due ${shortDue(selected, today)}`}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
