import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

import { BLOCKED_REASON_MAX_CHARS, enteredOn, longElapsed } from '@lib/cardAge';

import { Switch } from '../ui/Switch';
import './BlockedField.css';

interface BlockedFieldProps {
  editable: boolean;
  blockedSince: string | null;
  reason: string | null;
  now: number;
  onToggle: (blocked: boolean) => void;
  onReasonChange: (reason: string | null) => void;
}

/**
 * A toggle that reveals a reason once flipped on, the same shape as a
 * checklist item growing a note. Re-blocking with a new reason keeps the
 * original blocked-since time, which is why the toggle and the reason are
 * two separate calls to the store, not one.
 */
export function BlockedField({
  editable,
  blockedSince,
  reason,
  now,
  onToggle,
  onReasonChange,
}: BlockedFieldProps) {
  const [draft, setDraft] = useState(reason ?? '');
  const committed = useRef(reason ?? '');
  const reasonId = useId();
  const blocked = blockedSince !== null;

  useEffect(() => {
    setDraft(reason ?? '');
    committed.current = reason ?? '';
  }, [reason, blockedSince]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === committed.current.trim()) return;
    committed.current = trimmed;
    onReasonChange(trimmed === '' ? null : trimmed);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      commit();
      event.currentTarget.blur();
    }
  }

  return (
    <div className="blocked-field">
      <Switch
        label="Blocked"
        hint={
          blocked
            ? `Since ${enteredOn(blockedSince, now)}, ${longElapsed(blockedSince, now)} ago`
            : 'Flags this card as stuck, with a reason everyone can see'
        }
        checked={blocked}
        disabled={!editable}
        onChange={onToggle}
      />
      {blocked && (
        <div className="blocked-field__reason">
          <label htmlFor={reasonId} className="sr-only">
            Why this card is blocked
          </label>
          <textarea
            id={reasonId}
            className="blocked-field__textarea"
            rows={2}
            value={draft}
            maxLength={BLOCKED_REASON_MAX_CHARS}
            placeholder="Why is it blocked? Waiting on design, a dependency, a decision…"
            readOnly={!editable}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
          />
          {draft.length > BLOCKED_REASON_MAX_CHARS - 40 && (
            <p className="blocked-field__count">
              {draft.length} of {BLOCKED_REASON_MAX_CHARS}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
