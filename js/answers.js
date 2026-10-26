// Unified, metric-aware answer engine. Both languages use the SAME evidence
// selection, so a topic can never be "supported in English but unsupported in
// Hindi". The older English/Hindi trees in assistant.js/insights.js remain for
// composite narrative topics (rain windows, daily outlook, comparison, sun).
import * as tz from './timezone.js';
import { DEFAULT_OUTDOOR_WINDOW, windowLabel as partWindowLabel } from '../data/time-windows.js';
import { temp, wind, number, present, condition, localHour } from './weather.js';

const GRID_NOTE = {
  en: 'Forecast for this model grid cell — not a measurement at your field.',
  hi: 'यह मॉडल ग्रिड सेल का पूर्वानुमान है — आपके खेत का प्रत्यक्ष माप नहीं।'
};
const EVIDENCE_NOTE = {
  en: 'Percentages are for individual forecast hours, not the whole window. Official warning feeds are not connected; check IMD or SACHET.',
  hi: 'प्रतिशत प्रत्येक घंटे के लिए हैं, पूरी अवधि के लिए नहीं। आधिकारिक चेतावनी फ़ीड जुड़ी नहीं है; IMD या SACHET देखें।'
};

const METRIC_FIELDS = {
  feels: { field: 'apparent_temperature', current: 'apparent_temperature', label: 'Feels like', labelHi: 'महसूस होने वाला तापमान', kind: 'temp' },
  temperature: { field: 'temperature_2m', current: 'temperature_2m', label: 'Temperature', labelHi: 'तापमान', kind: 'temp' },
  humidity: { field: 'relative_humidity_2m', current: 'relative_humidity_2m', label: 'Relative humidity', labelHi: 'सापेक्ष आर्द्रता', kind: 'percent', unit: '%' },
  clouds: { field: 'cloud_cover', current: 'cloud_cover', label: 'Cloud cover', labelHi: 'बादल', kind: 'percent', unit: '%' },
  uv: { field: 'uv_index', current: null, label: 'UV index', labelHi: 'UV सूचकांक', kind: 'index' },
  visibility: { field: 'visibility', current: null, label: 'Visibility', labelHi: 'दृश्यता', kind: 'km' },
  pressure: { field: null, current: 'pressure_msl', label: 'Sea-level pressure', labelHi: 'समुद्र-तल दबाव', kind: 'pressure' }
};

function result(text, extra = {}) {
  return { text, metrics: [], language: 'en', ...extra };
}

function noForecast(language) {
  return result(language === 'hi'
    ? 'इस स्थान का पूर्वानुमान अभी लोड नहीं है। मौसम सेवा दोबारा आज़माएँ या दूसरा स्थान चुनें। बिना डेटा के मैं उत्तर नहीं दूँगा।'
    : "I don’t have a loaded forecast for this location yet. Retry the weather service, or search for another place, then ask again.",
    { language });
}

function missingValues(language, intent, state) {
  const range = tz.forecastRange(state);
  const availability = range.firstHour && range.lastHour
    ? (language === 'hi' ? `उपलब्ध घंटे: ${range.firstHour} से ${range.lastHour} (स्थानीय समय)।` : `Available local hours: ${range.firstHour} to ${range.lastHour}.`)
    : '';
  return result(language === 'hi'
    ? `चुने हुए समय के लिए यह मान उपलब्ध नहीं है; मैं अनुमान नहीं लगाऊँगा। ${availability}`
    : `That value is unavailable for the requested time, so I won’t guess it. ${availability}`,
    { language, scope: [intent.time?.resolvedLabel] });
}

function unavailableWindow(language, intent, state) {
  const range = tz.forecastRange(state);
  return result(language === 'hi'
    ? `यह समय उपलब्ध पूर्वानुमान के बाहर है। उपलब्ध अवधि: ${range.firstDate} से ${range.lastDate} (स्थानीय समय)। कृपया इसी सीमा में समय चुनें।`
    : `That time is outside the loaded forecast. The available local dates are ${range.firstDate} to ${range.lastDate}. Please choose a time inside that range.`,
    { language, scope: [intent.time?.resolvedLabel] });
}

