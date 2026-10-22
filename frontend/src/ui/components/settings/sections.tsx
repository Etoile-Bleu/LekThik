import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type {
  CardDisplay,
  ColorVision,
  Density,
  LetterSpacing,
  ReadingFont,
  TextSize,
} from '@lib/prefs';
import { usePrefsStore } from '@lib/prefsStore';

import { LabelChip } from '../board/LabelChip';
import { Segmented } from '../ui/Segmented';
import { Switch } from '../ui/Switch';
import { SettingRow } from './SettingRow';
import { ThemeTiles } from './ThemeTiles';
import './sections.css';

const DENSITIES: Array<{ value: Density; label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'spacious', label: 'Spacious' },
];

const TEXT_SIZES: Array<{ value: TextSize; label: string }> = [
  { value: 'normal', label: '100%' },
  { value: 'large', label: '110%' },
  { value: 'larger', label: '125%' },
  { value: 'largest', label: '150%' },
];

const FONTS: Array<{ value: ReadingFont; label: string; family?: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'hyperlegible', label: 'Hyperlegible', family: "'Atkinson Hyperlegible', sans-serif" },
  { value: 'lexend', label: 'Lexend', family: "'Lexend', sans-serif" },
];

const SPACINGS: Array<{ value: LetterSpacing; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'wide', label: 'Wide' },
  { value: 'wider', label: 'Wider' },
];

const VISIONS: Array<{ value: ColorVision; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'redgreen', label: 'Red-green' },
  { value: 'blueyellow', label: 'Blue-yellow' },
];

const CARD_FIELDS: Array<{ key: keyof CardDisplay; label: string; hint?: string }> = [
  { key: 'labels', label: 'Labels' },
  { key: 'due_date', label: 'Due date' },
  { key: 'assignees', label: 'Assignees' },
  { key: 'description_marker', label: 'Description icon' },
  {
    key: 'description_preview',
    label: 'Description preview',
    hint: 'The first lines, under the title.',
  },
];

const SAMPLE_LABELS = [
  { name: 'Slate', color: 'slate' },
  { name: 'Red', color: 'red' },
  { name: 'Orange', color: 'orange' },
  { name: 'Amber', color: 'amber' },
  { name: 'Green', color: 'green' },
  { name: 'Teal', color: 'teal' },
  { name: 'Blue', color: 'blue' },
  { name: 'Violet', color: 'violet' },
  { name: 'Pink', color: 'pink' },
] as const;

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="setting-row setting-row--toggle">
      <Switch label={label} hint={hint} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

export function AppearanceSection() {
  const prefs = usePrefsStore((state) => state.prefs);
  const update = usePrefsStore((state) => state.update);
  const setCardDisplay = usePrefsStore((state) => state.setCardDisplay);

  return (
    <>
      <SettingRow label="Theme" stacked hint="Light, dark, or the highest contrast we can draw.">
        <ThemeTiles value={prefs.theme} onChange={(theme) => update({ theme })} />
      </SettingRow>
      <SettingRow
        label="Density"
        hint="Changes spacing only, never the size of the text. Compact fits more on screen."
      >
        <Segmented
          label="Density"
          value={prefs.density}
          options={DENSITIES}
          onChange={(density) => update({ density })}
        />
      </SettingRow>
      <div className="settings-block">
        <h3 className="settings-block__title">What a card shows</h3>
        <p className="settings-block__hint">
          The default for all your boards. Each board can use its own from its Display menu.
        </p>
        {CARD_FIELDS.map((field) => (
          <Toggle
            key={field.key}
            label={field.label}
            hint={field.hint}
            checked={prefs.card_display[field.key]}
            onChange={(value) => setCardDisplay({ ...prefs.card_display, [field.key]: value })}
          />
        ))}
      </div>
    </>
  );
}

export function ReadingSection() {
  const prefs = usePrefsStore((state) => state.prefs);
  const update = usePrefsStore((state) => state.update);

  return (
    <>
      <SettingRow
        label="Text size"
        hint="Scales all the text in the app, up to one and a half times."
      >
        <Segmented
          label="Text size"
          value={prefs.text_size}
          options={TEXT_SIZES}
          onChange={(text_size) => update({ text_size })}
        />
      </SettingRow>
      <SettingRow
        label="Font"
        hint="Hyperlegible tells similar letters apart. Lexend gives each letter more room."
      >
        <Segmented
          label="Font"
          value={prefs.reading_font}
          options={FONTS.map((font) => ({
            value: font.value,
            label: font.label,
            fontFamily: font.family,
          }))}
          onChange={(reading_font) => update({ reading_font })}
        />
      </SettingRow>
      <SettingRow
        label="Letter and word spacing"
        hint="More room between letters and words, for text that feels too tight."
      >
        <Segmented
          label="Letter and word spacing"
          value={prefs.letter_spacing}
          options={SPACINGS}
          onChange={(letter_spacing) => update({ letter_spacing })}
        />
      </SettingRow>
    </>
  );
}

