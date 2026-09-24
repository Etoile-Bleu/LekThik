import './Features.css';

const ICON_PROPS = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function BoardIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16M6 9h0M18 13h0" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 4.3c1.7.4 3 2 3 3.9 0 1.9-1.3 3.5-3 3.9M21 20c0-2.8-2-5.1-4.7-5.8" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M21 12a9 9 0 0 1-15.3 6.4M3 12a9 9 0 0 1 15.3-6.4" />
      <path d="M21 4v5h-5M3 20v-5h5" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M7 7.5h0M7 16.5h0" />
    </svg>
  );
}

const FEATURES = [
  {
    Icon: BoardIcon,
    title: 'Boards, lists, cards',
    description: 'Drag cards between lists, reorder columns, keep every board legible at a glance.',
  },
  {
    Icon: UsersIcon,
    title: 'Built for teams',
    description: 'Assign owners, set due dates, and see who changed what without asking around.',
  },
  {
    Icon: SyncIcon,
    title: 'Offline-first, for real',
    description:
      'Edit a board with no connection. ZamSync merges your changes with everyone else’s the moment a link comes back.',
  },
  {
    Icon: ServerIcon,
    title: 'Hosted or self-hosted',
    description: 'Use our instance, or run LekThik on your own network with zero dependency on us.',
  },
];

export function Features() {
  return (
    <section id="product" className="features">
      <div className="container">
        <div className="features__header">
          <p className="features__eyebrow">Product</p>
          <h2 className="features__title">Everything a board needs, nothing it doesn&apos;t</h2>
        </div>

        <div className="features__grid">
          {FEATURES.map(({ Icon, title, description }) => (
            <article key={title} className="features__card">
              <div className="features__icon">
                <Icon />
              </div>
              <h3 className="features__card-title">{title}</h3>
              <p className="features__card-description">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
