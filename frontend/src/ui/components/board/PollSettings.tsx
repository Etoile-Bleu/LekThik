import { useId } from 'react';

import type { PollConfig } from '@lib/boardsApi';
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  newOptionId,
} from '@lib/polls';

import { TrashIcon } from '../ui/Icons';
import { Switch } from '../ui/Switch';
import './PollSettings.css';

interface PollSettingsProps {
  value: PollConfig;
  voted: boolean;
  problem: string | null;
  onChange: (changes: Partial<PollConfig>) => void;
}

export function PollSettings({ value, voted, problem, onChange }: PollSettingsProps) {
  const ids = useId();

  function rename(optionId: string, text: string) {
    onChange({
      options: value.options.map((option) =>
        option.id === optionId ? { ...option, text } : option
      ),
    });
  }

  return (
    <div className="poll-settings">
      <div className="field">
        <label htmlFor={`${ids}-question`}>Question</label>
        <input
          id={`${ids}-question`}
          value={value.question}
          maxLength={POLL_QUESTION_MAX}
          autoComplete="off"
          onChange={(event) => onChange({ question: event.target.value })}
        />
      </div>

      <fieldset className="poll-settings__options">
        <legend>Options</legend>
        {value.options.map((option, index) => (
          <div className="poll-settings__option" key={option.id}>
            <input
              aria-label={`Option ${index + 1}`}
              value={option.text}
              maxLength={POLL_OPTION_MAX}
              autoComplete="off"
              onChange={(event) => rename(option.id, event.target.value)}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove option ${index + 1}`}
              disabled={value.options.length <= POLL_MIN_OPTIONS}
              onClick={() =>
                onChange({ options: value.options.filter((entry) => entry.id !== option.id) })
              }
            >
              <TrashIcon />
            </button>
          </div>
        ))}
        {value.options.length < POLL_MAX_OPTIONS && (
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() =>
              onChange({
                options: [
                  ...value.options,
                  {
                    id: newOptionId(value.options.map((option) => option.id)),
                    text: `Option ${value.options.length + 1}`,
                  },
                ],
              })
            }
          >
            Add an option
          </button>
        )}
        {voted && (
          <p className="poll-settings__hint">
            Removing an option also removes the votes it received.
          </p>
        )}
      </fieldset>

      <Switch
        label="Show who voted"
        hint={
          voted
            ? 'Locked, because votes are already in. It would change what people agreed to.'
            : 'Names appear under each option. Otherwise votes stay anonymous. Fixed after the first vote.'
        }
        checked={value.show_voters}
        disabled={voted}
        onChange={(show_voters) => onChange({ show_voters })}
      />
      <Switch
        label="Close the poll"
        hint="Nobody can vote or change a vote. The results stay."
        checked={value.closed}
        onChange={(closed) => onChange({ closed })}
      />
      {problem && <p className="poll-settings__problem">{problem}</p>}
    </div>
  );
}
