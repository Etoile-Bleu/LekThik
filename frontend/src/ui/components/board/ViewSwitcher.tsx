import type { BoardViewKind } from '@lib/prefs';

import { CalendarIcon, ColumnsIcon, TableIcon } from '../ui/Icons';
import { Segmented } from '../ui/Segmented';
import './ViewSwitcher.css';

interface ViewSwitcherProps {
  value: BoardViewKind;
  onChange: (view: BoardViewKind) => void;
}

/** The same cards, three ways: columns to move work, a table to sort it, a calendar to plan it. */
export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  return (
    <Segmented<BoardViewKind>
      className="view-switcher"
      label="Board view"
      value={value}
      onChange={onChange}
      options={[
        { value: 'board', label: 'Board', icon: <ColumnsIcon size={16} /> },
        { value: 'list', label: 'List', icon: <TableIcon size={16} /> },
        { value: 'calendar', label: 'Calendar', icon: <CalendarIcon size={16} /> },
      ]}
    />
  );
}
