import { useBoardMeta } from '@hooks/useBoardMeta';
import type { BoardMember } from '@lib/boardsApi';

import { Avatar } from '../collab/Avatar';
import './AssigneePicker.css';

const MAX_ASSIGNEES = 10;

interface AssigneePickerProps {
  members: BoardMember[];
  assigneeIds: string[];
  editable: boolean;
  onChange: (userIds: string[]) => void;
}

export function AssigneePicker({ members, assigneeIds, editable, onChange }: AssigneePickerProps) {
  const { meId } = useBoardMeta();
  const full = assigneeIds.length >= MAX_ASSIGNEES;
  const iAmMember = members.some((member) => member.user_id === meId);
  const iAmAssigned = meId !== undefined && assigneeIds.includes(meId);
  // The person looking comes first, then everyone else in the order the server gave.
  const ordered = [
    ...members.filter((member) => member.user_id === meId),
    ...members.filter((member) => member.user_id !== meId),
  ];

  function toggle(userId: string, checked: boolean) {
    onChange(checked ? [...assigneeIds, userId] : assigneeIds.filter((id) => id !== userId));
  }

  if (!editable) {
    const assigned = members.filter((member) => assigneeIds.includes(member.user_id));
    return (
      <div className="assignee-picker">
        <span className="field-label">Assignees</span>
        {assigned.length === 0 ? (
          <p className="field-hint">Nobody is assigned.</p>
        ) : (
          <ul className="assignee-picker__list">
            {assigned.map((member) => (
              <li key={member.user_id} className="assignee-picker__readonly">
                <Avatar name={member.username} seed={member.user_id} size="sm" />
                <span>{member.username}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <fieldset className="assignee-picker">
      <legend className="field-label">Assignees</legend>
      {iAmMember && !iAmAssigned && !full && meId && (
        <button
          type="button"
          className="btn btn--outline btn--sm assignee-picker__me"
          onClick={() => toggle(meId, true)}
        >
          Assign to me
        </button>
      )}
      <ul className="assignee-picker__list">
        {ordered.map((member) => {
          const checked = assigneeIds.includes(member.user_id);
          return (
            <li key={member.user_id}>
              <label className="label-toggle">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={full && !checked}
                  onChange={(event) => toggle(member.user_id, event.target.checked)}
                />
                <span className="label-toggle__box" aria-hidden="true" />
                <Avatar name={member.username} seed={member.user_id} size="sm" />
                <span className="assignee-picker__name">
                  {member.username}
                  {member.user_id === meId && <span className="assignee-picker__you"> (you)</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {full && <p className="field-hint">A card has room for {MAX_ASSIGNEES} people.</p>}
    </fieldset>
  );
}
