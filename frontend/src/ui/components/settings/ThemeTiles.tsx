import type { Theme } from '@lib/prefs';

import { CheckIcon } from '../ui/Icons';
import './ThemeTiles.css';

const THEMES: Array<{ value: Theme; label: string; hint: string }> = [
  { value: 'system', label: 'System', hint: 'Follows your device' },
  { value: 'light', label: 'Light', hint: 'Soft and bright' },
  { value: 'dark', label: 'Dark', hint: 'Easy on the eyes' },
  { value: 'contrast', label: 'High contrast', hint: 'Maximum legibility' },
];

/** A tiny board drawn in the colours of one theme, so you choose by looking. */
function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <span className="theme-preview" data-preview={theme} aria-hidden="true">
      <span className="theme-preview__bar" />
      <span className="theme-preview__body">
        <span className="theme-preview__rail" />
        <span className="theme-preview__list">
          <span className="theme-preview__card theme-preview__card--accent" />
          <span className="theme-preview__card" />
        </span>
        <span className="theme-preview__list">
          <span className="theme-preview__card" />
        </span>
      </span>
    </span>
  );
}

interface ThemeTilesProps {
  value: Theme;
  onChange: (theme: Theme) => void;
}

/** Native radios underneath, so arrow keys and the group name come for free. */
export function ThemeTiles({ value, onChange }: ThemeTilesProps) {
  return (
    <div className="theme-tiles" role="radiogroup" aria-label="Theme">
      {THEMES.map((theme) => (
        <label
          key={theme.value}
          className="theme-tile"
          data-checked={value === theme.value || undefined}
        >
          <input
            type="radio"
            name="theme"
            className="theme-tile__input"
            value={theme.value}
            checked={value === theme.value}
            onChange={() => onChange(theme.value)}
          />
          <ThemePreview theme={theme.value} />
          <span className="theme-tile__text">
            <span className="theme-tile__name">
              {theme.label}
              <span className="theme-tile__check" aria-hidden="true">
                <CheckIcon size={14} />
              </span>
            </span>
            <span className="theme-tile__hint">{theme.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
