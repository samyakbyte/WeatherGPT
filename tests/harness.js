// Deterministic test harness. No network, no real clock, no browser globals.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
export const engine = require('../js/vendor/compromise.js');

export const FIXTURE_DAYS = Array.from({ length: 7 }, (_, i) => `2026-09-${15 + i}`);

/**
 * Build a frozen forecast state. `now` is an absolute instant (ISO with Z); when
 * supplied it drives "today" through the location's IANA time zone. When absent
 * the provider-style current.time is used, matching the legacy 43-test fixture.
 */
export function makeState(overrides = {}) {
  const days = overrides.days || FIXTURE_DAYS;
  const times = days.flatMap(d => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`));
  const hourly = { time: times };
  const base = {
    temperature_2m: 28, apparent_temperature: 30, relative_humidity_2m: 65,
    precipitation_probability: 40, precipitation: 1, weather_code: 61,
    wind_speed_10m: 12, wind_direction_10m: 90, visibility: 10000,
    uv_index: 4, cloud_cover: 50
  };
  for (const [k, v] of Object.entries({ ...base, ...(overrides.hourlyValues || {}) })) {
    hourly[k] = times.map((_, i) => overrides.hourlyFn?.[k] ? overrides.hourlyFn[k](i, times[i]) : v);
  }
  const daily = { time: days };
  const dailyBase = {
    temperature_2m_max: 32, temperature_2m_min: 23, precipitation_sum: 4,
    precipitation_probability_max: 40, weather_code: 61,
    wind_speed_10m_max: 18, wind_gusts_10m_max: 25, uv_index_max: 6,
    apparent_temperature_max: 34
  };
  for (const [k, v] of Object.entries({ ...dailyBase, ...(overrides.dailyValues || {}) })) daily[k] = days.map(() => v);
  if (overrides.maxTomorrow !== undefined) daily.temperature_2m_max[1] = overrides.maxTomorrow;
  daily.sunrise = days.map(d => d + 'T06:00');
  daily.sunset = days.map(d => d + 'T18:00');
  const current = {
    time: overrides.currentTime || days[0] + 'T12:15', temperature_2m: 29,
    apparent_temperature: 31, wind_speed_10m: 12, wind_direction_10m: 90,
    weather_code: 61, is_day: 1, pressure_msl: 1009, relative_humidity_2m: 65,
    cloud_cover: 50, precipitation: 0, wind_gusts_10m: 20, uv_index: 4
  };
  const weather = overrides.weather === null ? null : {
    current, hourly, daily, timezone: overrides.timezone || 'Asia/Kolkata',
    timezone_abbreviation: overrides.timezoneAbbreviation || 'IST',
    utc_offset_seconds: overrides.utcOffsetSeconds ?? 19800,
    latitude: overrides.gridLatitude ?? 26.875, longitude: overrides.gridLongitude ?? 75.75,
    elevation: overrides.elevation ?? 431, fetchedAt: Date.parse(overrides.now || '2026-09-15T06:45:00Z')
  };
  return {
    prefs: { language: overrides.language || 'en', temperature: 'celsius', wind: 'kmh' },
    location: { name: overrides.locationName || 'Jaipur', country: 'India', region: 'Rajasthan', latitude: 26.9, longitude: 75.8, timezone: overrides.timezone || 'Asia/Kolkata' },
    weather,
    now: overrides.now || null,
    farm: overrides.farm || null,
    ...(overrides.extra || {})
  };
}

export function createRunner(label = '') {
  let passed = 0, failed = 0;
  const failures = [];
  const check = (value, name) => {
    if (value) { passed++; }
    else { failed++; failures.push(name); console.error('[FAIL]', name); }
  };
  return {
    check,
    result: () => ({ label, passed, failed, failures }),
    print: () => console.log(`[${label}] ${passed} passed, ${failed} failed`)
  };
}
