import { useEffect, useRef } from 'react';

import { useBoardMeta } from '@hooks/useBoardMeta';

import { Avatar } from '../collab/Avatar';
import './AssigneeStack.css';

const MAX_SHOWN = 3;

interface AssigneeStackProps {
  ids: string[];
}

/** Overlapping avatars. Only people who join after the first paint pop in. */
export function AssigneeStack({ ids }: AssigneeStackProps) {
  const { membersById } = useBoardMeta();
  const known = useRef<Set<string> | null>(null);

  const isNew = (id: string) => known.current !== null && !known.current.has(id);

  useEffect(() => {
    known.current = new Set(ids);
  });

  if (ids.length === 0) {
    return null;
  }

  const names = ids.map((id) => membersById.get(id)?.username ?? 'Former member');
  const shown = ids.slice(0, MAX_SHOWN);
  const extra = ids.length - shown.length;

  return (
    <span className="assignees" title={names.join(', ')}>
      {shown.map((id, index) => (
        <span
          key={id}
          className="assignees__item"
          data-new={isNew(id) || undefined}
          style={{ zIndex: shown.length - index }}
        >
          <Avatar name={membersById.get(id)?.username ?? '?'} seed={id} size="xs" />
        </span>
      ))}
      {extra > 0 && (
        <span className="assignees__more" aria-hidden="true">
          +{extra}
        </span>
      )}
      <span className="sr-only">Assigned to {names.join(', ')}</span>
    </span>
  );
}
