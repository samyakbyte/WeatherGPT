import {
  AIR_QUALITY_ENDPOINT, AIR_QUALITY_TTL_MS, AIR_QUALITY_VARIABLES,
  AirQualityError, buildAirQualityURL, createAirQualityClient,
  parseAirQualityResponse, selectAirQualityFrame, validAirCoordinates
} from '../js/air-quality.js';

const location = { name: 'Jaipur', latitude: 26.9, longitude: 75.8 };
const fixture = (values = {}) => ({
  latitude: 26.875, longitude: 75.75, elevation: 431,
  timezone: 'Asia/Kolkata', timezone_abbreviation: 'IST', utc_offset_seconds: 19800,
  hourly_units: Object.fromEntries(AIR_QUALITY_VARIABLES.map(k => [k, 'μg/m³'])),
  hourly: {
    time: ['2026-10-29T09:00', '2026-10-29T10:00', '2026-10-29T11:00'],
    sulphur_dioxide: [1.2, 2.3, 3.4], nitrogen_dioxide: [4.5, 5.6, 6.7],
    pm2_5: [7.8, 8.9, 9.1], pm10: [10.2, 11.3, 12.4], ozone: [13.5, 14.6, 15.7],
    ...values
  }
});
const response = (body = fixture(), status = 200, retry = '') => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: name => name.toLowerCase() === 'retry-after' ? retry : null },
  json: async () => body
});
const defer = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

export async function airQualitySuite(check) {
  const url = new URL(buildAirQualityURL(location.latitude, location.longitude));
  check(url.origin + url.pathname === AIR_QUALITY_ENDPOINT, 'air-quality API uses the documented Open-Meteo endpoint');
  check(url.searchParams.get('latitude') === '26.900' && url.searchParams.get('longitude') === '75.800', 'coordinates are validated and bounded to three decimals');
  check(url.searchParams.get('hourly') === AIR_QUALITY_VARIABLES.join(','), 'request contains documented SO₂, NO₂, PM2.5, PM10 and ozone hourly fields');
  check(url.searchParams.get('forecast_days') === '2' && url.searchParams.get('timezone') === 'auto', 'request horizon and local-time parameters are explicit and bounded');
  check(!validAirCoordinates(null, null) && !validAirCoordinates('', 10) && !validAirCoordinates(91, 0) && !validAirCoordinates(0, -181), 'missing and out-of-range coordinates are rejected, not coerced to zero');
  let invalidThrown = false;
  try { buildAirQualityURL(null, 0); } catch (error) { invalidThrown = error instanceof AirQualityError; }
  check(invalidThrown, 'invalid requests fail before any network call');

  const parsed = parseAirQualityResponse(fixture(), location);
  check(parsed.source === 'Open-Meteo Air Quality API' && parsed.dataType === 'modeled-forecast', 'normalized response retains provider and modeled-data provenance');
  check(parsed.hourly.sulphur_dioxide[1] === 2.3 && parsed.hourly.pm2_5[1] === 8.9 && parsed.units.ozone === 'μg/m³', 'provider pollutant values and units are preserved');
  check(parsed.modelGrid.latitude === 26.875 && parsed.modelGrid.longitude === 75.75 && parsed.requested.latitude === 26.9, 'requested coordinates remain distinct from returned model-grid coordinates');
  const sparse = parseAirQualityResponse(fixture({ pm10: [null, '', 'not-a-number'] }), location);
  check(sparse.hourly.pm10.every(value => value === null), 'missing and malformed pollutant samples stay unavailable rather than becoming zero');
  let malformedRejected = false;
  try { parseAirQualityResponse({ hourly: { time: ['not-a-time'] } }, location); } catch { malformedRejected = true; }
  check(malformedRejected, 'malformed provider timestamps produce a controlled data error');
  const frame = selectAirQualityFrame(parsed, '2026-10-29T10:38');
  check(frame?.index === 1 && frame.time === '2026-10-29T10:00' && frame.values.ozone === 14.6, 'frame selection uses the closest available earlier provider timestamp');

  let now = 1000, calls = 0;
  const client = createAirQualityClient({ now: () => now, ttlMs: AIR_QUALITY_TTL_MS, fetchFn: async () => { calls++; return response(); } });
  const first = await client.get(location);
  const cached = await client.get(location);
  check(calls === 1 && first.cacheHit === false && cached.cacheHit === true, 'successful requests are cached and matching requests are deduplicated by URL');
  check(cached.hourly !== first.hourly && cached.hourly.pm2_5[0] === 7.8, 'cache consumers receive separate normalized data objects');
  now += AIR_QUALITY_TTL_MS + 1;
  await client.get(location);
  check(calls === 2, 'expired successful cache entries are refreshed');
  await client.get(location, { force: true });
  check(calls === 3, 'manual refresh can bypass a valid cache entry');

  const pending = defer(); let sharedCalls = 0;
  const sharedClient = createAirQualityClient({ fetchFn: () => { sharedCalls++; return pending.promise; } });
  const abortOne = new AbortController();
  const sharedFirst = sharedClient.get(location, { signal: abortOne.signal });
  const sharedSecond = sharedClient.get(location);
  abortOne.abort();
  const abortedResult = await Promise.allSettled([sharedFirst]);
  pending.resolve(response());
  const sharedValue = await sharedSecond;
  check(sharedCalls === 1 && abortedResult[0].reason?.name === 'AbortError' && sharedValue.hourly.pm2_5[1] === 8.9, 'one cancelled subscriber does not cancel another subscriber’s shared request');

  let restartCalls = 0;
  const restartClient = createAirQualityClient({ fetchFn: (requestUrl, { signal }) => {
    restartCalls++;
    if (restartCalls === 1) return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
    return Promise.resolve(response());
  } });
  const cancel = new AbortController();
  const canceled = restartClient.get(location, { signal: cancel.signal });
  cancel.abort();
  const replacement = await restartClient.get(location);
  const canceledOutcome = await Promise.allSettled([canceled]);
  check(restartCalls === 2 && replacement.hourly.pm2_5[0] === 7.8 && canceledOutcome[0].reason?.name === 'AbortError', 'a new selection never joins an already-aborted stale flight');

  const rateLimited = createAirQualityClient({ fetchFn: async () => response({}, 429, '17') });
  let rateError;
  try { await rateLimited.get(location); } catch (error) { rateError = error; }
  check(rateError?.status === 429 && rateError.retryAfterMs === 17000, 'HTTP 429 and Retry-After are surfaced for UI cooldown handling');
  const serverError = createAirQualityClient({ fetchFn: async () => response({}, 503) });
  let unavailable;
  try { await serverError.get(location); } catch (error) { unavailable = error; }
  check(unavailable?.status === 503 && unavailable instanceof AirQualityError, 'provider HTTP errors become controlled, typed failures');

  let timedOut;
  const timeoutClient = createAirQualityClient({ timeoutMs: 5, fetchFn: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })) });
  try { await timeoutClient.get(location); } catch (error) { timedOut = error; }
  check(timedOut?.status === 408 && /too long/i.test(timedOut.message), 'bounded provider timeout reports a retryable user-facing failure');

  let boundedCalls = 0;
  const bounded = createAirQualityClient({ maxCacheEntries: 2, fetchFn: async () => { boundedCalls++; return response(); } });
  await bounded.get(location);
  await bounded.get({ ...location, latitude: 27.001 });
  await bounded.get({ ...location, latitude: 28.001 });
  check(bounded.cacheSize() === 2 && boundedCalls === 3, 'successful response cache has a strict maximum size');
  return 22;
}
