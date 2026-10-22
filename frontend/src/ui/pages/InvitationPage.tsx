import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useDocumentTitle } from '@hooks/useDocumentTitle';
import { ApiError } from '@lib/api';
import { useAuthStore } from '@lib/authStore';
import * as api from '@lib/collabApi';
import type { Invitation } from '@lib/collabApi';
import { useInvitationStore } from '@lib/invitationStore';

import { InvitationCard } from '../components/collab/InvitationCard';
import './InvitationPage.css';

type PageState =
  | { kind: 'loading' }
  | { kind: 'ready'; invitation: Invitation }
  | { kind: 'closed'; invitation: Invitation }
  | { kind: 'wrong-account' }
  | { kind: 'error' };

/** Where the link in the invitation email lands. */
export function InvitationPage() {
  const { invitationId = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const accept = useInvitationStore((state) => state.accept);
  const decline = useInvitationStore((state) => state.decline);
  const [state, setState] = useState<PageState>({ kind: 'loading' });

  useDocumentTitle('Invitation');

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    api
      .fetchInvitation(invitationId)
      .then((invitation) => {
        if (cancelled) return;
        setState(
          invitation.status === 'pending' && !invitation.expired
            ? { kind: 'ready', invitation }
            : { kind: 'closed', invitation }
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          kind: error instanceof ApiError && error.status === 404 ? 'wrong-account' : 'error',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [invitationId]);

  return (
    <div className="invitation-page">
      <div className="invitation-page__panel">
        {state.kind === 'loading' && (
          <p role="status" aria-busy="true" className="invitation-page__note">
            Loading your invitation…
          </p>
        )}

        {state.kind === 'ready' && (
          <>
            <h1 className="invitation-page__title">You have been invited</h1>
            <p className="invitation-page__note">
              Signed in as <strong>{user?.email}</strong>.
            </p>
            <InvitationCard
              headingLevel="h2"
              invitation={state.invitation}
              onAccept={async (invitation) => {
                const joined = await accept(invitation);
                if (joined) navigate('/dashboard');
                return joined;
              }}
              onDecline={async (invitation) => {
                const declined = await decline(invitation);
                if (declined) navigate('/dashboard');
                return declined;
              }}
            />
          </>
        )}

        {state.kind === 'closed' && (
          <>
            <h1 className="invitation-page__title">This invitation is closed</h1>
            <p className="invitation-page__note">
              {state.invitation.expired && state.invitation.status === 'pending'
                ? 'It expired. Ask for a new one from someone who manages the workspace.'
                : `It was ${state.invitation.status}. Ask for a new one if you still need access.`}
            </p>
            <Link className="btn btn--primary" to="/dashboard">
              Go to your workspaces
            </Link>
          </>
        )}

        {state.kind === 'wrong-account' && (
          <>
            <h1 className="invitation-page__title">This invitation is not for this account</h1>
            <p className="invitation-page__note">
              You are signed in as <strong>{user?.email}</strong>. An invitation can only be opened
              with the email address it was sent to. Sign out and sign in with that address, or ask
              for a new invitation.
            </p>
            <Link className="btn btn--primary" to="/dashboard">
              Go to your workspaces
            </Link>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <h1 className="invitation-page__title">Could not load the invitation</h1>
            <p className="invitation-page__note">Check your connection and try again.</p>
            <button type="button" className="btn btn--primary" onClick={() => navigate(0)}>
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
