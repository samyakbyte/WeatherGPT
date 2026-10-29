// Explainable, deterministic weather screening. The numeric score is a
// configurable engineering indicator, NOT crop health, yield, damage, or a
// crop-specific agronomic threshold. Rainwater pH is monitoring context only.
import { HAZARD_THRESHOLDS as T } from '../data/hazard-thresholds.js';
import { CROP_LABELS, HAZARD_LABELS, getGuidance } from '../data/crops.js';
import { computeHazards } from './hazards.js';
import { buildAdvisories } from './advisory.js';
import { classifyPH } from './acidity.js';

export const SUITABILITY_WEIGHTS = Object.freeze({ temperature: 0.4, rainfall: 0.3, wind: 0.15, humidity: 0.15 });
const present = v => v !== null && v !== undefined && Number.isFinite(Number(v));
const n = v => Number(v);
const mapSeverity = s => s === 'SEVERE' ? 'SEVERE' : s === 'WARNING' ? 'HIGH' : s === 'WATCH' ? 'MODERATE' : 'LOW';
const cropLabel = (crop, lang = 'en') => CROP_LABELS[crop]?.[lang] || CROP_LABELS[crop]?.en || crop || (lang === 'hi' ? 'फसल चुनें' : 'Select a crop');
const hazardLabel = (kind, lang = 'en') => HAZARD_LABELS[kind]?.[lang] || HAZARD_LABELS[kind]?.en || kind;

const FACTOR_TEXT = {
  temperature: { en: 'Temperature', hi: 'तापमान' }, rainfall: { en: 'Rainfall', hi: 'वर्षा' },
  wind: { en: 'Wind', hi: 'हवा', }, humidity: { en: 'Humidity', hi: 'आर्द्रता' }
};

function temperatureFactor(max, min) {
  if (!present(max) && !present(min)) return null;
  let score = 90, status = 'Suitable screening range', reason = 'No configured heat/cold screening threshold crossed.';
  if (present(max)) {
    const v = n(max);
    if (v >= T.heat.severe) { score = Math.min(score, 15); status = 'Severe heat screen'; reason = `Daily maximum ${v.toFixed(1)}°C is at/above the configured ${T.heat.severe}°C severe screening threshold.`; }
    else if (v >= T.heat.warning) { score = Math.min(score, 35); status = 'High heat screen'; reason = `Daily maximum ${v.toFixed(1)}°C is at/above the configured ${T.heat.warning}°C warning threshold.`; }
    else if (v >= T.heat.watch) { score = Math.min(score, 60); status = 'Heat watch'; reason = `Daily maximum ${v.toFixed(1)}°C is at/above the configured ${T.heat.watch}°C watch threshold.`; }
  }
  if (present(min)) {
    const v = n(min);
    if (v <= T.cold.frostTemperature) { score = Math.min(score, 25); status = 'Very cold screen'; reason += ` Daily minimum ${v.toFixed(1)}°C is at/below ${T.cold.frostTemperature}°C; this is not a frost forecast.`; }
    else if (v <= T.cold.watch) { score = Math.min(score, 55); status = 'Cold watch'; reason += ` Daily minimum ${v.toFixed(1)}°C is at/below the ${T.cold.watch}°C cold-screen threshold.`; }
  }
  return { score, status, reason, value: `${present(min) ? n(min).toFixed(1) : '—'}–${present(max) ? n(max).toFixed(1) : '—'} °C` };
}

function rainfallFactor(value) {
  if (!present(value)) return null;
  const mm = n(value);
  const score = mm >= T.heavyRain.severe24 ? 15 : mm >= T.heavyRain.warning24 ? 35 : mm >= T.heavyRain.watch24 ? 60 : 90;
  const status = mm >= T.heavyRain.severe24 ? 'Severe rain screen' : mm >= T.heavyRain.warning24 ? 'High rain screen' : mm >= T.heavyRain.watch24 ? 'Rain watch' : 'No heavy-rain threshold';
  return { score, status, reason: `${mm.toFixed(1)} mm forecast in this daily period; screening thresholds are configurable engineering defaults, not flood or crop-damage predictions.`, value: `${mm.toFixed(1)} mm` };
}

