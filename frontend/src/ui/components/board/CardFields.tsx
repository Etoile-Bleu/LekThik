import { type ReactNode, useEffect, useId, useState } from 'react';

import type { Field, FieldValue } from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';
import {
  FIELD_TEXT_MAX,
  checkNumber,
  displayValue,
  hostOf,
  optionOf,
  toDecimal,
} from '@lib/fields';

import { CalendarIcon, CheckIcon, HashIcon, LinkIcon, TagIcon, TextLinesIcon } from '../ui/Icons';
import { Pick } from '../ui/Pick';
import { PropertyRow } from '../ui/PropertyRow';
import { LabelChip } from './LabelChip';
import './CardFields.css';

interface CardFieldsProps {
  cardId: string;
  fields: Field[];
  values: Map<string, FieldValue>;
  editable: boolean;
  startIndex: number;
}

const ICONS: Record<Field['kind'], ReactNode> = {
  text: <TextLinesIcon size={16} />,
  number: <HashIcon size={16} />,
  date: <CalendarIcon size={16} />,
  select: <TagIcon size={16} />,
  checkbox: <CheckIcon size={16} />,
  url: <LinkIcon size={16} />,
};

function useDraft(stored: string) {
  const [draft, setDraft] = useState(stored);
  useEffect(() => setDraft(stored), [stored]);
  return [draft, setDraft] as const;
}

function TypedText({
  field,
  stored,
  editable,
  save,
}: {
  field: Field;
  stored: string;
  editable: boolean;
  save: (value: string | null) => void;
}) {
  const ids = useId();
  const [draft, setDraft] = useDraft(stored);
  const isUrl = field.kind === 'url';

  if (!editable) {
    return stored === '' ? (
      <span className="card-field__none">Empty</span>
    ) : isUrl ? (
      <a href={stored} target="_blank" rel="noopener noreferrer nofollow">
        {hostOf(stored)}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    ) : (
      <span className="card-field__text">{stored}</span>
    );
  }

  const commit = () => {
    const next = draft.trim();
    if (next !== stored) save(next === '' ? null : next);
  };

  return (
    <span className="card-field__inline">
      <input
        id={`${ids}-input`}
        className="card-field__input"
        type={isUrl ? 'url' : 'text'}
        inputMode={isUrl ? 'url' : 'text'}
        aria-label={field.name}
        value={draft}
        maxLength={FIELD_TEXT_MAX}
        placeholder={isUrl ? 'https://' : 'Empty'}
        autoComplete="off"
        spellCheck={!isUrl}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.stopPropagation();
            setDraft(stored);
            event.currentTarget.blur();
          }
        }}
      />
      {isUrl && stored !== '' && (
        <a
          className="card-field__open"
          href={stored}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          Open
          <span className="sr-only"> {hostOf(stored)} in a new tab</span>
        </a>
      )}
    </span>
  );
}

function Numeric({
  field,
  stored,
  editable,
  save,
}: {
  field: Field;
  stored: string;
  editable: boolean;
  save: (value: string | null) => void;
}) {
  const ids = useId();
  const [draft, setDraft] = useDraft(stored);
  const problem = checkNumber(draft);

  if (!editable) {
    return stored === '' ? (
      <span className="card-field__none">Empty</span>
    ) : (
      <span className="card-field__number">{displayValue(field, stored)}</span>
    );
  }

  const commit = () => {
    if (problem) return;
    const next = toDecimal(draft);
    if ((next ?? '') !== stored) save(next);
  };

  return (
    <span className="card-field__stack">
      <input
        className="card-field__input card-field__input--number"
        type="text"
        inputMode="decimal"
        aria-label={field.name}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${ids}-problem` : undefined}
        value={draft}
        placeholder="Empty"
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.stopPropagation();
            setDraft(stored);
            event.currentTarget.blur();
          }
        }}
      />
      {problem && (
        <span id={`${ids}-problem`} className="card-field__problem" role="alert">
          {problem}
        </span>
      )}
    </span>
  );
}

function FieldEditor({
  field,
  value,
  editable,
  save,
}: {
  field: Field;
  value: FieldValue | undefined;
  editable: boolean;
  save: (value: FieldValue | null) => void;
}) {
  const text = typeof value === 'string' ? value : '';

  switch (field.kind) {
    case 'text':
    case 'url':
      return <TypedText field={field} stored={text} editable={editable} save={save} />;
    case 'number':
      return <Numeric field={field} stored={text} editable={editable} save={save} />;
    case 'date':
      return editable ? (
        <span className="card-field__inline">
          <input
            className="card-field__input card-field__input--date"
            type="date"
            aria-label={field.name}
            value={text}
            onChange={(event) => save(event.target.value === '' ? null : event.target.value)}
          />
          {text !== '' && (
            <button type="button" className="card-field__clear" onClick={() => save(null)}>
              Clear<span className="sr-only"> {field.name}</span>
            </button>
          )}
        </span>
      ) : text === '' ? (
        <span className="card-field__none">Empty</span>
      ) : (
        <span>{displayValue(field, text)}</span>
      );
    case 'checkbox':
      return (
        <Pick
          checked={value === true}
          disabled={!editable}
          onChange={(on) => save(on ? true : null)}
        >
          {value === true ? 'Yes' : 'No'}
        </Pick>
      );
    case 'select': {
      const chosen = optionOf(field, value);
      return editable ? (
        <span className="card-field__inline">
          <select
            className="card-field__select"
            aria-label={field.name}
            value={chosen?.id ?? ''}
            onChange={(event) => save(event.target.value === '' ? null : event.target.value)}
          >
            <option value="">No value</option>
            {field.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          {chosen && <LabelChip name={chosen.name} color={chosen.color} priority="none" />}
        </span>
      ) : chosen ? (
        <LabelChip name={chosen.name} color={chosen.color} priority="none" />
      ) : (
        <span className="card-field__none">Empty</span>
      );
    }
  }
}

export function CardFields({ cardId, fields, values, editable, startIndex }: CardFieldsProps) {
  const setValue = useBoardStore((state) => state.setCardFieldValue);

  return (
    <>
      {fields.map((field, offset) => (
        <PropertyRow
          key={field.id}
          index={startIndex + offset}
          icon={ICONS[field.kind]}
          label={field.name}
        >
          <FieldEditor
            field={field}
            value={values.get(field.id)}
            editable={editable}
            save={(value) => void setValue(cardId, field.id, value)}
          />
        </PropertyRow>
      ))}
    </>
  );
}
