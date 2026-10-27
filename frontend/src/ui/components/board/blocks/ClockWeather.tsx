import { useEffect, useId, useState } from 'react';

import { announce } from '@lib/announcer';
import type { ClockPlace } from '@lib/boardsApi';
import { useEmbedConsent } from '@lib/embedConsent';
import {
  WEATHER_PROVIDER,
  WEATHER_TTL_MS,
  type Weather,
  describeWeather,
  fetchWeather,
  lastWeather,
} from '@lib/weather';

import { ExternalLinkIcon, MoonIcon, SunIcon } from '../../ui/Icons';

interface ClockWeatherProps {
  place: ClockPlace;
  now: Date;
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; weather: Weather }
  | { status: 'failed'; weather: Weather | null };

function stamp(time: number): string {
  return new Date(time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function ClockWeather({ place, now }: ClockWeatherProps) {
  const allowed = useEmbedConsent((state) => state.allowed.open_meteo === true);
  const allow = useEmbedConsent((state) => state.allow);
  const [asked, setAsked] = useState(false);
  const [remember, setRemember] = useState(false);
  const [state, setState] = useState<State>({ status: 'idle' });
  const rememberId = useId();
  const active = asked || allowed;
  const bucket = Math.floor(now.getTime() / WEATHER_TTL_MS);
  const { latitude_centi: latitude, longitude_centi: longitude } = place;

  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    fetchWeather(latitude, longitude, controller.signal)
      .then((weather) => setState({ status: 'ready', weather }))
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: 'failed', weather: lastWeather(latitude, longitude) });
      });
    return () => controller.abort();
  }, [active, latitude, longitude, bucket]);

  if (!active) {
    return (
      <div className="clocks-block__weather clocks-block__weather--asking">
        <p>
          Showing the weather in <strong>{place.name}</strong> asks <strong>Open-Meteo</strong> for
          it. It will receive your IP address and the position {(latitude / 100).toFixed(2)},{' '}
          {(longitude / 100).toFixed(2)}. Nothing has been requested yet.
        </p>
        <button
          type="button"
          className="btn btn--outline btn--sm"
          onClick={() => {
            if (remember) allow('open_meteo');
            setAsked(true);
            announce(`Loading the weather in ${place.name}.`);
          }}
        >
          Show the weather
        </button>
        <div className="clocks-block__remember">
          <input
            id={rememberId}
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <label htmlFor={rememberId}>Remember for Open-Meteo on this device</label>
        </div>
        <a href={WEATHER_PROVIDER.privacyUrl} target="_blank" rel="noopener noreferrer">
          Open-Meteo terms and privacy <ExternalLinkIcon size={12} />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    );
  }

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="clocks-block__weather" role="status" aria-busy="true">
        Loading the weather in {place.name}…
      </div>
    );
  }

  const weather = state.weather;
  if (!weather) {
    return (
      <div className="clocks-block__weather" role="alert">
        The weather in {place.name} could not be loaded.
      </div>
    );
  }

  const words = describeWeather(weather.code);
  const Icon = weather.isDay ? SunIcon : MoonIcon;
  return (
    <div className="clocks-block__weather">
      <p className="sr-only" role="status">
        {`${place.name}: ${weather.temperature} degrees, ${words}. High ${weather.high}, low ${weather.low}.`}
      </p>
      <p className="clocks-block__weather-line" aria-hidden="true">
        <Icon size={20} />
        <span className="clocks-block__degrees">{weather.temperature}°</span>
        <span>{words}</span>
      </p>
      <p className="clocks-block__weather-meta" aria-hidden="true">
        {place.name} · High {weather.high}° · Low {weather.low}°
      </p>
      <p className="clocks-block__weather-meta">
        {state.status === 'failed'
          ? `Could not refresh, showing ${stamp(weather.fetchedAt)}. `
          : `Updated ${stamp(weather.fetchedAt)}. `}
        <a href={WEATHER_PROVIDER.licenseUrl} target="_blank" rel="noopener noreferrer">
          Weather data by Open-Meteo.com
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </div>
  );
}
