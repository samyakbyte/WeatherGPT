// Multi-source place search. Open-Meteo first (fast, cached, admin fields),
// Photon for type-ahead village names, Nominatim ONLY for explicit user
// requests (its usage policy forbids client-side autocomplete and caps use at
// 1 request/second). No key is used anywhere. See docs/DATA_SOURCES.md.
import { validCoordinates } from './api.js';

const OPEN_METEO = 'https://geocoding-api.open-meteo.com/v1/search';
const PHOTON = 'https://photon.komoot.io/api/';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const CACHE_TTL = 60 * 60 * 1000;
const cache = new Map();
let lastNominatimAt = 0;

const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
const text = v => String(v ?? '').trim().slice(0, 120);

async function fetchJSON(url, { signal, timeout = 7000, headers = {} } = {}) {
  const key = url;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL) return hit.data;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const onAbort = () => controller.abort();
  if (signal?.aborted) { clearTimeout(timer); throw new DOMException('Aborted', 'AbortError'); }
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal, headers, credentials: 'omit' });
    if (!response.ok) throw new Error(`Geocoder returned HTTP ${response.status}`);
    const data = await response.json();
    cache.set(key, { data, time: Date.now() });
    if (cache.size > 120) cache.delete(cache.keys().next().value);
    return data;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error.name === 'AbortError') throw new Error('The place search timed out. Please retry.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Split "Rampura, Alwar, Rajasthan" into a name and district/state context.
 *  Also understands "Rampura Alwar Rajasthan" as free-form text. */
export function parsePlaceQuery(raw) {
  const query = text(raw);
  const parts = query.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { name: parts[0], full: query, context: { district: parts[1] || null, state: parts[2] || null }, explicitContext: true };
  }
  return { name: query, full: query, context: {}, explicitContext: false };
}

/** Coordinate entry: validates decimal degrees and flags a likely swapped pair. */
export function parseCoordinates(raw) {
  const match = String(raw).trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  let latitude = Number(match[1]), longitude = Number(match[2]);
  let swapped = false, ambiguous = false;
  if (Math.abs(latitude) > 90 && Math.abs(longitude) <= 90) {
    [latitude, longitude] = [longitude, latitude];
    swapped = true;
  } else if (Math.abs(latitude) > Math.abs(longitude) && Math.abs(latitude) > 60) {
    // Both orders are geographically valid. Never guess: keep the entered
    // order but ask the user to confirm (or enter them the other way round).
    ambiguous = true;
  }
  if (!validCoordinates(latitude, longitude)) return { invalid: true, latitude, longitude };
  return {
    invalid: false, swapped, ambiguous, latitude, longitude,
    result: {
      name: `${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`,
      country: 'Map coordinates', region: '', district: '', state: '',
      label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      type: 'coordinates', latitude, longitude,
      source: 'user-coordinates', sourceLabel: 'Entered coordinates',
      needsConfirm: swapped || ambiguous,
      note: swapped
        ? 'The two numbers look swapped; latitude must be between −90 and 90. The corrected pair is shown — confirm before using.'
        : ambiguous ? 'Both orders are valid coordinates. This is using the first number as latitude; confirm, or re-enter them swapped.' : ''
    }
  };
}

function openMeteoResults(data) {
  return (data.results || []).map(p => ({
    name: text(p.name), country: text(p.country), region: text(p.admin2 || p.admin1),
    district: text(p.admin2), state: text(p.admin1),
    label: [p.name, p.admin2, p.admin1, p.country].filter(Boolean).join(', '),
    type: p.feature_code === 'PPLC' ? 'capital' : p.feature_code === 'PPLA' ? 'admin centre' : 'populated place',
    featureCode: p.feature_code || '', latitude: num(p.latitude), longitude: num(p.longitude),
    timezone: p.timezone || '', population: p.population ?? null,
    source: 'open-meteo', sourceLabel: 'Open-Meteo / GeoNames'
  })).filter(p => validCoordinates(p.latitude, p.longitude));
}

function photonResults(data) {
  return (data.features || []).map(f => {
    const p = f.properties || {}, coords = f.geometry?.coordinates || [];
    return {
      name: text(p.name), country: text(p.country), region: text(p.county || p.city),
      district: text(p.county), state: text(p.state),
      label: [p.name, p.city, p.county, p.state, p.country].filter(Boolean).join(', '),
      type: text(p.osm_value || p.type || 'place') || 'place',
      featureCode: p.osm_value || '', latitude: num(coords[1]), longitude: num(coords[0]),
      timezone: '', population: null,
      source: 'photon', sourceLabel: 'Photon / OpenStreetMap'
    };
  }).filter(p => validCoordinates(p.latitude, p.longitude));
}

