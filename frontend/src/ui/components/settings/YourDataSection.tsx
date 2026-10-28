import { useState } from 'react';

import { downloadMyData, saveAsFile } from '@lib/accountApi';
import { announce } from '@lib/announcer';
import { notifyError } from '@lib/toastStore';

import { DeleteAccountDialog } from './DeleteAccountDialog';
import './PrivacySection.css';

export function YourDataSection() {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function exportData() {
    setExporting(true);
    try {
      saveAsFile(await downloadMyData(), 'lekthik-my-data.json');
      announce('Your data was downloaded.');
    } catch (error) {
      notifyError(error, 'Your data could not be downloaded.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <p className="privacy__hint">
        Download everything LekThik holds about you as one file: your profile, settings,
        memberships, assigned cards, comments and votes. It never contains your password or any
        token. You can ask for it a few times an hour.
      </p>
      <div className="privacy__actions">
        <button
          type="button"
          className="btn btn--outline btn--sm"
          disabled={exporting}
          onClick={() => void exportData()}
        >
          {exporting ? 'Preparing…' : 'Download my data'}
        </button>
        <button type="button" className="btn btn--danger btn--sm" onClick={() => setDeleting(true)}>
          Delete my account
        </button>
      </div>
      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
    </>
  );
}
