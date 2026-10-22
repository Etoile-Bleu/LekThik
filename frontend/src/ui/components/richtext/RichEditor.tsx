import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

import { type Edit, MARKDOWN_HELP, SNIPPETS, insertBlock, prefixLines, wrap } from '@lib/richText';

import { RichText } from './RichText';
import './RichEditor.css';

interface RichEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Names the field for screen readers. */
  label: string;
  maxLength: number;
  placeholder?: string;
  saveLabel?: string;
  headingOffset?: number;
  /** Called when focus leaves the whole editor, for text that is saved as the person goes. */
  onLeave?: () => void;
}

interface Tool {
  id: string;
  label: string;
  glyph: string;
  run: (text: string, start: number, end: number) => Edit;
}

const TOOLS: Tool[] = [
  {
    id: 'bold',
    label: 'Bold',
    glyph: 'B',
    run: (text, start, end) => wrap(text, start, end, '**', '**', 'bold text'),
  },
  {
    id: 'italic',
    label: 'Italic',
    glyph: 'I',
    run: (text, start, end) => wrap(text, start, end, '*', '*', 'italic text'),
  },
  {
    id: 'heading',
    label: 'Heading',
    glyph: 'H',
    run: (text, s, e) => prefixLines(text, s, e, '## '),
  },
  {
    id: 'link',
    label: 'Link',
    glyph: 'Link',
    run: (text, start, end) => wrap(text, start, end, '[', '](https://example.com)', 'link text'),
  },
  {
    id: 'bullets',
    label: 'Bulleted list',
    glyph: '•',
    run: (text, s, e) => prefixLines(text, s, e, '- '),
  },
  {
    id: 'checklist',
    label: 'Checklist',
    glyph: '☐',
    run: (text, s, e) => prefixLines(text, s, e, '- [ ] '),
  },
  { id: 'quote', label: 'Quote', glyph: '”', run: (text, s, e) => prefixLines(text, s, e, '> ') },
  {
    id: 'code',
    label: 'Inline code',
    glyph: '<>',
    run: (text, start, end) => wrap(text, start, end, '`', '`', 'code'),
  },
  {
    id: 'codeblock',
    label: 'Code block',
    glyph: '{ }',
    run: (text, start, end) => insertBlock(text, start, end, SNIPPETS.code, { from: 6, to: 15 }),
  },
  {
    id: 'table',
    label: 'Table',
    glyph: '▦',
    run: (text, start, end) => insertBlock(text, start, end, SNIPPETS.table),
  },
  {
    id: 'formula',
    label: 'Formula (LaTeX)',
    glyph: 'Σ',
    run: (text, start, end) => wrap(text, start, end, '$', '$', 'x^2'),
  },
  {
    id: 'diagram',
    label: 'Diagram (Mermaid)',
    glyph: '◇',
    run: (text, start, end) => insertBlock(text, start, end, SNIPPETS.diagram),
  },
];

/**
 * A writing area with formatting buttons and a preview, for Markdown with checklists, tables,
 * LaTeX formulas, code and Mermaid diagrams. The buttons are one tab stop that arrow keys move
 * along, the preview is a tab that shows exactly what will be saved, and the usual shortcuts work
 * (bold, italic, link, Ctrl and Enter to save, Escape to cancel).
 */