function nominatimResults(data) {
  return (Array.isArray(data) ? data : []).map(p => {
    const a = p.address || {};
    return {
      name: text(p.name || a.village || a.town || a.city),
      country: text(a.country), region: text(a.state_district || a.county),
      district: text(a.state_district || a.county), state: text(a.state),
      label: text(p.display_name),
      type: text(p.addresstype || p.type) || 'place',
      featureCode: text(p.type), latitude: num(p.lat), longitude: num(p.lon),
      timezone: '', population: null,
      source: 'nominatim', sourceLabel: 'Nominatim / OpenStreetMap'
    };
  }).filter(p => validCoordinates(p.latitude, p.longitude));
}

function dedupe(list) {
  const seen = new Set();
  return list.filter(p => {
    const key = `${p.name.toLowerCase()}|${Number(p.latitude).toFixed(3)}|${Number(p.longitude).toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function contextMatches(list, context) {
  if (!context || !Object.keys(context).length) return true;
  return list.some(p => {
    const hay = [p.name, p.district, p.region, p.state, p.country, p.label].filter(Boolean).join(' ').toLowerCase();
    return Object.values(context).filter(Boolean).every(v => hay.includes(String(v).toLowerCase()));
  });
}

/**
 * Search places with ordered fallbacks.
 * @param {string} raw query ("Rampura", "Rampura, Alwar, Rajasthan", "26.9, 75.8")
 * @param {{signal?:AbortSignal, explicit?:boolean, countryCode?:string}} options
 *        `explicit: true` allows Nominatim (user pressed Enter / asked a question).
 * @returns {Promise<{results:Array, sources:string[], warnings:string[]}>}
 */
export async function searchPlaces(raw, { signal, explicit = false, countryCode = '' } = {}) {
  const coords = parseCoordinates(raw);
  if (coords) {
    if (coords.invalid) return { results: [], sources: [], warnings: ['Coordinates must be decimal degrees: latitude −90…90, longitude −180…180.'] };
    return { results: [coords.result], sources: ['user-coordinates'], warnings: coords.result.note ? [coords.result.note] : [] };
  }
  const { name, full, context } = parsePlaceQuery(raw);
  if (name.length < 2) return { results: [], sources: [], warnings: [] };
  const warnings = [], sources = [];
  let results = [];

  // 1. Open-Meteo. Its comma qualifier must match a country or admin1 exactly.
  try {
    const qualifier = context.state ? `, ${context.state}` : '';
    const params = new URLSearchParams({ name: name + qualifier, count: '10', language: 'en', format: 'json' });
    if (countryCode) params.set('countryCode', countryCode);
    const data = await fetchJSON(`${OPEN_METEO}?${params}`, { signal });
    results = openMeteoResults(data);
    if (results.length) sources.push('open-meteo');
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') throw error;
    warnings.push('Open-Meteo place search was unavailable.');
  }
  // If the user gave district context and Open-Meteo did not honour it, fall through.
  const needFallback = !results.length || (context.district && !contextMatches(results, context));

  // 2. Photon (allowed for type-ahead).
  if (needFallback) {
    try {
      const params = new URLSearchParams({ q: full, limit: '8', lang: 'en' });
      const data = await fetchJSON(`${PHOTON}?${params}`, { signal });
      const photon = photonResults(data);
      if (photon.length) { results = dedupe([...results, ...photon]); if (!sources.includes('photon')) sources.push('photon'); }
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') throw error;
      warnings.push('Photon place search was unavailable.');
    }
  }

  // 3. Nominatim — explicit user requests only, ≤1 request/second.
  if (explicit && (!results.length || (context.district && !contextMatches(results, context)))) {
    const wait = Math.max(0, 1100 - (Date.now() - lastNominatimAt));
    if (wait && !signal?.aborted) await new Promise(resolve => setTimeout(resolve, wait));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    lastNominatimAt = Date.now();
    try {
      const params = new URLSearchParams({ q: full, format: 'jsonv2', addressdetails: '1', limit: '8', 'accept-language': 'en' });
      const data = await fetchJSON(NOMINATIM + '?' + params, { signal, headers: { 'Accept-Language': 'en' } });
      const nominatim = nominatimResults(data);
      if (nominatim.length) { results = dedupe([...results, ...nominatim]); sources.push('nominatim'); }
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') throw error;
      warnings.push('Nominatim place search was unavailable.');
    }
  }
  // Order: context-matching results first, then everything else.
  const scored = results.map(p => {
    const hay = [p.name, p.district, p.region, p.state, p.country, p.label].filter(Boolean).join(' ').toLowerCase();
    const score = (context.state && hay.includes(context.state.toLowerCase()) ? 2 : 0) +
      (context.district && hay.includes(context.district.toLowerCase()) ? 2 : 0) +
      (p.population ? Math.min(2, Math.log10(p.population) / 4) : 0);
    return { p, score };
  }).sort((a, b) => b.score - a.score).map(x => x.p);
  return { results: scored.slice(0, 12), sources, warnings };
}

/** Backwards-compatible flat list for callers that only need an array. */
export async function searchLocationsCompat(query, signal, options = {}) {
  const { results } = await searchPlaces(query, { signal, ...options });
  return results;
}

export default searchPlaces;
