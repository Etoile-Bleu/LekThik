import { type FormEvent, useEffect, useId, useState } from 'react';

import { announce } from '@lib/announcer';
import { type Field, type FieldKind, LABEL_COLORS, type LabelColor } from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';
import * as fieldsApi from '@lib/fieldsApi';
import {
  FIELD_KINDS,
  FIELD_NAME_MAX,
  MAX_FIELDS,
  MAX_OPTIONS,
  OPTION_NAME_MAX,
  kindLabel,
} from '@lib/fields';

import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dialog } from '../ui/Dialog';
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, TrashIcon } from '../ui/Icons';
import { Switch } from '../ui/Switch';
import { LabelChip } from './LabelChip';
import './FieldsDialog.css';

interface FieldsDialogProps {
  open: boolean;
  onClose: () => void;
}

const COLOR_NAMES: Record<LabelColor, string> = {
  slate: 'Slate',
  red: 'Red',
  orange: 'Orange',
  amber: 'Amber',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  violet: 'Violet',
  pink: 'Pink',
};

function ColorSelect({
  value,
  onChange,
  label,
}: {
  value: LabelColor;
  onChange: (color: LabelColor) => void;
  label: string;
}) {
  return (
    <select
      className="fields-dialog__colour"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as LabelColor)}
    >
      {LABEL_COLORS.map((color) => (
        <option key={color} value={color}>
          {COLOR_NAMES[color]}
        </option>
      ))}
    </select>
  );
}

function Choices({ field }: { field: Field }) {
  const ids = useId();
  const changeOptions = useBoardStore((state) => state.changeOptions);
  const [name, setName] = useState('');
  const [color, setColor] = useState<LabelColor>('blue');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  async function add(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    const saved = await changeOptions(field.id, (boardId) =>
      fieldsApi.addOption(boardId, field.id, { name: trimmed, color })
    );
    if (saved) {
      setName('');
      announce(`Choice ${trimmed} added.`);
    }
  }

  async function rename(optionId: string) {
    const trimmed = draft.trim();
    if (trimmed === '') return;
    const saved = await changeOptions(field.id, (boardId) =>
      fieldsApi.updateOption(boardId, field.id, optionId, { name: trimmed })
    );
    if (saved) setEditing(null);
  }

  return (
    <div className="fields-dialog__choices">
      <h4 className="fields-dialog__subtitle">Choices</h4>
      <ul className="fields-dialog__options">
        {field.options.map((option) => (
          <li key={option.id}>
            {editing === option.id ? (
              <form
                className="fields-dialog__inline"
                onSubmit={(event) => {
                  event.preventDefault();
                  void rename(option.id);
                }}
              >
                <input
                  aria-label={`New name for ${option.name}`}
                  value={draft}
                  maxLength={OPTION_NAME_MAX}
                  autoFocus
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.stopPropagation();
                      setEditing(null);
                    }
                  }}
                />
                <button type="submit" className="btn btn--outline btn--sm">
                  Save
                </button>
              </form>
            ) : (
              <>
                <LabelChip name={option.name} color={option.color} priority="none" />
                <ColorSelect
                  label={`Colour of ${option.name}`}
                  value={option.color}
                  onChange={(next) =>
                    void changeOptions(field.id, (boardId) =>
                      fieldsApi.updateOption(boardId, field.id, option.id, { color: next })
                    )
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Rename choice ${option.name}`}
                  onClick={() => {
                    setEditing(option.id);
                    setDraft(option.name);
                  }}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Delete choice ${option.name}`}
                  onClick={() =>
                    void changeOptions(field.id, (boardId) =>
                      fieldsApi.deleteOption(boardId, field.id, option.id)
                    ).then((saved) => {
                      if (saved) announce(`Choice ${option.name} deleted.`);
                    })
                  }
                >
                  <TrashIcon />
                </button>
              </>
            )}
          </li>
        ))}
        {field.options.length === 0 && (
          <li className="fields-dialog__none">No choices yet. Add the first one.</li>
        )}
      </ul>
      {field.options.length < MAX_OPTIONS && (
        <form className="fields-dialog__inline" onSubmit={(event) => void add(event)}>
          <label htmlFor={`${ids}-name`} className="sr-only">
            New choice for {field.name}
          </label>
          <input
            id={`${ids}-name`}
            value={name}
            placeholder="New choice"
            maxLength={OPTION_NAME_MAX}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
          <ColorSelect label="Colour of the new choice" value={color} onChange={setColor} />
          <button type="submit" className="btn btn--outline btn--sm" disabled={name.trim() === ''}>
            Add
          </button>
        </form>
      )}
    </div>
  );
}

