import { useNavigate } from 'react-router-dom';

import { useInvitationStore } from '@lib/invitationStore';

import { Dialog } from '../ui/Dialog';
import { InvitationCard } from './InvitationCard';
import './InvitationsDialog.css';

interface InvitationsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function InvitationsDialog({ open, onClose }: InvitationsDialogProps) {
  const navigate = useNavigate();
  const invitations = useInvitationStore((state) => state.invitations);
  const accept = useInvitationStore((state) => state.accept);
  const decline = useInvitationStore((state) => state.decline);

  return (
    <Dialog open={open} onClose={onClose} title="Invitations" size="md">
      <div className="invitations">
        <h2 className="invitations__title">Invitations</h2>
        {invitations.length === 0 ? (
          <p className="invitations__empty">
            Nothing waiting for you. When someone invites you to a workspace, it shows up here and
            in your inbox.
          </p>
        ) : (
          <ul className="invitations__list">
            {invitations.map((invitation) => (
              <li key={invitation.id}>
                <InvitationCard
                  invitation={invitation}
                  onAccept={async (item) => {
                    const joined = await accept(item);
                    if (joined) {
                      onClose();
                      navigate('/dashboard');
                    }
                    return joined;
                  }}
                  onDecline={decline}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
