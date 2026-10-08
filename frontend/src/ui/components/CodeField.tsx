interface CodeFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

const CODE_LENGTH = 6;

export function CodeField({ id, value, onChange }: CodeFieldProps) {
  return (
    <div className="auth__field">
      <label htmlFor={id}>Verification code</label>
      <input
        id={id}
        name="code"
        className="auth__code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={CODE_LENGTH}
        placeholder="000000"
        required
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
      />
      <span className="auth__hint">The 6-digit code we emailed you. It expires in 10 minutes.</span>
    </div>
  );
}