export function RichEditor({
  value,
  onChange,
  onSave,
  onCancel,
  label,
  maxLength,
  placeholder,
  saveLabel = 'Save',
  headingOffset,
  onLeave,
}: RichEditorProps) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [active, setActive] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const tools = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const ids = useId();
  const fieldId = `${ids}-field`;
  const helpId = `${ids}-help`;

  useEffect(() => {
    field.current?.focus();
  }, []);

  useEffect(() => {
    const selection = pendingSelection.current;
    if (selection && field.current) {
      field.current.focus();
      field.current.setSelectionRange(selection.start, selection.end);
      pendingSelection.current = null;
    }
  }, [value]);

  function apply(run: Tool['run']) {
    const area = field.current;
    if (!area) return;
    const edit = run(value, area.selectionStart, area.selectionEnd);
    pendingSelection.current = { start: edit.start, end: edit.end };
    onChange(edit.text);
  }

  function toolByKey(event: KeyboardEvent<HTMLTextAreaElement>): Tool | null {
    if (!(event.ctrlKey || event.metaKey)) return null;
    const key = event.key.toLowerCase();
    return (
      TOOLS.find(
        (tool) =>
          (key === 'b' && tool.id === 'bold') ||
          (key === 'i' && tool.id === 'italic') ||
          (key === 'k' && tool.id === 'link')
      ) ?? null
    );
  }

  function onAreaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onSave();
      return;
    }
    const tool = toolByKey(event);
    if (tool) {
      event.preventDefault();
      apply(tool.run);
    }
  }

  function onToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = TOOLS.length - 1;
    let next = active;
    if (event.key === 'ArrowRight') next = active === last ? 0 : active + 1;
    else if (event.key === 'ArrowLeft') next = active === 0 ? last : active - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    setActive(next);
    tools.current[next]?.focus();
  }

  const left = maxLength - value.length;

  return (
    <div
      className="rich-editor"
      ref={root}
      onBlur={(event) => {
        if (onLeave && !root.current?.contains(event.relatedTarget as Node | null)) onLeave();
      }}
    >
      <div className="rich-editor__head">
        <div className="rich-editor__tabs" role="tablist" aria-label="Write or preview">
          {(['write', 'preview'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`${ids}-${tab}`}
              aria-selected={mode === tab}
              aria-controls={`${ids}-panel`}
              tabIndex={mode === tab ? 0 : -1}
              className="rich-editor__tab"
              onClick={() => setMode(tab)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  setMode(tab === 'write' ? 'preview' : 'write');
                  window.setTimeout(
                    () =>
                      document
                        .getElementById(`${ids}-${tab === 'write' ? 'preview' : 'write'}`)
                        ?.focus(),
                    0
                  );
                }
              }}
            >
              {tab === 'write' ? 'Write' : 'Preview'}
            </button>
          ))}
        </div>

        {mode === 'write' && (
          <div
            className="rich-editor__tools"
            role="toolbar"
            aria-label="Formatting"
            aria-controls={fieldId}
            onKeyDown={onToolbarKeyDown}
          >
            {TOOLS.map((tool, index) => (
              <button
                key={tool.id}
                type="button"
                ref={(node) => {
                  tools.current[index] = node;
                }}
                className="rich-editor__tool"
                data-id={tool.id}
                tabIndex={index === active ? 0 : -1}
                aria-label={tool.label}
                title={tool.label}
                onFocus={() => setActive(index)}
                onClick={() => apply(tool.run)}
              >
                <span aria-hidden="true">{tool.glyph}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        id={`${ids}-panel`}
        role="tabpanel"
        aria-labelledby={`${ids}-${mode}`}
        className="rich-editor__panel"
      >
        {mode === 'write' ? (
          <>
            <label className="sr-only" htmlFor={fieldId}>
              {label}
            </label>
            <textarea
              id={fieldId}
              ref={field}
              value={value}
              rows={8}
              maxLength={maxLength}
              placeholder={placeholder}
              aria-describedby={helpId}
              spellCheck
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onAreaKeyDown}
            />
          </>
        ) : (
          <div className="rich-editor__preview" tabIndex={0}>
            {value.trim() === '' ? (
              <p className="rich-editor__empty">Nothing to preview yet.</p>
            ) : (
              <RichText text={value} headingOffset={headingOffset} />
            )}
          </div>
        )}
      </div>

      <p id={helpId} className="rich-editor__hint">
        {left <= 300 ? `${left} characters left. ` : ''}
        <kbd>Ctrl</kbd> + <kbd>B</kbd> bold, <kbd>Ctrl</kbd> + <kbd>I</kbd> italic, <kbd>Ctrl</kbd>{' '}
        + <kbd>Enter</kbd> saves, <kbd>Esc</kbd> cancels.
      </p>

      <details className="rich-editor__help">
        <summary>What can I write?</summary>
        <dl>
          {MARKDOWN_HELP.map((row) => (
            <div key={row.what}>
              <dt>{row.what}</dt>
              <dd>
                <code>{row.how}</code>
              </dd>
            </div>
          ))}
        </dl>
      </details>

      <div className="rich-editor__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={onSave}>
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
