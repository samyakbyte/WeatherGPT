import { nextHours } from '../js/day-ahead.js';
import { makeState } from './harness.js';

export function dayAheadSuite(check) {
  check(nextHours(null).length===0,'day ahead: absent weather stays unavailable');
  const data=makeState({hourlyFn:{precipitation_probability:i=>i===17?85:5,temperature_2m:i=>i===20?34:25,wind_speed_10m:i=>i===30?99:12}}).weather;
  const results=nextHours(data);
  check(results.length===3&&results.every(r=>r.available===12),'day ahead: exactly twelve provider hours per measurement');
  check(results[0].peak.value===85&&results[0].peak.time.endsWith('17:00'),'day ahead: rain maximum uses the correct timestamp');
  check(results[1].peak.value===34&&results[1].peak.time.endsWith('20:00'),'day ahead: temperature peak is independent of rain');
  check(results[2].peak.value===12,'day ahead: a later high wind lies outside the window');
  data.hourly.precipitation_probability.fill(null);
  check(nextHours(data)[0].peak===null&&nextHours(data)[0].available===0,'day ahead: missing rain is not zero rain');
  data.hourly.precipitation_probability[13]=0;
  check(nextHours(data)[0].peak.value===0&&nextHours(data)[0].available===1,'day ahead: zero is a real reading with partial coverage');
  data.hourly.precipitation_probability[14]='';data.hourly.precipitation_probability[15]=false;data.hourly.precipitation_probability[16]=NaN;
  check(nextHours(data)[0].available===1,'day ahead: empty, boolean and invalid readings are rejected');
  data.current.time=data.hourly.time.at(-2);
  check(nextHours(data)[1].available===2,'day ahead: short forecast explicitly reports partial coverage');
  data.hourly.temperature_2m.fill(-8);
  check(nextHours(data)[1].peak.value===-8,'day ahead: below-zero temperatures remain negative');
  data.current.time='2026-09-15T23:15';data.hourly.wind_speed_10m.fill(12);data.hourly.wind_speed_10m[24]=20;
  check(nextHours(data)[2].peak.time==='2026-09-16T00:00','day ahead: crosses local midnight correctly');
  delete data.hourly.wind_speed_10m;
  check(nextHours(data)[2].peak===null,'day ahead: absent metric does not break other summaries');
}
