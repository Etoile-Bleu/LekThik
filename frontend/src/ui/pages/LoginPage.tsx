import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError, loginUser } from '@lib/api';
import { useAuthStore } from '@lib/authStore';

import '@components/AuthForm.css';

export function LoginPage() {
  const navigate = useNavigate();
  const checkSession = useAuthStore((state) => state.checkSession);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await loginUser(email, password);
      await checkSession();
      navigate('/dashboard');
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
          <h1 className="auth__title">Sign in</h1>
          <p className="auth__subtitle">Pick up your boards where you left off.</p>
        </div>

        <form className="auth__form" onSubmit={handleSubmit}>
          <div className="auth__field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="auth__field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && <p className="auth__error">{error}</p>}

          <button className="auth__submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="auth__switch">
          No account yet? <Link to="/signup">Create one</Link>
        </p>
      </div>
    </div>
  );
}
