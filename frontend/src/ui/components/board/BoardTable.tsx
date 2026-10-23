import { useMemo, useState } from 'react';

import { useBoardMeta } from '@hooks/useBoardMeta';
import { announce } from '@lib/announcer';
import { isCardList } from '@lib/blocks';
import {
  type Sort,
  type SortKey,
  buildRows,
  describeSort,
  nextSort,
  sortRows,
} from '@lib/boardViews';
import type { BoardList, BoardMember, CardSummary, Label } from '@lib/boardsApi';
import { withViewTransition } from '@lib/viewTransition';

import { ArrowDownIcon, SortAscendingIcon, SortDescendingIcon, SortIcon } from '../ui/Icons';
import { AssigneeStack } from './AssigneeStack';
import { DueBadge } from './DueBadge';
import { LabelChip } from './LabelChip';
import './BoardTable.css';

interface BoardTableProps {
  boardName: string;
  lists: BoardList[];
  labels: Label[];
  members: BoardMember[];
  matches: (card: CardSummary) => boolean;
  freshIds: string[];
  editable: boolean;
  onOpenCard: (cardId: string) => void;
  /** Moves a card to the end of another list, for people who would rather not drag. */
  onMoveCard: (cardId: string, listId: string, index: number) => void;
}

const COLUMNS: Array<{ key: SortKey; label: string; className: string }> = [
  { key: 'title', label: 'Card', className: 'board-table__col-title' },
  { key: 'list', label: 'List', className: 'board-table__col-list' },
  { key: 'labels', label: 'Labels', className: 'board-table__col-labels' },
  { key: 'assignees', label: 'Assignees', className: 'board-table__col-people' },
  { key: 'due', label: 'Due date', className: 'board-table__col-due' },
];

const MAX_LABELS = 3;
/** Animating every row costs more than it gives on a very long table. */
const MAX_ANIMATED_ROWS = 80;

function ariaSortFor(sort: Sort | null, key: SortKey): 'ascending' | 'descending' | undefined {
  if (!sort || sort.key !== key) return undefined;
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

function SortGlyph({ sort, column }: { sort: Sort | null; column: SortKey }) {
  if (!sort || sort.key !== column) return <SortIcon size={14} />;
  return sort.direction === 'asc' ? (
    <SortAscendingIcon size={14} />
  ) : (
    <SortDescendingIcon size={14} />
  );
}

/**
 * The same cards as a table you can sort. Each sortable header holds a real
 * button, only the sorted column carries `aria-sort`, the sort glyph changes
 * shape and not just colour, and the result is announced.
 */
export function BoardTable({
  boardName,
  lists,
  labels,
  members,
  matches,
  freshIds,
  editable,
  onOpenCard,
  onMoveCard,
}: BoardTableProps) {
  const { display } = useBoardMeta();
  const [sort, setSort] = useState<Sort | null>(null);

  const allRows = useMemo(() => buildRows(lists, labels, members), [lists, labels, members]);
  const rows = useMemo(
    () => sortRows(allRows, sort).filter((row) => matches(row.card)),
    [allRows, sort, matches]
  );
  const animate = rows.length <= MAX_ANIMATED_ROWS;

  function toggleSort(key: SortKey) {
    const next = nextSort(sort, key);
    withViewTransition(() => setSort(next));
    announce(describeSort(next));
  }

  function moveTo(cardId: string, title: string, listId: string) {
    const target = lists.find((list) => list.id === listId);
    if (!target) return;
    onMoveCard(cardId, listId, target.cards.length);
    announce(`Moved ${title} to ${target.name}.`);
  }

  if (allRows.length === 0) {
    return (
      <div className="board-table__empty">
        <p className="board-table__empty-title">No cards yet</p>
        <p>Add a card in the Board view and it shows up here, ready to sort.</p>
      </div>
    );
  }

  return (
    <div className="board-table" role="region" aria-label={`${boardName} as a table`} tabIndex={0}>
      <table>
        <caption className="sr-only">
          {rows.length} card{rows.length === 1 ? '' : 's'} on {boardName}. Use the column buttons to
          sort.
        </caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.className}
                aria-sort={ariaSortFor(sort, column.key)}
              >
                <button
                  type="button"
                  className="board-table__sort"
                  data-active={sort?.key === column.key || undefined}
                  onClick={() => toggleSort(column.key)}
                >
                  {column.label}
                  <span className="board-table__glyph" aria-hidden="true">
                    <SortGlyph sort={sort} column={column.key} />
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="board-table__none">
                No card matches the filter.
              </td>
            </tr>
          )}
          {rows.map((row, position) => (
            <tr
              key={row.card.id}
              data-card-id={row.card.id}
              className="board-table__row"
              data-fresh={freshIds.includes(row.card.id) || undefined}
              style={
                {
                  '--row-index': Math.min(position, 12),
                  viewTransitionName: animate ? `row-${row.card.id}` : undefined,
                } as React.CSSProperties
              }
            >
              <th scope="row" className="board-table__col-title">
                <button
                  type="button"
                  className="board-table__open"
                  onClick={() => onOpenCard(row.card.id)}
                >
                  {row.card.title}
                </button>
                {display.description_preview && row.card.description_preview && (
                  <span className="board-table__preview">{row.card.description_preview}</span>
                )}
              </th>
              <td className="board-table__col-list">
                {editable ? (
                  <span className="board-table__select-wrap">
                    <select
                      className="board-table__select"
                      aria-label={`List for ${row.card.title}`}
                      value={row.listId}
                      onChange={(event) => moveTo(row.card.id, row.card.title, event.target.value)}
                    >
                      {lists.filter(isCardList).map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.name}
                        </option>
                      ))}
                    </select>
                    <ArrowDownIcon size={12} className="board-table__select-arrow" />
                  </span>
                ) : (
                  <span className="board-table__pill">{row.listName}</span>
                )}
              </td>
              <td className="board-table__col-labels">
                {row.labels.length === 0 ? (
                  <span className="board-table__dash">
                    <span aria-hidden="true">–</span>
                    <span className="sr-only">No labels</span>
                  </span>
                ) : (
                  <ul className="board-table__chips">
                    {row.labels.slice(0, MAX_LABELS).map((label) => (
                      <li key={label.id}>
                        <LabelChip
                          name={label.name}
                          color={label.color}
                          priority={label.priority}
                        />
                      </li>
                    ))}
                    {row.labels.length > MAX_LABELS && (
                      <li
                        className="board-table__more"
                        title={row.labels
                          .slice(MAX_LABELS)
                          .map((label) => label.name)
                          .join(', ')}
                      >
                        +{row.labels.length - MAX_LABELS}
                        <span className="sr-only"> more labels</span>
                      </li>
                    )}
                  </ul>
                )}
              </td>
              <td className="board-table__col-people">
                {row.card.assignee_ids.length === 0 ? (
                  <span className="board-table__dash">
                    <span aria-hidden="true">–</span>
                    <span className="sr-only">Nobody assigned</span>
                  </span>
                ) : (
                  <AssigneeStack ids={row.card.assignee_ids} />
                )}
              </td>
              <td className="board-table__col-due">
                {row.card.due_date ? (
                  <DueBadge day={row.card.due_date} />
                ) : (
                  <span className="board-table__dash">
                    <span aria-hidden="true">–</span>
                    <span className="sr-only">No due date</span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
