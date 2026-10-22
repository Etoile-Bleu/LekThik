import { useBoardMeta } from '@hooks/useBoardMeta';
import type { BoardMember } from '@lib/boardsApi';

import { Avatar } from '../collab/Avatar';
import { Pick } from '../ui/Pick';
import './AssigneePicker.css';

const MAX_ASSIGNEES = 10;

interface AssigneePickerProps {
  members: BoardMember[];
  assigneeIds: string[];
  editable: boolean;
  onChange: (userIds: string[]) => void;
}

/** The value part of the "Assignees" row. */
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
    return assigned.length === 0 ? (
      <span className="assignee-picker__none">Nobody is assigned</span>
    ) : (
      <ul className="assignee-picker__list">
        {assigned.map((member) => (
          <li key={member.user_id} className="assignee-picker__readonly">
            <Avatar name={member.username} seed={member.user_id} size="xs" />
            <span>{member.username}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <ul className="assignee-picker__list">
        {iAmMember && !iAmAssigned && !full && meId && (
          <li>
            <button
              type="button"
              className="assignee-picker__me"
              onClick={() => toggle(meId, true)}
            >
              Assign to me
            </button>
          </li>
        )}
        {ordered.map((member) => {
          const checked = assigneeIds.includes(member.user_id);
          return (
            <li key={member.user_id}>
              <Pick
                checked={checked}
                disabled={full && !checked}
                onChange={(next) => toggle(member.user_id, next)}
              >
                <Avatar name={member.username} seed={member.user_id} size="xs" />
                <span className="assignee-picker__name">
                  {member.username}
                  {member.user_id === meId && <span className="assignee-picker__you"> (you)</span>}
                </span>
              </Pick>
            </li>
          );
        })}
      </ul>
      {full && (
        <span className="assignee-picker__none">A card has room for {MAX_ASSIGNEES} people.</span>
      )}
    </>
  );
}
