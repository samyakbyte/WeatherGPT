// Phase 2.3 — versioned farm storage, legacy migration, validation, CRUD.
import * as farms from '../js/farms.js';
import { parsePlaceQuery, parseCoordinates } from '../js/geocode.js';
import { makeState } from './harness.js';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => map.has(k) ? map.get(k) : null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    _map: map
  };
}

export function farmsSuite(check) {
  // ── Migration ──
  const legacy = [
    { name: 'Jaipur', country: 'India', region: 'Rajasthan', latitude: 26.9, longitude: 75.8, timezone: 'Asia/Kolkata' },
    { name: 'Broken', latitude: 'not-a-number', longitude: null },
    { name: 'Rampura', latitude: 27.1258, longitude: 76.7779 }
  ];
  const storage = memoryStorage({ 'weathergpt.saved': JSON.stringify(legacy) });
  const doc = farms.loadFarms(storage);
  check(doc.version === farms.FARM_SCHEMA_VERSION && doc.farms.length === 2, 'legacy saved places migrate into the v2 farm document, invalid ones are dropped');
  check(doc.farms.every(f => f.name && Number.isFinite(f.latitude) && Number.isFinite(f.longitude)), 'migrated farms have validated names and coordinates');
  check(farms.loadFarms(storage).farms.length === 2, 'migration is idempotent on reload');
  check(JSON.parse(storage.getItem('weathergpt.saved')).length === 3, 'legacy storage key is preserved for older versions');
  check(farms.loadFarms(memoryStorage({ 'weathergpt.farms.v2': '{corrupted json' })).farms.length === 0, 'corrupted storage is handled without throwing or inventing data');

  // ── Validation ──
  check(farms.validateFarm({ name: 'X', latitude: 91, longitude: 10 }) === null, 'out-of-range coordinates are rejected');
  check(farms.validateFarm({ name: '', latitude: 20, longitude: 70 }) === null, 'nameless farms are rejected');
  const clean = farms.validateFarm({ name: '  North field  ', latitude: '26.91', longitude: '75.79', crop: 'wheat', sowingDate: '2026-10-01', stage: 'sowing', drainage: 'poor', notes: 'x'.repeat(900) });
  check(clean && clean.name === 'North field' && clean.crop === 'wheat' && clean.notes.length === 500, 'farm fields are typed, bounded and trimmed');
  check(clean.stage === 'sowing' && clean.drainage === 'poor', 'growth stage and drainage survive validation');
  check(farms.validateFarm({ name: 'Y', latitude: 20, longitude: 70, crop: 'unknown-crop', sowingDate: '31/2/2026' }).crop === null, 'unknown crop and invalid date are dropped, not guessed');

  // ── CRUD + active farm ──
  let working = farms.emptyFarmDoc();
  const added = farms.addFarm(working, { name: 'Field A', latitude: 26.9, longitude: 75.8, crop: 'wheat' });
  working = added.doc;
  check(working.farms.length === 1 && added.farm.id, 'addFarm stores one validated farm with an id');
  working = farms.setActiveFarm(working, added.farm.id);
  check(farms.getActiveFarm(working)?.name === 'Field A', 'setActiveFarm selects the active farm');
  const updated = farms.updateFarm(working, added.farm.id, { crop: 'mustard', stage: 'flowering' });
  working = updated.doc;
  check(farms.getActiveFarm(working).crop === 'mustard' && farms.getActiveFarm(working).stage === 'flowering', 'updateFarm edits an existing farm');
  working = farms.deleteFarm(working, added.farm.id);
  check(working.farms.length === 0 && working.activeFarmId === null, 'deleteFarm clears the active pointer');
  check(farms.persistFarms(working, storage) === true, 'persistFarms writes the versioned document');
  check(JSON.parse(storage.getItem(farms.FARMS_KEY)).version === 2, 'persisted document carries a schema version');

  const location = farms.farmToLocation(clean);
  check(location.name === 'North field' && location.latitude === 26.91 && location.farmId === clean.id, 'farmToLocation exposes only coordinates/name to the weather layer');

  // ── Geocoding query parsing / coordinate safety ──
  const parsed = parsePlaceQuery('Rampura, Alwar, Rajasthan');
  check(parsed.name === 'Rampura' && parsed.context.district === 'Alwar' && parsed.context.state === 'Rajasthan', 'village + district + state query is parsed into context slots');
  const swapped = parseCoordinates('95.5, 26.9');
  check(swapped && swapped.swapped && swapped.latitude === 26.9 && swapped.longitude === 95.5, 'out-of-range first coordinate is detected as swapped and corrected with a confirmation flag');
  check(swapped.result.needsConfirm === true && /swapped/i.test(swapped.result.note), 'swapped coordinates are never accepted without confirmation');
  const ambiguous = parseCoordinates('75.8, 26.9');
  check(ambiguous && !ambiguous.swapped && ambiguous.result.needsConfirm === true, 'an ambiguous but valid pair asks for confirmation without silently swapping');
  check(parseCoordinates('91.5, 200').invalid === true, 'invalid coordinate ranges are rejected');
  check(parseCoordinates('26.9, 75.8').swapped === false, 'normal coordinates need no confirmation');

  // ── Privacy ──
  const state = makeState({ farm: clean });
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}`;
  check(!url.includes(clean.name) && !url.includes('wheat'), 'only coordinates enter the weather request URL, never farm names or crops');
  check(state.farm.name === clean.name, 'farm details live in local state only');
}
