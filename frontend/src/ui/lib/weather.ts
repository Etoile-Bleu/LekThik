export const WEATHER_PROVIDER = {
  name: 'Open-Meteo',
  company: 'Open-Meteo',
  privacyUrl: 'https://open-meteo.com/en/terms',
  licenseUrl: 'https://open-meteo.com/en/license',
} as const;

export const WEATHER_TTL_MS = 15 * 60 * 1000;
export const PLACE_QUERY_MAX = 60;

export interface Weather {
  temperature: number;
  code: number;
  isDay: boolean;
  high: number;
  low: number;
  fetchedAt: number;
}

export interface FoundPlace {
  name: string;
  latitude_centi: number;
  longitude_centi: number;
  detail: string;
}

const CONDITIONS: Array<[number[], string]> = [
  [[0], 'Clear sky'],
  [[1], 'Mostly clear'],
  [[2], 'Partly cloudy'],
  [[3], 'Overcast'],
  [[45, 48], 'Fog'],
  [[51, 53, 55], 'Drizzle'],
  [[56, 57], 'Freezing drizzle'],
  [[61], 'Light rain'],
  [[63], 'Rain'],
  [[65], 'Heavy rain'],
  [[66, 67], 'Freezing rain'],
  [[71], 'Light snow'],
  [[73], 'Snow'],
  [[75], 'Heavy snow'],
  [[77], 'Snow grains'],
  [[80], 'Light showers'],
  [[81], 'Showers'],
  [[82], 'Heavy showers'],
  [[85, 86], 'Snow showers'],
  [[95], 'Thunderstorm'],
  [[96, 99], 'Thunderstorm with hail'],
];

export function describeWeather(code: number): string {
  return CONDITIONS.find(([codes]) => codes.includes(code))?.[1] ?? 'Unknown conditions';
}

function degrees(centi: number): string {
  return (centi / 100).toFixed(2);
}

export function forecastUrl(latitudeCenti: number, longitudeCenti: number): string {
  const params = new URLSearchParams({
    latitude: degrees(latitudeCenti),
    longitude: degrees(longitudeCenti),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '1',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

export function geocodeUrl(query: string): string {
  const params = new URLSearchParams({
    name: query.trim().slice(0, PLACE_QUERY_MAX),
    count: '5',
    language: 'en',
    format: 'json',
  });
  return `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseForecast(data: unknown, now: number): Weather | null {
  if (!isRecord(data) || !isRecord(data.current) || !isRecord(data.daily)) return null;
  const { temperature_2m: temperature, weather_code: code, is_day: day } = data.current;
  const high = Array.isArray(data.daily.temperature_2m_max)
    ? data.daily.temperature_2m_max[0]
    : null;
  const low = Array.isArray(data.daily.temperature_2m_min)
    ? data.daily.temperature_2m_min[0]
    : null;
  if (!finite(temperature) || !finite(code) || !finite(day) || !finite(high) || !finite(low)) {
    return null;
  }
  return {
    temperature: Math.round(temperature),
    code,
    isDay: day === 1,
    high: Math.round(high),
    low: Math.round(low),
    fetchedAt: now,
  };
}

export function parsePlaces(data: unknown): FoundPlace[] {
  if (!isRecord(data) || !Array.isArray(data.results)) return [];
  const found: FoundPlace[] = [];
  for (const entry of data.results) {
    if (!isRecord(entry)) continue;
    const { name, latitude, longitude, admin1, country } = entry;
    if (typeof name !== 'string' || !finite(latitude) || !finite(longitude)) continue;
    const clean = name
      .replace(/\p{Cc}/gu, ' ')
      .trim()
      .slice(0, 60);
    if (clean === '' || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const detail = [admin1, country]
      .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
      .map((part) => part.replace(/\p{Cc}/gu, ' ').trim())
      .join(', ');
    found.push({
      name: clean,
      latitude_centi: Math.round(latitude * 100),
      longitude_centi: Math.round(longitude * 100),
      detail,
    });
  }
  return found;
}

const cache = new Map<string, Weather>();

export function cachedWeather(
  latitudeCenti: number,
  longitudeCenti: number,
  now: number
): Weather | null {
  const hit = cache.get(`${latitudeCenti},${longitudeCenti}`);
  return hit && now - hit.fetchedAt < WEATHER_TTL_MS ? hit : null;
}

export function lastWeather(latitudeCenti: number, longitudeCenti: number): Weather | null {
  return cache.get(`${latitudeCenti},${longitudeCenti}`) ?? null;
}

export function clearWeatherCache() {
  cache.clear();
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`);
  return response.json();
}

export async function fetchWeather(
  latitudeCenti: number,
  longitudeCenti: number,
  signal?: AbortSignal
): Promise<Weather> {
  const now = Date.now();
  const fresh = cachedWeather(latitudeCenti, longitudeCenti, now);
  if (fresh) return fresh;

  const weather = parseForecast(
    await getJson(forecastUrl(latitudeCenti, longitudeCenti), signal),
    now
  );
  if (!weather) throw new Error('Open-Meteo sent something unexpected');
  cache.set(`${latitudeCenti},${longitudeCenti}`, weather);
  return weather;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<FoundPlace[]> {
  if (query.trim().length < 2) return [];
  return parsePlaces(await getJson(geocodeUrl(query), signal));
}
