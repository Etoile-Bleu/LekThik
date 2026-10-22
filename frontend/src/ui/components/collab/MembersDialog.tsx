import { type FormEvent, useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '@lib/authStore';
import type { Role, Workspace } from '@lib/boardsApi';
import type { Invitation, Member } from '@lib/collabApi';
import { useMembersStore } from '@lib/membersStore';
import { assignableRoles, canManage, canManageMember, ROLE_LABEL, ROLE_SUMMARY } from '@lib/roles';
import { useWorkspaceStore } from '@lib/workspaceStore';

import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dialog } from '../ui/Dialog';
import { LogOutIcon, MailIcon, TrashIcon } from '../ui/Icons';
import { Avatar } from './Avatar';
import { RoleBadge } from './RoleBadge';
import './MembersDialog.css';

interface MembersDialogProps {
  workspace: Workspace | null;
  onClose: () => void;
}

type InvitableRole = Exclude<Role, 'owner'>;

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function MembersDialog({ workspace, onClose }: MembersDialogProps) {
  const navigate = useNavigate();
  const me = useAuthStore((state) => state.user);
  const overview = useMembersStore((state) => state.overview);
  const status = useMembersStore((state) => state.status);
  const open = useMembersStore((state) => state.open);
  const close = useMembersStore((state) => state.close);
  const invite = useMembersStore((state) => state.invite);
  const revoke = useMembersStore((state) => state.revoke);
  const changeRole = useMembersStore((state) => state.changeRole);
  const remove = useMembersStore((state) => state.remove);
  const loadWorkspaces = useWorkspaceStore((state) => state.load);

  const emailId = useId();
  const roleId = useId();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('writer');
  const [sending, setSending] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [leaving, setLeaving] = useState(false);

  const workspaceId = workspace?.id ?? null;

  useEffect(() => {
    if (workspaceId) {
      setEmail('');
      void open(workspaceId);
      return () => close();
    }
    return undefined;
  }, [workspaceId, open, close]);

  const myRole = overview?.role ?? workspace?.role;
  const choices = assignableRoles(myRole) as InvitableRole[];
  const picked = choices.includes(role) ? role : (choices[choices.length - 1] ?? 'reader');

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    if (sending || !email.trim()) return;
    setSending(true);
    try {
      if (await invite(email.trim(), picked)) {
        setEmail('');
      }
    } finally {
      setSending(false);
    }
  }

  async function confirmLeave() {
    setLeaving(false);
    if (!workspace || !me) return;
    if (await remove(me.id)) {
      onClose();
      await loadWorkspaces();
      navigate('/dashboard');
    }
  }

  const members = overview?.members ?? [];
  const invitations: Invitation[] = overview?.invitations ?? [];
  const isManager = canManage(myRole);

  return (
    <Dialog
      open={workspace !== null}
      onClose={onClose}
      title={workspace ? `Members of ${workspace.name}` : 'Members'}
      size="md"
    >
      <div className="members">
        <header className="members__header">
          <h2 className="members__title">Members</h2>
          <p className="members__subtitle">{workspace?.name}</p>
        </header>

        {isManager && (
          <form className="members__invite" onSubmit={handleInvite}>
            <div className="field members__invite-email">
              <label htmlFor={emailId}>Invite by email</label>
              <input
                id={emailId}
                type="email"
                autoComplete="off"
                inputMode="email"
                placeholder="name@company.com"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="field members__invite-role">
              <label htmlFor={roleId}>Role</label>
              <select
                id={roleId}
                value={picked}
                onChange={(event) => setRole(event.target.value as InvitableRole)}
              >
                {choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {ROLE_LABEL[choice]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="btn btn--primary members__send"
              disabled={sending || !email.trim()}
            >
              <MailIcon /> {sending ? 'Sending…' : 'Send invite'}
            </button>
            <p className="field-hint members__invite-hint">{ROLE_SUMMARY[picked]}.</p>
          </form>
        )}

        <section aria-labelledby="members-list-title" className="members__section">
          <h3 id="members-list-title" className="members__section-title">
            People with access
            <span className="members__count">{members.length}</span>
          </h3>

          {status === 'loading' && (
            <div className="members__skeleton" role="status" aria-label="Loading members">
              <span />
              <span />
            </div>
          )}

          <ul className="members__list">
            {members.map((member) => {
              const isMe = member.user_id === me?.id;
              const manageable = canManageMember(myRole, member.role);
              const memberRoles = assignableRoles(myRole);
              return (
                <li key={member.user_id} className="members__row">
                  <Avatar name={member.username} seed={member.user_id} />
                  <div className="members__who">
                    <span className="members__name">
                      {member.username}
                      {isMe && <span className="members__you"> (you)</span>}
                    </span>
                    <span className="members__email">{member.email}</span>
                  </div>
                  {manageable ? (
                    <>
                      <select
                        className="members__role-select"
                        aria-label={`Role of ${member.username}`}
                        value={member.role}
                        onChange={(event) =>
                          void changeRole(member.user_id, event.target.value as Role)
                        }
                      >
                        {memberRoles.map((choice) => (
                          <option key={choice} value={choice}>
                            {ROLE_LABEL[choice]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="icon-button members__remove"
                        aria-label={`Remove ${member.username}`}
                        onClick={() => setRemoving(member)}
                      >
                        <TrashIcon />
                      </button>
                    </>
                  ) : (
                    <RoleBadge role={member.role} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {isManager && (
          <section aria-labelledby="members-pending-title" className="members__section">
            <h3 id="members-pending-title" className="members__section-title">
              Pending invitations
              <span className="members__count">{invitations.length}</span>
            </h3>
            {invitations.length === 0 ? (
              <p className="members__empty">
                No one is waiting. Invited people appear here until they answer.
              </p>
            ) : (
              <ul className="members__list">
                {invitations.map((invitation) => (
                  <li key={invitation.id} className="members__row">
                    <span className="members__pending-icon" aria-hidden="true">
                      <MailIcon size={16} />
                    </span>
                    <div className="members__who">
                      <span className="members__name">{invitation.email}</span>
                      <span className="members__email">
                        {ROLE_LABEL[invitation.role]} ·{' '}
                        {invitation.expired
                          ? 'expired'
                          : `expires ${formatDate(invitation.expires_at)}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => void revoke(invitation.id)}
                    >
                      Revoke
                      <span className="sr-only"> invitation for {invitation.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {myRole && myRole !== 'owner' && (
          <footer className="members__footer">
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => setLeaving(true)}
            >
              <LogOutIcon /> Leave workspace
            </button>
          </footer>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        title="Remove this member?"
        message={
          removing
            ? `${removing.username} will lose access to ${workspace?.name ?? 'the workspace'} right away.`
            : ''
        }
        confirmLabel="Remove member"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const target = removing;
          setRemoving(null);
          if (target) {
            await remove(target.user_id);
          }
        }}
      />
      <ConfirmDialog
        open={leaving}
        title="Leave this workspace?"
        message={`You will lose access to ${workspace?.name ?? 'it'} until someone invites you again.`}
        confirmLabel="Leave workspace"
        onCancel={() => setLeaving(false)}
        onConfirm={() => void confirmLeave()}
      />
    </Dialog>
  );
}
