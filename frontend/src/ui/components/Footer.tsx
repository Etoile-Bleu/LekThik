import './Footer.css';

const YEAR = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <span className="footer__mark" aria-hidden="true" />
          <span>LekThik</span>
        </div>

        <p className="footer__tagline">A board for teams, offline-first by design.</p>

        <nav className="footer__links" aria-label="Footer">
          <a href="https://github.com/Etoile-Bleu/LekThik" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a
            href="https://github.com/Etoile-Bleu/LekThik/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
          >
            License
          </a>
          <a
            href="https://github.com/Etoile-Bleu/LekThik/blob/main/CONTRIBUTING.md"
            target="_blank"
            rel="noreferrer"
          >
            Contributing
          </a>
        </nav>

        <p className="footer__copy">&copy; {YEAR} LekThik. MIT licensed.</p>
      </div>
    </footer>
  );
}
