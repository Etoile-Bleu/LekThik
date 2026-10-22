import { type KeyboardEvent, useId, useRef, useState } from 'react';

import { linkify } from '@lib/blocks';

import { PencilIcon } from '../../ui/Icons';
import './NoteBlock.css';

const MAX_CHARS = 5000;

interface NoteBlockProps {
  text: string;
  editable: boolean;
  onSave: (text: string) => void;
}

function Paragraph({ text }: { text: string }) {
  return (
    <p className="note-block__paragraph">
      {linkify(text).map((part, index) =>
        part.href ? (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="note-block__link"
          >
            {part.text}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </p>
  );
}

/**
 * Plain text, never markup. Web addresses become links that open in a new tab
 * without handing over the page. Editing is a deliberate step with a clear way
 * out, so nothing is lost by a stray keystroke.
 */
export function NoteBlock({ text, editable, onSave }: NoteBlockProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const field = useRef<HTMLTextAreaElement>(null);
  const helpId = useId();

  function start() {
    setDraft(text);
    setEditing(true);
    window.setTimeout(() => field.current?.focus(), 0);
  }

  function save() {
    setEditing(false);
    if (draft !== text) onSave(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setEditing(false);
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save();
    }
  }

  if (editing) {
    const left = MAX_CHARS - draft.length;
    return (
      <div className="note-block note-block--editing">
        <label className="sr-only" htmlFor={`${helpId}-field`}>
          Note text
        </label>
        <textarea
          id={`${helpId}-field`}
          ref={field}
          value={draft}
          maxLength={MAX_CHARS}
          rows={6}
          aria-describedby={helpId}
          placeholder="Rules, reminders, links…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <p id={helpId} className="note-block__help">
          {left <= 200 ? `${left} characters left. ` : ''}
          <kbd>Ctrl</kbd> + <kbd>Enter</kbd> saves, <kbd>Esc</kbd> cancels.
        </p>
        <div className="note-block__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={save}>
            Save
          </button>
        </div>
      </div>
    );
  }

  const paragraphs = text.split(/\n{2,}/).filter((part) => part.trim() !== '');

  return (
    <div className="note-block">
      {paragraphs.length === 0 ? (
        <p className="note-block__empty">
          {editable ? 'Nothing written yet.' : 'This note is empty.'}
        </p>
      ) : (
        paragraphs.map((paragraph, index) => <Paragraph key={index} text={paragraph} />)
      )}
      {editable && (
        <button type="button" className="note-block__edit" onClick={start}>
          <PencilIcon size={14} />
          {paragraphs.length === 0 ? 'Write a note' : 'Edit note'}
        </button>
      )}
    </div>
  );
}
