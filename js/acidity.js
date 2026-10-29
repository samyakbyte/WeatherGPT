// Rainwater acidity records are user-provided. No live measured pH feed is connected.
// Rainwater pH is never inferred from weather or pollution proxies.
export const ACIDITY_UNAVAILABLE = 'Rainwater acidity data unavailable for this location.';
export const READINGS_KEY = 'weathergpt.rain-ph.v1';
export const METHODS = ['pH meter', 'test strip', 'laboratory', 'other'];

const clean = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const validCoords = (lat, lon) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) && Number(lat) >= -90 && Number(lat) <= 90 && Number(lon) >= -180 && Number(lon) <= 180;
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function classifyPH(value) {
  const pH = Number(value);
  if (!Number.isFinite(pH) || pH < 0 || pH > 14) return { band: 'unavailable', color: '#7b8581', label: 'Unavailable', note: 'No valid measured value.' };
  if (pH > 5.6) return { band: 'near-natural', color: '#438b68', label: 'Above pH 5.6', note: 'Above the commonly cited natural-rain reference; not a crop-safety determination.' };
  if (pH >= 5) return { band: 'slightly-acidic', color: '#c7a83b', label: 'pH 5.0–5.6', note: 'Slightly acidic precipitation range; trend and method matter.' };
  if (pH >= 4) return { band: 'low-ph', color: '#db873d', label: 'pH 4.0–4.9', note: 'Low measured pH; verify the method and monitor repeat observations.' };
  return { band: 'very-low-ph', color: '#c95050', label: 'Below pH 4.0', note: 'Very low measured pH; confirm with a calibrated instrument or laboratory.' };
}

