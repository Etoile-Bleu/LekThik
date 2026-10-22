import { type FocusEvent, type FormEvent, type KeyboardEvent, useRef, useState } from 'react';

import { CloseIcon, PlusIcon } from './Icons';
import './Composer.css';

interface ComposerProps {
  triggerLabel: string;
  inputLabel: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<unknown> | void;
  multiline?: boolean;
  variant?: 'inline' | 'column';
}

export function Composer({
  triggerLabel,
  inputLabel,
  placeholder,
  submitLabel,
  onSubmit,
  multiline = false,
  variant = 'inline',
}: ComposerProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    setValue('');
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = value.trim();
    if (!text || busy) {
      return;
    }
    setBusy(true);
    try {
      await onSubmit(text);
      setValue('');
      fieldRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  function handleBlur(event: FocusEvent<HTMLFormElement>) {
    const next = event.relatedTarget as Node | null;
    if (!event.currentTarget.contains(next) && !value.trim()) {
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        ref={triggerRef}
        type="button"
        className={`composer__trigger composer__trigger--${variant}`}
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => fieldRef.current?.focus(), 0);
        }}
      >
        <PlusIcon />
        <span>{triggerLabel}</span>
      </button>
    );
  }

  const sharedProps = {
    'aria-label': inputLabel,
    placeholder,
    value,
    maxLength: 120,
    autoComplete: 'off',
    spellCheck: true,
    onKeyDown: handleKeyDown,
    className: 'composer__field',
  };

  return (
    <form className={`composer composer--${variant}`} onSubmit={submit} onBlur={handleBlur}>
      {multiline ? (
        <textarea
          {...sharedProps}
          ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
          rows={3}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : (
        <input
          {...sharedProps}
          ref={fieldRef as React.RefObject<HTMLInputElement>}
          type="text"
          onChange={(event) => setValue(event.target.value)}
        />
      )}
      <div className="composer__actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !value.trim()}>
          {submitLabel}
        </button>
        <button type="button" className="icon-button" aria-label="Cancel" onClick={close}>
          <CloseIcon />
        </button>
      </div>
    </form>
  );
}
