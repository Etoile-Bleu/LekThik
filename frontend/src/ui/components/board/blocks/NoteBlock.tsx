import { useState } from 'react';

import { toggleTask } from '@lib/richText';

import { RichEditor } from '../../richtext/RichEditor';
import { RichText } from '../../richtext/RichText';
import { PencilIcon } from '../../ui/Icons';
import './NoteBlock.css';

const MAX_CHARS = 10000;

interface NoteBlockProps {
  text: string;
  editable: boolean;
  onSave: (text: string) => void;
}

/**
 * A note written in Markdown: headings, lists, checklists, tables, links, code, LaTeX formulas and
 * Mermaid diagrams. It is never read as HTML. The boxes of a checklist can be ticked straight from
 * the board by people who can edit, which saves the note. Editing is a deliberate step with a
 * preview and a clear way out, so nothing is lost by a stray keystroke.
 */
export function NoteBlock({ text, editable, onSave }: NoteBlockProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  function save() {
    setEditing(false);
    if (draft !== text) onSave(draft);
  }

  if (editing) {
    return (
      <div className="note-block note-block--editing">
        <RichEditor
          value={draft}
          onChange={setDraft}
          onSave={save}
          onCancel={() => setEditing(false)}
          label="Note text"
          maxLength={MAX_CHARS}
          placeholder="Rules, reminders, a checklist, a formula, a diagram…"
        />
      </div>
    );
  }

  const empty = text.trim() === '';

  return (
    <div className="note-block">
      {empty ? (
        <p className="note-block__empty">
          {editable ? 'Nothing written yet.' : 'This note is empty.'}
        </p>
      ) : (
        <RichText
          text={text}
          onToggleTask={editable ? (index) => onSave(toggleTask(text, index)) : undefined}
        />
      )}
      {editable && (
        <button
          type="button"
          className="note-block__edit"
          onClick={() => {
            setDraft(text);
            setEditing(true);
          }}
        >
          <PencilIcon size={14} />
          {empty ? 'Write a note' : 'Edit note'}
        </button>
      )}
    </div>
  );
}
