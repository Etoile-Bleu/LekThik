import { type FormEvent, useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { type BlockingWorkspace, blockingWorkspaces, deleteAccount } from '@lib/accountApi';
import { ApiError } from '@lib/api';
import { useAuthStore } from '@lib/authStore';
import { notifyError } from '@lib/toastStore';

import { Dialog } from '../ui/Dialog';
import './DeleteAccountDialog.css';

interface DeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

export function DeleteAccountDialog({ open, onClose }: DeleteAccountDialogProps) {
  const ids = useId();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const clearUser = useAuthStore((state) => state.clearUser);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [blocking, setBlocking] = useState<BlockingWorkspace[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmation('');
      setPassword('');
      setBlocking([]);
      setAgreed(false);
      setProblem(null);
    }
  }, [open]);

  const typedRight = confirmation.trim() === (user?.username ?? '');
  const ready = typedRight && password !== '' && (blocking.length === 0 || agreed) && !busy;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setProblem(null);
    try {
      await deleteAccount({
        password,
        confirmation: confirmation.trim(),
        delete_owned_workspaces: agreed,
      });
      clearUser();
      navigate('/');
    } catch (error) {
      const list = blockingWorkspaces(error);
      if (list.length > 0) {
        setBlocking(list);
        setAgreed(false);
      } else if (error instanceof ApiError && (error.status === 403 || error.status === 400)) {
        setProblem(error.status === 403 ? 'That password is not right.' : error.message);
      } else {
        notifyError(error, 'The account could not be deleted.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Delete my account" size="md">
      <form className="delete-account" onSubmit={(event) => void submit(event)} noValidate>
        <h2 className="delete-account__title">Delete my account</h2>
        <p className="delete-account__lead">
          This cannot be undone. Your login, settings, memberships, assignments and poll votes are
          removed. Comments and history you wrote stay for your team, without your name.
        </p>

        {blocking.length > 0 && (
          <div className="delete-account__warning" role="alert">
            <p>
              <strong>You still own workspaces that other people use:</strong>
            </p>
            <ul>
              {blocking.map((workspace) => (
                <li key={workspace.id}>
                  {workspace.name}, with {workspace.other_members}{' '}
                  {workspace.other_members === 1 ? 'other member' : 'other members'}
                </li>
              ))}
            </ul>
            <label className="delete-account__agree">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              <span>
                Delete these workspaces too, with every board, card and comment in them. Their
                members lose access for good.
              </span>
            </label>
          </div>
        )}

        <div className="field">
          <label htmlFor={`${ids}-name`}>
            Type your username <strong>{user?.username}</strong> to confirm
          </label>
          <input
            id={`${ids}-name`}
            value={confirmation}
            autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${ids}-password`}>Your password</label>
          <input
            id={`${ids}-password`}
            type="password"
            value={password}
            autoComplete="current-password"
            aria-invalid={problem ? true : undefined}
            onChange={(event) => setPassword(event.target.value)}
          />
          {problem && (
            <p className="delete-account__problem" role="alert">
              {problem}
            </p>
          )}
        </div>

        <div className="delete-account__actions">
          <button type="button" className="btn btn--outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--danger" disabled={!ready}>
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
