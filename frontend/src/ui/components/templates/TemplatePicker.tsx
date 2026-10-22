import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';

import type { BoardTemplate } from '@lib/boardsApi';
import { useTemplateStore } from '@lib/templateStore';

import { Dialog } from '../ui/Dialog';
import { BlankBoardPreview, BoardOutline, BoardPreview } from './TemplatePreview';
import './TemplatePicker.css';

type Mode = 'workspace' | 'board';

interface TemplatePickerProps {
  open: boolean;
  mode: Mode;
  onClose: () => void;
  onSubmit: (input: { name: string; templateId: string | null }) => Promise<boolean>;
}

interface Option {
  id: string;
  name: string;
  description: string;
  group: string;
}

const COPY: Record<Mode, { title: string; blank: string; blankHint: string; field: string }> = {
  workspace: {
    title: 'New workspace',
    blank: 'Blank workspace',
    blankHint: 'Start empty and add boards when you need them.',
    field: 'Workspace name',
  },
  board: {
    title: 'New board',
    blank: 'Blank board',
    blankHint: 'Start empty and add the lists you need.',
    field: 'Board name',
  },
};

export function TemplatePicker({ open, mode, onClose, onSubmit }: TemplatePickerProps) {
  const catalogue = useTemplateStore((state) => state.catalogue);
  const status = useTemplateStore((state) => state.status);
  const loadTemplates = useTemplateStore((state) => state.load);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const copy = COPY[mode];

  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setName('');
      setNameTouched(false);
      void loadTemplates();
    }
  }, [open, loadTemplates]);

  const options: Option[] = useMemo(() => {
    if (!catalogue) return [];
    return mode === 'board'
      ? catalogue.boards.map((template) => ({
          id: template.id,
          name: template.name,
          description: template.description,
          group: template.category,
        }))
      : catalogue.workspaces.map((template) => ({
          id: template.id,
          name: template.name,
          description: template.description,
          group: 'Workspace templates',
        }));
  }, [catalogue, mode]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, Option[]>();
    for (const option of options) {
      if (!byGroup.has(option.group)) {
        order.push(option.group);
        byGroup.set(option.group, []);
      }
      byGroup.get(option.group)?.push(option);
    }
    return order.map((group) => ({ group, items: byGroup.get(group) ?? [] }));
  }, [options]);

  const selected = options.find((option) => option.id === selectedId) ?? null;

  function select(id: string | null) {
    setSelectedId(id);
    if (!nameTouched) {
      setName(options.find((option) => option.id === id)?.name ?? '');
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) {
      return;
    }
    setBusy(true);
    try {
      const done = await onSubmit({ name: trimmed, templateId: selectedId });
      if (done) {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  function renderPreview() {
    if (!selected) {
      return mode === 'board' ? (
        <BlankBoardPreview />
      ) : (
        <p className="tpl-picker__empty-preview">
          An empty workspace. Create boards whenever you need them, blank or from a template.
        </p>
      );
    }

    if (mode === 'board') {
      const template = catalogue?.boards.find((candidate) => candidate.id === selected.id);
      return template ? <BoardPreview template={template} /> : null;
    }

    const workspace = catalogue?.workspaces.find((candidate) => candidate.id === selected.id);
    const boards = (workspace?.board_ids ?? [])
      .map((id) => catalogue?.boards.find((candidate) => candidate.id === id))
      .filter((template): template is BoardTemplate => template !== undefined);

    return (
      <ul className="tpl-picker__boards">
        {boards.map((template) => (
          <li key={template.id}>
            <h4>{template.name}</h4>
            <p>{template.description}</p>
            <BoardOutline template={template} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title={copy.title} size="lg">
      <form className="tpl-picker" onSubmit={handleSubmit}>
        <header className="tpl-picker__header">
          <h2>{copy.title}</h2>
          <p>Start blank or pick a template. You can change everything afterwards.</p>
        </header>

        <div className="tpl-picker__body">
          <fieldset className="tpl-picker__options">
            <legend className="sr-only">Template</legend>

            <label className="tpl-option">
              <input
                type="radio"
                name="template"
                checked={selectedId === null}
                onChange={() => select(null)}
              />
              <span className="tpl-option__face">
                <span className="tpl-option__name">{copy.blank}</span>
                <span className="tpl-option__description">{copy.blankHint}</span>
              </span>
            </label>

            {status === 'loading' && (
              <p className="tpl-picker__status" role="status">
                Loading templates…
              </p>
            )}
            {status === 'error' && (
              <p className="tpl-picker__status" role="status">
                Templates are unavailable right now. You can still start blank.
              </p>
            )}

            {groups.map(({ group, items }) => (
              <div key={group} role="group" aria-label={group} className="tpl-group">
                <p className="tpl-group__title" aria-hidden="true">
                  {group}
                </p>
                {items.map((option) => (
                  <label key={option.id} className="tpl-option">
                    <input
                      type="radio"
                      name="template"
                      checked={selectedId === option.id}
                      onChange={() => select(option.id)}
                    />
                    <span className="tpl-option__face">
                      <span className="tpl-option__name">{option.name}</span>
                      <span className="tpl-option__description">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </fieldset>

          <section
            className="tpl-picker__preview"
            aria-label={`Preview of ${selected?.name ?? copy.blank}`}
            tabIndex={0}
          >
            <div key={selectedId ?? 'blank'} className="tpl-picker__preview-body">
              <h3>{selected?.name ?? copy.blank}</h3>
              <p className="tpl-picker__preview-lead">{selected?.description ?? copy.blankHint}</p>
              {renderPreview()}
            </div>
          </section>
        </div>

        <footer className="tpl-picker__footer">
          <div className="field">
            <label htmlFor={nameId}>{copy.field}</label>
            <input
              id={nameId}
              type="text"
              value={name}
              maxLength={120}
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
                setNameTouched(true);
              }}
            />
          </div>
          <div className="tpl-picker__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>
              {mode === 'workspace' ? 'Create workspace' : 'Create board'}
            </button>
          </div>
        </footer>
      </form>
    </Dialog>
  );
}
