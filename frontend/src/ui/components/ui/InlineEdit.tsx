import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import './InlineEdit.css';

interface InlineEditProps {
  value: string;
  label: string;
  onCommit: (value: string) => void;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
  maxLength?: number;
  readOnly?: boolean;
}

export function InlineEdit({
  value,
  label,
  onCommit,
  as: Heading = 'h2',
  className = '',
  maxLength = 120,
  readOnly = false,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (readOnly) {
    return <Heading className={className}>{value}</Heading>;
  }

  function startEditing() {
    cancelled.current = false;
    setDraft(value);
    setEditing(true);
  }

  function finish(commit: boolean) {
    if (!editing) {
      return;
    }
    const next = draft.trim();
    setEditing(false);
    if (commit && next && next !== value) {
      onCommit(next);
    }
    window.setTimeout(() => buttonRef.current?.focus(), 0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelled.current = true;
      finish(false);
    }
  }

  if (editing) {
    return (
      <Heading className={`inline-edit ${className}`}>
        <input
          ref={inputRef}
          type="text"
          className="inline-edit__input"
          aria-label={label}
          value={draft}
          maxLength={maxLength}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (!cancelled.current) {
              finish(true);
            }
          }}
        />
      </Heading>
    );
  }

  return (
    <Heading className={`inline-edit ${className}`}>
      <button ref={buttonRef} type="button" className="inline-edit__button" onClick={startEditing}>
        {value}
        <span className="sr-only"> (rename {label})</span>
      </button>
    </Heading>
  );
}
