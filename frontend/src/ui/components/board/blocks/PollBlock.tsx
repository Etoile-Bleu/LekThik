import { useId } from 'react';

import { useBoardMeta } from '@hooks/useBoardMeta';
import { announce } from '@lib/announcer';
import { pollConfig } from '@lib/blocks';
import type { BoardList } from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';
import { leaders, sharePercent, votesFor } from '@lib/polls';

import { CheckIcon } from '../../ui/Icons';
import './PollBlock.css';

interface PollBlockProps {
  block: BoardList;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function PollBlock({ block }: PollBlockProps) {
  const ids = useId();
  const config = pollConfig(block);
  const { membersById } = useBoardMeta();
  const tally = useBoardStore((state) =>
    state.view?.polls?.find((entry) => entry.list_id === block.id)
  );
  const castVote = useBoardStore((state) => state.castVote);
  const total = tally?.total ?? 0;
  const mine = tally?.mine ?? null;
  const ahead = leaders(config, tally);

  async function choose(optionId: string) {
    if (config.closed || optionId === mine) return;
    const text = config.options.find((option) => option.id === optionId)?.text ?? '';
    if (await castVote(block.id, optionId)) announce(`Voted for ${text}.`);
  }

  async function withdraw() {
    if (await castVote(block.id, null)) announce('Vote removed.');
  }

  return (
    <div className="poll-block" data-closed={config.closed || undefined}>
      <p className="poll-block__question" id={`${ids}-q`}>
        {config.question}
      </p>
      <div role="radiogroup" aria-labelledby={`${ids}-q`} className="poll-block__options">
        {config.options.map((option) => {
          const votes = votesFor(tally, option.id);
          const share = sharePercent(votes, total);
          const chosen = mine === option.id;
          const names = (
            tally?.voters?.find((entry) => entry.option_id === option.id)?.user_ids ?? []
          )
            .map((id) => membersById.get(id)?.username)
            .filter((name): name is string => Boolean(name));
          return (
            <label
              key={option.id}
              className="poll-block__option"
              data-chosen={chosen || undefined}
              data-leading={ahead.includes(option.id) || undefined}
            >
              <input
                type="radio"
                name={`${ids}-vote`}
                className="poll-block__radio"
                checked={chosen}
                disabled={config.closed}
                onChange={() => void choose(option.id)}
              />
              <span className="poll-block__bar" aria-hidden="true" style={{ width: `${share}%` }} />
              <span className="poll-block__mark" aria-hidden="true">
                {chosen && <CheckIcon size={12} />}
              </span>
              <span className="poll-block__text">{option.text}</span>
              <span className="poll-block__figure">
                {plural(votes, 'vote')}
                <span aria-hidden="true"> · {share}%</span>
                <span className="sr-only">, {share} percent</span>
              </span>
              {names.length > 0 && <span className="poll-block__names">{names.join(', ')}</span>}
            </label>
          );
        })}
      </div>
      <p className="poll-block__foot" role="status">
        <span>
          {plural(total, 'vote')}
          {config.show_voters ? '' : ', anonymous'}
        </span>
        {config.closed ? (
          <span className="poll-block__closed">Closed</span>
        ) : (
          mine !== null && (
            <button type="button" className="poll-block__withdraw" onClick={() => void withdraw()}>
              Remove my vote
            </button>
          )
        )}
      </p>
    </div>
  );
}
