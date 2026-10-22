import { type FormEvent, useEffect, useId, useState } from 'react';

import { Dialog } from './Dialog';
import './NameDialog.css';

interface NameDialogProps {
  open: boolean;
  title: string;
  fieldLabel: string;
  submitLabel: string;
  placeholder?: string;
  initialValue?: string;
  onSubmit: (name: string) => Promise<boolean>;
  onClose: () => void;
}

export function NameDialog({
  open,
  title,
  fieldLabel,
  submitLabel,
  placeholder,
  initialValue = '',
  onSubmit,
  onClose,
}: NameDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  useEffect(() => {
    if (open) {
      setValue(initialValue);
    }
  }, [open, initialValue]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const name = value.trim();
    if (!name || busy) {
      return;
    }
    setBusy(true);
    try {
      const done = await onSubmit(name);
      if (done) {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm">
      <form className="name-dialog" onSubmit={handleSubmit}>
        <h2 className="name-dialog__title">{title}</h2>
        <div className="field">
          <label htmlFor={inputId}>{fieldLabel}</label>
          <input
            id={inputId}
            type="text"
            value={value}
            maxLength={120}
            autoComplete="off"
            autoFocus
            placeholder={placeholder}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div className="name-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || !value.trim()}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