export function FieldsDialog({ open, onClose }: FieldsDialogProps) {
  const ids = useId();
  const fields = useBoardStore((state) => state.view?.fields ?? []);
  const values = useBoardStore((state) => state.view?.field_values ?? []);
  const createField = useBoardStore((state) => state.createField);
  const changeField = useBoardStore((state) => state.changeField);
  const removeField = useBoardStore((state) => state.removeField);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<FieldKind>('text');
  const [show, setShow] = useState(false);
  const [starting, setStarting] = useState('');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<Field | null>(null);

  useEffect(() => {
    if (!open) {
      setRenaming(null);
      setDeleting(null);
    }
  }, [open]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || busy) return;
    setBusy(true);
    const options =
      kind === 'select'
        ? starting
            .split(/\r?\n|,/)
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry, index) => ({
              name: entry,
              color: LABEL_COLORS[(index + 3) % LABEL_COLORS.length],
            }))
        : undefined;
    const created = await createField({ name: trimmed, kind, options, show_on_card: show });
    setBusy(false);
    if (created) {
      setName('');
      setStarting('');
      setShow(false);
      announce(`Field ${trimmed} added.`);
    }
  }

  async function rename(field: Field) {
    const trimmed = draft.trim();
    if (trimmed === '' || trimmed === field.name) {
      setRenaming(null);
      return;
    }
    if (await changeField(field.id, { name: trimmed })) setRenaming(null);
  }

  const used = (field: Field) => values.filter((entry) => entry.field_id === field.id).length;

  return (
    <>
      <Dialog open={open} onClose={onClose} title="Fields" size="lg">
        <div className="fields-dialog">
          <header>
            <h2 className="fields-dialog__title">Fields</h2>
            <p className="fields-dialog__intro">
              Add properties to the cards of this board: a size, an environment, a client. Everyone
              who can edit fills them in. A board holds up to {MAX_FIELDS} fields.
            </p>
          </header>

          <ul className="fields-dialog__list">
            {fields.map((field, index) => (
              <li key={field.id} className="fields-dialog__field">
                <div className="fields-dialog__head">
                  {renaming === field.id ? (
                    <form
                      className="fields-dialog__inline"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void rename(field);
                      }}
                    >
                      <input
                        aria-label={`New name for ${field.name}`}
                        value={draft}
                        maxLength={FIELD_NAME_MAX}
                        autoFocus
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.stopPropagation();
                            setRenaming(null);
                          }
                        }}
                      />
                      <button type="submit" className="btn btn--outline btn--sm">
                        Save
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="fields-dialog__name">{field.name}</span>
                      <span className="fields-dialog__kind">{kindLabel(field.kind)}</span>
                    </>
                  )}
                  <span className="fields-dialog__tools">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Move ${field.name} up`}
                      disabled={index === 0}
                      onClick={() => void changeField(field.id, { position: index - 1 })}
                    >
                      <ArrowUpIcon />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Move ${field.name} down`}
                      disabled={index === fields.length - 1}
                      onClick={() => void changeField(field.id, { position: index + 1 })}
                    >
                      <ArrowDownIcon />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Rename field ${field.name}`}
                      onClick={() => {
                        setRenaming(field.id);
                        setDraft(field.name);
                      }}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete field ${field.name}`}
                      onClick={() => setDeleting(field)}
                    >
                      <TrashIcon />
                    </button>
                  </span>
                </div>
                <Switch
                  label="Show on the card"
                  hint="Up to three fields show on the face of a card."
                  checked={field.show_on_card}
                  onChange={(on) => void changeField(field.id, { show_on_card: on })}
                />
                {field.kind === 'select' && <Choices field={field} />}
              </li>
            ))}
            {fields.length === 0 && (
              <li className="fields-dialog__none">No fields yet. Create the first one below.</li>
            )}
          </ul>

          {fields.length < MAX_FIELDS && (
            <form className="fields-dialog__form" onSubmit={(event) => void add(event)}>
              <h3 className="fields-dialog__subtitle">New field</h3>
              <div className="field">
                <label htmlFor={`${ids}-name`}>Name</label>
                <input
                  id={`${ids}-name`}
                  value={name}
                  maxLength={FIELD_NAME_MAX}
                  autoComplete="off"
                  placeholder="Story size"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <fieldset className="fields-dialog__kinds">
                <legend>Type</legend>
                {FIELD_KINDS.map((entry) => (
                  <label key={entry.kind} className="fields-dialog__kind-option">
                    <input
                      type="radio"
                      name={`${ids}-kind`}
                      checked={kind === entry.kind}
                      onChange={() => setKind(entry.kind)}
                    />
                    <span>
                      <strong>{entry.label}</strong>
                      <span>{entry.hint}</span>
                    </span>
                  </label>
                ))}
                <p className="fields-dialog__locked">
                  A field keeps its type, so pick it with care.
                </p>
              </fieldset>
              {kind === 'select' && (
                <div className="field">
                  <label htmlFor={`${ids}-options`}>Choices (optional)</label>
                  <textarea
                    id={`${ids}-options`}
                    rows={3}
                    value={starting}
                    placeholder={'Staging\nProduction'}
                    onChange={(event) => setStarting(event.target.value)}
                  />
                  <p className="fields-dialog__hint">One per line, or separated by commas.</p>
                </div>
              )}
              <Switch label="Show on the card" checked={show} onChange={setShow} />
              <div className="fields-dialog__actions">
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={name.trim() === '' || busy}
                >
                  Add the field
                </button>
              </div>
            </form>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this field?"
        message={
          deleting
            ? `“${deleting.name}” will be removed from every card${
                used(deleting) > 0
                  ? `, along with the ${used(deleting)} value${used(deleting) === 1 ? '' : 's'} already filled in`
                  : ''
              }. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete field"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) {
            void removeField(target.id).then((done) => {
              if (done) announce(`Field ${target.name} deleted.`);
            });
          }
        }}
      />
    </>
  );
}
