import { usePrefsStore } from '@lib/prefsStore';

import { CheckIcon } from '../ui/Icons';
import './SaveStatus.css';

const COPY = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved to your account',
  error: 'Could not save, your changes still apply on this device',
} as const;

/**
 * Settings save by themselves, so the page says so and says when it worked.
 * One save model for the whole page, as the design systems advise.
 */
export function SaveStatus() {
  const state = usePrefsStore((store) => store.saveState);

  return (
    <p className="save-status" data-state={state} role="status" aria-live="polite">
      {state === 'saved' && <CheckIcon size={14} />}
      {COPY[state]}
    </p>
  );
}