/** Collect provider values for a metric inside the resolved window. */
function collect(state, intent, spec) {
  const w = state.weather;
  if (!w) return null;
  const isNow = intent.time?.isNow;
  if (isNow && spec.current) {
    const raw = w.current?.[spec.current];
    return { values: present(raw) ? [raw] : [], indexes: [], isNow: true, complete: present(raw) };
  }
  if (spec.kind === 'pressure') {
    const raw = w.current?.pressure_msl;
    return { values: present(raw) ? [raw] : [], indexes: [], isNow: true, complete: present(raw), currentOnly: true };
  }
  const { date, startHour, endHour, dayOffset } = intent.time;
  const { indexes } = tz.selectHourIndices(state, { date, startHour, endHour, onlyFuture: dayOffset === 0 });
  if (!indexes.length) return { values: [], indexes: [], isNow: false, complete: false, outside: true };
  const values = indexes.map(i => w.hourly?.[spec.field]?.[i]).filter(present);
  return { values, indexes, isNow: false, complete: values.length === indexes.length, partial: values.length > 0 && values.length < indexes.length };
}

function formatMetric(spec, value, prefs, language) {
  if (!present(value)) return '—';
  if (spec.kind === 'temp') return temp(value, prefs, true);
  if (spec.kind === 'percent') return `${number(value, 0)} ${spec.unit}`;
  if (spec.kind === 'km') return `${number(value / 1000, 1)} km`;
  if (spec.kind === 'pressure') return `${number(value)} hPa`;
  if (spec.kind === 'index') return number(value, 1);
  return number(value, 1);
}

function rangeText(spec, values, prefs, language) {
  if (!values.length) return '—';
  const min = Math.min(...values), max = Math.max(...values);
  if (min === max) return formatMetric(spec, min, prefs, language);
  return `${formatMetric(spec, min, prefs, language)}–${formatMetric(spec, max, prefs, language)}`;
}

/** Metric answers: temperature / feels-like / humidity / clouds / UV /
 * visibility / pressure, in EN and HI, honouring the requested date + window. */
export function metricAnswer(intent, state) {
  const language = intent.language, spec = METRIC_FIELDS[intent.topic];
  if (!spec) return null;
  const data = state.weather;
  if (!data) return noForecast(language);
  const resolved = intent.time?.resolvedLabel;
  const place = state.location?.name || '';
  // Pressure has no hourly series in this app; say so rather than substituting.
  if (spec.kind === 'pressure' && (intent.dayOffset > 0 || intent.time?.kind !== 'day' || !intent.time?.isNow)) {
    if (intent.dayOffset > 0 || intent.time?.kind === 'point' || intent.time?.kind === 'part') {
      return result(language === 'hi'
        ? 'इस ऐप में समुद्र-तल दबाव केवल वर्तमान मॉडल अनुमान के रूप में लोड है, प्रति-घंटा पूर्वानुमान के रूप में नहीं। "Pressure now" पूछें।'
        : 'This app loads current sea-level pressure, not its hourly forecast. Ask “Pressure now” for the available model estimate.',
        { language, scope: [place, resolved] });
    }
  }
  const collected = collect(state, intent, spec);
  if (!collected) return noForecast(language);
  if (collected.outside) return unavailableWindow(language, intent, state);
  if (!collected.values.length) return missingValues(language, intent, state);
  const value = rangeText(spec, collected.values, state.prefs, language);
  const label = language === 'hi' ? spec.labelHi : spec.label;
  const when = resolved || intent.date;
  const note = collected.partial
    ? (language === 'hi' ? 'कुछ घंटों के मान उपलब्ध नहीं हैं।' : 'Some hourly values in this window are missing.')
    : '';
  const text = language === 'hi'
    ? `${place} में ${when} के लिए ${label} ${value} रहने का पूर्वानुमान है। ${GRID_NOTE.hi} ${note}`
    : `For ${place}, ${label.toLowerCase()} is ${value} for ${when}. ${GRID_NOTE.en} ${note}`;
  const metrics = [{ label, value }];
  if (intent.topic === 'feels' || intent.topic === 'temperature') {
    const other = intent.topic === 'feels' ? METRIC_FIELDS.temperature : METRIC_FIELDS.feels;
    const otherCollected = collect(state, intent, other);
    if (otherCollected?.values?.length) {
      metrics.push({ label: language === 'hi' ? other.labelHi : other.label, value: rangeText(other, otherCollected.values, state.prefs, language) });
    }
  }
  return result(text.trim(), { language, metrics, scope: [place, intent.time?.label], note: EVIDENCE_NOTE[language] });
}

