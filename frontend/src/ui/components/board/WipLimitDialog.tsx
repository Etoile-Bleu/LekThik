import { type FormEvent, useEffect, useId, useState } from 'react';

import { parseLimit } from '@lib/wipLimit';

import { Dialog } from '../ui/Dialog';
import './WipLimitDialog.css';

interface WipLimitDialogProps {
  open: boolean;
  listName: string;
  current: number | null;
  cardCount: number;
  onSave: (limit: number | null) => void;
  onClose: () => void;
}

/** A limit is a nudge to finish before starting, so it warns and never blocks. */
export function WipLimitDialog({
  open,
  listName,
  current,
  cardCount,
  onSave,
  onClose,
}: WipLimitDialogProps) {
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  useEffect(() => {
    if (open) {
      setText(current === null ? '' : String(current));
      setTouched(false);
    }
  }, [open, current]);

  const parsed = parseLimit(text);
  const invalid = touched && !parsed.ok;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!parsed.ok) {
      return;
    }
    onSave(parsed.value);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Card limit for ${listName}`} size="sm">
      <form className="wip-dialog" onSubmit={handleSubmit} noValidate>
        <h2 className="wip-dialog__title">Card limit</h2>
        <p className="wip-dialog__lead">
          Keeps <strong>{listName}</strong> from filling up. It holds {cardCount} card
          {cardCount === 1 ? '' : 's'} now.
        </p>

        <div className="field">
          <label htmlFor={inputId}>Most cards at once</label>
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={text}
            placeholder="No limit"
            aria-describedby={invalid ? `${hintId} ${errorId}` : hintId}
            aria-invalid={invalid || undefined}
            className="wip-dialog__input"
            onChange={(event) => {
              setText(event.target.value);
              setTouched(false);
            }}
            onBlur={() => setTouched(true)}
          />
          <p id={hintId} className="wip-dialog__hint">
            A number from 1 to 99. The list warns when it goes over, and still accepts cards.
          </p>
          {invalid && (
            <p id={errorId} className="wip-dialog__error" role="alert">
              Use a whole number from 1 to 99, or clear the field to remove the limit.
            </p>
          )}
        </div>

        <div className="wip-dialog__actions">
          {current !== null && (
            <button
              type="button"
              className="btn btn--ghost wip-dialog__remove"
              onClick={() => {
                onSave(null);
                onClose();
              }}
            >
              Remove limit
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
