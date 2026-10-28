import { useMemo } from 'react';

import { useMinuteClock } from '@hooks/useMinuteClock';
import { clocksConfig } from '@lib/blocks';
import type { BoardList } from '@lib/boardsApi';
import {
  type ClockReading,
  type Slot,
  hourIn,
  hourLabel,
  isKnownZone,
  readClock,
  sharedWindow,
  viewerZone,
  workSlots,
  zoneLabel,
} from '@lib/clocks';

import { GlobeIcon, MoonIcon, SunIcon } from '../../ui/Icons';
import { ClockWeather } from './ClockWeather';
import './ClocksBlock.css';

interface ClocksBlockProps {
  block: BoardList;
  editable: boolean;
  onSetup: (blockId: string) => void;
}

function Row({ clock, index, mine }: { clock: ClockReading; index: number; mine?: boolean }) {
  const Icon = clock.daylight === 'day' ? SunIcon : MoonIcon;
  return (
    <li
      className="clocks-block__row"
      data-daylight={clock.daylight}
      style={{ '--row-index': index } as React.CSSProperties}
    >
      <p className="sr-only">{clock.spoken}</p>
      <div className="clocks-block__where" aria-hidden="true">
        <span className="clocks-block__city">{mine ? 'You' : clock.label}</span>
        <span className="clocks-block__zone">
          {mine ? `${clock.label}, ` : ''}
          {clock.offset}
        </span>
      </div>
      <div className="clocks-block__when" aria-hidden="true">
        <span className="clocks-block__time">{clock.time}</span>
        <span className="clocks-block__date">
          {clock.relative ? `${clock.relative}, ` : ''}
          {clock.date}
        </span>
      </div>
      <span className="clocks-block__daylight" aria-hidden="true">
        <Icon size={15} />
        {clock.daylight === 'day' ? 'Day' : 'Night'}
      </span>
    </li>
  );
}

function Strip({ slots, total, hour }: { slots: Slot[]; total: number; hour: number }) {
  return (
    <div className="clocks-block__strip" aria-hidden="true">
      <div className="clocks-block__cells">
        {slots.map((slot) => (
          <span
            key={slot.hour}
            className="clocks-block__cell"
            data-level={slot.open === total ? 'all' : slot.open > 0 ? 'some' : 'none'}
            data-now={slot.hour === hour || undefined}
          />
        ))}
      </div>
      <div className="clocks-block__ticks">
        {[0, 6, 12, 18].map((tick) => (
          <span key={tick}>{hourLabel(tick)}</span>
        ))}
      </div>
    </div>
  );
}

export function ClocksBlock({ block, editable, onSetup }: ClocksBlockProps) {
  const config = clocksConfig(block);
  const now = useMinuteClock();
  const viewer = useMemo(() => viewerZone(), []);

  const known = config.zones.filter(isKnownZone);
  const unknown = config.zones.filter((zone) => !isKnownZone(zone));
  const clocks = known
    .map((zone) => readClock(zone, now, viewer))
    .filter((clock): clock is ClockReading => clock !== null);
  const mine = readClock(viewer, now, viewer);

  const compared = useMemo(
    () => (known.includes(viewer) ? known : [viewer, ...known]),
    [known.join('|'), viewer] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const slots = useMemo(() => workSlots(compared, now, viewer), [compared, now, viewer]);
  const shared = sharedWindow(slots, compared.length);
  const hourNow = hourIn(viewer, now);

  if (config.zones.length === 0 && !config.place) {
    return (
      <div className="clocks-block clocks-block--empty">
        <GlobeIcon size={26} />
        <p className="clocks-block__empty-title">No place yet</p>
        <p>Add the time zones of your team, and the weather if you like.</p>
        {editable && (
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => onSetup(block.id)}
          >
            Add time zones
          </button>
        )}
      </div>
    );
  }

  const overlap =
    compared.length < 2
      ? null
      : shared
        ? `Everyone is at work from ${hourLabel(shared.from)} to ${hourLabel(shared.to)} your time.`
        : 'No hour is inside 09:00 to 18:00 for everyone.';

  return (
    <div className="clocks-block">
      {config.zones.length > 0 && (
        <ul className="clocks-block__list">
          {mine && !known.includes(viewer) && <Row clock={mine} index={0} mine />}
          {clocks.map((clock, index) => (
            <Row key={clock.zone} clock={clock} index={index + 1} mine={clock.zone === viewer} />
          ))}
          {unknown.map((zone) => (
            <li key={zone} className="clocks-block__row clocks-block__row--unknown">
              <span>{zoneLabel(zone)}: this browser does not know that time zone.</span>
            </li>
          ))}
        </ul>
      )}
      {overlap && (
        <div className="clocks-block__overlap">
          <p className="clocks-block__overlap-text" role="status">
            {overlap}
          </p>
          <Strip slots={slots} total={compared.length} hour={hourNow} />
        </div>
      )}
      {config.place && <ClockWeather place={config.place} now={now} />}
    </div>
  );
}
