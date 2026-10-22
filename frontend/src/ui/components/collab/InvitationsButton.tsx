import { useState } from 'react';

import { useInvitationStore } from '@lib/invitationStore';

import { MailIcon } from '../ui/Icons';
import { InvitationsDialog } from './InvitationsDialog';
import './InvitationsButton.css';

export function InvitationsButton() {
  const count = useInvitationStore((state) => state.invitations.length);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="icon-button invitations-button"
        aria-label={count > 0 ? `Invitations, ${count} waiting` : 'Invitations'}
        onClick={() => setOpen(true)}
      >
        <MailIcon size={20} />
        {count > 0 && (
          <span className="invitations-button__count" aria-hidden="true">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      <InvitationsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