function windFactor(value) {
  if (!present(value)) return null;
  const gust = n(value);
  const score = gust >= T.wind.severe ? 15 : gust >= T.wind.warning ? 35 : gust >= T.wind.watch ? 60 : 90;
  const status = gust >= T.wind.severe ? 'Severe gust screen' : gust >= T.wind.warning ? 'High gust screen' : gust >= T.wind.watch ? 'Wind watch' : 'No strong-wind threshold';
  return { score, status, reason: `${gust.toFixed(0)} km/h forecast maximum gust compared with configured thresholds (${T.wind.watch}/${T.wind.warning}/${T.wind.severe} km/h).`, value: `${gust.toFixed(0)} km/h` };
}

function humidityFactor(weather, dayIndex) {
  const times = weather?.hourly?.time || [], values = weather?.hourly?.relative_humidity_2m || [], date = weather?.daily?.time?.[dayIndex];
  if (!date) return null;
  const indexes = times.map((t, i) => t.startsWith(date) ? i : -1).filter(i => i >= 0 && present(values[i]));
  if (indexes.length < 12) return null;
  const humidHours = indexes.filter(i => n(values[i]) >= T.humid.relativeHumidity).length;
  const prolonged = humidHours >= 18 && indexes.length >= 18;
  const score = prolonged ? 65 : 90;
  return { score, status: prolonged ? 'Sustained high humidity screen' : 'No sustained humidity screen', reason: prolonged
    ? `${humidHours} of ${indexes.length} available hourly values are at/above ${T.humid.relativeHumidity}% RH. Such conditions can favour disease pressure; this is not a disease diagnosis.`
    : `Hourly humidity available for ${indexes.length} of 24 hours; no sustained high-humidity screen was reached.`, value: `${humidHours}/${indexes.length} h ≥${T.humid.relativeHumidity}%` };
}

function scoreFactors(factors) {
  const available = Object.entries(factors).filter(([, value]) => value);
  if (!available.length) return { score: null, dataCoverage: 0, classification: 'Unavailable' };
  const totalWeight = available.reduce((sum, [key]) => sum + SUITABILITY_WEIGHTS[key], 0);
  const score = Math.round(available.reduce((sum, [key, factor]) => sum + factor.score * SUITABILITY_WEIGHTS[key], 0) / totalWeight);
  const dataCoverage = Math.round(totalWeight * 100);
  const classification = score >= 80 ? 'Generally favorable screening' : score >= 60 ? 'Monitor conditions' : score >= 40 ? 'Elevated weather concern' : 'High weather concern';
  return { score: Math.max(0, Math.min(100, score)), dataCoverage, classification };
}

function hazardEvents(weather, dayIndex, factors) {
  const d = weather.daily, date = d.time[dayIndex], events = [];
  const push = (kind, severity, reason) => events.push({ kind, severity, reason, date });
  if (present(d.temperature_2m_max?.[dayIndex])) {
    const v = n(d.temperature_2m_max[dayIndex]);
    if (v >= T.heat.watch) push('heat', v >= T.heat.severe ? 'SEVERE' : v >= T.heat.warning ? 'HIGH' : 'MODERATE', factors.temperature?.reason || `Maximum temperature ${v}°C crossed screening threshold.`);
  }
  if (present(d.temperature_2m_min?.[dayIndex])) {
    const v = n(d.temperature_2m_min[dayIndex]);
    if (v <= T.cold.watch) push('cold', v <= T.cold.frostTemperature ? 'HIGH' : 'MODERATE', factors.temperature?.reason || `Minimum temperature ${v}°C crossed screening threshold.`);
  }
  if (present(d.precipitation_sum?.[dayIndex])) {
    const v = n(d.precipitation_sum[dayIndex]);
    if (v >= T.heavyRain.watch24) push('heavyRain', v >= T.heavyRain.severe24 ? 'SEVERE' : v >= T.heavyRain.warning24 ? 'HIGH' : 'MODERATE', factors.rainfall?.reason || `${v} mm forecast.`);
  }
  if (present(d.wind_gusts_10m_max?.[dayIndex])) {
    const v = n(d.wind_gusts_10m_max[dayIndex]);
    if (v >= T.wind.watch) push('wind', v >= T.wind.severe ? 'SEVERE' : v >= T.wind.warning ? 'HIGH' : 'MODERATE', factors.wind?.reason || `${v} km/h gust forecast.`);
  }
  if (factors.humidity && factors.humidity.score < 90) push('humid', 'MODERATE', factors.humidity.reason);
  return events;
}

