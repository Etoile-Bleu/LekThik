import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

import { ApiError, registerUser } from '@lib/api';

import '@components/AuthForm.css';

export function SignupPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await registerUser(email, username, password);
      setRegisteredEmail(email);
    } catch (submitError) {
      setError(
        submitError instanceof ApiError ? submitError.message : 'Something went wrong, try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (registeredEmail) {
    return (
      <div className="auth">
        <div className="auth__card">
          <div>
            <h1 className="auth__title">Account created</h1>
            <p className="auth__subtitle">You&apos;re all set.</p>
          </div>
          <p className="auth__success">
            Your account <strong>{registeredEmail}</strong> was created successfully. You can now
            sign in.
          </p>
          <p className="auth__switch">
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <div>
          <h1 className="auth__title">Create your account</h1>
          <p className="auth__subtitle">Boards, lists and cards, synced across your team.</p>
        </div>

        <form className="auth__form" onSubmit={handleSubmit}>
          <div className="auth__field">
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="auth__field">
            <label htmlFor="signup-username">Username</label>
            <input
              id="signup-username"
              name="username"
              type="text"
              autoComplete="username"
              minLength={3}
              maxLength={32}
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <span className="auth__hint">3 to 32 characters.</span>
          </div>

          <div className="auth__field">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
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
            <label htmlFor="signup-confirm-password">Confirm password</label>
            <input
              id="signup-confirm-password"
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

          <button className="auth__submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="auth__switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
