import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { CodeField } from '@components/CodeField';
import { ApiError, requestPasswordReset, resetPassword } from '@lib/api';

import '@components/AuthForm.css';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await resetPassword(email, code, password);
      navigate('/login', { state: { notice: 'Password updated. You can sign in now.' } });
    } catch (submitError) {
      setError(
        submitError instanceof ApiError ? submitError.message : 'Something went wrong, try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    setIsResending(true);

    try {
      await requestPasswordReset(email);
      setNotice('If an account exists for this address, a new code is on its way.');
    } catch (resendError) {
      setError(
        resendError instanceof ApiError ? resendError.message : 'Something went wrong, try again.'
      );
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <div>
          <h1 className="auth__title">Choose a new password</h1>
          <p className="auth__subtitle">
            Enter the code from your email, then pick a new password.
          </p>
        </div>

        <form className="auth__form" onSubmit={handleSubmit}>
          <div className="auth__field">
            <label htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <CodeField id="reset-code" value={code} onChange={setCode} />

          <div className="auth__field">
            <label htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <span className="auth__hint">At least 8 characters.</span>
          </div>

          <div className="auth__field">
            <label htmlFor="reset-confirm-password">Confirm new password</label>
            <input
              id="reset-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>

          {error && <p className="auth__error">{error}</p>}
          {notice && <p className="auth__success">{notice}</p>}

          <button className="auth__submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Updating...' : 'Update password'}
          </button>
        </form>

        <button
          className="auth__link-button"
          type="button"
          onClick={handleResend}
          disabled={isResending || email === ''}
        >
          {isResending ? 'Sending...' : 'Send a new code'}
        </button>

        <p className="auth__switch">
          Back to <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