export function evaluateDay(weather, dayIndex, { crop = null, stage = null } = {}) {
  if (!weather?.daily?.time || dayIndex < 0 || dayIndex >= weather.daily.time.length) return null;
  const d = weather.daily;
  const factors = {
    temperature: temperatureFactor(d.temperature_2m_max?.[dayIndex], d.temperature_2m_min?.[dayIndex]),
    rainfall: rainfallFactor(d.precipitation_sum?.[dayIndex]),
    wind: windFactor(d.wind_gusts_10m_max?.[dayIndex]),
    humidity: humidityFactor(weather, dayIndex)
  };
  const assessment = scoreFactors(factors);
  const events = hazardEvents(weather, dayIndex, factors).sort((a, b) => ({ SEVERE: 0, HIGH: 1, MODERATE: 2 }[a.severity] - ({ SEVERE: 0, HIGH: 1, MODERATE: 2 }[b.severity])));
  const main = events[0] || null;
  const guidance = main ? getGuidance(crop || 'other', stage, main.kind) : null;
  return {
    index: dayIndex, date: d.time[dayIndex], score: assessment.score,
    classification: assessment.classification, dataCoverage: assessment.dataCoverage,
    factors, events, risk: assessment.score === null ? 'UNKNOWN' : (main?.severity || 'LOW'), mainHazard: main?.kind || null,
    precaution: guidance?.general || null,
    source: weather.simulated ? 'DEMO / SIMULATED DATA' : 'Open-Meteo forecast',
    limitation: weather.simulated
      ? 'This entire scenario is simulated for demonstration; it is not a live forecast.'
      : 'Model forecast for a grid cell, not a field measurement. Thresholds are engineering screens, not crop-specific damage limits.',
    crop, cropLabel: cropLabel(crop), stage
  };
}

export function evaluateSevenDays(weather, options = {}) {
  if (!weather?.daily?.time?.length) return [];
  return weather.daily.time.slice(0, 7).map((_, i) => evaluateDay(weather, i, options));
}

export function calculateSuitability(weather, crop, stage = null, dayIndex = 0) {
  const day = evaluateDay(weather, dayIndex, { crop, stage });
  if (!day) return { score: null, classification: 'Unavailable', factors: {}, dataCoverage: 0, note: 'No forecast data available; no score is calculated.' };
  return {
    score: day.score, classification: day.classification, factors: day.factors,
    dataCoverage: day.dataCoverage, risk: day.risk, day,
    note: `Deterministic, crop-agnostic weather-screening index using available forecast factors. Available-data coverage ${day.dataCoverage}%. Missing factors are excluded and weights renormalized. Selecting a crop changes the advisory context, not this shared score; it is not crop health or an agronomic recommendation.`
  };
}

