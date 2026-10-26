// Phase 1.3 — time zones, midnight/DST, forecast availability, missing values,
// geocoder validation, and request races. All deterministic, no network.
import { interpretWeatherQuestion, applyGeocoderResult } from '../js/nlp.js';
import { analyzeQuestion } from '../js/assistant.js';
import { createRequestGuard, isFresh } from '../js/request-guard.js';
import * as tz from '../js/timezone.js';
import { engine, makeState } from './harness.js';

const daysFrom = (start, count = 7) => {
  const out = [];
  let d = start;
  for (let i = 0; i < count; i++) { out.push(d); d = tz.addDays(d, 1); }
  return out;
};

export function reliabilitySuite(check) {
  // ── Target-location clock, not the browser clock ──
  const afterMidnightIST = makeState({
    now: '2026-09-15T20:15:00Z',            // 01:45 IST on 2026-09-16
    days: daysFrom('2026-09-16'),
    currentTime: '2026-09-16T01:45'
  });
  const local = tz.zonedParts(Date.parse('2026-09-15T20:15:00Z'), 'Asia/Kolkata');
  check(local.date === '2026-09-16' && local.hour === 1, 'target-zone clock: 20:15 UTC is 01:45 next day in Asia/Kolkata');
  check(tz.localToday(afterMidnightIST) === '2026-09-16', 'localToday uses the target location, not UTC');
  const midnightIntent = interpretWeatherQuestion('Rain tomorrow?', afterMidnightIST, { engine });
  check(midnightIntent.date === '2026-09-17' && midnightIntent.dayOffset === 1, 'midnight: "tomorrow" resolves in target local calendar');
  check(/IST/.test(midnightIntent.time.resolvedLabel), 'resolved label states the target time-zone abbreviation');
  check(/\(2026-09-17\)/.test(midnightIntent.time.resolvedLabel), 'resolved label states the resolved ISO date');

  // Date line between a UTC user and an Indian target.
  const utcState = makeState({ now: '2026-09-20T23:30:00Z', days: daysFrom('2026-09-21'), currentTime: '2026-09-21T05:00' });
  const utcIntent = interpretWeatherQuestion('Weather today?', utcState, { engine });
  check(utcIntent.date === '2026-09-21', 'date-line case: local date differs from the UTC date without corrupting offsets');

  // ── DST (America/New_York spring forward 2026-03-08) ──
  const before = tz.zonedParts(Date.parse('2026-03-08T06:30:00Z'), 'America/New_York');
  const after = tz.zonedParts(Date.parse('2026-03-08T07:30:00Z'), 'America/New_York');
  check(before.date === '2026-03-08' && before.hour === 1, 'DST: 06:30 UTC is 01:30 EST before the jump');
  check(after.date === '2026-03-08' && after.hour === 3, 'DST: 07:30 UTC is 03:30 EDT after the jump');
  check(tz.addDays('2026-03-08', 1) === '2026-03-09', 'civil date arithmetic is DST-independent');
  const dstState = makeState({
    now: '2026-03-08T07:30:00Z', timezone: 'America/New_York',
    timezoneAbbreviation: 'EDT', utcOffsetSeconds: -14400,
    days: daysFrom('2026-03-08'), currentTime: '2026-03-08T03:30'
  });
  const dstIntent = interpretWeatherQuestion('Rain tomorrow?', dstState, { engine });
  check(dstIntent.date === '2026-03-09' && /EDT/.test(dstIntent.time.resolvedLabel), 'DST day: relative dates and zone label stay correct');

  // Hourly civil strings: a DST day with a missing 02:00 is handled by the
  // provider's own series, without inventing an hour.
  check(tz.selectHourIndices({
    weather: { hourly: { time: ['2026-03-08T00:00', '2026-03-08T01:00', '2026-03-08T03:00'] }, daily: { time: ['2026-03-08'] }, current: { time: '2026-03-08T00:00' } }
  }, { date: '2026-03-08', startHour: 0, endHour: 24, onlyFuture: false }).indexes.length === 3,
  'DST-shortened day: only provider-supplied civil hours are selected');

  // ── Forecast availability & null values ──
  const state = makeState({ now: '2026-09-15T06:45:00Z' });
  const outOfRange = interpretWeatherQuestion('Rain in ten days?', state, { engine });
  const outAnswer = analyzeQuestion('Rain in ten days?', state, outOfRange);
  check(/2026-09-15 to 2026-09-21/.test(outAnswer.text), 'out-of-range date states the available local date range');
  const nullState = makeState({
    now: '2026-09-15T06:45:00Z',
    hourlyFn: { apparent_temperature: () => null }
  });
  const nullIntent = interpretWeatherQuestion('Feels like tomorrow at 7 PM?', nullState, { engine });
  const nullAnswer = analyzeQuestion('Feels like tomorrow at 7 PM?', nullState, nullIntent);
  check(/unavailable/i.test(nullAnswer.text) && !/NaN|undefined|null°/.test(nullAnswer.text), 'missing forecast values are reported, never defaulted');
  const noData = analyzeQuestion('Rain tomorrow?', { ...state, weather: null }, interpretWeatherQuestion('Rain tomorrow?', state, { engine }));
  check(/don’t have a loaded forecast/.test(noData.text), 'API failure path never invents weather');

  // ── Geocoder validation / ambiguity ──
  const villageIntent = interpretWeatherQuestion('Weather in Rampura, Alwar, Rajasthan', state, { engine });
  const candidates = [
    { name: 'Rampura', region: 'Alwar', state: 'Rajasthan', country: 'India', latitude: 27.1258, longitude: 76.7779, type: 'village' },
    { name: 'Rampura', region: 'Jaipur', state: 'Rajasthan', country: 'India', latitude: 26.7086, longitude: 75.4044, type: 'village' }
  ];
  applyGeocoderResult(villageIntent, candidates);
  check(villageIntent.place.status === 'resolved' && villageIntent.place.resolved.region === 'Alwar', 'district/state context validates a unique village match');

  const dupIntent = interpretWeatherQuestion('Weather in Rampura?', state, { engine });
  applyGeocoderResult(dupIntent, candidates);
  check(dupIntent.place.status === 'ambiguous' && dupIntent.clarification?.choices?.length === 2, 'duplicate village names produce a choice list, never a silent pick');
  check(dupIntent.clarification.choices[0].query === 'select-place:0', 'choice queries select an explicit candidate');

  const missingIntent = interpretWeatherQuestion('Weather in Nowherepur?', state, { engine });
  applyGeocoderResult(missingIntent, []);
  check(missingIntent.place.status === 'not-found' && Boolean(missingIntent.clarification), 'unresolved place is never accepted silently');
  check(missingIntent.unresolved.includes('place'), 'unresolved place is recorded as an unresolved slot');

  // ── Race guard ──
  const guard = createRequestGuard();
  const first = guard.next(), second = guard.next();
  check(!guard.isCurrent(first) && guard.isCurrent(second), 'new request supersedes the previous request id');
  check(!isFresh({ id: first, guard, epochAtStart: 0, currentEpoch: 1 }), 'stale answer is rejected');
  check(isFresh({ id: second, guard, epochAtStart: 1, currentEpoch: 2, expectedEpoch: 2 }), 'current answer with expected location epoch is accepted');
  check(!isFresh({ id: second, guard, epochAtStart: 1, currentEpoch: 3, expectedEpoch: 2 }), 'location changed during request: answer rejected');
  check(!isFresh({ id: second, guard, epochAtStart: 1, currentEpoch: 2, expectedEpoch: 2, aborted: true }), 'aborted request: answer rejected');

  // ── Structured intent is validated and honest ──
  const structured = interpretWeatherQuestion('Rain in London in four days?', state, { engine });
  check(structured.schemaVersion === 2 && structured.confidence > 0 && structured.unresolved.includes('place'), 'intent object carries confidence and unresolved slots');
  check(structured.time.zone === 'Asia/Kolkata' && structured.time.zoneLabel === 'IST', 'intent carries the target time zone');
}

export default reliabilitySuite;
