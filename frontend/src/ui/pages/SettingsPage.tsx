import { useEffect } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';

import { useDocumentTitle } from '@hooks/useDocumentTitle';
import { ensureFont } from '@lib/appearance';
import { DEFAULT_PREFERENCES } from '@lib/prefs';
import { usePrefsStore } from '@lib/prefsStore';

import { CalendarSection } from '../components/settings/CalendarSection';
import { CardDialogSection } from '../components/settings/CardDialogSection';
import { PrivacySection } from '../components/settings/PrivacySection';
import {
  AppearanceSection,
  ColourSection,
  ControlsSection,
  HelpSection,
  ReadingSection,
} from '../components/settings/sections';
import { SaveStatus } from '../components/settings/SaveStatus';
import { SettingsPreview } from '../components/settings/SettingsPreview';
import {
  CalendarIcon,
  ColumnsIcon,
  EyeIcon,
  KeyboardIcon,
  ShieldIcon,
  PaletteIcon,
  SlidersIcon,
  TextLinesIcon,
} from '../components/ui/Icons';
import './SettingsPage.css';

const SECTIONS = [
  {
    id: 'appearance',
    label: 'Appearance',
    blurb: 'Theme, density and what cards show.',
    icon: <PaletteIcon size={18} />,
    content: <AppearanceSection />,
  },
  {
    id: 'card',
    label: 'Card dialog',
    blurb: 'Choose and order what a card shows.',
    icon: <ColumnsIcon size={18} />,
    content: <CardDialogSection />,
  },
  {
    id: 'reading',
    label: 'Reading',
    blurb: 'Text size, font and spacing.',
    icon: <TextLinesIcon size={18} />,
    content: <ReadingSection />,
  },
  {
    id: 'colour',
    label: 'Colour',
    blurb: 'Palettes for colour blindness, and shapes.',
    icon: <EyeIcon size={18} />,
    content: <ColourSection />,
  },
  {
    id: 'controls',
    label: 'Controls and motion',
    blurb: 'Bigger targets, focus, motion and announcements.',
    icon: <SlidersIcon size={18} />,
    content: <ControlsSection />,
  },
  {
    id: 'privacy',
    label: 'Privacy',
    blurb: 'What is kept, and outside content.',
    icon: <ShieldIcon size={18} />,
    content: <PrivacySection />,
  },
  {
    id: 'calendar',
    label: 'Calendar feed',
    blurb: 'A private address of your assigned cards.',
    icon: <CalendarIcon size={18} />,
    content: <CalendarSection />,
  },
  {
    id: 'help',
    label: 'Keyboard and help',
    blurb: 'Shortcuts, and how to move cards without dragging.',
    icon: <KeyboardIcon size={18} />,
    content: <HelpSection />,
  },
] as const;

/**
 * One page for everything about how LekThik looks and behaves for you.
 * Sections on the left, the section in the middle, and a live preview that
 * stays in view on the right. Everything saves by itself.
 */
export function SettingsPage() {
  const { section: sectionId = '' } = useParams();
  const section = SECTIONS.find((candidate) => candidate.id === sectionId);
  const update = usePrefsStore((state) => state.update);

  useDocumentTitle(section ? `${section.label}, settings` : 'Settings');

  useEffect(() => {
    // Let people see each font as they choose, without loading them for everyone else.
    if (section?.id === 'reading') {
      ensureFont('hyperlegible');
      ensureFont('lexend');
    }
  }, [section?.id]);

  if (!section) {
    return <Navigate to="/settings/appearance" replace />;
  }

  function resetAll() {
    const {
      boards: _boards,
      card_display: _display,
      card_dialog: _dialog,
      ...defaults
    } = DEFAULT_PREFERENCES;
    void _boards;
    void _display;
    void _dialog;
    update(defaults);
  }

  const showsPreview = !['help', 'card', 'privacy', 'calendar'].includes(section.id);

  return (
    <div className="settings">
      <header className="settings__header">
        <h1 className="settings__title">Settings</h1>
        <p className="settings__subtitle">
          Make LekThik fit the way you see, read and work. Changes apply at once and follow you to
          every device.
        </p>
      </header>

      <div className="settings__grid" data-preview={showsPreview || undefined}>
        <nav className="settings__nav" aria-label="Settings sections">
          <ul>
            {SECTIONS.map((item) => (
              <li key={item.id}>
                <NavLink to={`/settings/${item.id}`} className="settings__link">
                  <span className="settings__link-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="settings__link-text">
                    <span className="settings__link-label">{item.label}</span>
                    <span className="settings__link-blurb">{item.blurb}</span>
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <section className="settings__panel" aria-labelledby="settings-section-title">
          <div className="settings__bar">
            <h2 id="settings-section-title" className="settings__section-title">
              {section.label}
            </h2>
            <SaveStatus />
          </div>
          <div className="settings__rows" key={section.id}>
            {section.content}
          </div>
          {showsPreview && (
            <footer className="settings__footer">
              <button type="button" className="btn btn--ghost btn--sm" onClick={resetAll}>
                Reset appearance and accessibility to defaults
              </button>
            </footer>
          )}
        </section>

        {showsPreview && (
          <aside className="settings__aside" aria-label="Live preview">
            <SettingsPreview />
          </aside>
        )}
      </div>
    </div>
  );
}