export function validateReading(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value < 0 || value > 14) return null;
  const date = clean(raw.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return null;
  const hasLat = raw.latitude !== null && raw.latitude !== undefined && raw.latitude !== '';
  const hasLon = raw.longitude !== null && raw.longitude !== undefined && raw.longitude !== '';
  if (hasLat !== hasLon || (hasLat && !validCoords(raw.latitude, raw.longitude))) return null;
  const method = METHODS.includes(raw.method) ? raw.method : 'other';
  return {
    id: clean(raw.id, 60) || `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    value, date, method,
    source: clean(raw.source || raw.method, 100) || 'User-provided',
    location: clean(raw.location, 120),
    latitude: hasLat ? Number(raw.latitude) : null,
    longitude: hasLon ? Number(raw.longitude) : null,
    notes: clean(raw.notes, 300),
    farmId: clean(raw.farmId, 60) || null,
    createdAt: clean(raw.createdAt, 40) || new Date().toISOString(),
    recordType: 'user-recorded'
  };
}

export function loadReadings(storage = globalThis.localStorage) {
  let raw;
  try { raw = JSON.parse(storage?.getItem(READINGS_KEY) ?? '[]'); } catch { raw = []; }
  if (!Array.isArray(raw)) raw = [];
  return raw.map(validateReading).filter(Boolean).slice(-100);
}

export function addReading(readings, raw, storage = globalThis.localStorage) {
  const record = validateReading(raw);
  if (!record) return { readings, error: 'A pH reading needs a value from 0 to 14, a valid date, and either valid coordinates or no coordinates.' };
  const next = [...readings, record].slice(-100);
  try { storage?.setItem(READINGS_KEY, JSON.stringify(next)); } catch { return { readings: next, reading: record, error: 'Browser storage is unavailable; this reading will last only for this session.' }; }
  return { readings: next, reading: record };
}

export function deleteReading(readings, id, storage = globalThis.localStorage) {
  const next = readings.filter(r => r.id !== id);
  try { storage?.setItem(READINGS_KEY, JSON.stringify(next)); } catch { /* session-only */ }
  return next;
}

export function summarizeTrend(readings = []) {
  const sorted = readings.filter(r => Number.isFinite(Number(r.value)) && r.date).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 3) return { status: 'insufficient', message: 'At least three dated readings are needed for a simple comparison; this is not a regional trend.' };
  const split = Math.ceil(sorted.length / 2);
  const mean = rows => rows.reduce((sum, r) => sum + Number(r.value), 0) / rows.length;
  const earlier = mean(sorted.slice(0, split)), recent = mean(sorted.slice(split));
  if (recent < earlier) return { status: 'lower', message: 'The more recent recorded readings are lower than the earlier readings. Samples may not represent the wider area.' };
  if (recent > earlier) return { status: 'higher', message: 'The more recent recorded readings are higher than the earlier readings. Samples may not represent the wider area.' };
  return { status: 'steady', message: 'Recorded readings are equal across the earlier and more recent groups. This does not establish a regional trend.' };
}

/** The three concepts are NEVER conflated. */
export const CONCEPTS = {
  rainwater: 'Rainwater pH — acidity of rain, measured at a station or by you.',
  soil: 'Soil pH — a soil test, not available in this app.',
  irrigation: 'Irrigation-water quality — a water test, not available in this app.'
};

export function acidityHTML(language = 'en', readings = [], context = {}) {
  const hi = language === 'hi';
  const sorted = readings.slice().sort((a, b) => a.date.localeCompare(b.date));
  const list = sorted.length
    ? `<ul class="ph-readings">${sorted.slice(-5).reverse().map(r => { const c = classifyPH(r.value); return `<li><strong>${Number(r.value).toFixed(1)}</strong> · ${escape(r.date)} · ${escape(r.source || r.method)} · ${escape(c.label)}${r.location ? ' · ' + escape(r.location) : ''}${r.notes ? ' · ' + escape(r.notes) : ''}<button type="button" class="text-button" data-delete-ph="${escape(r.id)}" aria-label="Delete pH reading from ${escape(r.date)}">Delete</button></li>`; }).join('')}</ul>`
    : `<p class="muted-note">${hi ? 'कोई उपयोगकर्ता-दर्ज माप नहीं है।' : 'No user-provided readings yet.'}</p>`;
  const lat = Number.isFinite(Number(context.latitude)) ? Number(context.latitude) : '';
  const lon = Number.isFinite(Number(context.longitude)) ? Number(context.longitude) : '';
  const readingsCount = sorted.length;
  return `<p class="acidity-unavailable">${ACIDITY_UNAVAILABLE}</p>
    <p class="acidity-explain">${hi
      ? 'IMD के GAW स्टेशनों के ऐतिहासिक वर्षा-रसायन अध्ययन उपलब्ध हैं, परंतु वर्तमान, स्थानीय और मशीन-पठनीय pH फ़ीड नहीं है। स्टेशन के पुराने मान को आपके खेत का मान मानना गलत होगा।'
      : 'Historical IMD GAW precipitation-chemistry studies exist, but there is no current, local, machine-readable pH feed. A station reading cannot be treated as your field’s value.'}</p>
    <details class="ph-concepts"><summary>${hi ? 'तीन अलग-अलग बातें' : 'Three different things'}</summary><ul>${Object.values(CONCEPTS).map(v => `<li>${escape(v)}</li>`).join('')}</ul></details>
    <section class="ph-history" aria-label="Recorded rainwater pH history"><h4>${hi ? 'रिकॉर्ड किए गए माप' : 'Recorded measurements'} <span>${hi ? 'उपयोगकर्ता द्वारा दर्ज' : 'User-provided readings'} · ${readingsCount} ${hi ? 'माप' : 'observations'}</span></h4>
      ${readingsCount ? `<canvas id="ph-history-chart" role="img" aria-label="Chart of user-recorded rainwater pH over time"></canvas><p class="muted-note">${escape(summarizeTrend(sorted).message)} · User-recorded observations only; not a regional trend.</p>` : ''}${list}</section>
    <h4>${hi ? 'उपयोगकर्ता द्वारा नया माप दर्ज करें' : 'Record a measurement'}</h4>
    <form id="ph-reading-form" class="ph-reading-form">
      <label>pH <input id="ph-value" type="number" step="0.1" min="0" max="14" required></label>
      <label>${hi ? 'तारीख' : 'Measurement date'} <input id="ph-date" type="date" required></label>
      <label>${hi ? 'विधि' : 'Method'} <select id="ph-method">${METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}</select></label>
      <label>${hi ? 'स्रोत / विधि विवरण' : 'Measurement source'} <input id="ph-source" maxlength="100" placeholder="e.g. home test strip"></label>
      <label>${hi ? 'स्थान' : 'Location'} <input id="ph-location" maxlength="120" value="${escape(context.locationName || '')}" required></label>
      <label>Latitude <input id="ph-latitude" type="number" step="any" min="-90" max="90" value="${lat}" required></label>
      <label>Longitude <input id="ph-longitude" type="number" step="any" min="-180" max="180" value="${lon}" required></label>
      <label class="ph-notes-field">${hi ? 'टिप्पणी' : 'Optional notes'} <input id="ph-notes" maxlength="300"></label>
      <button type="submit" class="text-button">${hi ? 'माप जोड़ें' : 'Save user-recorded reading'}</button>
    </form>
    <p class="muted-note">${hi ? 'स्रोत: उपयोगकर्ता द्वारा दर्ज। ये माप केवल इस डिवाइस पर रहते हैं। कोई रासायनिक उपचार नहीं सुझाया जाता।' : 'Source: user-recorded. Readings stay on this device; pH bands are visual categories, not crop-damage thresholds. No chemical treatment is prescribed.'}</p>`;
}

export default acidityHTML;