function outdoorScore(h, i, prefs) {
  return h.precipitation_probability[i] * .6 + Math.abs(h.temperature_2m[i] - 22) * 2 +
    h.wind_speed_10m[i] * .4 + (h.uv_index?.[i] || 0) * 2;
}

/** Outdoor planning scores ONLY hours inside the requested window. */
export function outdoorAnswer(intent, state) {
  const language = intent.language, w = state.weather;
  if (!w) return noForecast(language);
  const requested = intent.time?.window;
  const window = requested || { ...DEFAULT_OUTDOOR_WINDOW, key: 'default' };
  const label = partWindowLabel(window, language);
  const date = intent.time?.date;
  const { indexes } = tz.selectHourIndices(state, {
    date, startHour: window.start, endHour: window.end, onlyFuture: intent.dayOffset === 0
  });
  const resolved = intent.time?.resolvedLabel;
  if (!indexes.length) return result(language === 'hi'
    ? `${resolved} की ${label} अवधि में पूर्वानुमान के घंटे उपलब्ध नहीं हैं (या आज का यह समय बीत चुका है)। मैं इस अवधि के बाहर का समय नहीं सुझाऊँगा। कृपया कोई दूसरी अवधि चुनें।`
    : `There are no forecast hours inside ${label} on ${date}${intent.dayOffset === 0 ? ' that have not already passed' : ''}. I won’t suggest a time outside the window you asked about. Try another window.`,
    { language, scope: [resolved, label] });
  const h = w.hourly;
  const candidates = indexes.filter(i => [h.temperature_2m?.[i], h.precipitation_probability?.[i], h.wind_speed_10m?.[i]].every(present));
  if (!candidates.length) return missingValues(language, intent, state);
  const suitable = i => present(h.precipitation_probability[i]) && h.precipitation_probability[i] <= 60 &&
    present(h.wind_speed_10m[i]) && h.wind_speed_10m[i] <= 40 &&
    present(h.temperature_2m[i]) && h.temperature_2m[i] >= 10 && h.temperature_2m[i] <= 38 &&
    (!present(h.uv_index?.[i]) || h.uv_index[i] <= 8);
  const good = candidates.filter(suitable);
  const best = (good.length ? good : candidates).reduce((a, b) => outdoorScore(h, a, state.prefs) <= outdoorScore(h, b, state.prefs) ? a : b);
  const time = tz.hourLabel(Number(h.time[best].slice(11, 13)), 0, language);
  const peak = Math.max(...candidates.map(i => h.precipitation_probability[i]));
  const maxWind = Math.max(...candidates.map(i => h.wind_speed_10m[i]));
  const temps = candidates.map(i => h.temperature_2m[i]);
  const caveat = good.length ? '' : (language === 'hi'
    ? `इस अवधि में कोई भी घंटा पूरी तरह अनुकूल नहीं है (अधिकतम वर्षा संभावना ${number(peak)}%, अधिकतम हवा ${wind(maxWind, state.prefs)}); नीचे सबसे कम प्रतिकूल समय दिया गया है।`
    : `No hour in ${label} looks fully comfortable (peak rain chance ${number(peak)}%, max wind ${wind(maxWind, state.prefs)}); the least unfavourable hour is shown below.`);
  const tempRange = `${temp(Math.min(...temps), state.prefs, true)}–${temp(Math.max(...temps), state.prefs, true)}`;
  const text = language === 'hi'
    ? `${state.location.name} में ${resolved} की ${label} अवधि में ${time} बाहर जाने के लिए ${good.length ? 'सबसे अनुकूल' : 'सबसे कम प्रतिकूल'} समय है: तापमान ${temp(h.temperature_2m[best], state.prefs, true)}, वर्षा संभावना ${number(h.precipitation_probability[best])}%, हवा ${wind(h.wind_speed_10m[best], state.prefs)}। केवल इसी अवधि के उपलब्ध घंटों की तुलना की गई (तापमान ${tempRange}); यह सरल तुलना है, सुरक्षा की गारंटी नहीं। ${caveat} ${GRID_NOTE.hi}`
    : `For ${state.location.name}, around ${time} on ${resolved} is the ${good.length ? 'best' : 'least unfavourable'} hour inside ${label}: ${temp(h.temperature_2m[best], state.prefs, true)}, ${number(h.precipitation_probability[best])}% precipitation chance, wind ${wind(h.wind_speed_10m[best], state.prefs)}. Only hours inside the requested window were compared (${tempRange} across them); this is a simple score, not a safety guarantee. ${caveat} ${GRID_NOTE.en}`;
  return result(text.trim(), {
    language,
    metrics: [
      { label: language === 'hi' ? 'सुझाया गया समय' : 'Suggested time', value: time },
      { label: language === 'hi' ? 'तापमान' : 'Temperature', value: temp(h.temperature_2m[best], state.prefs, true) },
      { label: language === 'hi' ? 'वर्षा संभावना' : 'Rain chance', value: `${number(h.precipitation_probability[best])}%` }
    ],
    scope: [state.location.name, label, resolved],
    note: EVIDENCE_NOTE[language]
  });
}

