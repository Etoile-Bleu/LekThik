import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { announce } from '@lib/announcer';
import {
  type Command,
  type CommandChoice,
  type CommandStep,
  collectCommands,
  rankCommands,
  readRecent,
  rememberCommand,
  useCommandStore,
} from '@lib/commandStore';
import { fuzzyMatch, highlightRuns } from '@lib/fuzzy';
import { notifyError, notifySuccess } from '@lib/toastStore';

import { ChevronRightIcon, CornerDownLeftIcon, SearchIcon } from '../ui/Icons';
import './CommandPalette.css';

interface Pending {
  command: Command;
  answers: string[];
  /** The words of each answer, shown in the trail above the field. */
  said: string[];
}

interface Row {
  key: string;
  title: string;
  hint?: string;
  icon?: Command['icon'];
  shortcut?: string[];
  indexes: number[];
  group: string;
  pick: () => void;
}

function Highlighted({ text, indexes }: { text: string; indexes: number[] }) {
  return (
    <>
      {highlightRuns(text, indexes).map((run, position) =>
        run.hit ? (
          <b key={position} className="palette__hit">
            {run.text}
          </b>
        ) : (
          <Fragment key={position}>{run.text}</Fragment>
        )
      )}
    </>
  );
}

/**
 * The Ctrl+K command palette: one field to jump anywhere and do anything. It follows the
 * combobox pattern, so focus never leaves the field while the arrow keys move through the
 * results, and a command that needs more details asks for them one question at a time.
 */
