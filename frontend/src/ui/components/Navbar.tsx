import { useEffect, useState } from 'react';

import './Navbar.css';

const NAV_LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#offline-first', label: 'Offline-first' },
  { href: '#why', label: 'Why not Trello' },
];

const REPO_URL = 'https://github.com/Etoile-Bleu/LekThik';

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

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

        <a className="navbar__cta" href={REPO_URL} target="_blank" rel="noreferrer">
          View on GitHub
        </a>

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
          <a
            className="navbar__cta navbar__cta--mobile"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => setIsMenuOpen(false)}
          >
            View on GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