export function radarAnswer(intent, state) {
  const hi = intent.language === 'hi';
  return result(hi
    ? 'वर्षा रडार परत खोल दी गई है। यह उपलब्ध पिछली रडार फ़्रेम दिखाती है, भविष्य की बारिश नहीं। भारत में रडार कवरेज सीमित हो सकती है; खाली रडार का अर्थ बारिश नहीं होना नहीं है। भविष्य की बारिश के लिए इस स्थान का पूर्वानुमान पूछें।'
    : 'I’ve opened the precipitation radar layer. It shows available past observations, not where heavy rain is expected tomorrow. Coverage varies, and a blank map is not proof of dry weather. For future rain at this location, ask about the forecast.',
    { language: intent.language, action: 'radar' });
}

export function acidityAnswer(intent, state) {
  const hi = intent.language === 'hi';
  return result(hi
    ? 'Rainwater acidity data unavailable for this location. वर्तमान, स्थानीय और प्रोग्राम-योग्य वर्षा-jal pH डेटा इस ऐप से नहीं जुड़ा है। आप अपनी माप "उपयोगकर्ता द्वारा दर्ज" के रूप में दर्ज कर सकते हैं।'
    : 'Rainwater acidity data unavailable for this location. No current, local, machine-readable measured pH dataset is connected. You may enter your own reading, clearly labelled “User-provided”.',
    { language: intent.language });
}

export function cropFallbackAnswer(intent, state) {
  const hi = intent.language === 'hi';
  return result(hi
    ? 'फसल-विशेष सलाह के लिए सक्रिय खेत और उसका पूर्वानुमान चाहिए। अभी मैं केवल मौसम के आँकड़े बता सकता हूँ; कृपया "फार्म" अनुभाग में फसल चुनें।'
    : 'Crop-specific guidance needs an active farm and its forecast. I can only report weather values right now; choose a crop in the Farms section first.',
    { language: intent.language });
}

/** Called by analyzeQuestion. Returns a response or `null` to use the legacy
 * narrative branches. */
export function structuredAnswer(intent, state) {
  if (!intent || intent.clarification) return null;
  if (intent.topic === 'radar') return radarAnswer(intent, state);
  if (intent.topic === 'acidity') return acidityAnswer(intent, state);
  if (intent.topic === 'crop') return cropFallbackAnswer(intent, state);
  if (intent.topic === 'outdoors') return outdoorAnswer(intent, state);
  if (METRIC_FIELDS[intent.topic]) return metricAnswer(intent, state);
  if (intent.topic === 'feels') return metricAnswer(intent, state);
  return null;
}

/** Append an explicit, checkable resolution of relative date/time to legacy
 * narrative answers. Never changes the beginning of a sentence. */
export function withScope(response, intent, state) {
  if (!response || !intent?.time?.resolvedLabel) return response;
  const label = intent.time.resolvedLabel;
  const prefix = response.language === 'hi' || intent.language === 'hi' ? 'समझा गया समय' : 'Resolved';
  const text = `${response.text} (${prefix}: ${label}.)`;
  return { ...response, text, scope: response.scope || [state?.location?.name] };
}

export default structuredAnswer;
