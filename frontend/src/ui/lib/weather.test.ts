import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WEATHER_TTL_MS,
  cachedWeather,
  clearWeatherCache,
  describeWeather,
  fetchWeather,
  forecastUrl,
  geocodeUrl,
  lastWeather,
  parseForecast,
  parsePlaces,
  searchPlaces,
} from './weather';

const forecast = {
  latitude: 48.853382,
  longitude: 2.355208,
  current: { time: '2026-10-27T16:00', temperature_2m: 16.4, weather_code: 80, is_day: 1 },
  daily: { time: ['2026-10-27'], temperature_2m_max: [16.5], temperature_2m_min: [10.6] },
};

afterEach(() => {
  clearWeatherCache();
  vi.unstubAllGlobals();
});

describe('addresses', () => {
  it('send rounded coordinates and nothing else about a person', () => {
    const url = new URL(forecastUrl(4886, 235));

    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('48.86');
    expect(url.searchParams.get('longitude')).toBe('2.35');
    expect([...url.searchParams.keys()].sort()).toEqual([
      'current',
      'daily',
      'forecast_days',
      'latitude',
      'longitude',
      'timezone',
    ]);
    expect(new URL(forecastUrl(-3350, -7010)).searchParams.get('longitude')).toBe('-70.10');
  });

  it('encode the place that is searched for and cap its length', () => {
    const url = new URL(geocodeUrl('  Saint-Étienne & co/../x  '));

    expect(url.origin).toBe('https://geocoding-api.open-meteo.com');
    expect(url.searchParams.get('name')).toBe('Saint-Étienne & co/../x');
    expect(new URL(geocodeUrl('a'.repeat(500))).searchParams.get('name')).toHaveLength(60);
  });
});

describe('conditions', () => {
  it('are written in words, and unknown codes are said to be unknown', () => {
    expect(describeWeather(0)).toBe('Clear sky');
    expect(describeWeather(80)).toBe('Light showers');
    expect(describeWeather(99)).toBe('Thunderstorm with hail');
    expect(describeWeather(1234)).toBe('Unknown conditions');
  });
});

describe('parseForecast', () => {
  it('reads what Open-Meteo sends and rounds the degrees', () => {
    expect(parseForecast(forecast, 5)).toEqual({
      temperature: 16,
      code: 80,
      isDay: true,
      high: 17,
      low: 11,
      fetchedAt: 5,
    });
  });

  it('refuses anything that is not the expected shape', () => {
    for (const bad of [
      null,
      'text',
      [],
      {},
      { current: {}, daily: {} },
      { ...forecast, current: { ...forecast.current, temperature_2m: '16' } },
      { ...forecast, current: { ...forecast.current, weather_code: null } },
      { ...forecast, daily: { temperature_2m_max: [], temperature_2m_min: [10] } },
      { ...forecast, daily: { temperature_2m_max: [Infinity], temperature_2m_min: [10] } },
    ]) {
      expect(parseForecast(bad, 0)).toBeNull();
    }
  });
});

describe('parsePlaces', () => {
  it('keeps a name, a rounded position and where it is', () => {
    const places = parsePlaces({
      results: [
        {
          name: 'Nancy',
          latitude: 48.68439,
          longitude: 6.18496,
          admin1: 'Grand Est',
          country: 'France',
        },
        { name: 'Nancy', latitude: 38.0, longitude: -85.0 },
      ],
    });

    expect(places).toEqual([
      { name: 'Nancy', latitude_centi: 4868, longitude_centi: 618, detail: 'Grand Est, France' },
      { name: 'Nancy', latitude_centi: 3800, longitude_centi: -8500, detail: '' },
    ]);
  });

  it('skips results that are odd and survives a reply with no results', () => {
    expect(parsePlaces({})).toEqual([]);
    expect(parsePlaces(null)).toEqual([]);
    expect(
      parsePlaces({
        results: [
          null,
          { name: 5, latitude: 1, longitude: 1 },
          { name: 'Far', latitude: 91, longitude: 0 },
          { name: '  ', latitude: 1, longitude: 1 },
          { name: 'Okay\u0007Place', latitude: 1.234, longitude: 2.345 },
        ],
      })
    ).toEqual([{ name: 'Okay Place', latitude_centi: 123, longitude_centi: 235, detail: '' }]);
  });
});

describe('fetching', () => {
  function stub(body: unknown, ok = true, status = 200) {
    const fetcher = vi.fn().mockResolvedValue({ ok, status, json: async () => body });
    vi.stubGlobal('fetch', fetcher);
    return fetcher;
  }

  it('asks for no cookies and no referrer, and keeps the answer for fifteen minutes', async () => {
    const fetcher = stub(forecast);

    const first = await fetchWeather(4886, 235);
    const again = await fetchWeather(4886, 235);

    expect(first.temperature).toBe(16);
    expect(again).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    expect(cachedWeather(4886, 235, first.fetchedAt + WEATHER_TTL_MS + 1)).toBeNull();
    expect(lastWeather(4886, 235)).toBe(first);
  });

  it('fails clearly when the provider errs or sends nonsense', async () => {
    stub({}, false, 503);
    await expect(fetchWeather(1, 1)).rejects.toThrow(/503/);

    stub({ unexpected: true });
    await expect(fetchWeather(2, 2)).rejects.toThrow(/unexpected/);
    expect(lastWeather(2, 2)).toBeNull();
  });

  it('searches places only for a few letters or more', async () => {
    const fetcher = stub({ results: [{ name: 'Nancy', latitude: 48.68, longitude: 6.18 }] });

    expect(await searchPlaces('n')).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await searchPlaces('Nancy'))[0].name).toBe('Nancy');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
