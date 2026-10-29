// Target-location time handling. Open-Meteo returns LOCAL civil timestamps
// (no zone suffix), an IANA `timezone`, a `timezone_abbreviation` and a
// `utc_offset_seconds` that its docs say is fixed for the whole response,
// including across DST transitions. We therefore compare civil strings from the
// provider with civil strings we build here, and use Intl (IANA zone) only to
// decide "what is the local date at this instant". No browser-local Date math is
// used for the target location.
const DAY_MS = 86400000;
const pad = n => String(n).padStart(2, '0');

export function zoneOf(state) {
  return state?.weather?.timezone || state?.location?.timezone || 'UTC';
}

export function nowMillis(state) {
  return state?.now ? Date.parse(state.now) : Date.now();
}

/** Civil date/time parts of an absolute instant in an IANA zone (DST-aware). */
export function zonedParts(ms, zone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(ms));
    const get = type => parts.find(p => p.type === type)?.value;
    return {
      year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
      hour: Number(get('hour')) % 24, minute: Number(get('minute')),
      date: `${get('year')}-${get('month')}-${get('day')}`
    };
  } catch {
    // Unknown zone: fall back to UTC rather than the browser's zone.
    const d = new Date(ms);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
      hour: d.getUTCHours(), minute: d.getUTCMinutes(), date: d.toISOString().slice(0, 10) };
  }
}

export function isCivilDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const ms = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

export function addDays(date, days) {
  const ms = Date.parse(`${date}T12:00:00Z`);
  return Number.isFinite(ms) ? new Date(ms + days * DAY_MS).toISOString().slice(0, 10) : null;
}

export function daysBetween(from, to) {
  const a = Date.parse(`${from}T12:00:00Z`), b = Date.parse(`${to}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / DAY_MS) : null;
}

export function weekdayOf(date) {
  return Number.isFinite(Date.parse(`${date}T12:00:00Z`))
    ? new Date(`${date}T12:00:00Z`).getUTCDay() : null;
}

/** "Today" in the target location. A frozen `state.now` wins; otherwise the
 * provider's own current.time is used so legacy fixtures stay deterministic. */
export function localToday(state) {
  const weather = state?.weather;
  if (state?.now) return zonedParts(nowMillis(state), zoneOf(state)).date;
  if (weather?.current?.time && isCivilDate(weather.current.time.slice(0, 10))) return weather.current.time.slice(0, 10);
  if (weather?.daily?.time?.[0]) return weather.daily.time[0];
  return zonedParts(nowMillis(state), zoneOf(state)).date;
}

export function zoneAbbreviation(state) {
  const w = state?.weather;
  if (w?.timezone_abbreviation) return w.timezone_abbreviation;
  if (Number.isFinite(w?.utc_offset_seconds)) {
    const sign = w.utc_offset_seconds < 0 ? '-' : '+';
    const abs = Math.abs(w.utc_offset_seconds);
    return `UTC${sign}${Math.floor(abs / 3600)}:${pad(Math.floor(abs % 3600 / 60))}`;
  }
  return zoneOf(state).split('/').pop().replaceAll('_', ' ');
}

export function hourLabel(hour, minute = 0, language = 'en') {
  const h12 = hour % 12 || 12, ampm = hour >= 12 ? 'PM' : 'AM';
  const clock = `${h12}${minute ? ':' + pad(minute) : ''} ${ampm}`;
  if (language !== 'hi') return clock;
  const part = hour < 6 ? 'रात' : hour < 12 ? 'सुबह' : hour < 17 ? 'दोपहर' : hour < 20 ? 'शाम' : 'रात';
  return `${part} ${clock}`;
}

export function dayWord(offset, language = 'en') {
  if (language === 'hi') return ['आज', 'कल', 'परसों'][offset] || null;
  return ['Today', 'Tomorrow', 'The day after tomorrow'][offset] || null;
}

export function formatDate(date, language = 'en') {
  if (!isCivilDate(date)) return date || '';
  try {
    return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN-u-nu-latn' : 'en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'
    }).format(new Date(`${date}T12:00:00Z`));
  } catch { return date; }
}

/** Human-checkable resolution of a relative date/time, e.g.
 *  "Tomorrow, Tue 27 Oct, 7 PM IST". Always includes the zone abbreviation. */
export function resolvedLabel({ state, date, dayOffset = 0, hour = null, minute = 0, window = null, language = 'en' }) {
  const zone = zoneAbbreviation(state);
  const day = dayWord(dayOffset, language);
  const dateText = formatDate(date, language) + (isCivilDate(date) && dayOffset > 2 ? ` ${date.slice(0, 4)}` : '');
  const dayText = day ? `${day}, ${dateText}` : dateText;
  let timeText;
  if (hour !== null && hour !== undefined) timeText = hourLabel(Number(hour), minute, language);
  else if (window) timeText = language === 'hi' ? (window.labelHi || window.label) : window.label;
  else timeText = language === 'hi' ? 'पूरा दिन' : 'whole day';
  return `${dayText}, ${timeText} ${zone} (${date})`;
}

export function forecastRange(state) {
  const d = state?.weather?.daily?.time, h = state?.weather?.hourly?.time;
  return {
    firstDate: d?.[0] || null, lastDate: d?.at(-1) || null,
    firstHour: h?.[0] || null, lastHour: h?.at(-1) || null
  };
}

/** Hourly indices for a local civil window. Never invents values for hours that
 * are not in the provider's series. `onlyFuture` excludes already-elapsed hours
 * on day 0. */
export function selectHourIndices(state, { date, startHour = 0, endHour = 24, onlyFuture = true } = {}) {
  const w = state?.weather;
  if (!w?.hourly?.time || !date) return { indexes: [], date, complete: false };
  const current = w.current?.time?.slice(0, 13);
  const indexes = [];
  w.hourly.time.forEach((t, i) => {
    if (!t.startsWith(date)) return;
    const hour = Number(t.slice(11, 13));
    if (hour < startHour || hour >= endHour) return;
    if (onlyFuture && date === w.daily?.time?.[0] && current && t.slice(0, 13) < current) return;
    indexes.push(i);
  });
  return { indexes, date, complete: indexes.length > 0 };
}
