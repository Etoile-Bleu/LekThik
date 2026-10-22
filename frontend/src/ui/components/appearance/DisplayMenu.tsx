import { useId } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ACCENTS,
  BACKGROUNDS,
  type BoardAccent,
  type BoardBackground,
  type BoardLook,
} from '@lib/boardLooks';
import { type CardDisplay, type Density, cardDisplayFor, hasBoardDisplay } from '@lib/prefs';
import { usePrefsStore } from '@lib/prefsStore';

import { SlidersIcon } from '../ui/Icons';
import { Popover } from '../ui/Popover';
import { Segmented } from '../ui/Segmented';
import { Switch } from '../ui/Switch';
import { Swatches } from './Swatches';
import './DisplayMenu.css';

interface DisplayMenuProps {
  boardId: string;
  look: BoardLook;
  /** Writers and above can change what the whole board looks like. */
  canStyle: boolean;
  onLookChange: (look: BoardLook) => void;
}

const DENSITIES: Array<{ value: Density; label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'spacious', label: 'Spacious' },
];

const CARD_FIELDS: Array<{ key: keyof CardDisplay; label: string; hint?: string }> = [
  { key: 'labels', label: 'Labels' },
  { key: 'due_date', label: 'Due date' },
  { key: 'assignees', label: 'Assignees' },
  { key: 'description_marker', label: 'Description icon' },
  {
    key: 'description_preview',
    label: 'Description preview',
    hint: 'The first lines, under the title',
  },
];

/** Linear's "Display" idea: one button next to the view, everything that changes how it looks. */
export function DisplayMenu({ boardId, look, canStyle, onLookChange }: DisplayMenuProps) {
  const prefs = usePrefsStore((state) => state.prefs);
  const update = usePrefsStore((state) => state.update);
  const setCardDisplay = usePrefsStore((state) => state.setCardDisplay);
  const setBoardCardDisplay = usePrefsStore((state) => state.setBoardCardDisplay);
  const navigate = useNavigate();
  const headingId = useId();

  const display = cardDisplayFor(prefs, boardId);
  const ownDisplay = hasBoardDisplay(prefs, boardId);

  function toggleField(key: keyof CardDisplay, value: boolean) {
    const next = { ...display, [key]: value };
    if (ownDisplay) {
      setBoardCardDisplay(boardId, next);
    } else {
      setCardDisplay(next);
    }
  }

  return (
    <Popover
      label="Display options"
      trigger={
        <>
          <SlidersIcon /> Display
        </>
      }
    >
      {(close) => (
        <div className="display-menu">
          <header className="display-menu__header">
            <h2 id={headingId} className="display-menu__title">
              Display
            </h2>
            <p className="display-menu__sub">How this board looks to you.</p>
          </header>

          <section className="display-menu__section" aria-label="Density">
            <h3 className="display-menu__heading">Density</h3>
            <Segmented
              label="Density"
              value={prefs.density}
              options={DENSITIES}
              onChange={(density) => update({ density })}
            />
          </section>

          <section className="display-menu__section" aria-label="Card content">
            <h3 className="display-menu__heading">Card content</h3>
            <div className="display-menu__switches">
              {CARD_FIELDS.map((field) => (
                <Switch
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  checked={display[field.key]}
                  onChange={(value) => toggleField(field.key, value)}
                />
              ))}
            </div>
            <Switch
              label="Only for this board"
              hint={
                ownDisplay
                  ? 'This board keeps its own choices.'
                  : 'Off: these choices apply to all your boards.'
              }
              checked={ownDisplay}
              onChange={(value) => setBoardCardDisplay(boardId, value ? display : null)}
            />
          </section>

          <section className="display-menu__section" aria-label="Board look">
            <h3 className="display-menu__heading">Board look</h3>
            {canStyle ? (
              <>
                <p className="display-menu__note">Shared with everyone on this board.</p>
                <div className="display-menu__swatch-row">
                  <span className="display-menu__swatch-label">Background</span>
                  <Swatches<BoardBackground>
                    label="Background"
                    value={look.background}
                    options={BACKGROUNDS.map((option) => ({
                      key: option.key,
                      label: option.label,
                      color: option.hue,
                    }))}
                    onChange={(background) => onLookChange({ ...look, background })}
                  />
                </div>
                <div className="display-menu__swatch-row">
                  <span className="display-menu__swatch-label">Accent</span>
                  <Swatches<BoardAccent>
                    label="Accent"
                    value={look.accent}
                    options={ACCENTS.map((option) => ({
                      key: option.key,
                      label: option.label,
                      color: option.light.accent,
                    }))}
                    onChange={(accent) => onLookChange({ ...look, accent })}
                  />
                </div>
              </>
            ) : (
              <p className="display-menu__note">
                Writers, admins and the owner choose how this board looks.
              </p>
            )}
          </section>

          <footer className="display-menu__footer">
            <button
              type="button"
              className="display-menu__link"
              onClick={() => {
                close();
                navigate('/settings/appearance');
              }}
            >
              All settings…
            </button>
          </footer>
        </div>
      )}
    </Popover>
  );
}
