import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

import {
  COMMENT_MAX_CHARS,
  type Person,
  insertMention,
  matchPeople,
  mentionQuery,
} from '@lib/timeline';

import './CommentComposer.css';

interface CommentComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  people: Person[];
  label: string;
  submitLabel: string;
  busy?: boolean;
  autoFocus?: boolean;
  rows?: number;
}

export function CommentComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  people,
  label,
  submitLabel,
  busy = false,
  autoFocus = false,
  rows = 3,
}: CommentComposerProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const ids = useId();
  const [caret, setCaret] = useState(value.length);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [active, setActive] = useState(0);

  const mention = mentionQuery(value, caret);
  const options = mention ? matchPeople(people, mention.query) : [];
  const open = mention !== null && options.length > 0 && dismissed !== mention.start;
  const empty = value.trim() === '';

  useEffect(() => {
    setActive(0);
  }, [mention?.query]);

  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  function syncCaret() {
    setCaret(field.current?.selectionStart ?? value.length);
  }

  function choose(person: Person) {
    if (!mention) return;
    const next = insertMention(value, caret, mention, person.username);
    onChange(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(next.caret, next.caret);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const modified = event.ctrlKey || event.metaKey;
    if (open && !modified) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((current) => (current + 1) % options.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((current) => (current - 1 + options.length) % options.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        choose(options[active]);
        return;
      }
      if (event.key === 'Escape' && mention) {
        event.preventDefault();
        event.stopPropagation();
        setDismissed(mention.start);
        return;
      }
    }
    if (event.key === 'Enter' && modified) {
      event.preventDefault();
      if (!empty && !busy) onSubmit();
    } else if (event.key === 'Escape' && onCancel) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className="composer">
      <div className="composer__field">
        <label htmlFor={`${ids}-text`} className="sr-only">
          {label}
        </label>
        <textarea
          id={`${ids}-text`}
          ref={field}
          className="composer__text"
          rows={rows}
          value={value}
          maxLength={COMMENT_MAX_CHARS}
          placeholder="Write a comment. Markdown works, @ mentions a teammate."
          aria-autocomplete="list"
          aria-controls={open ? `${ids}-list` : undefined}
          aria-activedescendant={open ? `${ids}-option-${active}` : undefined}
          aria-describedby={`${ids}-hint`}
          onChange={(event) => {
            onChange(event.target.value);
            setCaret(event.target.selectionStart);
            setDismissed(null);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onBlur={() => setDismissed(mention?.start ?? null)}
        />
        {open && (
          <ul
            className="composer__list"
            id={`${ids}-list`}
            role="listbox"
            aria-label="People to mention"
          >
            {options.map((person, index) => (
              <li
                key={person.id}
                id={`${ids}-option-${index}`}
                role="option"
                aria-selected={index === active}
                data-active={index === active || undefined}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(person);
                }}
                onMouseEnter={() => setActive(index)}
              >
                <span aria-hidden="true">@</span>
                {person.username}
              </li>
            ))}
          </ul>
        )}
        <p className="sr-only" role="status">
          {open
            ? `${options.length} ${options.length === 1 ? 'person matches' : 'people match'}. Use the arrow keys, Enter to choose.`
            : ''}
        </p>
      </div>
      <div className="composer__bar">
        <p className="composer__hint" id={`${ids}-hint`}>
          Ctrl or Cmd + Enter to {submitLabel.toLowerCase()}
          {value.length > COMMENT_MAX_CHARS - 500 && (
            <span className="composer__count">
              {' '}
              · {value.length.toLocaleString()} of {COMMENT_MAX_CHARS.toLocaleString()}
            </span>
          )}
        </p>
        <div className="composer__actions">
          {onCancel && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={empty || busy}
            onClick={onSubmit}
          >
            {busy ? 'Sending…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
