import './Switch.css';

interface SwitchProps {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * A setting that is on or off. The whole row is the control, a wide target
 * that is easy to hit, with the label and its hint inside so both are read.
 */
export function Switch({ label, hint, checked, disabled = false, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      className="switch-row"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-row__text">
        <span className="switch-row__label">{label}</span>
        {hint && <span className="switch-row__hint">{hint}</span>}
      </span>
      <span className="switch-row__track" aria-hidden="true">
        <span className="switch-row__thumb" />
      </span>
    </button>
  );
}
