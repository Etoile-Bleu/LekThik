import { useState } from 'react';

import type { Invitation } from '@lib/collabApi';
import { ROLE_LABEL, ROLE_SUMMARY } from '@lib/roles';

import { Avatar } from './Avatar';
import './InvitationCard.css';

interface InvitationCardProps {
  invitation: Invitation;
  onAccept: (invitation: Invitation) => Promise<boolean>;
  onDecline: (invitation: Invitation) => Promise<boolean>;
  headingLevel?: 'h2' | 'h3';
}

/** One pending invitation with its two answers, used by the inbox and the invitation page. */
export function InvitationCard({
  invitation,
  onAccept,
  onDecline,
  headingLevel: Heading = 'h3',
}: InvitationCardProps) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);

  async function answer(kind: 'accept' | 'decline') {
    if (busy) return;
    setBusy(kind);
    try {
      await (kind === 'accept' ? onAccept(invitation) : onDecline(invitation));
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="invitation-card" aria-label={`Invitation to ${invitation.workspace_name}`}>
      <Avatar name={invitation.workspace_name} seed={invitation.workspace_id} />
      <div className="invitation-card__body">
        <Heading className="invitation-card__title">{invitation.workspace_name}</Heading>
        <p className="invitation-card__meta">
          {invitation.invited_by} invited you as <strong>{ROLE_LABEL[invitation.role]}</strong>.{' '}
          {ROLE_SUMMARY[invitation.role]}.
        </p>
      </div>
      <div className="invitation-card__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={busy !== null}
          onClick={() => void answer('accept')}
        >
          {busy === 'accept' ? 'Joining…' : 'Accept'}
        </button>
        <button
          type="button"
          className="btn btn--outline btn--sm"
          disabled={busy !== null}
          onClick={() => void answer('decline')}
        >
          Decline
        </button>
      </div>
    </article>
  );
}
