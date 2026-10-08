import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { CodeField } from '@components/CodeField';
import { ApiError, resendVerification, verifyEmail } from '@lib/api';

import '@components/AuthForm.css';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      await verifyEmail(email, code);
      navigate('/login', { state: { notice: 'Email verified. You can sign in now.' } });
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
      await resendVerification(email);
      setNotice('If this address needs verification, a new code is on its way.');
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
          <h1 className="auth__title">Check your inbox</h1>
          <p className="auth__subtitle">
            Enter the code we sent to verify your email and finish creating your account.
          </p>
        </div>

        <form className="auth__form" onSubmit={handleSubmit}>
          <div className="auth__field">
            <label htmlFor="verify-email">Email</label>
            <input
              id="verify-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <CodeField id="verify-code" value={code} onChange={setCode} />

          {error && <p className="auth__error">{error}</p>}
          {notice && <p className="auth__success">{notice}</p>}

          <button className="auth__submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Verifying...' : 'Verify email'}
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
          Already verified? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
