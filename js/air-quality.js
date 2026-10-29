// Open-Meteo Air Quality API client. Every returned concentration is a
// forecast/model grid estimate, never a ground-station observation.
export const AIR_QUALITY_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';
export const AIR_QUALITY_SOURCE = 'Open-Meteo Air Quality API';
export const AIR_QUALITY_TTL_MS = 15 * 60 * 1000;
export const AIR_QUALITY_VARIABLES = Object.freeze([
  'sulphur_dioxide', 'nitrogen_dioxide', 'pm2_5', 'pm10', 'ozone'
]);

export const POLLUTANTS = Object.freeze({
  sulphur_dioxide: { en: 'Sulfur dioxide (SO₂)', hi: 'सल्फर डाइऑक्साइड (SO₂)', short: 'SO₂', color: '#bd7d3e' },
  nitrogen_dioxide: { en: 'Nitrogen dioxide (NO₂)', hi: 'नाइट्रोजन डाइऑक्साइड (NO₂)', short: 'NO₂', color: '#a45b52' },
  pm2_5: { en: 'PM2.5', hi: 'PM2.5', short: 'PM2.5', color: '#7867a7' },
  pm10: { en: 'PM10', hi: 'PM10', short: 'PM10', color: '#438c8a' },
  ozone: { en: 'Ozone (O₃)', hi: 'ओज़ोन (O₃)', short: 'O₃', color: '#527d9b' }
});

export class AirQualityError extends Error {
  constructor(message, { status = 0, retryAfterMs = 0 } = {}) {
    super(message);
    this.name = 'AirQualityError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const isFiniteNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const abortError = () => new DOMException('Air-quality request was cancelled.', 'AbortError');
const copyAirQualityData = data => ({
  ...data,
  hourly: Object.fromEntries(Object.entries(data.hourly).map(([key, values]) => [key, [...values]])),
  units: { ...data.units }, requested: { ...data.requested }, modelGrid: { ...data.modelGrid }
});

export function validAirCoordinates(latitude, longitude) {
  const supplied = value => value !== null && value !== undefined && value !== '';
  return supplied(latitude) && supplied(longitude) && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) &&
    Number(latitude) >= -90 && Number(latitude) <= 90 &&
    Number(longitude) >= -180 && Number(longitude) <= 180;
}

/** Stable 3-decimal request coordinates keep repeat requests/cache keys bounded. */
export function buildAirQualityURL(latitude, longitude) {
  if (!validAirCoordinates(latitude, longitude)) throw new AirQualityError('Choose a valid location before loading atmospheric data.');
  const params = new URLSearchParams({
    latitude: Number(latitude).toFixed(3),
    longitude: Number(longitude).toFixed(3),
    hourly: AIR_QUALITY_VARIABLES.join(','),
    forecast_days: '2',
    timezone: 'auto'
  });
  return `${AIR_QUALITY_ENDPOINT}?${params}`;
}

/** Normalize provider arrays without substituting zero for absent measurements. */
export function parseAirQualityResponse(raw, requested = {}) {
  if (!raw || typeof raw !== 'object' || raw.error) {
    throw new AirQualityError('Atmospheric data is unavailable for this location.');
  }
  const times = raw.hourly?.time;
  if (!Array.isArray(times) || !times.length || times.some(t => typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t))) {
    throw new AirQualityError('The atmospheric provider returned no usable hourly timestamps.');
  }
  const hourly = { time: times.slice() };
  for (const key of AIR_QUALITY_VARIABLES) {
    const values = raw.hourly?.[key];
    hourly[key] = times.map((_, i) => Array.isArray(values) && isFiniteNumber(values[i]) ? Number(values[i]) : null);
  }
  const modelLatitude = isFiniteNumber(raw.latitude) && Number(raw.latitude) >= -90 && Number(raw.latitude) <= 90 ? Number(raw.latitude) : null;
  const modelLongitude = isFiniteNumber(raw.longitude) && Number(raw.longitude) >= -180 && Number(raw.longitude) <= 180 ? Number(raw.longitude) : null;
  return {
    hourly,
    units: Object.fromEntries(AIR_QUALITY_VARIABLES.map(key => [key, String(raw.hourly_units?.[key] || '')])),
    requested: {
      latitude: Number(requested.latitude), longitude: Number(requested.longitude), name: String(requested.name || '')
    },
    modelGrid: { latitude: modelLatitude, longitude: modelLongitude, elevation: isFiniteNumber(raw.elevation) ? Number(raw.elevation) : null },
    timezone: String(raw.timezone || ''),
    timezoneAbbreviation: String(raw.timezone_abbreviation || ''),
    utcOffsetSeconds: isFiniteNumber(raw.utc_offset_seconds) ? Number(raw.utc_offset_seconds) : null,
    source: AIR_QUALITY_SOURCE,
    dataType: 'modeled-forecast',
    fetchedAt: Date.now()
  };
}

