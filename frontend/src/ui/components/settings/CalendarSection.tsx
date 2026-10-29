import { useEffect, useState } from 'react';

import { announce } from '@lib/announcer';
import {
  calendarFeedUrl,
  fetchCalendarToken,
  regenerateCalendarToken,
  revokeCalendarToken,
} from '@lib/calendarApi';
import { notifyError, notifySuccess } from '@lib/toastStore';

import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CheckIcon, CopyIcon } from '../ui/Icons';
import { Switch } from '../ui/Switch';
import './PrivacySection.css';
import './CalendarSection.css';

/**
 * A private .ics address of this person's assigned cards, for a calendar app to subscribe to.
 * Off by default, and opening this page never turns it on by itself: only the switch does that,
 * the same rule every other choice in Privacy follows.
 */
export function CalendarSection() {
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingNew, setConfirmingNew] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCalendarToken()
      .then((found) => {
        if (!cancelled) setToken(found);
      })
      .catch((error: unknown) => notifyError(error, 'Could not check your calendar feed.'))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      setToken(await regenerateCalendarToken());
      announce('Calendar feed turned on.');
    } catch (error) {
      notifyError(error, 'The calendar feed could not be turned on.');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await revokeCalendarToken();
      setToken(null);
      announce('Calendar feed turned off.');
    } catch (error) {
      notifyError(error, 'The calendar feed could not be turned off.');
    } finally {
      setBusy(false);
    }
  }

  async function makeNewAddress() {
    setConfirmingNew(false);
    setBusy(true);
    try {
      setToken(await regenerateCalendarToken());
      notifySuccess('New calendar address made. The old one no longer works.');
    } catch (error) {
      notifyError(error, 'A new address could not be made.');
    } finally {
      setBusy(false);
    }
  }

  async function copyAddress() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(calendarFeedUrl(token));
      notifySuccess('Calendar address copied.');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      notifyError(new Error('The address could not be copied.'));
    }
  }

  return (
    <div className="calendar-feed">
      <p className="privacy__hint">
        A private web address of your assigned cards that have a due date, one all day event each,
        for a calendar app to check on its own. Cards with no due date are left out.
      </p>

      <div className="setting-row setting-row--toggle">
        <Switch
          label="Calendar feed"
          hint={
            token
              ? 'On. Anyone with the address below can read the titles and dates of your assigned cards.'
              : 'Off. Nothing is shared until you turn this on.'
          }
          checked={token !== null}
          disabled={!loaded || busy}
          onChange={(on) => void (on ? turnOn() : turnOff())}
        />
      </div>

      <div className="calendar-feed__panel" data-open={token !== null}>
        <div className="calendar-feed__panel-inner">
          {token && (
            <>
              <div className="calendar-feed__address">
                <label className="calendar-feed__address-label" htmlFor="calendar-feed-url">
                  Feed address
                </label>
                <div className="calendar-feed__address-row">
                  <input
                    id="calendar-feed-url"
                    className="calendar-feed__address-input"
                    type="text"
                    readOnly
                    value={calendarFeedUrl(token)}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => void copyAddress()}
                  >
                    {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                    Copy
                  </button>
                </div>
              </div>

              <div className="privacy__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() => setConfirmingNew(true)}
                >
                  New address
                </button>
              </div>

              <details className="calendar-feed__help">
                <summary>Add it to your calendar app</summary>
                <ul className="privacy__list">
                  <li>
                    <strong>Google Calendar:</strong> Other calendars, the plus button, &ldquo;From
                    URL&rdquo;, paste the address.
                  </li>
                  <li>
                    <strong>Apple Calendar:</strong> File, &ldquo;New Calendar Subscription&rdquo;,
                    paste the address.
                  </li>
                  <li>
                    <strong>Outlook:</strong> Add calendar, &ldquo;Subscribe from web&rdquo;, paste
                    the address.
                  </li>
                </ul>
              </details>

              <p className="privacy__hint">
                Treat this address like a password: anyone who has it can read your assigned cards
                until you press <strong>New address</strong>, which replaces it at once. It is never
                shown to anyone else.
              </p>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmingNew}
        title="Make a new address?"
        message="Whatever calendar app is reading the current address stops seeing updates until you give it the new one."
        confirmLabel="Make a new address"
        onCancel={() => setConfirmingNew(false)}
        onConfirm={() => void makeNewAddress()}
      />
    </div>
  );
}