export function buildAgriculturalAlerts(state, { crop = null, stage = null, readings = [], demo = null, language = 'en' } = {}) {
  const activeCrop = crop || state?.farm?.crop || null;
  if (!state?.weather) return { alerts: [], notes: ['No forecast loaded.'], suitability: calculateSuitability(null, activeCrop), days: [] };
  const result = computeHazards(state, { hours: 72 });
  const advisories = buildAdvisories(state, { crop: activeCrop, stage, language, hours: 72 });
  const alerts = advisories.map(a => ({
    id: a.id, kind: a.hazard, severity: mapSeverity(a.severity), metric: a.metric, value: a.value, unit: a.unit,
    expected: a.expected, why: a.why, actions: a.actions, evidence: a.evidence, limitations: a.limitations,
    windowLabel: a.expected?.en?.match(/Window: ([^.]+)/)?.[1] || 'Next 72 hours', source: state.weather.simulated ? 'DEMO / SIMULATED DATA' : 'Open-Meteo forecast', crop: activeCrop
  }));
  const scopedReadings = readings.filter(r => {
    if (demo?.pHReading?.id === r.id) return false;
    if (state.farm?.id) return r.farmId === state.farm.id || (!r.farmId && Number.isFinite(Number(r.latitude)) && Math.abs(Number(r.latitude) - Number(state.farm.latitude)) < 0.001 && Math.abs(Number(r.longitude) - Number(state.farm.longitude)) < 0.001);
    return Number.isFinite(Number(r.latitude)) && Math.abs(Number(r.latitude) - Number(state.location?.latitude)) < 0.001 && Math.abs(Number(r.longitude) - Number(state.location?.longitude)) < 0.001;
  }).sort((a, b) => a.date.localeCompare(b.date));
  const pHRecords = demo?.pHReading ? [demo.pHReading] : scopedReadings;
  const recent = pHRecords.at(-1);
  if (recent && Number(recent.value) < 5) {
    const repeated = pHRecords.filter(r => Number(r.value) < 5).length >= 3;
    const c = classifyPH(recent.value);
    alerts.unshift({
      id: `rain-ph-${recent.id}`, kind: 'acidity', severity: Number(recent.value) < 4 ? 'HIGH' : 'MODERATE',
      metric: 'rainwater pH', value: Number(recent.value), unit: 'pH', crop: activeCrop,
      expected: { en: `${recent.location || state.location?.name || 'Recorded location'}: pH ${Number(recent.value).toFixed(1)} measured on ${recent.date}.`, hi: `${recent.location || state.location?.name || 'दर्ज स्थान'}: ${recent.date} को pH ${Number(recent.value).toFixed(1)} मापा गया।` },
      why: { en: `${c.note} ${repeated ? 'Several low readings are recorded; repeat/independent verification is advised.' : 'One observation is not enough to establish a trend or crop impact.'}`, hi: `${c.note} ${repeated ? 'कई कम माप दर्ज हैं; दोबारा या स्वतंत्र जाँच करें।' : 'एक माप से रुझान या फसल पर असर स्थापित नहीं होता।'}` },
      actions: [{ kind: 'monitoring', source: null, text: { en: 'Check the measurement method and sample handling, repeat the rainwater test, and test soil separately if crop concerns persist. Do not apply amendments based on rainwater pH alone.', hi: 'माप की विधि और नमूना जाँचें, वर्षा-जल परीक्षण दोहराएँ और फसल की चिंता बनी रहे तो मिट्टी का अलग परीक्षण कराएँ। केवल वर्षा-जल pH के आधार पर संशोधन न करें।' } }],
      evidence: { en: `User-recorded measurement · ${recent.source || recent.method || 'source not stated'} · ${recent.location || 'location not stated'}.`, hi: `उपयोगकर्ता द्वारा दर्ज माप · ${recent.source || recent.method || 'स्रोत उपलब्ध नहीं'} · ${recent.location || 'स्थान उपलब्ध नहीं'}।` },
      limitations: { en: 'Rainwater pH is not soil pH or irrigation-water quality. This is a monitoring prompt, not a crop-damage assessment.', hi: 'वर्षा-जल pH, मिट्टी pH या सिंचाई जल की गुणवत्ता नहीं है। यह निगरानी संकेत है, फसल-क्षति का आकलन नहीं।' },
      windowLabel: `${recent.date}`, source: recent.recordType === 'simulated' ? 'DEMO / SIMULATED DATA' : 'User-recorded measurement', simulated: recent.recordType === 'simulated', repeated, cropLabel: cropLabel(activeCrop, language)
    });
  }
  const days = evaluateSevenDays(state.weather, { crop: activeCrop, stage });
  const suitability = calculateSuitability(state.weather, activeCrop, stage, 0);
  return { alerts, notes: result.notes, suitability, days, coverage: result.coverage };
}

