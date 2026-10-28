import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

import { BLOCK_GROUPS, BLOCK_GROUP_ORDER, BLOCK_KINDS, type PanelKindInfo } from '@lib/blocks';
import type { PanelKind } from '@lib/boardsApi';

import { Dialog } from '../ui/Dialog';
import { SearchIcon } from '../ui/Icons';
import { KindIcon } from './BoardBlock';
import { BlockPreview } from './BlockPreview';
import './AddBlockDialog.css';

type BlockKind = Exclude<PanelKind, 'list'>;

interface AddBlockDialogProps {
  open: boolean;
  onPick: (kind: BlockKind) => void;
  onClose: () => void;
}

function matches(info: PanelKindInfo, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${info.label} ${info.description} ${BLOCK_GROUPS[info.kind].keywords} ${
    BLOCK_GROUPS[info.kind].group
  }`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function AddBlockDialog({ open, onPick, onClose }: AddBlockDialogProps) {
  const ids = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<BlockKind>(BLOCK_KINDS[0].kind);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(BLOCK_KINDS[0].kind);
    }
  }, [open]);

  const sections = useMemo(
    () =>
      BLOCK_GROUP_ORDER.map((group) => ({
        group,
        items: BLOCK_KINDS.filter(
          (info) => BLOCK_GROUPS[info.kind].group === group && matches(info, query)
        ),
      })).filter((section) => section.items.length > 0),
    [query]
  );
  const flat = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const current = flat.find((info) => info.kind === active) ?? flat[0] ?? null;

  function pick(kind: BlockKind) {
    onPick(kind);
    onClose();
  }

  function move(step: number) {
    if (flat.length === 0) return;
    const index = Math.max(
      0,
      flat.findIndex((info) => info.kind === current?.kind)
    );
    const next = flat[(index + step + flat.length) % flat.length];
    setActive(next.kind);
    document.getElementById(`${ids}-${next.kind}`)?.scrollIntoView?.({ block: 'nearest' });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter' && current) {
      event.preventDefault();
      pick(current.kind);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add a block" size="xl">
      <div className="add-block">
        <header className="add-block__head">
          <div>
            <h2 className="add-block__title">Add a block</h2>
            <p className="add-block__lead">
              Blocks sit beside your lists and draw on the cards of this board.
            </p>
          </div>
          <div className="add-block__search">
            <SearchIcon size={16} />
            <input
              ref={searchRef}
              type="search"
              role="combobox"
              aria-label="Search blocks"
              aria-expanded="true"
              aria-controls={`${ids}-list`}
              aria-activedescendant={current ? `${ids}-${current.kind}` : undefined}
              placeholder="Search: chart, vote, timer…"
              value={query}
              autoComplete="off"
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
        </header>

        <div className="add-block__body">
          <div className="add-block__list" id={`${ids}-list`} role="listbox" aria-label="Blocks">
            {sections.map((section) => (
              <div key={section.group} role="group" aria-labelledby={`${ids}-g-${section.group}`}>
                <h3 className="add-block__group" id={`${ids}-g-${section.group}`}>
                  {section.group}
                </h3>
                {section.items.map((info) => (
                  <div
                    key={info.kind}
                    id={`${ids}-${info.kind}`}
                    role="option"
                    aria-selected={current?.kind === info.kind}
                    className="add-block__row"
                    onMouseEnter={() => setActive(info.kind)}
                    onClick={() => pick(info.kind)}
                  >
                    <span className="add-block__row-icon">
                      <KindIcon kind={info.kind} size={18} />
                    </span>
                    <span className="add-block__row-text">
                      <span className="add-block__row-name">{info.label}</span>
                      <span className="add-block__row-description">{info.description}</span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {sections.length === 0 && (
              <p className="add-block__none" role="status">
                No block matches “{query}”. Try “chart”, “vote” or “timer”.
              </p>
            )}
          </div>

          <aside className="add-block__side" aria-hidden="true">
            {current && (
              <>
                <div className="add-block__stage" key={current.kind}>
                  <BlockPreview kind={current.kind} />
                </div>
                <p className="add-block__side-name">{current.label}</p>
                <p className="add-block__side-description">{current.description}</p>
              </>
            )}
          </aside>
        </div>

        <footer className="add-block__foot">
          <span className="add-block__hint">
            <kbd>↑</kbd> <kbd>↓</kbd> to move, <kbd>Enter</kbd> to add
          </span>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!current}
            onClick={() => current && pick(current.kind)}
          >
            {current ? `Add ${current.label.toLowerCase()}` : 'Add a block'}
          </button>
        </footer>
      </div>
    </Dialog>
  );
}
