// Phase 4 — forecast-derived hazards, sourced vs general guidance, assistant
// integration, missing data, unsupported crops, Hindi, no invented doses.
import { computeHazards } from '../js/hazards.js';
import { buildAdvisories, advisoryText, answerCropQuestion } from '../js/advisory.js';
import { ENTRIES, SOURCES, getGuidance, CROP_KB_VERSION } from '../data/crops.js';
import { HAZARD_THRESHOLDS } from '../data/hazard-thresholds.js';
import { interpretWeatherQuestion } from '../js/nlp.js';
import { analyzeQuestion } from '../js/assistant.js';
import { engine, makeState } from './harness.js';

const NO_HAZARD = {
  hourlyValues: { precipitation: 0, precipitation_probability: 0, relative_humidity_2m: 50, uv_index: 2, cloud_cover: 40, wind_speed_10m: 5, wind_gusts_10m: 6, temperature_2m: 26 },
  dailyValues: { temperature_2m_max: 30, temperature_2m_min: 18, precipitation_sum: 4, wind_gusts_10m_max: 10, wind_speed_10m_max: 8, weather_code: 0, uv_index_max: 3 }
};
const stateWithFarm = (overrides = {}, farm = { name: 'North field', crop: 'wheat', stage: 'flowering', drainage: 'poor', latitude: 26.9, longitude: 75.8 }) =>
  ({ ...makeState({ now: '2026-09-15T06:45:00Z', ...overrides }), farm });

