import * as agriculture from '../js/agriculture.js';
import { makeDemoState, demoScenario, DEMO_SCENARIOS } from '../js/demo.js';
import { addReading, READINGS_KEY } from '../js/acidity.js';

const time = Array.from({ length: 7 }, (_, i) => { const date = new Date(Date.UTC(2026, 9, 29 + i)); return date.toISOString().slice(0, 10); });
function weather(overrides = {}) {
  return {
    current: { time: `${time[0]}T12:00`, temperature_2m: 30, relative_humidity_2m: 55, wind_speed_10m: 10, precipitation: 0, pressure_msl: 1012, weather_code: 1 },
    hourly: { time: time.flatMap(date => Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`)), relative_humidity_2m: Array(168).fill(55) },
    daily: {
      time, temperature_2m_max: Array(7).fill(30), temperature_2m_min: Array(7).fill(18),
      precipitation_sum: Array(7).fill(2), wind_gusts_10m_max: Array(7).fill(18), weather_code: Array(7).fill(1)
    }, timezone: 'Asia/Kolkata', ...overrides
  };
}
const state = data => ({ weather: data, location: { name: 'Jaipur', latitude: 26.9, longitude: 75.8 }, farm: null });

export function agricultureSuite(check) {
  const calm = weather({ hourly: { time: time.flatMap(date => Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`)), relative_humidity_2m: Array(168).fill(null) } });
  const good = agriculture.calculateSuitability(calm, 'tomato');
  check(good.score === 90, 'suitability is deterministic and weighted from available factors');
  check(good.dataCoverage === 85, 'missing humidity hours are excluded and coverage is transparent');
  check(good.note.includes('not crop health'), 'suitability disclaims crop-health interpretation');
  check(agriculture.calculateSuitability(null, 'tomato').score === null, 'missing forecast produces no suitability score');
  check(agriculture.evaluateDay(weather({ daily: { ...calm.daily, temperature_2m_max: [44, 30, 30, 30, 30, 30, 30] } }), 0, { crop: 'tomato' }).events[0].kind === 'heat', '44°C forecast triggers a heat screening event');
  const rain = weather({ daily: { ...calm.daily, precipitation_sum: [75, 2, 2, 2, 2, 2, 2] } });
  check(agriculture.evaluateDay(rain, 0, { crop: 'wheat' }).events.some(e => e.kind === 'heavyRain'), 'heavy rainfall triggers a screening event');
  check(agriculture.evaluateSevenDays(calm).length === 7, 'risk view is based on seven forecast days');
  check(agriculture.suitabilityFactorRows(good, 'hi').some(row => row.label === 'तापमान'), 'factor explanations include Hindi labels');
  check(agriculture.suitabilityFactorRows(good, 'hi').some(row => row.status === 'सामान्य स्क्रीनिंग सीमा'), 'factor statuses are localized in Hindi');
  check(agriculture.suitabilityClassification('Monitor conditions', 'hi') === 'स्थितियों पर निगरानी रखें', 'suitability classifications are localized in Hindi');
  check(agriculture.buildAgriculturalAlerts({}).suitability.score === null, 'no weather cannot imply a LOW risk or score');

  const base = { location: { name: 'Jaipur', latitude: 26.9, longitude: 75.8 }, farm: null, weather: calm };
  const acidity = makeDemoState('acid-rain', base, new Date('2026-10-29T12:00:00Z'));
  const heat = makeDemoState('extreme-heat', base, new Date('2026-10-29T12:00:00Z'));
  const downpour = makeDemoState('heavy-rain', base, new Date('2026-10-29T12:00:00Z'));
  const normal = makeDemoState('normal', base, new Date('2026-10-29T12:00:00Z'));
  check(DEMO_SCENARIOS.length === 4 && DEMO_SCENARIOS.every(key => !!demoScenario(key)), 'all four named demo scenarios are registered');
  check(acidity.simulated && acidity.pHReading.value === 4.2 && acidity.pHReading.recordType === 'simulated', 'acid-rain scenario is simulated and explicitly marked');
  check(heat.crop === 'tomato' && heat.weather.daily.temperature_2m_max[0] === 44 && heat.weather.simulated, 'heat demo uses a synthetic 44°C tomato forecast');
  check(downpour.crop === 'wheat' && downpour.weather.daily.precipitation_sum[0] === 75, 'heavy-rain demo uses a synthetic wheat forecast');
  check(normal.weather.simulated && normal.weather.daily.precipitation_sum[0] === 2, 'normal scenario is still identified as simulated');
  check(makeDemoState('not-a-scenario', base) === null, 'unknown demo key does not invent a scenario');

  const memory = new Map();
  const storage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  const before = storage.getItem(READINGS_KEY);
  const added = addReading([], { value: 4.2, date: '2026-10-29', latitude: 26.9, longitude: 75.8 }, storage);
  check(!added.error && storage.getItem(READINGS_KEY) !== before, 'only a user action writes a reading into pH persistence');
  check(!JSON.stringify(added.readings).includes('demo-acid-rain'), 'demo fixtures do not get mixed into user-recorded readings');
}
