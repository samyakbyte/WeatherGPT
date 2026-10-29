import { selectAirQualityFrame, AIR_QUALITY_VARIABLES, validAirCoordinates } from './air-quality.js';
import { t, formatNumber } from './i18n.js';
import { escapeHTML } from './icons.js';
import { cropName } from './agriculture.js';

const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const coordinateMatch = (a, b) => validAirCoordinates(a?.latitude, a?.longitude) && validAirCoordinates(b?.latitude, b?.longitude) &&
  Math.abs(Number(a.latitude) - Number(b.latitude)) <= 0.001 && Math.abs(Number(a.longitude) - Number(b.longitude)) <= 0.001;

/**
 * A transparent screening summary—not a pH estimator. Concentrations of SO2/NO2,
 * weather humidity, and rainfall alone cannot determine precipitation chemistry.
 * No thresholds or confidence score are applied.
 */
export function buildAcidityIntelligence({ location, farm = null, crop = null, readings = [], environment = null, weather = null, demo = null } = {}) {
  const demoReading = demo?.pHReading || null;
  const measurement = demoReading ? null : readings
    .filter(record => record?.recordType !== 'simulated' && finite(record.value) && record.date &&
      (farm?.id && record.farmId === farm.id || (!record.farmId && coordinateMatch(record, farm || location))))
    .slice().sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  const targetLocation = farm || location;
  const environmentMatches = coordinateMatch(environment?.requested, targetLocation);
  const locationMatches = coordinateMatch(location, targetLocation);
  const data = environment?.status === 'ready' && environmentMatches ? environment.data : null;
  const target = weather?.current?.time || '';
  const matchingWeather = locationMatches ? weather : null;
  const frame = data ? selectAirQualityFrame(data, target) : null;
  const pollutants = frame ? Object.fromEntries(AIR_QUALITY_VARIABLES.map(key => [key, {
    value: finite(frame.values[key]) ? Number(frame.values[key]) : null,
    unit: data.units?.[key] || ''
  }])) : null;
  const daily = matchingWeather?.daily;
  const rain = {
    amount: finite(daily?.precipitation_sum?.[0]) ? Number(daily.precipitation_sum[0]) : null,
    probability: finite(daily?.precipitation_probability_max?.[0]) ? Number(daily.precipitation_probability_max[0]) : null,
    date: daily?.time?.[0] || ''
  };
  return {
    reliability: demo ? 'demonstration' : measurement ? 'measured' : data ? 'screening' : 'unavailable',
    measurement, demoReading, pollutants, modelTime: frame?.time || '', modelCentre: data?.modelGrid || null,
    source: data?.source || '', rain, crop: crop || farm?.crop || null,
    pHValue: measurement ? Number(measurement.value) : null,
    prediction: null,
    hasRainForecast: rain.amount !== null && rain.amount > 0 || rain.probability !== null && rain.probability > 0
  };
}

