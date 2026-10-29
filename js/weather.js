import { getLocale, t, formatNumber } from './i18n.js';

const weatherCodes = {
  0:['Clear skies','sun','☀️'],1:['Mostly clear','sun-cloud','🌤️'],2:['Partly cloudy','sun-cloud','⛅'],3:['Overcast','cloud','☁️'],
  45:['Fog','fog','🌫️'],48:['Depositing rime fog','fog','🌫️'],51:['Light drizzle','cloud-rain','🌦️'],53:['Drizzle','cloud-rain','🌧️'],55:['Dense drizzle','cloud-rain','🌧️'],56:['Freezing drizzle','cloud-rain','🌨️'],57:['Heavy freezing drizzle','cloud-rain','🌨️'],
  61:['Light rain','cloud-rain','🌦️'],63:['Rain','cloud-rain','🌧️'],65:['Heavy rain','cloud-rain','🌧️'],66:['Freezing rain','cloud-rain','🌨️'],67:['Heavy freezing rain','cloud-rain','🌨️'],
  71:['Light snow','snow','🌨️'],73:['Snow','snow','❄️'],75:['Heavy snow','snow','❄️'],77:['Snow grains','snow','❄️'],80:['Light showers','cloud-rain','🌦️'],81:['Rain showers','cloud-rain','🌧️'],82:['Heavy showers','cloud-rain','⛈️'],85:['Snow showers','snow','🌨️'],86:['Heavy snow showers','snow','❄️'],95:['Thunderstorm','storm','⛈️'],96:['Thunderstorm with hail','storm','⛈️'],99:['Severe thunderstorm with hail','storm','⚡']
};
export function condition(code, isDay = true) {
  const [, name, emoji = '⛅'] = weatherCodes[code] || ['Conditions unavailable','cloud','☁️'];
  const locale = getLocale();
  const label = code in weatherCodes ? t(`weather.code.${code}`) : t('weather.code.unknown');
  const isNight = !isDay && (code === 0 || code === 1);
  return { 
    label, 
    icon: isNight ? 'moon' : name,
    emoji: isNight ? '🌙' : emoji
  };
}
export function present(value) { return value !== null && value !== undefined && Number.isFinite(Number(value)); }
export function number(value, digits = 0) { return present(value) ? formatNumber(Number(value), { minimumFractionDigits:digits, maximumFractionDigits:digits }) : '—'; }
export function temp(value, prefs = {}, unit = false) {
  if (!present(value)) return '—';
  return `${formatNumber(Math.round(prefs.temperature === 'fahrenheit' ? value * 9 / 5 + 32 : value))}°${unit ? (prefs.temperature === 'fahrenheit' ? 'F' : 'C') : ''}`;
}
export function wind(value, prefs = {}, unit = true) {
  if (!present(value)) return '—';
  return `${formatNumber(Math.round(prefs.wind === 'mph' ? value / 1.609344 : value))}${unit ? (prefs.wind === 'mph' ? ' mph' : ' km/h') : ''}`;
}
export function direction(degrees) { return present(degrees) ? ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(degrees / 22.5) % 16] : '—'; }
export function localHour(iso, compact = false) {
  if (!iso) return '—';
  const hour = Number(iso.slice(11,13)), minute = iso.slice(14,16);
  const clock = `${formatNumber(hour % 12 || 12)}${!compact && minute !== '00' ? ':' + formatNumber(Number(minute),{minimumIntegerDigits:2,useGrouping:false}) : ''}`;
  return compact ? clock : `${clock} ${hour >= 12 ? t('weather.pm') : t('weather.am')}`;
}
export function dayLabel(iso, index) {
  if (index === 0) return t('weather.today');
  if (index === 1) return t('weather.tomorrow');
  const date=new Date(`${iso}T12:00:00`);
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(getLocale()==='hi'?'hi-IN-u-nu-deva':'en-IN',{weekday:'short',day:'numeric'}).format(date):String(iso||'—');
}
export function currentHourIndex(data) {
  const key = data.current.time.slice(0,13);
  const idx = data.hourly.time.findIndex(t => t.startsWith(key));
  return idx < 0 ? 0 : idx;
}
export function forecastHours(data, days = 0) {
  const date = data.daily.time[days];
  return data.hourly.time.map((t,i) => ({ time:t, index:i })).filter(v => v.time.startsWith(date));
}
export function deriveAdvisories(data) {
  if (!data) return [];
  const d = data.daily, advisories = [];
  // Explicit conservative demonstration thresholds, not agency alerts.
  const max = (field) => Math.max(...d[field].slice(0,3).filter(present));
  const add = (severity,title,body,threshold,key=null,value=null) => advisories.push({severity,title,body,threshold,key,value});
  const heat = max('temperature_2m_max');
  if (heat >= 35) add(heat >= 45 ? 'SEVERE' : heat >= 40 ? 'WARNING' : 'WATCH','Elevated heat in the next 3 days',`The forecast reaches ${Math.round(heat)}°C. Plan strenuous activity for cooler hours, drink water regularly, and check on people vulnerable to heat.`, 'Watch ≥35°C · Warning ≥40°C · Severe ≥45°C forecast daily maximum.','heat',Math.round(heat));
  const rain = max('precipitation_sum');
  if (rain >= 20) add(rain >= 100 ? 'SEVERE' : rain >= 50 ? 'WARNING' : 'WATCH','Heavy precipitation potential',`Up to ${rain.toFixed(1)} mm of total daily precipitation is forecast within the next 3 days. Check local travel conditions and official flood guidance. This does not predict flooding.`, 'Watch ≥20 mm · Warning ≥50 mm · Severe ≥100 mm forecast daily precipitation.','rain',rain.toFixed(1));
  const gusts = max('wind_gusts_10m_max');
  if (gusts >= 40) add(gusts >= 90 ? 'SEVERE' : gusts >= 65 ? 'WARNING' : 'WATCH','Gusty conditions possible',`Forecast gusts reach ${Math.round(gusts)} km/h in the next 3 days. Secure loose outdoor items and use caution in exposed areas.`, 'Watch ≥40 km/h · Warning ≥65 km/h · Severe ≥90 km/h forecast gusts.','wind',Math.round(gusts));
  if (d.weather_code.slice(0,3).some(c => c >= 95)) add('WATCH','Thunderstorms in the forecast','Thunderstorm conditions appear in the next 3 days. Monitor official alerts and seek indoor shelter if thunder is heard. Radar storm tracking is not available in this assistant.','Triggered by a WMO daily weather code ≥95 within the next 3 days.','storm');
  const uv = d.uv_index_max[0];
  if (uv >= 8) add('WATCH','Very high UV today',`Today’s maximum UV index is ${number(uv,1)}. Use sun protection and shade, especially around midday.`, 'Triggered by a daily maximum UV index ≥8.','uv',number(uv,1));
  const min = Math.min(...d.temperature_2m_min.slice(0,3).filter(present));
  if (min <= 0) add(min <= -15 ? 'WARNING' : 'WATCH','Freezing temperatures possible',`Overnight temperatures may fall to ${Math.round(min)}°C in the next 3 days. Watch for icy surfaces and dress for the cold.`, 'Watch ≤0°C · Warning ≤−15°C forecast daily minimum.','freeze',Math.round(min));
  const order = {SEVERE:0,WARNING:1,WATCH:2};
  return advisories.sort((a,b) => order[a.severity] - order[b.severity]);
}
export function dailySummary(data, prefs) {
  const d = data.daily, label = condition(d.weather_code[0]).label.toLocaleLowerCase(getLocale()==='hi'?'hi-IN-u-nu-deva':'en-IN');
  const probability = d.precipitation_probability_max[0];
  const rain = present(probability) ? t('weather.rainChance',{probability:formatNumber(Math.round(probability))}) : '';
  return t('weather.summary',{condition:label,high:temp(d.temperature_2m_max[0],prefs),low:temp(d.temperature_2m_min[0],prefs),rain});
}
