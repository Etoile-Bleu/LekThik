import './Hero.css';

const REPO_URL = 'https://github.com/Etoile-Bleu/LekThik';

export function Hero() {
  return (
    <section id="top" className="hero">
      <div className="container hero__inner">
        <p className="hero__eyebrow">Open source, in active development</p>

        <h1 className="hero__title">The board that keeps working when the network doesn&apos;t.</h1>

        <p className="hero__subtitle">
          LekThik is a Trello-style board for teams. We are using it to prove that ZamSync, an
          offline-first sync engine, can be bolted onto a finished app without rebuilding it.
        </p>

        <div className="hero__actions">
          <a className="hero__primary" href={REPO_URL} target="_blank" rel="noreferrer">
            View the code
          </a>
          <a className="hero__secondary" href="#offline-first">
            Read the offline-first story
          </a>
        </div>

        <p className="hero__stat">
          <strong>2.2 billion</strong> people do not have a reliable internet connection.{' '}
          <span className="hero__stat-source">Most tools assume they do. (ITU, 2025)</span>
        </p>
      </div>
    </section>
  );
}