/** Pick the closest provider hourly frame to a target local timestamp. */
export function selectAirQualityFrame(data, targetTime = '') {
  const times = data?.hourly?.time || [];
  if (!times.length) return null;
  const target = typeof targetTime === 'string' && targetTime ? targetTime.slice(0, 13) : '';
  let index = target ? times.findIndex(t => t.slice(0, 13) === target) : -1;
  if (index < 0 && target) {
    index = times.reduce((best, t, i) => {
      if (t.slice(0, 13) <= target && (best < 0 || t.slice(0, 13) > times[best].slice(0, 13))) return i;
      return best;
    }, -1);
  }
  if (index < 0) index = 0;
  return {
    index, time: times[index], values: Object.fromEntries(AIR_QUALITY_VARIABLES.map(key => [key, data.hourly[key]?.[index] ?? null]))
  };
}

/**
 * Small single-consumer-friendly client with URL-keyed TTL cache and shared
 * in-flight requests. One aborted caller does not cancel another subscriber.
 */
export function createAirQualityClient({
  fetchFn = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  ttlMs = AIR_QUALITY_TTL_MS,
  timeoutMs = 16000,
  maxCacheEntries = 48
} = {}) {
  const cache = new Map();
  const flights = new Map();

  function startFlight(url, requested) {
    const controller = new AbortController();
    const entry = { controller, subscribers: 0, settled: false, promise: null };
    entry.promise = (async () => {
      let timer, timedOut = false;
      try {
        timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        const response = await fetchFn(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (response.status === 429) {
          const seconds = Number(response.headers?.get?.('Retry-After'));
          throw new AirQualityError('The air-quality service is busy. Please wait briefly, then retry.', { status: 429, retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60000 });
        }
        if (!response.ok) throw new AirQualityError(response.status === 400 ? 'The air-quality provider does not support this location or request.' : 'The air-quality provider could not complete this request.', { status: response.status });
        let raw;
        try { raw = await response.json(); } catch { throw new AirQualityError('The air-quality provider returned an unreadable response.'); }
        const data = parseAirQualityResponse(raw, requested);
        data.fetchedAt = now();
        cache.set(url, { data, time: now() });
        while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value);
        return data;
      } catch (error) {
        if (timedOut) throw new AirQualityError('Atmospheric data took too long to load. Retry when the connection is available.', { status: 408 });
        if (error?.name === 'AbortError') throw error;
        if (error instanceof AirQualityError) throw error;
        if (error instanceof TypeError) throw new AirQualityError('Unable to reach the air-quality service. Check the connection and retry.');
        throw new AirQualityError(error?.message || 'Atmospheric data is temporarily unavailable.');
      } finally {
        clearTimeout(timer);
        entry.settled = true;
        if (flights.get(url) === entry) flights.delete(url);
      }
    })();
    flights.set(url, entry);
    return entry;
  }

  function subscribe(entry, signal) {
    if (signal?.aborted) return Promise.reject(abortError());
    entry.subscribers++;
    let settled = false;
    const release = () => {
      entry.subscribers = Math.max(0, entry.subscribers - 1);
      if (!entry.settled && entry.subscribers === 0) entry.controller.abort();
    };
    return new Promise((resolve, reject) => {
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        release();
        fn(value);
      };
      const onAbort = () => finish(reject, abortError());
      signal?.addEventListener('abort', onAbort, { once: true });
      entry.promise.then(value => finish(resolve, value), error => finish(reject, error));
    });
  }

  async function get(location, { signal, force = false } = {}) {
    if (signal?.aborted) throw abortError();
    const url = buildAirQualityURL(location?.latitude, location?.longitude);
    const existing = cache.get(url);
    if (!force && existing && now() - existing.time < ttlMs) return { ...copyAirQualityData(existing.data), cacheHit: true };
    let entry = flights.get(url);
    if (entry && (entry.controller.signal.aborted || entry.settled)) {
      if (flights.get(url) === entry) flights.delete(url);
      entry = null;
    }
    if (!entry) entry = startFlight(url, { latitude: Number(location.latitude), longitude: Number(location.longitude), name: location.name || '' });
    const data = await subscribe(entry, signal);
    return { ...copyAirQualityData(data), cacheHit: false };
  }

  return { get, clearCache: () => cache.clear(), cacheSize: () => cache.size, inFlightCount: () => flights.size };
}

const defaultClient = createAirQualityClient();
export const fetchAirQuality = (location, options) => defaultClient.get(location, options);
export const clearAirQualityCache = () => defaultClient.clearCache();
export default { fetchAirQuality, createAirQualityClient, buildAirQualityURL, parseAirQualityResponse, selectAirQualityFrame, POLLUTANTS };
