// Isolated, in-memory agricultural demonstration fixtures. Never persisted and
// never written into the live weather or farm records.
const SCENARIOS = {
  'acid-rain': { label: 'Acid rain', crop: 'french-beans', ph: 4.2, type: 'ph', description: 'Simulated rainwater pH 4.2; no live pH measurement.' },
  'extreme-heat': { label: 'Extreme heat', crop: 'tomato', type: 'heat', description: 'Simulated forecast heat scenario; not provider weather.' },
  'heavy-rain': { label: 'Heavy rainfall', crop: 'wheat', type: 'rain', description: 'Simulated forecast rainfall scenario; not provider weather.' },
  normal: { label: 'Normal conditions', crop: 'french-beans', type: 'normal', description: 'Simulated generally mild conditions; not a live forecast.' }
};

const pad = n => String(n).padStart(2, '0');
const toLocalISO = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:00`;

function simulatedWeather(now = new Date(), mode = 'normal') {
  const hourlyTime = [], dailyTime = [];
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 168; i++) { const d = new Date(start); d.setUTCHours(start.getUTCHours() + i); hourlyTime.push(toLocalISO(d)); }
  for (let i = 0; i < 7; i++) { const d = new Date(start); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + i); dailyTime.push(toLocalISO(d).slice(0, 10)); }

  const max = Array.from({ length: 7 }, (_, i) => mode === 'heat' ? [44, 41, 38, 36, 34, 33, 34][i] : mode === 'rain' ? [29, 30, 31, 30, 29, 30, 31][i] : [28, 29, 30, 29, 28, 30, 29][i]);
  const min = Array.from({ length: 7 }, (_, i) => mode === 'heat' ? [27, 26, 25, 24, 24, 23, 24][i] : [18, 19, 19, 18, 17, 19, 18][i]);
  const rain = Array.from({ length: 7 }, (_, i) => mode === 'rain' ? [75, 22, 8, 2, 0, 2, 1][i] : [2, 3, 2, 3, 2, 2, 3][i]);
  if (mode === 'normal') rain.splice(0, 7, 2, 2, 2, 2, 2, 2, 2);
  const maxGust = Array.from({ length: 7 }, (_, i) => mode === 'rain' && i === 0 ? 48 : 18);
  const maxWind = maxGust.map(v => Math.round(v * 0.6));
  const weatherCode = Array.from({ length: 7 }, (_, i) => mode === 'rain' && i < 2 ? (i === 0 ? 65 : 63) : 1);
  const hourly = {
    time: hourlyTime,
    temperature_2m: [], apparent_temperature: [], relative_humidity_2m: [], precipitation: [], precipitation_probability: [],
    wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], cloud_cover: [], weather_code: [], uv_index: [], visibility: []
  };
  for (let i = 0; i < hourlyTime.length; i++) {
    const day = Math.min(6, Math.floor(i / 24)), hour = Number(hourlyTime[i].slice(11, 13));
    const temp = hour >= 6 && hour <= 16 ? max[day] : min[day];
    const hourlyRain = rain[day] / 24;
    hourly.temperature_2m.push(temp);
    hourly.apparent_temperature.push(mode === 'heat' && day === 0 ? temp + 2 : temp);
    hourly.relative_humidity_2m.push(mode === 'heat' && day === 0 ? 42 : mode === 'rain' && day < 2 ? 92 : 58);
    hourly.precipitation.push(hourlyRain);
    hourly.precipitation_probability.push(mode === 'rain' && day === 0 ? 95 : 15);
    hourly.wind_speed_10m.push(maxWind[day]);
    hourly.wind_gusts_10m.push(maxGust[day]);
    hourly.wind_direction_10m.push(240);
    hourly.cloud_cover.push(mode === 'rain' && day < 2 ? 90 : 25);
    hourly.weather_code.push(weatherCode[day]);
    hourly.uv_index.push(mode === 'heat' && day === 0 ? 9 : 4);
    hourly.visibility.push(10000);
  }
  const daily = {
    time: dailyTime, temperature_2m_max: max, temperature_2m_min: min,
    precipitation_sum: rain, precipitation_probability_max: rain.map((_, i) => mode === 'rain' && i === 0 ? 95 : 20),
    wind_gusts_10m_max: maxGust, wind_speed_10m_max: maxWind, weather_code: weatherCode,
    uv_index_max: max.map((_, i) => mode === 'heat' && i === 0 ? 9 : 4),
    sunrise: dailyTime.map(d => `${d}T06:00`), sunset: dailyTime.map(d => `${d}T18:00`)
  };
  const currentTime = hourlyTime[0];
  const current = {
    time: currentTime, temperature_2m: hourly.temperature_2m[0], apparent_temperature: hourly.apparent_temperature[0],
    relative_humidity_2m: hourly.relative_humidity_2m[0], precipitation: hourly.precipitation[0],
    wind_speed_10m: hourly.wind_speed_10m[0], wind_direction_10m: 240, pressure_msl: 1012,
    weather_code: weatherCode[0], is_day: 1
  };
  return { current, hourly, daily, timezone: 'UTC', utc_offset_seconds: 0, fetchedAt: Date.now(), simulated: true };
}

export function demoScenario(key) { return SCENARIOS[key] || null; }

/** Returns an entirely synthetic forecast, even if live weather is present. */
export function makeDemoState(key, baseState = {}, now = new Date()) {
  const scenario = SCENARIOS[key];
  if (!scenario) return null;
  const mode = scenario.type === 'heat' ? 'heat' : scenario.type === 'rain' ? 'rain' : 'normal';
  const farm = baseState.farm || null;
  const location = baseState.location || {};
  const target = farm || location;
  return {
    key, scenario, simulated: true, crop: scenario.crop,
    location: {
      name: target.name || location.name || 'Demo location',
      latitude: Number(target.latitude ?? location.latitude), longitude: Number(target.longitude ?? location.longitude),
      farmId: farm?.id || null
    },
    weather: simulatedWeather(now, mode),
    pHReading: scenario.ph == null ? null : {
      id: `demo-${key}`, value: scenario.ph, date: simulatedWeather(now, mode).daily.time[0],
      method: 'simulation', source: 'DEMO / SIMULATED DATA', recordType: 'simulated',
      location: target.name || location.name || 'Demo location',
      latitude: Number(target.latitude ?? location.latitude), longitude: Number(target.longitude ?? location.longitude),
      farmId: farm?.id || null
    }
  };
}

export const DEMO_SCENARIOS = Object.freeze(Object.keys(SCENARIOS));
export default { demoScenario, makeDemoState, DEMO_SCENARIOS };