export function ColourSection() {
  const prefs = usePrefsStore((state) => state.prefs);
  const update = usePrefsStore((state) => state.update);
  const shapesForced = prefs.color_vision !== 'standard';

  return (
    <>
      <SettingRow
        label="Colour vision"
        hint="Label colours are re-picked so they stay apart for the chosen kind of colour blindness."
      >
        <Segmented
          label="Colour vision"
          value={prefs.color_vision}
          options={VISIONS}
          onChange={(color_vision) => update({ color_vision })}
        />
      </SettingRow>
      <Toggle
        label="Mark colours with shapes"
        hint={
          shapesForced
            ? 'Always on while a colour vision mode is chosen.'
            : 'Adds a small shape to every label, so colour is never the only clue.'
        }
        checked={prefs.label_shapes || shapesForced}
        disabled={shapesForced}
        onChange={(label_shapes) => update({ label_shapes })}
      />
      <div className="settings-block">
        <h3 className="settings-block__title">Your label colours</h3>
        <ul className="settings-labels" aria-label="Label colour preview">
          {SAMPLE_LABELS.map((label) => (
            <li key={label.color}>
              <LabelChip name={label.name} color={label.color} priority="none" />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export function ControlsSection() {
  const prefs = usePrefsStore((state) => state.prefs);
  const update = usePrefsStore((state) => state.update);

  return (
    <>
      <Toggle
        label="Larger buttons and controls"
        hint="Bigger targets, easier to hit with a hand that is not steady."
        checked={prefs.large_targets}
        onChange={(large_targets) => update({ large_targets })}
      />
      <Toggle
        label="Stronger focus outline"
        hint="A thick two tone ring around whatever the keyboard has selected."
        checked={prefs.strong_focus}
        onChange={(strong_focus) => update({ strong_focus })}
      />
      <Toggle
        label="Plain board backgrounds"
        hint="No tint behind boards, only the plain theme colour."
        checked={prefs.flat_backgrounds}
        onChange={(flat_backgrounds) => update({ flat_backgrounds })}
      />
      <Toggle
        label="Reduce motion"
        hint="Turns off transitions and animations. Your device setting is respected either way."
        checked={prefs.motion === 'reduce'}
        onChange={(on) => update({ motion: on ? 'reduce' : 'system' })}
      />
      <Toggle
        label="Announce changes from teammates"
        hint="A screen reader says when someone else changes the board you are on."
        checked={prefs.announce_changes}
        onChange={(announce_changes) => update({ announce_changes })}
      />
    </>
  );
}

function Help({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-help">
      <h3 className="settings-block__title">{title}</h3>
      {children}
    </section>
  );
}

/** Always in the same place, the account menu, as WCAG 3.2.6 asks of help. */
export function HelpSection() {
  return (
    <>
      <p className="settings-help__lead">
        LekThik works with a keyboard, a screen reader, voice control and a switch.
      </p>

      <Help title="Use the keyboard">
        <dl className="settings-keys">
          <div>
            <dt>
              <kbd>Tab</kbd> and <kbd>Shift</kbd> + <kbd>Tab</kbd>
            </dt>
            <dd>Move forward and back. The first stop is a link that skips to the content.</dd>
          </div>
          <div>
            <dt>
              <kbd>Enter</kbd> or <kbd>Space</kbd>
            </dt>
            <dd>Press the button, open the card, switch the setting.</dd>
          </div>
          <div>
            <dt>
              <kbd>Esc</kbd>
            </dt>
            <dd>Close a menu, a panel or a dialog and go back where you were.</dd>
          </div>
          <div>
            <dt>
              <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd>
            </dt>
            <dd>Choose between options in a group, and move through a menu.</dd>
          </div>
        </dl>
      </Help>

      <Help title="See the same cards three ways">
        <ul className="settings-list">
          <li>
            On a board, the <strong>Board</strong>, <strong>List</strong> and{' '}
            <strong>Calendar</strong> buttons switch the view. Your choice is remembered for each
            board.
          </li>
          <li>
            In the <strong>List</strong> view, each column heading is a button that sorts. Press it
            again to reverse, once more to go back to the board order.
          </li>
          <li>
            In the <strong>Calendar</strong>, arrow keys move between days, <kbd>Page Up</kbd> and{' '}
            <kbd>Page Down</kbd> change month, and <kbd>Enter</kbd> lists the cards of a day. Cards
            without a date wait in a tray, each with a button to give it the chosen day.
          </li>
          <li>
            <strong>My cards</strong>, in the sidebar, gathers everything assigned to you.
          </li>
        </ul>
      </Help>

      <Help title="Move cards and lists without dragging">
        <ul className="settings-list">
          <li>
            Open the menu of a list and choose <strong>Move left</strong> or{' '}
            <strong>Move right</strong>.
          </li>
          <li>
            Open a card and use <strong>List</strong>, <strong>Position</strong> and{' '}
            <strong>Move card</strong>.
          </li>
          <li>
            Or drag with the keyboard: focus the grip, press <kbd>Space</kbd>, move with the arrow
            keys, press <kbd>Space</kbd> to drop or <kbd>Esc</kbd> to cancel. Each step is
            announced.
          </li>
        </ul>
      </Help>

      <Help title="With a screen reader or voice control">
        <ul className="settings-list">
          <li>
            Turn on <Link to="/settings/controls">Announce changes from teammates</Link> to hear
            when someone else edits the board you are on.
          </li>
          <li>
            Every control is named with the words you see, so saying “click Display” or “click
            Members” works.
          </li>
          <li>
            Due dates are spoken as words, such as “Overdue” or “Due today”, never only shown as a
            colour.
          </li>
        </ul>
      </Help>
    </>
  );
}
