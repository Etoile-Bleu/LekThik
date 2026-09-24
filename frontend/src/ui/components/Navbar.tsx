import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { logoutUser } from '@lib/api';
import { useAuthStore } from '@lib/authStore';

import './Navbar.css';

const NAV_LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#offline-first', label: 'Offline-first' },
  { href: '#why', label: 'Why not Trello' },
];

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const clearUser = useAuthStore((state) => state.clearUser);
  const isAuthenticated = status === 'authenticated';

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  async function handleSignOut() {
    setIsMenuOpen(false);
    await logoutUser();
    clearUser();
    navigate('/');
  }

  return (
    <header className="navbar">
      <div className="navbar__bar container">
        <a href="#top" className="navbar__brand" onClick={() => setIsMenuOpen(false)}>
          <span className="navbar__mark" aria-hidden="true" />
          LekThik
        </a>

        <nav className="navbar__links" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="navbar__actions">
          {isAuthenticated ? (
            <>
              <Link className="navbar__link-cta" to="/dashboard">
                Dashboard
              </Link>
              <button className="navbar__cta" type="button" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link className="navbar__link-cta" to="/login">
                Sign in
              </Link>
              <Link className="navbar__cta" to="/signup">
                Create account
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="navbar__toggle"
          aria-expanded={isMenuOpen}
          aria-controls="mobile-menu"
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span className={`navbar__burger ${isMenuOpen ? 'navbar__burger--open' : ''}`} />
        </button>
      </div>

      <div
        id="mobile-menu"
        className={`navbar__mobile ${isMenuOpen ? 'navbar__mobile--open' : ''}`}
      >
        <nav aria-label="Mobile">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setIsMenuOpen(false)}>
              {link.label}
            </a>
          ))}
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" onClick={() => setIsMenuOpen(false)}>
                Dashboard
              </Link>
              <button
                className="navbar__cta navbar__cta--mobile"
                type="button"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setIsMenuOpen(false)}>
                Sign in
              </Link>
              <Link
                className="navbar__cta navbar__cta--mobile"
                to="/signup"
                onClick={() => setIsMenuOpen(false)}
              >
                Create account
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
