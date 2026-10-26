// Rainwater acidity — research outcome: NO current, local, programmatically
// accessible measured pH dataset is connected (see docs/DATA_SOURCES.md). The
// app shows exactly the unavailability message. Users may record their OWN
// readings (clearly labelled "User-provided"), stored only on this device.
// Rainwater pH, soil pH and irrigation-water quality are separate concepts.
export const ACIDITY_UNAVAILABLE = 'Rainwater acidity data unavailable for this location.';
export const READINGS_KEY = 'weathergpt.rain-ph.v1';
export const METHODS = ['pH meter', 'test strip', 'laboratory', 'other'];

const clean = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';

export function validateReading(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value < 0 || value > 14) return null;
  const date = clean(raw.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`))) return null;
  const method = METHODS.includes(raw.method) ? raw.method : 'other';
  return {
    id: clean(raw.id, 60) || `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    value, date, method,
    notes: clean(raw.notes, 300),
    farmId: clean(raw.farmId, 60) || null,
    createdAt: clean(raw.createdAt, 40) || new Date().toISOString()
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
  if (!record) return { readings, error: 'A pH reading needs a value between 0 and 14 and a measurement date.' };
  const next = [...readings, record].slice(-100);
  try { storage?.setItem(READINGS_KEY, JSON.stringify(next)); } catch { return { readings: next, error: 'Browser storage is unavailable; this reading will last only for this session.' }; }
  return { readings: next, reading: record };
}

export function deleteReading(readings, id, storage = globalThis.localStorage) {
  const next = readings.filter(r => r.id !== id);
  try { storage?.setItem(READINGS_KEY, JSON.stringify(next)); } catch { /* session-only */ }
  return next;
}

/** The three concepts are NEVER conflated. */
export const CONCEPTS = {
  rainwater: 'Rainwater pH — acidity of rain, measured at a station or by you.',
  soil: 'Soil pH — a soil test, not available in this app.',
  irrigation: 'Irrigation-water quality — a water test, not available in this app.'
};

export function acidityHTML(language = 'en', readings = []) {
  const hi = language === 'hi';
  const list = readings.length
    ? `<ul class="ph-readings">${readings.slice(-5).reverse().map(r => `<li><strong>${Number(r.value).toFixed(1)}</strong> · ${r.date} · ${r.method}${r.notes ? ' · ' + escape(r.notes) : ''}</li>`).join('')}</ul>`
    : `<p class="muted-note">${hi ? 'कोई उपयोगकर्ता-दर्ज माप नहीं है।' : 'No user-provided readings yet.'}</p>`;
  return `<p class="acidity-unavailable">${ACIDITY_UNAVAILABLE}</p>
    <p class="acidity-explain">${hi
      ? 'IMD के GAW स्टेशनों के ऐतिहासिक वर्षा-रसायन अध्ययन उपलब्ध हैं, परंतु वर्तमान, स्थानीय और मशीन-पठनीय pH फ़ीड नहीं है। स्टेशन के पुराने मान को आपके खेत का मान मानना गलत होगा।'
      : 'Historical IMD GAW precipitation-chemistry studies exist, but there is no current, local, machine-readable pH feed. A station reading cannot be treated as your field’s value.'}</p>
    <details class="ph-concepts"><summary>${hi ? 'तीन अलग-अलग बातें' : 'Three different things'}</summary><ul>${Object.values(CONCEPTS).map(v => `<li>${v}</li>`).join('')}</ul></details>
    <h4>${hi ? 'उपयोगकर्ता द्वारा दर्ज माप' : 'User-provided readings'}</h4>${list}
    <form id="ph-reading-form" class="ph-reading-form">
      <label>pH <input id="ph-value" type="number" step="0.1" min="0" max="14" required></label>
      <label>${hi ? 'तारीख' : 'Date'} <input id="ph-date" type="date" required></label>
      <label>${hi ? 'विधि' : 'Method'} <select id="ph-method">${METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}</select></label>
      <label>${hi ? 'टिप्पणी' : 'Notes'} <input id="ph-notes" maxlength="300"></label>
      <button type="submit" class="text-button">${hi ? 'माप जोड़ें' : 'Add my reading'}</button>
    </form>
    <p class="muted-note">${hi ? 'ये माप केवल आपके डिवाइस पर रहते हैं और स्रोत डेटा नहीं हैं।' : 'These readings stay on this device only and are not sourced data.'}</p>`;
}

function escape(v) { return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export default acidityHTML;
