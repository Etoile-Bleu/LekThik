import './WhySection.css';

const POINTS = [
  {
    label: 'Deployment',
    trello: 'Their cloud, one option.',
    lekthik: 'Our hosted instance, or your own network, offline included.',
  },
  {
    label: 'Multi-site resilience',
    trello: 'One central cloud, one point of failure.',
    lekthik: 'ZamSync keeps two sites in sync, even after a long disconnect.',
  },
  {
    label: 'Source',
    trello: 'Closed, you rent it.',
    lekthik: 'Open on GitHub, you can read every line.',
  },
];

export function WhySection() {
  return (
    <section id="why" className="why">
      <div className="container">
        <div className="why__header">
          <p className="why__eyebrow">Why not just Trello</p>
          <h2 className="why__title">We are not competing on features</h2>
          <p className="why__subtitle">
            Trello has years of polish we cannot match in one sprint cycle. LekThik answers a
            question Trello, as a centralized SaaS, cannot: what happens when a site loses the
            cloud.
          </p>
        </div>

        <div className="why__table" role="table">
          <div className="why__row why__row--head" role="row">
            <span role="columnheader"></span>
            <span role="columnheader">Trello</span>
            <span role="columnheader">LekThik</span>
          </div>
          {POINTS.map((point) => (
            <div className="why__row" role="row" key={point.label}>
              <span className="why__row-label" role="rowheader">
                {point.label}
              </span>
              <span role="cell">{point.trello}</span>
              <span role="cell" className="why__row-lekthik">
                {point.lekthik}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
