import './OfflineFirst.css';

export function OfflineFirst() {
  return (
    <section id="offline-first" className="offline">
      <div className="container">
        <div className="offline__header">
          <p className="offline__eyebrow">Offline-first</p>
          <h2 className="offline__title">Two people, no network, one board</h2>
          <p className="offline__subtitle">
            The test that matters: what happens when two people edit the same card while
            disconnected, then reconnect.
          </p>
        </div>

        <div className="offline__compare">
          <div className="offline__panel offline__panel--without">
            <p className="offline__panel-label">Without ZamSync</p>
            <p className="offline__panel-text">
              Both edits arrive. One silently overwrites the other, or the app just breaks.
            </p>
          </div>

          <div className="offline__panel offline__panel--with">
            <p className="offline__panel-label">With ZamSync</p>
            <p className="offline__panel-text">
              Both edits are ordered, deduplicated, and merged. Nothing is lost, no conflict dialog
              required.
            </p>
          </div>
        </div>

        <p className="offline__footnote">
          ZamSync is not in production yet. Making it survive this exact scenario, on LekThik, is
          the point of this project.
        </p>
      </div>
    </section>
  );
}
