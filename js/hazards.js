// Forecast-derived hazard calculation. Every number comes from the loaded
// provider arrays. Null/missing values are skipped and reported; hazards are
// never computed from defaults. This module does NOT diagnose disease and does
// NOT contain agricultural guidance (that lives in data/crops.js + advisory.js).
import { HAZARD_THRESHOLDS as T } from '../data/hazard-thresholds.js';
import { currentHourIndex } from './weather.js';

const present = v => v !== null && v !== undefined && Number.isFinite(Number(v));
const num = v => Number(v);

function severityFor(value, t) {
  if (value >= t.severe) return 'SEVERE';
  if (value >= t.warning) return 'WARNING';
  if (value >= t.watch) return 'WATCH';
  return null;
}

/** @returns {{hazards:Array, notes:string[], coverage:{hours:number, from:string|null, to:string|null}}} */
export function computeHazards(state, options = {}) {
  const w = state?.weather;
  const horizon = options.hours || T.horizonHours;
  const notes = [];
  if (!w?.hourly?.time?.length || !w?.daily?.time?.length) {
    return { hazards: [], notes: ['No forecast is loaded; hazards cannot be calculated.'], coverage: { hours: 0, from: null, to: null } };
  }
  const h = w.hourly, d = w.daily;
  const start = currentHourIndex(w);
  const end = Math.min(h.time.length, start + horizon);
  const indexes = Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
  const values = (field) => indexes.map(i => h[field]?.[i]).filter(present).map(num);
  const missing = (field) => indexes.filter(i => !present(h[field]?.[i])).length;
  const hazards = [];
  const coverage = { hours: indexes.length, from: h.time[start] || null, to: h.time[end - 1] || null };
  const push = (hazard) => hazards.push({ ...hazard, basis: 'forecast', thresholdsVersion: T.version });

  // ── Heavy rain: rolling 24/48/72-hour precipitation sums + intensity ──
  const precip = h.precipitation || [];
  const validPrecip = indexes.filter(i => present(precip[i]));
  if (!validPrecip.length) notes.push('Hourly precipitation is unavailable; heavy-rain totals were not calculated.');
  else {
    const sumOver = hours => {
      const slice = indexes.slice(0, hours);
      const usable = slice.filter(i => present(precip[i]));
      return { total: usable.reduce((a, i) => a + num(precip[i]), 0), usable: usable.length, expected: slice.length, from: h.time[slice[0]], to: h.time[slice.at(-1)] };
    };
    const r24 = sumOver(24), r48 = sumOver(48), r72 = sumOver(72);
    const worst = [r24, r48, r72].reduce((a, b) => b.total > a.total ? b : a);
    const level = severityFor(r24.total, { watch: T.heavyRain.watch24, warning: T.heavyRain.warning24, severe: T.heavyRain.severe24 }) ||
      (r48.total >= T.heavyRain.watch48 ? 'WATCH' : null) || (r72.total >= T.heavyRain.watch72 ? 'WATCH' : null);
    const peakHour = validPrecip.reduce((a, b) => num(precip[a]) >= num(precip[b]) ? a : b);
    const intensity = num(precip[peakHour]);
    if (level || intensity >= T.heavyRain.intensityHourly) {
      push({
        id: 'heavy-rain', kind: 'heavyRain', severity: level || 'WATCH',
        metric: 'precipitation', value: Number(worst.total.toFixed(1)), unit: 'mm',
        windowLabel: `${worst.from.slice(0, 10)} ${worst.from.slice(11, 16)} → ${worst.to.slice(0, 10)} ${worst.to.slice(11, 16)} local`,
        from: worst.from, to: worst.to,
        detail: `Forecast precipitation totals ${r24.total.toFixed(1)} mm in 24 h, ${r48.total.toFixed(1)} mm in 48 h, ${r72.total.toFixed(1)} mm in 72 h. Peak hourly ${intensity.toFixed(1)} mm at ${h.time[peakHour]}.`,
        partial: worst.usable < worst.expected
      });
      if (worst.usable < worst.expected) notes.push(`${worst.expected - worst.usable} hourly precipitation values were missing in the accumulation window.`);
    }
  }

  // ── Heat / cold from daily maxima/minima (next 3 days) ──
  const maxTemps = d.temperature_2m_max?.slice(0, 3).filter(present).map(num) || [];
  if (!maxTemps.length) notes.push('Daily maximum temperatures are unavailable; heat hazard not calculated.');
  else {
    const max = Math.max(...maxTemps), dayIndex = d.temperature_2m_max.findIndex(v => present(v) && num(v) === max);
    const level = severityFor(max, T.heat);
    if (level) push({ id: 'heat', kind: 'heat', severity: level, metric: 'temperature_2m_max', value: max, unit: '°C',
      windowLabel: d.time[dayIndex] || 'next 3 days', from: `${d.time[dayIndex]}T00:00`, to: `${d.time[dayIndex]}T23:00`,
      detail: `Highest forecast daily maximum in the next three days is ${max.toFixed(1)}°C (${d.time[dayIndex]}).` });
  }
  const minTemps = d.temperature_2m_min?.slice(0, 3).filter(present).map(num) || [];
  if (!minTemps.length) notes.push('Daily minimum temperatures are unavailable; cold/frost screening not calculated.');
  else {
    const min = Math.min(...minTemps), dayIndex = d.temperature_2m_min.findIndex(v => present(v) && num(v) === min);
    const coldLevel = min <= T.cold.watch ? 'WATCH' : null;
    // Frost screening: low minimum + a clear, relatively dry night. Never a diagnosis.
    const nightHours = indexes.filter(i => {
      const hour = Number(h.time[i].slice(11, 13));
      return h.time[i].startsWith(d.time[dayIndex]) && (hour >= 22 || hour <= 6);
    });
    const clouds = nightHours.map(i => h.cloud_cover?.[i]).filter(present).map(num);
    const humidity = nightHours.map(i => h.relative_humidity_2m?.[i]).filter(present).map(num);
    const clear = clouds.length ? Math.max(...clouds) <= T.cold.frostMaxCloudCover : null;
    const dry = humidity.length ? Math.max(...humidity) <= T.cold.frostMaxHumidity : null;
    const frostRisk = min <= T.cold.frostTemperature && clear !== false && dry !== false;
    if (coldLevel || frostRisk) push({
      id: frostRisk ? 'frost-risk' : 'cold', kind: frostRisk ? 'frost' : 'cold', severity: frostRisk ? 'WARNING' : coldLevel,
      metric: 'temperature_2m_min', value: min, unit: '°C',
      windowLabel: `${d.time[dayIndex]} night`, from: `${d.time[dayIndex]}T22:00`, to: `${d.time[dayIndex]}T06:00`,
      detail: `Lowest forecast minimum is ${min.toFixed(1)}°C. ${frostRisk ? `Night cloud cover max ${clouds.length ? Math.max(...clouds) : '—'}% and humidity max ${humidity.length ? Math.max(...humidity) : '—'}% — conditions that MAY favour frost, not a frost forecast.` : 'Cold conditions only.'}`,
      partial: !clouds.length || !humidity.length
    });
    if (!clouds.length || !humidity.length) notes.push('Night cloud/humidity values were partly unavailable; frost screening is indicative only.');
  }

  // ── Strong wind / gusts ──
  const gusts = d.wind_gusts_10m_max?.slice(0, 3).filter(present).map(num) || [];
  const hourlyGusts = values('wind_gusts_10m');
  const peakGust = gusts.length ? Math.max(...gusts) : hourlyGusts.length ? Math.max(...hourlyGusts) : null;
  if (peakGust === null) notes.push('Wind gust values are unavailable; wind hazard not calculated.');
  else {
    const level = severityFor(peakGust, T.wind);
    if (level) push({ id: 'strong-wind', kind: 'wind', severity: level, metric: 'wind_gusts_10m_max', value: peakGust, unit: 'km/h',
      windowLabel: 'next 3 days', from: h.time[start], to: h.time[end - 1],
      detail: `Maximum forecast gust ${peakGust.toFixed(0)} km/h in the next three days.` });
  }

  // ── Consecutive dry days (daily precipitation_sum) ──
  const dailyRain = d.precipitation_sum || [];
  if (!dailyRain.filter(present).length) notes.push('Daily precipitation is unavailable; dry spell not calculated.');
  else {
    let run = 0, startDay = null;
    for (let i = 0; i < d.time.length; i++) {
      if (!present(dailyRain[i])) { run = 0; continue; }
      if (num(dailyRain[i]) < T.drySpell.dailyPrecipitation) { if (run === 0) startDay = d.time[i]; run++; }
      else break;
    }
    if (run >= T.drySpell.days) push({ id: 'dry-spell', kind: 'drySpell', severity: 'WATCH', metric: 'precipitation_sum', value: run, unit: 'days',
      windowLabel: `${startDay} → ${d.time[run - 1]}`, from: `${startDay}T00:00`, to: `${d.time[run - 1]}T23:00`,
      detail: `${run} consecutive forecast days below ${T.drySpell.dailyPrecipitation} mm precipitation from ${startDay}.` });
  }

  // ── Prolonged humid/wet spell (disease-favouring CONDITIONS only) ──
  const rh = h.relative_humidity_2m || [];
  const rhPresent = indexes.filter(i => present(rh[i]));
  if (!rhPresent.length) notes.push('Relative humidity is unavailable; humid-spell screening not calculated.');
  else {
    let run = 0, maxRun = 0, runEnd = null;
    for (const i of indexes) {
      const wet = present(rh[i]) && num(rh[i]) >= T.humid.relativeHumidity;
      if (wet) { run++; if (run > maxRun) { maxRun = run; runEnd = h.time[i]; } } else run = 0;
    }
    if (maxRun >= T.humid.hours) push({ id: 'humid-spell', kind: 'humid', severity: 'WATCH', metric: 'relative_humidity_2m', value: maxRun, unit: 'hours',
      windowLabel: `up to ${runEnd}`, from: h.time[start], to: runEnd,
      detail: `${maxRun} consecutive hours at or above ${T.humid.relativeHumidity}% relative humidity, ending ${runEnd}. Conditions can favour fungal diseases; inspect the crop and consult your local KVK — this is not a disease diagnosis.` });
  }
  return { hazards, notes, coverage };
}

export default computeHazards;
