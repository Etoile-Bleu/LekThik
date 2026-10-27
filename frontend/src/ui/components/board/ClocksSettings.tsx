import { type FormEvent, useId, useMemo, useState } from 'react';

import { announce } from '@lib/announcer';
import type { ClocksConfig } from '@lib/boardsApi';
import { MAX_ZONES, isKnownZone, supportedZones, viewerZone, zoneLabel } from '@lib/clocks';
import { type FoundPlace, PLACE_QUERY_MAX, WEATHER_PROVIDER, searchPlaces } from '@lib/weather';

import { CloseIcon } from '../ui/Icons';
import './ClocksSettings.css';

interface ClocksSettingsProps {
  value: ClocksConfig;
  onChange: (changes: Partial<ClocksConfig>) => void;
}

export function ClocksSettings({ value, onChange }: ClocksSettingsProps) {
  const ids = useId();
  const [zone, setZone] = useState('');
  const [zoneProblem, setZoneProblem] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<FoundPlace[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchProblem, setSearchProblem] = useState<string | null>(null);
  const zones = value.zones ?? [];
  const options = useMemo(() => supportedZones(), []);

  function addZone(name: string) {
    const wanted = name.trim();
    if (wanted === '') {
      setZoneProblem('Type a city or pick a time zone from the list.');
    } else if (!isKnownZone(wanted)) {
      setZoneProblem('This browser does not know that time zone. Pick one from the list.');
    } else if (zones.includes(wanted)) {
      setZoneProblem(`${zoneLabel(wanted)} is already there.`);
    } else if (zones.length >= MAX_ZONES) {
      setZoneProblem(`At most ${MAX_ZONES} time zones.`);
    } else {
      onChange({ zones: [...zones, wanted] });
      setZone('');
      setZoneProblem(null);
      announce(`${zoneLabel(wanted)} added.`);
      return;
    }
  }

  function removeZone(name: string) {
    onChange({ zones: zones.filter((entry) => entry !== name) });
    announce(`${zoneLabel(name)} removed.`);
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) {
      setSearchProblem('Type at least two letters.');
      return;
    }
    setSearching(true);
    setSearchProblem(null);
    try {
      const places = await searchPlaces(query);
      setFound(places);
      announce(places.length === 0 ? 'No place found.' : `${places.length} places found.`);
    } catch {
      setFound(null);
      setSearchProblem('The search could not be done. Try again later.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="clocks-settings">
      <fieldset className="clocks-settings__group">
        <legend>Time zones</legend>
        <ul className="clocks-settings__chips">
          {zones.map((entry) => (
            <li key={entry}>
              <span>{zoneLabel(entry)}</span>
              <button type="button" onClick={() => removeZone(entry)}>
                <CloseIcon size={12} />
                <span className="sr-only">Remove {zoneLabel(entry)}</span>
              </button>
            </li>
          ))}
          {zones.length === 0 && <li className="clocks-settings__none">None yet.</li>}
        </ul>
        <div className="clocks-settings__add">
          <label htmlFor={`${ids}-zone`} className="sr-only">
            Time zone
          </label>
          <input
            id={`${ids}-zone`}
            type="text"
            list={`${ids}-zones`}
            value={zone}
            placeholder="Europe/Paris"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={zoneProblem ? true : undefined}
            aria-describedby={zoneProblem ? `${ids}-zone-problem` : undefined}
            onChange={(event) => {
              setZone(event.target.value);
              setZoneProblem(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addZone(zone);
              }
            }}
          />
          <datalist id={`${ids}-zones`}>
            {options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => addZone(zone)}>
            Add
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => addZone(viewerZone())}
          >
            My time zone
          </button>
        </div>
        {zoneProblem && (
          <p id={`${ids}-zone-problem`} className="clocks-settings__problem" role="alert">
            {zoneProblem}
          </p>
        )}
        <p className="block-settings__hint">
          Up to {MAX_ZONES}. Summer time is followed on its own, the clocks never need a change.
        </p>
      </fieldset>

      <fieldset className="clocks-settings__group">
        <legend>Weather (optional)</legend>
        {value.place ? (
          <p className="clocks-settings__place">
            <strong>{value.place.name}</strong>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                onChange({ place: null });
                announce('Weather removed.');
              }}
            >
              Remove the weather
            </button>
          </p>
        ) : (
          <p className="block-settings__hint">No place chosen, so no weather is shown.</p>
        )}
        <form className="clocks-settings__add" onSubmit={(event) => void search(event)}>
          <label htmlFor={`${ids}-place`} className="sr-only">
            Search for a place
          </label>
          <input
            id={`${ids}-place`}
            type="text"
            value={query}
            maxLength={PLACE_QUERY_MAX}
            placeholder="Nancy"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" className="btn btn--outline btn--sm" disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
        <p className="block-settings__hint">
          Searching sends what you type and your IP address to {WEATHER_PROVIDER.name}, run by{' '}
          {WEATHER_PROVIDER.company}. Only a position rounded to about a kilometre is kept in the
          block.
        </p>
        {searchProblem && (
          <p className="clocks-settings__problem" role="alert">
            {searchProblem}
          </p>
        )}
        {found && found.length === 0 && <p className="block-settings__hint">No place found.</p>}
        {found && found.length > 0 && (
          <ul className="clocks-settings__results">
            {found.map((place) => (
              <li key={`${place.name}-${place.latitude_centi}-${place.longitude_centi}`}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({
                      place: {
                        name: place.name,
                        latitude_centi: place.latitude_centi,
                        longitude_centi: place.longitude_centi,
                      },
                    });
                    setFound(null);
                    setQuery('');
                    announce(`${place.name} chosen for the weather.`);
                  }}
                >
                  <strong>{place.name}</strong>
                  {place.detail && <span>{place.detail}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </div>
  );
}
