// Versioned, device-local farm storage. Farm names, crops and notes NEVER
// leave the browser: only latitude/longitude are sent to the weather API.
// Migrates the legacy `weathergpt.saved` array without destroying it.
import { validCoordinates } from './api.js';

export const FARMS_KEY = 'weathergpt.farms.v2';
export const LEGACY_SAVED_KEY = 'weathergpt.saved';
export const FARM_SCHEMA_VERSION = 2;
export const MAX_FARMS = 30;

export const CROPS = ['wheat', 'rice', 'maize', 'mustard', 'cotton', 'soybean', 'potato', 'tomato', 'sugarcane', 'french-beans', 'other'];
export const STAGES = ['sowing', 'vegetative', 'flowering', 'grain filling', 'maturity', 'harvest'];
export const IRRIGATION = ['rainfed', 'canal', 'tube well', 'drip', 'sprinkler', 'other'];
export const DRAINAGE = ['good', 'moderate', 'poor', 'unknown'];

const bounded = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const oneOf = (value, list) => list.includes(value) ? value : null;
const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ? value : null;

export function emptyFarmDoc() {
  return { version: FARM_SCHEMA_VERSION, farms: [], activeFarmId: null };
}

/** Validate and normalise one farm record. Returns null for unusable records. */
export function validateFarm(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const latitude = Number(raw.latitude), longitude = Number(raw.longitude);
  if (!validCoordinates(latitude, longitude)) return null;
  const name = bounded(raw.name, 80);
  if (!name) return null;
  return {
    id: bounded(raw.id, 60) || `farm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    placeLabel: bounded(raw.placeLabel || raw.label, 160),
    latitude, longitude,
    crop: oneOf(raw.crop, CROPS),
    sowingDate: isoDate(raw.sowingDate),
    stage: oneOf(raw.stage, STAGES),
    irrigation: oneOf(raw.irrigation, IRRIGATION),
    drainage: oneOf(raw.drainage, DRAINAGE),
    soil: bounded(raw.soil, 200),
    notes: bounded(raw.notes, 500),
    createdAt: bounded(raw.createdAt, 40) || new Date().toISOString()
  };
}

export function farmToLocation(farm) {
  return {
    name: farm.name, country: '', region: farm.placeLabel || '',
    latitude: farm.latitude, longitude: farm.longitude,
    timezone: farm.timezone || undefined, farmId: farm.id
  };
}

/** Migrate legacy saved places into farm records. Idempotent: legacy records
 *  are skipped when their coordinates already exist in the v2 document. */
export function migrateLegacy(saved, doc = emptyFarmDoc()) {
  if (!Array.isArray(saved)) return doc;
  const next = { ...doc, farms: [...(doc.farms || [])] };
  saved.forEach((place, index) => {
    if (!place || !validCoordinates(Number(place.latitude), Number(place.longitude))) return;
    const exists = next.farms.some(f => Math.abs(f.latitude - Number(place.latitude)) < 1e-6 && Math.abs(f.longitude - Number(place.longitude)) < 1e-6);
    if (exists) return;
    const record = validateFarm({
      id: `legacy-${index}`, name: place.name || `Saved place ${index + 1}`,
      placeLabel: [place.name, place.region, place.country].filter(Boolean).join(', '),
      latitude: place.latitude, longitude: place.longitude, timezone: place.timezone
    });
    if (record) next.farms.push(record);
  });
  next.farms = next.farms.slice(0, MAX_FARMS);
  return next;
}

/** Load safely: corrupted or missing storage never throws. */
export function loadFarms(storage = globalThis.localStorage) {
  let raw;
  try { raw = JSON.parse(storage?.getItem(FARMS_KEY) ?? 'null'); } catch { raw = null; }
  let doc;
  if (!raw || typeof raw !== 'object') doc = emptyFarmDoc();
  else doc = {
    version: FARM_SCHEMA_VERSION,
    farms: Array.isArray(raw.farms) ? raw.farms.map(validateFarm).filter(Boolean).slice(0, MAX_FARMS) : [],
    activeFarmId: typeof raw.activeFarmId === 'string' ? raw.activeFarmId : null
  };
  if (!doc.farms.some(f => f.id === doc.activeFarmId)) doc.activeFarmId = null;
  // First run: migrate the legacy saved-places list (read-only).
  let legacy = [];
  try { legacy = JSON.parse(storage?.getItem(LEGACY_SAVED_KEY) ?? '[]'); } catch { legacy = []; }
  const migrated = migrateLegacy(Array.isArray(legacy) ? legacy : [], doc);
  return migrated;
}

export function persistFarms(doc, storage = globalThis.localStorage) {
  try {
    storage?.setItem(FARMS_KEY, JSON.stringify({ version: FARM_SCHEMA_VERSION, farms: doc.farms.slice(0, MAX_FARMS), activeFarmId: doc.activeFarmId }));
    return true;
  } catch { return false; }
}

export function addFarm(doc, farm) {
  if (doc.farms.length >= MAX_FARMS) return { doc, error: `You can keep up to ${MAX_FARMS} farms on this device.` };
  const record = validateFarm({ ...farm, id: farm?.id || undefined });
  if (!record) return { doc, error: 'A farm needs a name and valid coordinates.' };
  return { doc: { ...doc, farms: [...doc.farms, record] }, farm: record };
}

export function updateFarm(doc, id, patch) {
  const index = doc.farms.findIndex(f => f.id === id);
  if (index < 0) return { doc, error: 'Farm not found.' };
  const record = validateFarm({ ...doc.farms[index], ...patch, id });
  if (!record) return { doc, error: 'The updated farm has invalid coordinates or name.' };
  const farms = [...doc.farms]; farms[index] = record;
  return { doc: { ...doc, farms }, farm: record };
}

export function deleteFarm(doc, id) {
  return { ...doc, farms: doc.farms.filter(f => f.id !== id), activeFarmId: doc.activeFarmId === id ? null : doc.activeFarmId };
}

export function setActiveFarm(doc, id) {
  return { ...doc, activeFarmId: doc.farms.some(f => f.id === id) ? id : null };
}

export function getActiveFarm(doc) {
  return doc?.farms?.find(f => f.id === doc.activeFarmId) || null;
}

export default loadFarms;