export function CommandPalette() {
  const open = useCommandStore((state) => state.open);
  const sources = useCommandStore((state) => state.sources);
  const close = useCommandStore((state) => state.closePalette);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const listId = useId();
  const labelId = useId();
  const hintId = useId();
  const errorId = useId();

  // ---- opening and closing the native dialog ----
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery('');
      setActive(0);
      setPending(null);
      setProblem(null);
      setRecent(readRecent());
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const step: CommandStep | null = pending
    ? (pending.command.steps?.[pending.answers.length] ?? null)
    : null;

  // ---- what is listed ----
  const ranked = useMemo<Row[]>(() => {
    if (!open) return [];
    if (pending && step?.kind === 'choose') {
      return step.choices().flatMap<Row>((choice: CommandChoice) => {
        const found = fuzzyMatch(query, choice.title);
        if (!found) return [];
        return [
          {
            key: `choice:${choice.id}`,
            title: choice.title,
            hint: choice.hint,
            icon: choice.icon,
            indexes: found.indexes,
            group: step.prompt,
            pick: () => answer(choice.id, choice.title),
          },
        ];
      });
    }
    if (pending) return [];
    return rankCommands(collectCommands(), query, recent).map<Row>((item) => ({
      key: item.command.id,
      title: item.command.title,
      hint: item.command.hint,
      icon: item.command.icon,
      shortcut: item.command.shortcut,
      indexes: item.indexes,
      group: item.command.group,
      pick: () => void choose(item.command),
    }));
    // The functions below only read state that is part of these dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, pending, step, recent, sources]);

  // One heading per group, in the order of the best match of each, and the rows follow the headings.
  const { groups, rows } = useMemo(() => {
    const byName = new Map<string, Row[]>();
    for (const row of ranked) {
      const members = byName.get(row.group);
      if (members) members.push(row);
      else byName.set(row.group, [row]);
    }
    const flat: Row[] = [];
    const out = Array.from(byName, ([name, members]) => ({
      name,
      rows: members.map((row) => {
        flat.push(row);
        return { row, index: flat.length - 1 };
      }),
    }));
    return { groups: out, rows: flat };
  }, [ranked]);

  const optionId = (index: number) => `${listId}-option-${index}`;
  const current = rows[Math.min(active, rows.length - 1)];
  const asking = step?.kind === 'text';

  // Keep the highlighted result in view and tell screen readers how many there are.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open, rows]);

  useEffect(() => {
    if (!open || asking) return;
    const timer = window.setTimeout(
      () =>
        announce(
          rows.length === 0
            ? 'No results.'
            : `${rows.length} result${rows.length === 1 ? '' : 's'}.`
        ),
      250
    );
    return () => window.clearTimeout(timer);
    // Only what is typed changes the count, moving through the list should not repeat it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, pending, asking, rows.length]);

  // ---- running things ----
  async function finishWith(command: Command, answers: string[]) {
    setBusy(true);
    try {
      const message = await command.finish?.(answers);
      rememberCommand(command.id);
      useCommandStore.getState().closePalette();
      if (message) {
        notifySuccess(message);
        announce(message);
      }
    } catch (error) {
      notifyError(error);
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  async function choose(command: Command) {
    if (command.steps && command.steps.length > 0) {
      setPending({ command, answers: [], said: [] });
      setQuery('');
      setActive(0);
      setProblem(null);
      inputRef.current?.focus();
      return;
    }
    rememberCommand(command.id);
    useCommandStore.getState().closePalette();
    try {
      await command.run?.();
    } catch (error) {
      notifyError(error);
    }
  }

  function answer(value: string, spoken: string) {
    if (!pending) return;
    const answers = [...pending.answers, value];
    const said = [...pending.said, spoken];
    if (answers.length >= (pending.command.steps?.length ?? 0)) {
      void finishWith(pending.command, answers);
      return;
    }
    setPending({ ...pending, answers, said });
    setQuery('');
    setActive(0);
    setProblem(null);
  }

  function back() {
    if (!pending) return;
    if (pending.answers.length === 0) {
      setPending(null);
    } else {
      setPending({
        ...pending,
        answers: pending.answers.slice(0, -1),
        said: pending.said.slice(0, -1),
      });
    }
    setQuery('');
    setActive(0);
    setProblem(null);
  }

  function submit() {
    if (busy) return;
    if (step?.kind === 'text') {
      const text = query.trim();
      if (text === '' && !step.optional) {
        setProblem('Type something first.');
        return;
      }
      const message = step.validate?.(text) ?? null;
      if (message) {
        setProblem(message);
        return;
      }
      answer(text, text === '' ? 'none' : text);
      return;
    }
    current?.pick();
  }

  // ---- keyboard ----
  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    const count = rows.length;
    switch (event.key) {
      case 'ArrowDown':
        if (asking) return;
        event.preventDefault();
        if (count > 0) setActive((index) => (index + 1) % count);
        break;
      case 'ArrowUp':
        if (asking) return;
        event.preventDefault();
        if (count > 0) setActive((index) => (index - 1 + count) % count);
        break;
      case 'PageDown':
        if (asking) return;
        event.preventDefault();
        setActive((index) => Math.min(count - 1, index + 8));
        break;
      case 'PageUp':
        if (asking) return;
        event.preventDefault();
        setActive((index) => Math.max(0, index - 8));
        break;
      case 'Home':
        if (asking || query !== '') return;
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        if (asking || query !== '') return;
        event.preventDefault();
        setActive(Math.max(0, count - 1));
        break;
      case 'Enter':
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        submit();
        break;
      case 'Backspace':
        if (query === '' && pending) {
          event.preventDefault();
          back();
        }
        break;
      default:
    }
  }

  function handleCancel(event: Event) {
    // Escape steps back out of a question before it closes the palette.
    if (pending) {
      event.preventDefault();
      back();
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  });

  function handleClose() {
    if (openRef.current) close();
  }

  function handleBackdrop(event: ReactMouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) close();
  }

  const placeholder = step
    ? step.prompt
    : 'Search cards, boards and commands, or type to do something…';
  const examples = step?.kind === 'text' ? (step.examples ?? []) : [];

  return (
    <dialog
      ref={dialogRef}
      className="palette"
      aria-labelledby={labelId}
      onClose={handleClose}
      onClick={handleBackdrop}
    >
      <div className="palette__panel">
        <h2 id={labelId} className="sr-only">
          Command palette
        </h2>

        <div className="palette__bar">
          <SearchIcon size={18} className="palette__search" />
          {pending && (
            <ol className="palette__trail" aria-label="Command so far">
              <li>{pending.command.title}</li>
              {pending.said.map((spoken, position) => (
                <li key={position}>
                  <ChevronRightIcon size={13} />
                  {spoken}
                </li>
              ))}
            </ol>
          )}
          <input
            ref={inputRef}
            className="palette__input"
            type="text"
            value={query}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint={asking ? 'done' : 'go'}
            placeholder={placeholder}
            aria-label={step ? step.prompt : 'Search commands'}
            {...(asking
              ? { 'aria-describedby': problem ? `${hintId} ${errorId}` : hintId }
              : {
                  role: 'combobox',
                  'aria-expanded': true,
                  'aria-controls': listId,
                  'aria-autocomplete': 'list' as const,
                  'aria-activedescendant': current
                    ? optionId(Math.min(active, rows.length - 1))
                    : undefined,
                })}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              setProblem(null);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>

        {asking ? (
          <div className="palette__ask">
            <p id={hintId} className="palette__help">
              {query.trim() === ''
                ? examples.length > 0
                  ? `For example ${examples.join(', ')}.`
                  : 'Type your answer, then press Enter.'
                : 'Press Enter to confirm.'}
            </p>
            {problem && (
              <p id={errorId} className="palette__problem" role="alert">
                {problem}
              </p>
            )}
          </div>
        ) : (
          <div
            ref={listRef}
            id={listId}
            className="palette__list"
            role="listbox"
            aria-label={step ? step.prompt : 'Results'}
          >
            {rows.length === 0 && (
              <p className="palette__empty">
                {query.trim() === ''
                  ? 'Nothing to show here yet.'
                  : `Nothing matches “${query.trim()}”.`}
              </p>
            )}
            {groups.map((group) => {
              const headingId = `${listId}-group-${group.name}`;
              return (
                <div
                  key={group.name}
                  role="group"
                  aria-labelledby={headingId}
                  className="palette__group"
                >
                  <div id={headingId} className="palette__heading">
                    {group.name}
                  </div>
                  {group.rows.map(({ row, index }) => (
                    <div
                      key={row.key}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === active}
                      className="palette__option"
                      data-active={index === active || undefined}
                      onMouseMove={() => {
                        if (index !== active) setActive(index);
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={row.pick}
                    >
                      <span className="palette__icon" aria-hidden="true">
                        {row.icon}
                      </span>
                      <span className="palette__title">
                        <Highlighted text={row.title} indexes={row.indexes} />
                      </span>
                      {row.hint && <span className="palette__hint">{row.hint}</span>}
                      {row.shortcut && (
                        <span className="palette__keys" aria-hidden="true">
                          {row.shortcut.map((key) => (
                            <kbd key={key}>{key}</kbd>
                          ))}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        <div className="palette__footer" aria-hidden="true">
          {!asking && (
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> to move
            </span>
          )}
          <span>
            <kbd>
              <CornerDownLeftIcon size={12} />
            </kbd>{' '}
            {asking ? 'to confirm' : step ? 'to choose' : 'to select'}
          </span>
          <span>
            <kbd>Esc</kbd> {pending ? 'to go back' : 'to close'}
          </span>
        </div>
      </div>
    </dialog>
  );
}