export function renderAcidityIntelligence(root, input, language = 'en') {
  if (!root) return;
  const s = buildAcidityIntelligence(input);
  const hi = language === 'hi';
  const statusKey = s.reliability === 'measured' ? 'acidity.measured' : s.reliability === 'demonstration' ? 'acidity.demonstration' : s.reliability === 'screening' ? 'acidity.screening' : 'acidity.unavailable';
  const pHValue = s.measurement ? `<strong class="acidity-intelligence-value">${formatNumber(s.pHValue, {minimumFractionDigits:1,maximumFractionDigits:1}, language)} <small>pH</small></strong>` : s.demoReading ? `<strong class="acidity-intelligence-value demo-value">${formatNumber(Number(s.demoReading.value), {minimumFractionDigits:1,maximumFractionDigits:1}, language)} <small>pH</small></strong>` : `<strong class="acidity-intelligence-unavailable">${escapeHTML(t('acidity.notMeasurable', {}, language))}</strong>`;
  const measurementNote = s.measurement
    ? `<p class="acidity-record-note">${escapeHTML(t('acidity.measurementDetail', { value: formatNumber(s.pHValue, {minimumFractionDigits:1,maximumFractionDigits:1}, language), date: s.measurement.date, method: s.measurement.method || s.measurement.source || (hi ? 'अज्ञात विधि' : 'method not specified') }, language))}</p>`
    : s.demoReading
      ? `<p class="acidity-record-note">${hi ? 'यह pH मान केवल काल्पनिक प्रदर्शन डेटा है; मापा हुआ नमूना नहीं।' : 'This pH value is synthetic demonstration data, not a measured sample.'}</p>`
      : `<p class="acidity-record-note">${escapeHTML(t('acidity.noEstimate', {}, language))}</p>`;
  const atmosphericNote = s.pollutants
    ? t('acidity.indicatorsAvailable', {}, language)
    : t('acidity.indicatorsMissing', {}, language);
  const rainNote = s.hasRainForecast
    ? t('acidity.precipitationExpected', {}, language)
    : t('acidity.noPrecipitationExpected', {}, language);
  const crop = s.crop ? cropName(s.crop, language) : (hi ? 'चुनी हुई फसल' : 'the selected crop');
  const cropGuidance = t('acidity.cropGuidance', { crop }, language);
  const rows = s.pollutants ? Object.entries(s.pollutants).map(([key, item]) =>
    `<div class="acidity-tech-row"><span>${escapeHTML(key === 'sulphur_dioxide' ? 'SO₂' : key === 'nitrogen_dioxide' ? 'NO₂' : key === 'pm2_5' ? 'PM2.5' : key === 'pm10' ? 'PM10' : 'O₃')}</span><b>${item.value === null ? escapeHTML(t('common.unavailable', {}, language)) : `${formatNumber(item.value, {minimumFractionDigits:1,maximumFractionDigits:1}, language)} ${escapeHTML(item.unit || t('common.unavailable', {}, language))}`}</b></div>`).join('') : `<p>${escapeHTML(t('acidity.indicatorsMissing', {}, language))}</p>`;
  const timestamp = s.modelTime ? `<small>${hi ? 'मॉडल समय' : 'Model timestamp'}: ${escapeHTML(s.modelTime)} ${escapeHTML(input?.environment?.data?.timezoneAbbreviation || '')}</small>` : '';
  const centre = validAirCoordinates(s.modelCentre?.latitude, s.modelCentre?.longitude)
    ? `${formatNumber(Number(s.modelCentre.latitude),{minimumFractionDigits:3,maximumFractionDigits:3},language)}, ${formatNumber(Number(s.modelCentre.longitude),{minimumFractionDigits:3,maximumFractionDigits:3},language)}`
    : (hi ? 'उपलब्ध नहीं' : 'not supplied');
  root.innerHTML = `<header class="acidity-intelligence-heading"><div><span class="card-kicker">${escapeHTML(t('acidity.title', {}, language))}</span><span class="acidity-reliability ${s.reliability}">${escapeHTML(t(statusKey, {}, language))}</span></div><div class="acidity-ph-block"><span>${escapeHTML(t('acidity.phTitle', {}, language))}</span>${pHValue}</div></header>
    <p class="acidity-intelligence-lede">${escapeHTML(t('acidity.explain', {}, language))}</p>${measurementNote}
    <div class="acidity-screen-grid"><section><h4>${escapeHTML(t('acidity.screening', {}, language))}</h4><p>${escapeHTML(atmosphericNote)}</p><p>${escapeHTML(rainNote)}</p>${s.rain.amount !== null || s.rain.probability !== null ? `<small>${escapeHTML(t('acidity.rainForecast', {}, language))}: ${s.rain.amount === null ? '—' : `${formatNumber(s.rain.amount, {minimumFractionDigits:1,maximumFractionDigits:1}, language)} mm`}${s.rain.probability === null ? '' : ` · ${formatNumber(s.rain.probability,{},language)}%`}</small>` : ''}</section>
      <section><h4>${hi ? 'फसल के लिए सलाह' : 'Agricultural guidance'}</h4><p>${escapeHTML(cropGuidance)}</p><p>${escapeHTML(t('acidity.precaution', {}, language))}</p><small>${escapeHTML(t('crop.noDamageClaim', {}, language))}</small></section></div>
    <details class="acidity-science-details"><summary>${escapeHTML(t('acidity.technical', {}, language))}</summary><p>${escapeHTML(t('acidity.noPrediction', {}, language))} ${escapeHTML(t('acidity.explain', {}, language))}</p><div class="acidity-tech-list">${rows}</div><small>${hi ? 'चुना हुआ मौसम मॉडल-बिंदु' : 'Selected atmospheric model-grid centre'}: ${escapeHTML(centre)}${timestamp ? ` · ${timestamp}` : ''}</small><p>${hi ? 'वायुदाब, नमी और तापमान pH माप का विकल्प नहीं हैं। यह स्क्रीनिंग कोई जोखिम अंक या प्रतिशत नहीं बनाती।' : 'Humidity, temperature and atmospheric pollutant concentrations do not replace precipitation chemistry. This screen creates no risk score or confidence percentage.'}</p></details>
    <footer class="acidity-intelligence-footer"><span>${escapeHTML(t('acidity.dataQuality', {}, language))}: ${escapeHTML(t(statusKey, {}, language))}</span><button type="button" class="text-button" data-open-ph-map>${escapeHTML(t('acidity.sample', {}, language))}</button></footer>`;
  root.dataset.reliability = s.reliability;
  return s;
}

export default { buildAcidityIntelligence, renderAcidityIntelligence };
