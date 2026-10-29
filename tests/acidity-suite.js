// Phase 3 — honest unavailability, user-provided readings, three separate concepts.
import * as acidity from '../js/acidity.js';
import { analyzeQuestion } from '../js/assistant.js';
import { interpretWeatherQuestion } from '../js/nlp.js';
import { engine, makeState } from './harness.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: k => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), _map: map };
}

export function aciditySuite(check) {
  check(acidity.acidityHTML('en').includes(acidity.ACIDITY_UNAVAILABLE), 'UI shows the exact unavailability message');
  check(!/\b\d\.\d\b/.test(acidity.acidityHTML('en').split('</p>')[0]), 'no pH number appears in the sourced-data area');
  check(Object.keys(acidity.CONCEPTS).join(',') === 'rainwater,soil,irrigation', 'rainwater pH, soil pH and irrigation water are three separate concepts');
  check(acidity.acidityHTML('en').includes('Three different things'), 'UI explains the three separate concepts');
  check(acidity.validateReading({ value: 5.6, date: '2026-10-26', method: 'pH meter' })?.value === 5.6, 'a valid user reading is accepted');
  check(acidity.validateReading({ value: 15, date: '2026-10-26' }) === null, 'pH above 14 is rejected');
  check(acidity.validateReading({ value: -1, date: '2026-10-26' }) === null, 'negative pH is rejected');
  check(acidity.validateReading({ value: 6, date: '26/10/2026' }) === null, 'a reading without an ISO measurement date is rejected');
  check(acidity.validateReading({ value: 6, date: '2026-02-31' }) === null, 'an impossible calendar date is rejected');
  const storage = memoryStorage();
  const added = acidity.addReading([], { value: 6.2, date: '2026-10-26', method: 'test strip', notes: 'after first shower' }, storage);
  check(added.readings.length === 1 && added.reading.method === 'test strip', 'user reading is stored with method and date');
  check(acidity.loadReadings(storage)[0].value === 6.2, 'readings survive a reload from device storage');
  check(acidity.acidityHTML('en', added.readings).includes('User-provided readings'), 'user readings are labelled separately');
  check(acidity.deleteReading(added.readings, added.reading.id, storage).length === 0, 'a user reading can be deleted');
  check(acidity.loadReadings(memoryStorageWith('{bad json')).length === 0, 'corrupted reading storage is ignored safely');

  // The assistant must never derive pH from weather proxies.
  const state = makeState();
  const intent = interpretWeatherQuestion('What is the rainwater pH here?', state, { engine });
  const answer = analyzeQuestion('What is the rainwater pH here?', state, intent);
  check(answer.text.startsWith(acidity.ACIDITY_UNAVAILABLE), 'assistant returns the exact unavailability message');
  check(!/5\.6|4\.8|AQI|SO2|NOx/i.test(answer.text), 'no derived or invented pH value, no pollution-proxy inference');
  check(!/lime|gypsum|sulphur|soil treatment/i.test(answer.text), 'no soil treatment is recommended from rainwater acidity');
}

function memoryStorageWith(value) {
  return { getItem: () => value, setItem: () => {}, removeItem: () => {} };
}