export function suitabilityFactorRows(result, language = 'en') {
  const statusHindi = {
    'Suitable screening range':'सामान्य स्क्रीनिंग सीमा','Severe heat screen':'अत्यधिक गर्मी स्क्रीन','High heat screen':'उच्च गर्मी स्क्रीन','Heat watch':'गर्मी पर नज़र',
    'Very cold screen':'अत्यधिक ठंड स्क्रीन','Cold watch':'ठंड पर नज़र','Severe rain screen':'अत्यधिक वर्षा स्क्रीन','High rain screen':'भारी वर्षा स्क्रीन','Rain watch':'वर्षा पर नज़र',
    'No heavy-rain threshold':'भारी-वर्षा सीमा पार नहीं','Severe gust screen':'अत्यधिक हवा के झोंके स्क्रीन','High gust screen':'तेज़ झोंके स्क्रीन','Wind watch':'हवा पर नज़र','No strong-wind threshold':'तेज़-हवा सीमा पार नहीं',
    'Sustained high humidity screen':'लगातार अधिक आर्द्रता स्क्रीन','No sustained humidity screen':'लगातार अधिक आर्द्रता स्क्रीन नहीं'
  };
  const reasonHindi = (key, factor) => {
    if (!factor) return 'पूर्वानुमान कारक उपलब्ध नहीं था; इसे स्कोर में शामिल नहीं किया गया।';
    if (key === 'temperature') return `न्यूनतम–अधिकतम तापमान ${factor.value}; सामान्य ताप/ठंड स्क्रीनिंग सीमाओं से तुलना। यह खेत का मापन या फसल-क्षति पूर्वानुमान नहीं है।`;
    if (key === 'rainfall') return `${factor.value} वर्षा का पूर्वानुमान; सीमाएँ सामान्य स्क्रीनिंग संकेत हैं, बाढ़ या फसल-क्षति का पूर्वानुमान नहीं।`;
    if (key === 'wind') return `${factor.value} अधिकतम झोंके का पूर्वानुमान; स्क्रीनिंग सीमा पार होना खेत की क्षति का आकलन नहीं।`;
    return `${factor.value} प्रति घंटा आर्द्रता मान उपलब्ध; अधिक आर्द्रता रोग-दबाव को बढ़ावा दे सकती है, पर यह रोग का निदान नहीं है।`;
  };
  const scoreName = value => language !== 'hi' ? value : ({
    'Generally favorable screening':'मौसम सामान्यतः अनुकूल (स्क्रीन)','Monitor conditions':'स्थितियों पर निगरानी रखें',
    'Elevated weather concern':'मौसम-संबंधी चिंता अधिक','High weather concern':'मौसम-संबंधी चिंता उच्च','Unavailable':'उपलब्ध नहीं'
  }[value] || value);
  return Object.entries(result?.factors || {}).map(([key, factor]) => ({
    key, label: FACTOR_TEXT[key]?.[language] || key,
    status: language === 'hi' ? (statusHindi[factor?.status] || (factor ? 'स्क्रीनिंग पूरी' : 'डेटा उपलब्ध नहीं')) : (factor?.status || 'Not available'),
    reason: language === 'hi' ? reasonHindi(key, factor) : (factor?.reason || 'Forecast factor unavailable; excluded from score.'),
    score: factor?.score ?? null, value: factor?.value ?? '—'
  }));
}

export function suitabilityClassification(value, language = 'en') {
  if (language !== 'hi') return value;
  return ({
    'Generally favorable screening':'मौसम सामान्यतः अनुकूल (स्क्रीन)','Monitor conditions':'स्थितियों पर निगरानी रखें',
    'Elevated weather concern':'मौसम-संबंधी चिंता अधिक','High weather concern':'मौसम-संबंधी चिंता उच्च','Unavailable':'उपलब्ध नहीं'
  })[value] || value;
}

export function cropName(crop, language = 'en') { return cropLabel(crop, language); }
export function hazardName(kind, language = 'en') { return hazardLabel(kind, language); }

export default { calculateSuitability, evaluateDay, evaluateSevenDays, buildAgriculturalAlerts, suitabilityFactorRows };