export function advisorySuite(check) {
  // ── Hazard engine ──
  const calm = computeHazards(stateWithFarm(NO_HAZARD));
  check(calm.hazards.length === 0, `no-hazard forecast produces no hazard (got ${calm.hazards.map(h => h.kind).join(',')})`);

  const heavy = computeHazards(stateWithFarm({ ...NO_HAZARD, hourlyValues: { ...NO_HAZARD.hourlyValues, precipitation: 12 } }));
  check(heavy.hazards.some(h => h.kind === 'heavyRain' && h.value >= 20), 'heavy rain is computed from hourly precipitation totals');
  check(heavy.hazards.find(h => h.kind === 'heavyRain').detail.includes('mm'), 'heavy-rain hazard states its numbers and units');
  const heat = computeHazards(stateWithFarm({ ...NO_HAZARD, dailyValues: { ...NO_HAZARD.dailyValues, temperature_2m_max: 42 } }));
  check(heat.hazards.some(h => h.kind === 'heat' && h.severity === 'WARNING'), 'heat hazard uses configured daily-max thresholds');
  const frost = computeHazards(stateWithFarm({ ...NO_HAZARD, dailyValues: { ...NO_HAZARD.dailyValues, temperature_2m_min: 0 }, hourlyValues: { ...NO_HAZARD.hourlyValues, cloud_cover: 20, relative_humidity_2m: 60 } }));
  check(frost.hazards.some(h => h.kind === 'frost'), 'frost-risk screening combines minimum temperature with night cloud/humidity');
  check(/not a frost forecast/i.test(frost.hazards.find(h => h.kind === 'frost').detail), 'frost screening explicitly says it is not a frost forecast');
  const wind = computeHazards(stateWithFarm({ ...NO_HAZARD, dailyValues: { ...NO_HAZARD.dailyValues, wind_gusts_10m_max: 70 } }));
  check(wind.hazards.some(h => h.kind === 'wind'), 'strong-wind hazard is computed from forecast gusts');
  const dry = computeHazards(stateWithFarm({ ...NO_HAZARD, dailyValues: { ...NO_HAZARD.dailyValues, precipitation_sum: 0 } }));
  check(dry.hazards.some(h => h.kind === 'drySpell' && h.value >= HAZARD_THRESHOLDS.drySpell.days), 'consecutive dry days are counted from daily precipitation');
  const humid = computeHazards(stateWithFarm({ ...NO_HAZARD, hourlyValues: { ...NO_HAZARD.hourlyValues, relative_humidity_2m: 90 } }));
  check(humid.hazards.some(h => h.kind === 'humid' && h.value >= HAZARD_THRESHOLDS.humid.hours), 'prolonged humid spell is counted from hourly humidity');
  check(/not a disease diagnosis/i.test(humid.hazards.find(h => h.kind === 'humid').detail), 'humid spell does not claim to diagnose disease');

  const nulls = computeHazards(stateWithFarm({ ...NO_HAZARD, hourlyFn: { precipitation: () => null, relative_humidity_2m: () => null } }));
  check(!nulls.hazards.some(h => h.kind === 'heavyRain' || h.kind === 'humid') && nulls.notes.length >= 2, 'missing values are reported, never defaulted into hazards');
  check(computeHazards({ weather: null }).hazards.length === 0, 'no forecast means no hazards');

  // ── Knowledge base honesty ──
  check(CROP_KB_VERSION === 1 && ENTRIES.length > 50, 'versioned knowledge base covers nine crops and hazards');
  check(ENTRIES.filter(e => e.kind === 'sourced').every(e => SOURCES[e.source]?.url?.startsWith('https://')), 'every sourced entry points at a source we recorded');
  check(ENTRIES.filter(e => e.kind === 'general').every(e => /no crop-specific source/i.test(e.sourceNote)), 'general entries are explicitly labelled as unsourced');
  const allText = ENTRIES.map(e => e.en + ' ' + e.hi).join(' ');
  check(!/@\s*\d|kg\s*\/\s*ha|ml\s*\/\s*L|g\s*\/\s*litre|dose\s*@/i.test(allText), 'knowledge base contains no pesticide/fertiliser dose or rate');
  const unknown = getGuidance('dragonfruit', null, 'heavyRain');
  check(unknown.cropKnown === false && /generic fallback/i.test(unknown.general.sourceNote), 'unsupported crop uses a clearly labelled generic fallback');

  // ── Advisory output: four parts, calculated vs sourced separated ──
  const heavyState = stateWithFarm({ ...NO_HAZARD, hourlyValues: { ...NO_HAZARD.hourlyValues, precipitation: 12 } });
  const advisories = buildAdvisories(heavyState, { language: 'en', crop: 'wheat', stage: 'flowering' });
  const a = advisories.find(x => x.hazard === 'heavyRain');
  check(Boolean(a), 'heavy-rain advisory is produced for the active farm');
  check(/mm/.test(a.expected.en) && /grid cell/.test(a.expected.en), 'part 1 states numbers, window and the grid-cell caveat');
  check(/wheat/i.test(a.why.en) && /flowering/i.test(a.why.en), 'part 2 explains why this crop and stage may be affected');
  check(a.actions.some(x => x.kind === 'sourced') && a.actions.some(x => x.kind === 'general'), 'part 3 keeps sourced and general precautions visibly distinct');
  check(/Open-Meteo/.test(a.evidence.en) && /KVK/.test(a.limitations.en), 'part 4 cites the calculation source, guidance sources and limits');
  const text = advisoryText(a, 'en');
  check(/1\. What weather/.test(text) && /2\. Why/.test(text) && /3\. What to do/.test(text) && /4\. Evidence/.test(text), 'advisory text is structured into four numbered parts');
  const hi = buildAdvisories(heavyState, { language: 'hi', crop: 'wheat', stage: 'flowering' });
  check(/[ऀ-ॿ]/.test(advisoryText(hi[0], 'hi')), 'Hindi advisory is in Devanagari');
  check(advisories.every(x => x.needs.includes('stage') === false), 'known growth stage removes the request for stage details');

  // ── Assistant integration ──
  const claimIntent = interpretWeatherQuestion('I grow wheat near this village. Heavy rain is forecast tomorrow. What should I do to protect my crop?', heavyState, { engine });
  check(claimIntent.topic === 'crop', 'crop question is recognised as a crop intent');
  const claimAnswer = analyzeQuestion(claimIntent.original, heavyState, claimIntent);
  check(/matches the forecast/.test(claimAnswer.text), 'assistant verifies the user’s heavy-rain claim against the real forecast');
  check(/wheat/i.test(claimAnswer.text), 'assistant uses the active farm / named crop');
  const falseClaim = answerCropQuestion('Heavy rain is forecast; what about my wheat?', { ...claimIntent, language: 'en' }, stateWithFarm(NO_HAZARD));
  check(/does not show heavy rain/.test(falseClaim.text), 'assistant says so when the forecast does not support a heavy-rain claim');
  const noHazard = answerCropQuestion('What should I do for my wheat?', { ...claimIntent, language: 'en' }, stateWithFarm(NO_HAZARD));
  check(/No configured forecast hazard/.test(noHazard.text), 'no-hazard scenario gives an honest no-hazard answer');
  const noCrop = answerCropQuestion('What should I do?', { ...claimIntent, language: 'en', canonical: 'what should i do' }, makeState({ now: '2026-09-15T06:45:00Z' }));
  check(/Choose an active farm|tell me the crop/.test(noCrop.text), 'missing crop asks a short question instead of inventing advice');
  const missingWeather = answerCropQuestion('Heavy rain and wheat advice', { ...claimIntent, language: 'en' }, { ...heavyState, weather: null });
  check(/No forecast is loaded/.test(missingWeather.text), 'missing forecast blocks crop advice');
  const unknownCrop = answerCropQuestion('I grow dragonfruit. Heavy rain tomorrow.', { ...claimIntent, language: 'en', canonical: 'i grow dragonfruit heavy rain tomorrow' }, heavyState);
  check(/generic fallback/.test(unknownCrop.text), 'unsupported crop is answered with the labelled generic fallback');
  const hindiCrop = interpretWeatherQuestion('मेरी गेहूँ की फसल के लिए भारी बारिश में सलाह दो', heavyState, { engine });
  const hindiAnswer = analyzeQuestion(hindiCrop.original, heavyState, hindiCrop);
  check(hindiAnswer.language === 'hi' && /[ऀ-ॿ]/.test(hindiAnswer.text), 'Hindi crop question gets a Hindi answer');
}
