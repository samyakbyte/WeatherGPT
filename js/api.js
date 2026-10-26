// Public, authorization-free providers only. Never put private API keys here.
const cache = new Map();
const TTL = 10 * 60 * 1000;
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
export const DEFAULT_LOCATION = { name: 'New Delhi', country: 'India', latitude: 28.6139, longitude: 77.209, timezone: 'Asia/Kolkata' };

export async function requestJSON(url, { signal, ttl = TTL } = {}) {
  const existing = cache.get(url);
  if (existing && Date.now() - existing.time < ttl) return existing.data;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(response.status === 429 ? 'The weather service is busy. Please wait a minute and retry.' : 'The data provider could not complete this request. Please retry.');
    const data = await response.json();
    if (data.error) throw new Error('The weather provider could not return data for this location.');
    cache.set(url, { data, time: Date.now() });
    if (cache.size > 70) cache.delete(cache.keys().next().value);
    return data;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error.name === 'AbortError') throw new Error('The weather service took too long to respond. Please try again.');
    if (error instanceof TypeError) throw new Error('Unable to reach the weather service. Check your connection and retry.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
export function validCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}
export async function fetchWeather(location, signal) {
  if (!validCoordinates(location.latitude, location.longitude)) throw new Error('Choose a valid location first.');
  const params = new URLSearchParams({
    latitude: location.latitude, longitude: location.longitude, timezone: 'auto', forecast_days: '7',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,surface_pressure,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,visibility,uv_index,wind_speed_10m,wind_direction_10m,cloud_cover',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max'
  });
  const data = await requestJSON(`${WEATHER_URL}?${params}`, { signal });
  if (!data.current || !data.hourly?.time?.length || !data.daily?.time?.length) throw new Error('The forecast is incomplete. Please try another location or retry.');
  return { ...data, fetchedAt: Date.now() };
}
export async function searchLocations(query, signal) {
  const clean = query.trim().slice(0, 100);
  const coords = clean.match(/^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/);
  if (coords) {
    const latitude = Number(coords[1]), longitude = Number(coords[2]);
    if (!validCoordinates(latitude, longitude)) throw new Error('Use latitude −90 to 90 and longitude −180 to 180.');
    return [{ name: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`, country: 'Map coordinates', latitude, longitude }];
  }
  if (clean.length < 2) return [];
  const params = new URLSearchParams({ name: clean, count: '7', language: 'en', format: 'json' });
  const data = await requestJSON(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal, ttl: 3600000 });
  return (data.results || []).map(p => ({ name: p.name, country: p.country || '', region: p.admin1 || '', latitude: p.latitude, longitude: p.longitude, timezone: p.timezone }));
}
export async function fetchSamples(points, signal) {
  const params = new URLSearchParams({
    latitude: points.map(p => p.lat.toFixed(3)).join(','), longitude: points.map(p => p.lng.toFixed(3)).join(','),
    current: 'temperature_2m,relative_humidity_2m,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m', timezone: 'GMT', forecast_days: '1'
  });
  const data = await requestJSON(`${WEATHER_URL}?${params}`, { signal, ttl: 15 * 60 * 1000 });
  const result = Array.isArray(data) ? data : [data];
  return result.map((p, i) => ({ ...points[i], current: p.current })).filter(p => p.current);
}
export async function fetchRadar(signal) {
  const data = await requestJSON('https://api.rainviewer.com/public/weather-maps.json', { signal, ttl: 5 * 60 * 1000 });
  const host = new URL(data.host);
  if (host.protocol !== 'https:' || !host.hostname.endsWith('.rainviewer.com')) throw new Error('Unexpected radar provider address.');
  const frames = [ ...(data.radar?.past || []).map(f => ({ ...f, future: false })), ...(data.radar?.nowcast || []).map(f => ({ ...f, future: true })) ].filter(f => Number.isFinite(f.time) && /^\/v2\/radar\/[a-zA-Z0-9_\/-]+$/.test(f.path));
  if (!frames.length) throw new Error('No radar frames are available from the provider.');
  return { host: host.origin, frames, generated: data.generated };
}
export function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
