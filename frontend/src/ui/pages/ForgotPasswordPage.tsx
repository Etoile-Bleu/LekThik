import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError, requestPasswordReset } from '@lib/api';

import '@components/AuthForm.css';

export function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await requestPasswordReset(email);
      navigate(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (submitError) {
      setError(
        submitError instanceof ApiError ? submitError.message : 'Something went wrong, try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <div>
          <h1 className="auth__title">Forgot your password?</h1>
          <p className="auth__subtitle">
            Enter your email and we will send you a code to choose a new one.
          </p>
        </div>

        <form className="auth__form" onSubmit={handleSubmit}>
          <div className="auth__field">
            <label htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          {error && <p className="auth__error">{error}</p>}

          <button className="auth__submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Send code'}
          </button>
        </form>

        <p className="auth__switch">
          Remembered it? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
