// Deterministic provider fixtures for browser tests. No live API calls: the
// sandbox cannot reach those hosts, so all external traffic is intercepted.
// A separate live-API pass is listed as "needs manual device testing" in the
// README/PR because it cannot be performed in this environment.
export const DAYS = Array.from({ length: 7 }, (_, i) => `2026-10-${26 + i}`);
const pad = n => String(n).padStart(2, '0');

export function buildForecast() {
  const hours = DAYS.flatMap(d => Array.from({ length: 24 }, (_, h) => `${d}T${pad(h)}:00`));
  const hourly = { time: hours };
  const base = {
    temperature_2m: 29, apparent_temperature: 32, relative_humidity_2m: 65,
    precipitation_probability: 45, precipitation: 0, rain: 0, weather_code: 61,
    visibility: 10000, uv_index: 5, wind_speed_10m: 14, wind_direction_10m: 90,
    cloud_cover: 50, wind_gusts_10m: 24
  };
  for (const [k, v] of Object.entries(base)) hourly[k] = hours.map((_, i) => k === 'temperature_2m' ? v + Math.sin(i / 4) * 3 : v);
  const daily = { time: DAYS };
  for (const [k, v] of Object.entries({
    weather_code: 61, temperature_2m_max: 34, temperature_2m_min: 22,
    apparent_temperature_max: 37, uv_index_max: 6, precipitation_sum: 5,
    precipitation_probability_max: 45, wind_speed_10m_max: 22, wind_gusts_10m_max: 34
  })) daily[k] = DAYS.map(() => v);
  daily.temperature_2m_max[2] = 39;
  daily.sunrise = DAYS.map(d => d + 'T06:12');
  daily.sunset = DAYS.map(d => d + 'T18:05');
  return {
    latitude: 26.875, longitude: 75.75, elevation: 431.2, generationtime_ms: 1.3,
    utc_offset_seconds: 19800, timezone: 'Asia/Kolkata', timezone_abbreviation: 'IST',
    current: {
      time: DAYS[0] + 'T10:00', interval: 900, temperature_2m: 29.1,
      relative_humidity_2m: 65, apparent_temperature: 32.2, is_day: 1,
      precipitation: 0, rain: 0, weather_code: 61, cloud_cover: 50,
      surface_pressure: 970, pressure_msl: 1009, wind_speed_10m: 14,
      wind_direction_10m: 90, wind_gusts_10m: 28
    },
    hourly, daily, hourly_units: { temperature_2m: '°C' }, daily_units: { temperature_2m_max: '°C' }
  };
}

export const GEOCODE = {
  results: [
    { id: 1269515, name: 'Jaipur', latitude: 26.91962, longitude: 75.78781, elevation: 435, feature_code: 'PPLA', country_code: 'IN', country: 'India', admin1: 'Rajasthan', admin2: 'Jaipur', admin3: 'Jaipur', timezone: 'Asia/Kolkata', population: 3046163 }
  ]
};
export const VILLAGES = [
  { place_id: 1, licence: 'Data © OpenStreetMap contributors, ODbL 1.0', osm_type: 'node', osm_id: 1, lat: '27.1258341', lon: '76.7779326', category: 'place', type: 'village', addresstype: 'village', name: 'Rampura', display_name: 'Rampura, Reni Tehsil, Alwar, Rajasthan, India', address: { village: 'Rampura', county: 'Reni Tehsil', state_district: 'Alwar', state: 'Rajasthan', country: 'India' } },
  { place_id: 2, licence: 'Data © OpenStreetMap contributors, ODbL 1.0', osm_type: 'node', osm_id: 2, lat: '27.1843717', lon: '77.0544147', category: 'place', type: 'village', addresstype: 'village', name: 'Rampura', display_name: 'Rampura, Kathumar Tehsil, Alwar, Rajasthan, India', address: { village: 'Rampura', county: 'Kathumar Tehsil', state_district: 'Alwar', state: 'Rajasthan', country: 'India' } }
];
export const PHOTON = { type: 'FeatureCollection', features: VILLAGES.map(v => ({ type: 'Feature', properties: { osm_type: 'N', osm_id: v.osm_id, osm_key: 'place', osm_value: v.type, name: v.name, county: v.address.county, state: v.address.state, country: 'India', countrycode: 'IN' }, geometry: { type: 'Point', coordinates: [Number(v.lon), Number(v.lat)] } })) };
export const RADAR = {
  host: 'https://tilecache.rainviewer.com', generated: 1761450000,
  radar: { past: [{ time: 1761448800, path: '/v2/radar/1761448800' }, { time: 1761449400, path: '/v2/radar/1761449400' }], nowcast: [] }
};
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

export default buildForecast;
