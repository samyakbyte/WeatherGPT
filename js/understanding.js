// Structured, validated intent interpretation for WeatherGPT.
//
// Design: normalize ALL input (English, Devanagari, Romanized Hindi) to one
// canonical analysis string; REMOVE temporal phrases, activity words and topic
// words BEFORE looking for a place; resolve date/time in the TARGET location's
// time zone; then emit one validated intent object. Legacy field names are kept
// as aliases so the existing views and test families keep working.
//
// No meteorological values live in this module. No example question is
// special-cased: every rule below is a general vocabulary/pattern rule.
import * as tz from './timezone.js';
import { PART_WINDOWS, DEFAULT_OUTDOOR_WINDOW, windowLabel as partWindowLabel } from '../data/time-windows.js';

export const topicNames = {
  rain: 'Rain / umbrella', weather: 'Weather outlook', temperature: 'Temperature',
  wind: 'Wind', clouds: 'Cloud cover', humidity: 'Humidity', pressure: 'Pressure',
  uv: 'UV exposure', visibility: 'Visibility', comparison: 'Temperature comparison',
  feels: 'Feels-like temperature', sun: 'Sunrise / sunset', alerts: 'Warnings / safety',
  outdoors: 'Outdoor planning', radar: 'Radar map', crop: 'Crop / farm advisory',
  acidity: 'Rainwater acidity', farm: 'Farm management', current: 'Current conditions',
  advisory: 'Weather advisories', other: 'Unrecognized topic'
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  शून्य: 0, एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6,
  सात: 7, आठ: 8, नौ: 9, दस: 10,
  ek: 1, teen: 3, chaar: 4, char: 4, paanch: 5, panch: 5, chhe: 6, chhai: 6,
  saat: 7, aath: 8, nau: 9, das: 10
};
const CITY_NAMES = [
  ['नई दिल्ली', 'New Delhi'], ['नयी दिल्ली', 'New Delhi'], ['जयपुर', 'Jaipur'],
  ['दिल्ली', 'Delhi'], ['मुंबई', 'Mumbai'], ['मुम्बई', 'Mumbai'],
  ['बेंगलुरु', 'Bengaluru'], ['बैंगलोर', 'Bengaluru'], ['चेन्नई', 'Chennai'],
  ['कोलकाता', 'Kolkata'], ['हैदराबाद', 'Hyderabad'], ['लखनऊ', 'Lucknow'],
  ['अहमदाबाद', 'Ahmedabad'], ['पुणे', 'Pune'], ['भोपाल', 'Bhopal'],
  ['पटना', 'Patna'], ['रांची', 'Ranchi'], ['इंदौर', 'Indore'],
  ['चंडीगढ़', 'Chandigarh'], ['गुवाहाटी', 'Guwahati'], ['लंदन', 'London'],
  ['न्यूयॉर्क', 'New York'], ['अलवर', 'Alwar'], ['राजस्थान', 'Rajasthan']
];
const STATES = ['rajasthan', 'punjab', 'haryana', 'gujarat', 'maharashtra', 'madhyapradesh', 'madhya pradesh',
  'uttarpradesh', 'uttar pradesh', 'bihar', 'jharkhand', 'westbengal', 'west bengal', 'odisha', 'orissa',
  'telangana', 'andhrapradesh', 'andhra pradesh', 'tamilnadu', 'tamil nadu', 'karnataka', 'kerala',
  'assam', 'chhattisgarh', 'uttarakhand', 'himachalpradesh', 'himachal pradesh'];
// "Delhi" and "India" are deliberately NOT states here: they are common place
// names in their own right (New Delhi, Delhi, India) and must stay searchable.

// Words that can never be a place. Kept broad on purpose: a false rejection is
// recoverable (the user can use search), but a false acceptance sends a bogus
// string to the geocoder and produces an answer about the wrong place.
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'will', 'would', 'can', 'could', 'should', 'shall', 'may',
  'do', 'does', 'did', 'have', 'has', 'had', 'get', 'got', 'go', 'going', 'gonna', 'take', 'carry', 'bring',
  'need', 'know', 'wear', 'expect', 'check', 'tell', 'show', 'open', 'please', 'ask', 'say', 'give',
  'what', 'when', 'where', 'which', 'who', 'why', 'how', 'much', 'many', 'about', 'for', 'from', 'with',
  'so', 'am', "i'm", "we're", 'and', 'or', 'vs', 'versus', 'to', 'of', 'in', 'on', 'at', 'by', 'near', 'around', 'between', 'during',
  'best', 'good', 'better', 'time', 'times', 'day', 'days', 'hour', 'hours', 'week', 'weekend', 'now',
  'today', 'tomorrow', 'tonight', 'yesterday', 'morning', 'afternoon', 'evening', 'night', 'noon', 'midnight',
  'weather', 'forecast', 'outlook', 'condition', 'conditions', 'rain', 'rains', 'rainy', 'shower', 'showers',
  'drizzle', 'precipitation', 'umbrella', 'brolly', 'raincoat', 'wet', 'temperature', 'temp', 'hot', 'cold',
  'heat', 'warm', 'cool', 'feels', 'feel', 'apparent', 'wind', 'windy', 'gust', 'gusts', 'breeze', 'humidity',
  'humid', 'cloud', 'clouds', 'cloudy', 'overcast', 'uv', 'visibility', 'fog', 'mist', 'pressure', 'sunrise',
  'sunset', 'sun', 'alert', 'alerts', 'warning', 'warnings', 'storm', 'flood', 'danger', 'safe', 'cyclone',
  'lightning', 'radar', 'map', 'outside', 'outdoor', 'walk', 'walking', 'run', 'running', 'jog', 'jogging',
  'picnic', 'cycling', 'hike', 'hiking', 'travel', 'farm', 'farming', 'farmer', 'crop', 'crops', 'field',
  'harvest', 'spray', 'spraying', 'sow', 'sowing', 'irrigation', 'soil', 'wheat', 'rice', 'paddy', 'maize',
  'mustard', 'cotton', 'soybean', 'potato', 'tomato', 'sugarcane', 'advisory', 'advice', 'precautions',
  'compare', 'comparison', 'difference', 'than', 'there', 'here', 'then', 'next', 'last', 'coming', 'after',
  'before', 'still', 'really', 'quite', 'very', 'kya', 'ka', 'ki', 'ke', 'mein', 'me', 'hai', 'hain', 'hoga',
  'hogi', 'hoge', 'kaisa', 'kaisi', 'kaise', 'batao', 'bataiye', 'chahiye', 'karo', 'karein', 'kholo',
  'dikhao', 'dikhaiye', 'aur', 'wahaan', 'vahan', 'abhi', 'kal', 'aaj', 'parso', 'shaam', 'sham', 'subah',
  'dopahar', 'raat', 'baje', 'o\'clock', 'am', 'pm', 'ist', 'utc', 'like', 'looks', 'look', 'any', 'some',
  'joke', 'help', 'hello', 'thanks', 'thank', 'hi', 'hey', 'yes', 'no', 'clear', 'sunny', 'snow', 'snowfall',
  'pesticide', 'fertilizer', 'insecticide', 'herbicide', 'weedicide', 'fungicide', 'dose', 'se', 'tak',
  'zyada', 'jyada', 'garam', 'thanda', 'whats', 'what\'s', 'hows', 'wheres', 'whens',
  // Devanagari function words (weather words are already transliterated above).
  'है', 'हैं', 'था', 'थी', 'हुआ', 'हुई', 'होगा', 'होगी', 'क्या', 'कैसा', 'कैसी', 'कैसे', 'और',
  'में', 'से', 'का', 'की', 'के', 'को', 'पर', 'भी', 'ही', 'तो', 'कल', 'आज', 'परसों', 'अभी',
  'शाम', 'सुबह', 'दोपहर', 'रात', 'बजे', 'बारिश', 'वर्षा', 'बरसात', 'मौसम', 'तापमान', 'हवा',
  'नमी', 'बादल', 'धूप', 'कोहरा', 'गर्मी', 'ठंड', 'फसल', 'गेहूँ', 'गेहूं', 'धान', 'खेत', 'किसान',
  'सलाह', 'खोलो', 'दिखाओ', 'बताओ', 'चाहिए', 'ज़्यादा', 'ज्यादा', 'अधिक', 'महसूस', 'स्प्रे',
  'रडार', 'पानी', 'बुवाई', 'सूखा', 'पाला', 'ओले', 'तूफान', 'आंधी', 'बाढ़', 'चेतावनी'
]);

const ROMANIZED_HINDI = /\b(?:kal|aaj|parso|parsō|baarish|barish|barsat|mausam|tapman|garmi|thand|thandi|hawa|nami|baadal|dhoop|subah|shaam|sham|dopahar|raat|baje|kholo|dikhao|fasal|gehu|gehun|dhan|khet|kisan|kisaan|pani|paani|salah|salaah|kya|hai|hoga|hogi|ka|ki|ke|mein|aur|abhi|batao|chahiye|suraj|barf|olf)\b/i;

function applyList(text, list) {
  for (const [pattern, replacement] of list) text = text.replace(pattern, replacement);
  return text;
}

/** Convert any of the three input forms into one canonical analysis string. */
export function canonicalize(raw) {
  const original = String(raw ?? '').trim().slice(0, 400);
  const script = /[\u0900-\u097f]/.test(original) ? 'devanagari' : 'latin';
  const pastTense = /(था|थी|हुआ|हुई|बीता|पिछल|जलवायु|yesterday|\bthi\b|\btha\b|\bhua\b|\bhui\b|historical|climate|last (?:year|month|week))/i.test(original);
  let q = original.normalize('NFKC').replace(/[’‘]/g, "'").replace(/[०-९]/g, c => String(c.charCodeAt(0) - 0x0966));
  q = applyList(q, [
    // Ambiguous Hindi "kal": past-tense markers make it yesterday. Devanagari
    // has no JS \b word boundary, so those patterns are deliberately unanchored.
    [/कल/gu, pastTense ? ' yesterday ' : ' tomorrow '], [/\bkal\b/giu, pastTense ? ' yesterday ' : ' tomorrow '],
    [/परसों/gu, ' day after tomorrow '], [/\bparso\b/giu, ' day after tomorrow '],
    [/आज/gu, ' today '], [/\baaj\b/giu, ' today '],
    [/अभी/gu, ' now '], [/\babhi\b/giu, ' now '],
    [/शाम/gu, ' evening '], [/\b(?:shaam|sham)\b/giu, ' evening '],
    [/सुबह/gu, ' morning '], [/\bsubah\b/giu, ' morning '],
    [/दोपहर/gu, ' afternoon '], [/\bdopahar\b/giu, ' afternoon '],
    [/रात/gu, ' night '], [/\braat\b/giu, ' night '],
    [/बजे/gu, " o'clock "], [/\bbaje\b/giu, " o'clock "],
    [/बारिश|वर्षा|बरसात|मानसून/gu, ' rain '], [/\b(?:baarish|barish|barsat|mansoon)\b/giu, ' rain '],
    [/छाता/gu, ' umbrella '], [/\b(?:chhata|chaata)\b/giu, ' umbrella '],
    [/तापमान/gu, ' temperature '], [/\btapman\b/giu, ' temperature '],
    [/मौसम/gu, ' weather '], [/\bmausam\b/giu, ' weather '],
    [/महसूस/gu, ' feels like '], [/\bmahsoos\b/giu, ' feels like '],
    [/गर्मी|गर्म/gu, ' hot '], [/\bgarmi\b/giu, ' hot '],
    [/ठंडा|ठंड/gu, ' cold '], [/\b(?:thand|thandi)\b/giu, ' cold '],
    [/हवा/gu, ' wind '], [/\bhawa\b/giu, ' wind '],
    [/आर्द्रता|नमी/gu, ' humidity '], [/\bnami\b/giu, ' humidity '],
    [/बादल/gu, ' clouds '], [/\b(?:baadal|badal)\b/giu, ' clouds '],
    [/धूप/gu, ' sun '], [/\b(?:dhoop|dhup)\b/giu, ' sun '],
    [/कोहरा/gu, ' visibility '], [/\bkohra\b/giu, ' visibility '],
    [/सूर्योदय/gu, ' sunrise '], [/सूर्यास्त/gu, ' sunset '],
    [/चेतावनी|अलर्ट/gu, ' warning '], [/\balert\b/giu, ' warning '],
    [/तूफान|आंधी/gu, ' storm '], [/\b(?:toofan|tufan)\b/giu, ' storm '],
    [/बाढ़/gu, ' flood '], [/ओले/gu, ' storm '],
    [/फसल/gu, ' crop '], [/\bfasal\b/giu, ' crop '],
    [/गेहूँ|गेहूं/gu, ' wheat '], [/\b(?:gehu|gehun)\b/giu, ' wheat '],
    [/धान/gu, ' rice '], [/\bdhan\b/giu, ' rice '],
    [/बुवाई/gu, ' sowing '], [/\b(?:buvai|buai)\b/giu, ' sowing '],
    [/स्प्रे/gu, ' spray '], [/किसान/gu, ' farmer '], [/\bkisan\b/giu, ' farmer '],
    [/खेत/gu, ' field '], [/\bkhet\b/giu, ' field '],
    [/सलाह/gu, ' advice '], [/\bsalah\b/giu, ' advice '],
    [/(\s)से(\s)/gu, '$1 se $2'], [/(\s)तक(\s)/gu, '$1 tak $2'],
    [/खोलो/gu, ' open '], [/\bkholo\b/giu, ' open '],
    [/दिखाओ/gu, ' show '], [/\bdikhao\b/giu, ' show '],
    [/कैसा|कैसी/gu, ' what '], [/\b(?:kaisa|kaisi)\b/giu, ' what '],
    [/क्या/gu, ' what '], [/\bkya\b/giu, ' what '],
    [/और/gu, ' and '], [/\baur\b/giu, ' and '],
    [/में/gu, ' in '], [/\bmein\b/giu, ' in '],
    [/होगी|होगा|है|हैं|था|थी|हुआ|हुई/gu, ' is '], [/\b(?:hogi|hoga|hai|hain|thi|tha|hua|hui)\b/giu, ' is '],
    [/ज़्यादा|ज्यादा/gu, ' more '], [/अधिक/gu, ' more '],
    [/\b(?:zyada|jyada)\b/giu, ' more '], [/\bgaram\b/giu, ' hot '], [/\bthanda\b/giu, ' cold '],
    [/तुलना/gu, ' compare '], [/पर/gu, ' in '],
    [/बाहर/gu, ' outside '], [/\bbahar\b/giu, ' outside '],
    [/घूमन(?:ा|े)|टहलन(?:ा|े)|दौड़/gu, ' walk '], [/\bghoom(?:ne|na)?\b/giu, ' walk '],
    [/समय/gu, ' time '], [/\bsamay\b/giu, ' time '],
    [/रडार/gu, ' radar '], [/अम्लता|पीएच/gu, ' acidity '],
    [/वर्षा जल|बारिश का पानी/gu, ' rainwater '], [/सूखा/gu, ' dry '], [/पाला/gu, ' frost '],
    [/कितना|कितनी/gu, ' how much '], [/\b(?:kitna|kitni)\b/giu, ' how much '],
    [/कब/gu, ' when '], [/\bkab\b/giu, ' when '],
    [/रहेगा|रहेगी/gu, ' will be '], [/चाहिए/gu, ' need '], [/\bchahiye\b/giu, ' need '],
    [/मेरा|मेरी/gu, ' my '], [/\b(?:mera|meri)\b/giu, ' my '],
    [/सूरज/gu, ' sun '], [/बर्फ/gu, ' snow '],
    [/\bacidity\b|\brainwater\b|\bph\b/giu, ' acidity '],
    // English synonyms (also covers typos from voice input).
    [/\b(?:tmrw|tmr|tommorow|tommorrow)\b/gi, ' tomorrow '],
    [/\b(?:wether|wheather)\b/gi, ' weather '],
    [/\b(?:precip|precipitation|drizzle|downpour|showers?|raining|rainy|monsoon)\b/gi, ' rain '],
    [/\b(?:brolly|raincoat)\b/gi, ' umbrella '],
    [/\b(?:breezy|windy|gusty)\b/gi, ' wind '],
    [/\b(?:muggy|humid)\b/gi, ' humidity '],
    [/\bfeel\b/gi, ' feels like '],
    [/\b(?:temp|temps)\b/gi, ' temperature '],
    [/\b(?:scorching|sweltering|warm)\b/gi, ' hot '],
    [/\b(?:chilly|freezing)\b/gi, ' cold '],
    [/\b(?:noon|midday)\b/gi, ' 12 PM '], [/\bmidnight\b/gi, ' 12 AM '],
    [/\b(?:am|pm)\b/g, m => ' ' + m.toUpperCase() + ' '],
    [/\ba\.?m\.?\b/gi, ' AM '], [/\bp\.?m\.?\b/gi, ' PM ']
  ]);
  // Number words → digits (both clock and "in N days"). Devanagari words are
  // matched without word boundaries; Latin words keep them ("do" is excluded
  // because it collides with the English verb).
  q = q.replace(/शून्य|एक|दो|तीन|चार|पाँच|पांच|छह|छः|सात|आठ|नौ|दस/gu, m => String(NUMBER_WORDS[m] ?? m));
  q = q.replace(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|ek|teen|chaar|char|paanch|panch|chhe|chhai|saat|aath|nau|das)\b/giu,
    m => String(NUMBER_WORDS[m.toLowerCase()] ?? m));
  // Written hours with meridiem, e.g. "seven PM" → "7 PM".
  q = q.replace(/\b(\d{1,2})\s+(AM|PM)\b/g, '$1 $2');
  // Devanagari place names → geocoder-friendly Latin names.
  for (const [hi, en] of CITY_NAMES) q = q.split(hi).join(' ' + en + ' ');
  // Meridiem markers must survive lowercasing: the time parser matches AM|PM.
  q = q.toLowerCase().replace(/\b(am|pm)\b/g, m => m.toUpperCase()).replace(/\s+/g, ' ').trim();
  return { original, q, script, pastTense, romanizedHindi: script === 'latin' && ROMANIZED_HINDI.test(original) };
}

const TEMPORAL_PATTERNS = [
  /\b(?:between|from)\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:AM|PM|o'clock)?\s*(?:and|to|[-–])\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:AM|PM|o'clock)?\b/g,
  /\b(?:in|after)\s+\d+\s+days?\b/g,
  /\b(?:day after tomorrow|the day after|tomorrow|today|tonight|yesterday|this weekend|next week|next month|next year|last week|last month|last year)\b/g,
  /\b(?:next|this|coming|on|by)?\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b/g,
  /\b(?:at|around|by|from|during|until|till|before|after)?\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|o'clock)\b/g,
  /\b(?:at|around|by|from|during)?\s*\d{1,2}:\d{2}\b/g,
  /\b(?:next hour|this hour|coming hours?)\b/g,
  /\b(?:morning|afternoon|evening|night|tonight|noon|midnight)\b/g
];

/** Remove temporal phrases BEFORE place extraction. "in" is temporal only when
 * the following tokens are temporal; a bare "in London" stays. */
export function removeTemporal(q) {
  let text = ' ' + q + ' ';
  for (const pattern of TEMPORAL_PATTERNS) text = text.replace(pattern, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

const titleCase = s => s.replace(/\b[a-z]/g, c => c.toUpperCase());

function validPlace(value) {
  if (!value) return false;
  const v = value.trim();
  if (v.length < 2 || v.length > 90) return false;
  if (/^\d/.test(v)) return false;
  const words = v.split(/\s+/);
  if (words.every(w => STOP_WORDS.has(w))) return false;
  if (words.some(w => /^(?:\d+|am|pm|o'clock|days?|hours?|weeks?|years?)$/.test(w))) return false;
  if (WEEKDAYS.includes(v)) return false;
  if (Object.keys(PART_WINDOWS).includes(v) || STATES.includes(v)) return false;
  return true;
}

const LEADING_NOISE = /^(?:what|whats|what's|which|who|how|when|where|why|is|are|will|can|could|should|do|does|did|tell|show|please|give|me|us|the|a|an|about|for|of|and|then|also|aur|kya|kaise|kab|kitna|kitni)\b\s*/i;

function cleanPlace(value) {
  let v = String(value || '').replace(/[?!.;,]+$/g, '').replace(/^[,;\s]+/, '').trim();
  v = v.replace(/\b(?:in|at|near|for|to|around|from|of|the|please|mein|me)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  v = v.replace(/['’]s\b/g, '').trim();
  // Question words and verbs are not place names. Strip them repeatedly so
  // "What's the weather in New Delhi" cannot become "What New Delhi".
  let previous;
  do { previous = v; v = v.replace(LEADING_NOISE, '').trim(); } while (v !== previous);
  return v;
}

function parsePlaceContext(text) {
  const parts = text.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const context = {};
    if (parts[1]) context.district = titleCase(parts[1]);
    if (parts[2]) context.state = titleCase(parts[2]);
    return { query: titleCase(parts[0]), fullQuery: titleCase(parts.join(', ')), context };
  }
  const words = text.split(/\s+/);
  if (words.length >= 3 && STATES.includes(words.at(-1).toLowerCase())) {
    return { query: titleCase(words.slice(0, -1).join(' ')), fullQuery: titleCase(text), context: { state: titleCase(words.at(-1)) } };
  }
  return { query: titleCase(text), fullQuery: titleCase(text), context: {} };
}

/** Extract a place from a canonical question AFTER temporal/topic/activity
 * removal. Returns {query, fullQuery, context, kind, status, candidates}. */
export function extractPlace({ original, q, temporalFree }) {
  const coordinate = original.match(/(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (coordinate) {
    let lat = Number(coordinate[1]), lon = Number(coordinate[2]);
    let swapped = false;
    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) { [lat, lon] = [lon, lat]; swapped = true; }
    return { query: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, fullQuery: `${lat}, ${lon}`,
      context: {}, kind: 'coordinates', status: 'pending', candidates: [], coordinates: { lat, lon, swapped } };
  }
  const possessive = original.match(/^([\p{L} .'-]+?)['’]s\s+(?:weather|forecast|temperature|rain|wind|humidity|mausam)/iu);
  let raw = possessive ? cleanPlace(possessive[1]) : '';
  if (!raw) {
    // Keep comma-separated geographic context, but never restore the raw
    // question: doing so reintroduces dates and conversational clauses.
    let source = temporalFree
      // Carrying verbs before an article/object are actions, not town names.
      // Do not blacklist "keep": College Keep is a legitimate explicit name.
      .replace(/\b(?:keep|pack|bring|carry|take)\s+(?=(?:an?|the|my|our|your|umbrella)\b)/gi, ' ')
      .replace(/\b(?:heading|headed|commuting)\s+to\b/gi, ' to ')
      // Generic destinations are activities. Preserve compounds such as
      // College Station / State College, and a city following "college in".
      .replace(/\b(?:to|at|my|our|have)\s+(?:the\s+)?(?:college|school|work|office|class|university)(?=\s*(?:[,.;?!]|$)|\s+(?:in|near|so|should|do|and|with)\b)/gi, ' ');
    const pieces = source.split(/\band\b|\bvs\b|\bversus\b|[?;]/i)
      .map(p => p.replace(/[^A-Za-z\u0900-\u097f\s,'.-]/g, ' '))
      .map(p => p.split(/\s+/).filter(w => !STOP_WORDS.has(w.toLowerCase().replace(/^[,.;]+|[,.;]+$/g, ''))).join(' '))
      .map(cleanPlace).filter(validPlace);
    raw = pieces[0] || '';
  }
  if (!raw) return { query: null, fullQuery: null, context: {}, kind: 'none', status: 'none', candidates: [] };
  const multi = /\band\b|\bvs\b|\bversus\b/i.test(temporalFree) || (raw.includes(',') === false && /\band\b/i.test(original));
  const parsed = parsePlaceContext(raw);
  return { ...parsed, kind: 'name', status: multi ? 'ambiguous-name' : 'pending', candidates: [] };
}

function detectTopic(q) {
  if (/\bradar\b|\brain map\b/.test(q)) return 'radar';
  if (/\b(?:alert|warning|storm|flood|safe|danger|cyclone|lightning)\b/.test(q)) return 'alerts';
  if (/\b(?:hotter|warmer|cooler|colder|compare|comparison|difference)\b/.test(q) ||
      (/\btomorrow\b/.test(q) && /\btoday\b/.test(q) && /\b(?:hot|cold|more|less)\b/.test(q))) return 'comparison';
  if (/\b(?:crop|wheat|rice|paddy|maize|mustard|cotton|soybean|potato|tomato|sugarcane|fasal|gehu|dhan|harvest|spray|sowing|field|farmer|khet|kisan|advisory|advice|precautions)\b/.test(q)) return 'crop';
  if (/\b(?:acid|acidity|ph|rainwater)\b/.test(q)) return 'acidity';
  if (/\b(?:feels like|feels|apparent temperature)\b/.test(q)) return 'feels';
  if (/\b(?:walk|run|jog|outside|outdoor|picnic|cycling|hike|hiking|best time|good time)\b/.test(q)) return 'outdoors';
  if (/\b(?:sunrise|sunset)\b/.test(q)) return 'sun';
  if (/\b(?:humidity|moisture)\b/.test(q)) return 'humidity';
  if (/\b(?:cloud|clouds|cloudy|overcast)\b/.test(q)) return 'clouds';
  if (/\b(?:pressure|barometer)\b/.test(q)) return 'pressure';
  if (/\b(?:uv|sunburn|sunscreen)\b/.test(q)) return 'uv';
  if (/\b(?:visibility|fog|mist)\b/.test(q)) return 'visibility';
  if (/\b(?:rain|umbrella|wet|shower|drizzle|precipitation)\b/.test(q)) return 'rain';
  if (/\b(?:wind|gust|breez)\b/.test(q)) return 'wind';
  if (/\b(?:temperature|hot|cold|heat)\b/.test(q)) return 'temperature';
  if (/\b(?:weather|forecast|outlook|conditions)\b/.test(q)) return 'weather';
  if (/\b(?:save|bookmark)\b/.test(q)) return 'farm';
  return 'other';
}

const METRIC_FOR_TOPIC = {
  rain: 'precipitation_probability', temperature: 'temperature_2m', feels: 'apparent_temperature',
  wind: 'wind_speed_10m', humidity: 'relative_humidity_2m', clouds: 'cloud_cover',
  uv: 'uv_index', visibility: 'visibility', pressure: 'pressure_msl',
  sun: 'sunrise_sunset', comparison: 'temperature_2m_max', weather: 'temperature_2m',
  outdoors: 'comfort_score', alerts: 'advisory', radar: 'radar', crop: 'advisory',
  acidity: 'ph', farm: 'storage', current: 'current', advisory: 'advisory', other: null
};

function clarification(intent, en, hi, choices = []) {
  if (intent.clarification) return;
  intent.clarification = { text: intent.language === 'hi' ? hi : en, choices };
  intent.unresolved.push(intent.clarification ? 'clarification' : 'unknown');
}

function detectFollowup(q) {
  return /^(?:and\b|what about\b|how about\b|also\b|और|वहाँ|wahaan\b|aur\b)/i.test(q);
}

/** Resolve the date from canonical q. Returns legacy + structured fields. */
function resolveDate(q, state, intent, previous) {
  const today = tz.localToday(state);
  let dayOffset = /\bday after tomorrow\b/.test(q) ? 2 : /\btomorrow\b/.test(q) ? 1 : 0;
  let resolved = /\b(?:today|tomorrow|tonight|day after tomorrow)\b/.test(q);
  const relative = q.match(/\b(?:in|after)\s+(\d+)\s+days?\b/);
  const weekday = q.match(/\b(?:next\s+|this\s+|on\s+|coming\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  const iso = q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const numericDate = q.match(/\b\d{1,2}\/\d{1,2}\b/);
  const monthDate = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d/.test(q);
  let historical = false, unsupportedDate = false;
  const datePhrasePresent = /\b(?:today|tomorrow|tonight|yesterday|day after|next|in \d+|after \d+|\d{4}-\d{2}-\d{2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(q);
  const inheritDate = intent.followup && previous && intent.contextKey === previous.contextKey && !datePhrasePresent;

  if (/\b(?:the\s+)?day after\b/.test(q) && previous) {
    dayOffset = (previous.dayOffset ?? 0) + 1; resolved = true;
  } else if (relative) {
    dayOffset = Number(relative[1]); resolved = true;
  } else if (weekday) {
    const nowDay = tz.weekdayOf(today);
    let delta = (WEEKDAYS.indexOf(weekday[1]) - nowDay + 7) % 7;
    if (/\bnext\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(q) && delta === 0) delta = 7;
    dayOffset = delta; resolved = true;
    intent.dateInterpretation = `${weekday[1]} = nearest ${weekday[1]}${delta === 0 ? ' (today)' : ''}`;
  } else if (iso) {
    if (!tz.isCivilDate(iso[1])) {
      clarification(intent, 'That date is not valid. Use YYYY-MM-DD.', 'तारीख मान्य नहीं है। YYYY-MM-DD का उपयोग करें।');
    } else {
      dayOffset = tz.daysBetween(today, iso[1]) ?? 0; resolved = true;
    }
  } else if (numericDate || monthDate) {
    clarification(intent, 'Please write the date as YYYY-MM-DD so I do not mix up day and month.',
      'कृपया तारीख YYYY-MM-DD में लिखें, ताकि दिन और महीना न बदलें।');
  }

  if (/\byesterday\b|\bhistorical\b|\bclimate\b|\blast (?:year|month|week)\b|पिछल|जलवायु|बीते/.test(q) ||
      (!iso && /\b(?:19|20)\d{2}\b/.test(q))) {
    historical = true; unsupportedDate = true;
  }
  if (dayOffset < 0) { historical = true; unsupportedDate = true; }
  if (dayOffset > 6) unsupportedDate = true;
  if (/\b(?:next week|next month|next year)\b/.test(q)) unsupportedDate = true;
  if (inheritDate) {
    dayOffset = previous.dayOffset ?? 0;
    resolved = true;
    intent.inherited.push('date');
  }

  const date = inheritDate && previous.date ? previous.date : tz.addDays(today, dayOffset);
  Object.assign(intent, { dayOffset, date, historical, unsupportedDate, today });
  intent.dateLabel = tz.dayWord(dayOffset, intent.language) || date || `In ${dayOffset} days`;
  return { today, dayOffset, date, historical, unsupportedDate, resolved };
}

const PART_KEYS = Object.keys(PART_WINDOWS);

function resolveTime(q, state, intent, dateInfo, previous) {
  const language = intent.language;
  let period = null, clock = null, range = null;
  // Vernacular ranges: "5 se 8 baje" / "5 से 8 बजे" resolve inside the
  // part-of-day named in the same question (evening → 17:00–20:00).
  const vernacularRange = q.match(/\b(\d{1,2})\s*(?:se|tak|to)\s*(\d{1,2})\s*o'clock\b/);
  if (vernacularRange) {
    const part = PART_KEYS.find(k => new RegExp(`\\b${k}\\b`).test(q));
    let a = Number(vernacularRange[1]), b = Number(vernacularRange[2]);
    if (part && PART_WINDOWS[part].start >= 12 && a < 12) a += 12;
    if (part && PART_WINDOWS[part].start >= 12 && b < 12) b += 12;
    if (b > a && a < 24 && b <= 24) {
      range = { key: 'custom', start: a, end: b,
        label: `${tz.hourLabel(a)}–${tz.hourLabel(b)}`,
        labelHi: `${tz.hourLabel(a, 0, 'hi')}–${tz.hourLabel(b, 0, 'hi')}` };
    }
  }
  const rangeMatch = q.match(/\b(?:between|from)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:and|to|[-–])\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/);
  if (rangeMatch && !range) {
    let a = Number(rangeMatch[1]), b = Number(rangeMatch[4]);
    let aMer = rangeMatch[3], bMer = rangeMatch[6];
    if (!aMer && bMer) aMer = bMer;
    if (!bMer && aMer) bMer = aMer;
    const ambiguous = (!aMer && a <= 12) || (!bMer && b <= 12);
    const invalid = (aMer && (a < 1 || a > 12)) || (bMer && (b < 1 || b > 12)) || a > 23 || b > 24 ||
      Number(rangeMatch[2] || 0) > 59 || Number(rangeMatch[5] || 0) > 59;
    if (aMer === 'PM' && a < 12) a += 12;
    if (aMer === 'AM' && a === 12) a = 0;
    if (bMer === 'PM' && b < 12) b += 12;
    if (bMer === 'AM' && b === 12) b = 0;
    if (ambiguous || invalid || b <= a || (rangeMatch[2] && rangeMatch[2] !== '00') || (rangeMatch[5] && rangeMatch[5] !== '00')) {
      clarification(intent, 'Please use a same-day, whole-hour range with AM/PM, such as “from 5 PM to 8 PM”. Overnight ranges are not supported yet.',
        'AM/PM के साथ एक ही दिन की पूरे घंटों वाली अवधि पूछें, जैसे “from 5 PM to 8 PM”।');
    } else {
      range = { key: 'custom', start: a, end: b, label: `${tz.hourLabel(a)}–${tz.hourLabel(b)}`, labelHi: `${tz.hourLabel(a, 0, 'hi')}–${tz.hourLabel(b, 0, 'hi')}` };
    }
  }
  if (!range) {
    const hourPhrase = q.match(/(?:\bat\s+|\baround\s+|\bby\s+)?(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/) ||
      q.match(/(\d{1,2})(?::(\d{2}))?\s*o'clock\b/) ||
      q.match(/(?:\bat\s+|\baround\s+|\bby\s+)?(\d{1,2}):(\d{2})\b/);
    if (hourPhrase) {
      let hour = Number(hourPhrase[1]), minute = Number(hourPhrase[2] || 0);
      const meridiem = hourPhrase[3];
      const part = PART_KEYS.find(k => new RegExp(`\\b${k}\\b`).test(q));
      const hasOclock = /o'clock/.test(hourPhrase[0]);
      let invalid = minute > 59 || hour > 23 || (meridiem && (hour < 1 || hour > 12));
      if (meridiem === 'PM' && hour < 12) hour += 12;
      if (meridiem === 'AM' && hour === 12) hour = 0;
      if (hasOclock && !meridiem) {
        if (part && PART_WINDOWS[part].start >= 12 && hour < 12) hour += 12;
        else if (!part && hour <= 12) invalid = true;
      }
      if (hourPhrase[2] && !meridiem && hour > 12) invalid = false; // 24-hour notation
      clock = { hour, minute, invalid, meridiem: meridiem || null };
      if (invalid) clarification(intent, 'Please use a valid time, such as 7 PM or 09:00, and say morning or evening.',
        'कृपया समय स्पष्ट करें, जैसे “कल शाम 7 बजे” या “कल सुबह 9 बजे”।');
    } else if (/\bnext hour\b/.test(q)) {
      const c = state.weather?.current?.time;
      if (c) {
        let hour = Number(c.slice(11, 13)) + 1;
        if (hour >= 24) { hour = 0; intent.dayOffset = dateInfo.dayOffset + 1; intent.date = tz.addDays(dateInfo.today, intent.dayOffset); }
        clock = { hour, minute: 0, invalid: false, meridiem: null };
      }
    } else if (!/:\d{2}/.test(q)) {
      const bare = q.match(/\b(?:at|around|by)\s+(\d{1,2})\b/);
      if (bare && Number(bare[1]) > 0 && Number(bare[1]) <= 12) {
        const h = Number(bare[1]);
        clarification(intent, `Did you mean ${h} AM or ${h} PM?`, `आपका मतलब ${h} AM है या ${h} PM?`,
          ['AM', 'PM'].map(m => ({ label: `${h} ${m}`, query: intent.original.replace(new RegExp(`\\b${h}\\b`), `${h} ${m}`) })));
      }
    }
  }
  if (!clock && !range) {
    const part = PART_KEYS.find(k => new RegExp(`\\b${k}\\b`).test(q)) || (/\btonight\b/.test(q) ? 'night' : null);
    if (part) period = { key: part, ...PART_WINDOWS[part] };
  }
  // Inherit an explicit previous window for follow-ups that did not change time.
  const followup = intent.followup;
  if (followup && previous && intent.contextKey === previous.contextKey &&
      !clock && !range && !period && !/\b(?:now|current|today|tomorrow|day after|\d{4}-\d{2}-\d{2})\b/.test(q)) {
    if (previous.time?.kind === 'point' && previous.clock) { clock = { ...previous.clock }; intent.inherited.push('time window'); }
    else if (previous.period) { period = { ...previous.period }; intent.inherited.push('time window'); }
  }
  const isNow = /\b(?:now|currently|current|right now)\b/.test(q) && !intent.dayOffset && !period && !clock;
  const window = range || period || null;
  const kind = clock ? 'point' : range ? 'range' : period ? 'part' : isNow ? 'point' : 'day';
  const currentHour = isNow ? Number(state.weather?.current?.time?.slice(11, 13) || 0) : 0;
  const startHour = clock ? clock.hour : window ? window.start : isNow ? currentHour : 0;
  const endHour = clock ? clock.hour + 1 : window ? window.end : isNow ? currentHour + 1 : 24;
  const label = clock ? tz.hourLabel(clock.hour, clock.minute, language) :
    window ? partWindowLabel(window, language) :
      (language === 'hi' ? 'पूरा दिन' : 'Daily outlook');
  intent.period = clock ? null : period || range;
  intent.clock = clock;
  intent.timeLabel = label;
  intent.time = {
    kind, date: intent.date, dayOffset: intent.dayOffset, granularity: kind,
    startHour, endHour, hour: clock ? clock.hour : null, minute: clock ? clock.minute : 0,
    window, label, labelHi: window?.labelHi || null, isNow,
    zone: tz.zoneOf(state), zoneLabel: tz.zoneAbbreviation(state),
    resolvedLabel: tz.resolvedLabel({ state, date: intent.date, dayOffset: intent.dayOffset,
      hour: clock ? clock.hour : null, minute: clock ? clock.minute : 0, window, language })
  };
  return intent.time;
}

const normalizeName = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

/** Validate a geocoder result set. Never silently accepts an unresolved place.
 * A name + district/state context that narrows the list to ONE match is a
 * validated unique result, not a silent guess. */
export function applyGeocoderResult(intent, matches) {
  const place = intent.place;
  if (!place || place.kind === 'none') return intent;
  let list = (Array.isArray(matches) ? matches : []).filter(m => Number.isFinite(Number(m.latitude)) && Number.isFinite(Number(m.longitude)));
  if (place.kind === 'coordinates') {
    place.status = 'resolved';
    place.resolved = list[0] || { name: place.query, country: 'Map coordinates', ...place.coordinates, latitude: place.coordinates.lat, longitude: place.coordinates.lon };
    place.candidates = [place.resolved];
    return intent;
  }
  const wanted = normalizeName(place.query);
  const exact = list.filter(m => normalizeName(m.name) === wanted || normalizeName(m.name).includes(wanted));
  let considered = exact.length ? exact : list;
  const ctx = place.context || {};
  if (Object.keys(ctx).length && considered.length > 1) {
    const filtered = considered.filter(m => {
      const hay = [m.region, m.district, m.state, m.country, m.name, m.label].filter(Boolean).join(' ').toLowerCase();
      return Object.values(ctx).every(v => hay.includes(String(v).toLowerCase()));
    });
    if (filtered.length) considered = filtered;
  }
  place.candidates = considered;
  list = considered;
  if (!list.length) {
    place.status = 'not-found';
    if (!intent.unresolved.includes('place')) intent.unresolved.push('place');
    clarification(intent,
      `I could not find “${place.query}”. Try the location search with a district or state, or enter latitude, longitude.`,
      `“${place.query}” नहीं मिला। खोज में ज़िला या राज्य जोड़ें, या अक्षांश, देशांतर दर्ज करें।`);
  } else if (list.length > 1 && !place.selectionIndex && place.kind !== 'coordinates') {
    place.status = 'ambiguous';
    if (!intent.unresolved.includes('place')) intent.unresolved.push('place');
    clarification(intent,
      `Several places match “${place.query}”. Which one did you mean?`,
      `“${place.query}” के कई स्थान मिले। आप किस स्थान के बारे में पूछ रहे हैं?`,
      list.slice(0, 5).map((m, i) => ({
        label: `${m.name}${m.region ? ', ' + m.region : ''}${m.country ? ', ' + m.country : ''} (${Number(m.latitude).toFixed(2)}, ${Number(m.longitude).toFixed(2)})`,
        query: `select-place:${i}`
      })));
  } else {
    place.status = 'resolved';
    place.resolved = list[place.selectionIndex || 0];
  }
  return intent;
}

/**
 * Main entry point. Produces one validated intent object.
 * @param {string} raw user question
 * @param {object} state app state (weather, location, prefs, now, farm)
 * @param {{previous?:object, engine?:Function, preferredLanguage?:string}} options
 */
export function interpretWeatherQuestion(raw, state = {}, options = {}) {
  const { previous = null, engine = null, preferredLanguage = null } = options;
  const { original, q, script, romanizedHindi } = canonicalize(raw);
  const preference = preferredLanguage || state.prefs?.language || 'en';
  const language = preference === 'hi' || script === 'devanagari' || romanizedHindi ? 'hi' : 'en';
  const tokens = [];
  let engineLabel = engine ? 'Compromise + structured weather rules' : 'Structured weather rules (NLP library unavailable)';
  if (engine && script !== 'devanagari') {
    try {
      const doc = engine(original);
      tokens.push(...doc.terms().out('array').slice(0, 50));
    } catch { engineLabel = 'Structured weather rules (NLP analysis unavailable)'; }
  }
  const temporalFree = removeTemporal(q);
  const place = extractPlace({ original, q, temporalFree });
  const topic = detectTopic(q);
  const contextKey = `${state.location?.latitude},${state.location?.longitude}`;
  const intent = {
    schemaVersion: 2, original, normalized: q, canonical: q, script, language,
    tokens, engine: engineLabel, contextKey,
    topic, metric: METRIC_FOR_TOPIC[topic] ?? null,
    place, time: null, confidence: 0, unresolved: [], inherited: [],
    clarification: null, dateInterpretation: null, action: null,
    followup: detectFollowup(q) || (Boolean(previous) && /\bthen\b/.test(q)), previous: previous || null,
    // legacy aliases (filled below)
    locationQuery: place.query, dayOffset: 0, date: null, dateLabel: null, timeLabel: null,
    period: null, clock: null, unsupportedDate: false, historical: false
  };
  if (topic === 'radar') intent.action = 'radar';
  if (topic === 'farm' && /\bsave\b/.test(q)) intent.action = 'save-location';

  // Multi-place requests: never silently choose one.
  if (place.status === 'ambiguous-name') {
    clarification(intent, 'Please ask about one location at a time. Which city should I use?',
      'एक समय पर एक स्थान पूछें। किस शहर का मौसम चाहिए?');
  }
  // Follow-up inheritance: carry forward only what the user did not change.
  if (intent.followup && previous && contextKey === previous.contextKey) {
    if (topic === 'other') { intent.topic = previous.topic; intent.metric = previous.metric; intent.inherited.push('topic'); }
    if (place.kind === 'none' && previous.place?.status === 'resolved') {
      intent.place = { ...previous.place };
      intent.locationQuery = intent.place.query;
      intent.inherited.push('place');
    }
  } else if (intent.followup && topic === 'other' && !previous) {
    clarification(intent, 'What weather detail would you like—rain, temperature, or wind?',
      'किस बारे में जानना है—बारिश, तापमान या हवा?', [
        { label: 'Rain tomorrow', query: 'Will it rain tomorrow?' },
        { label: 'Temperature tomorrow', query: 'Temperature tomorrow?' }
      ]);
  }
  if (intent.followup && intent.topic === 'other' && place.kind !== 'none') intent.topic = 'weather';

  const dateInfo = resolveDate(q, state, intent, previous);
  resolveTime(q, state, intent, dateInfo, previous);

  if (intent.topic === 'comparison' && ((dateInfo.resolved && intent.dayOffset !== 1) || /\b(?:day after tomorrow|weekend)\b/.test(q))) {
    clarification(intent, 'Temperature comparison currently supports today versus tomorrow. Would you like that comparison?',
      'तुलना अभी आज और कल के अधिकतम तापमान के लिए उपलब्ध है। यही तुलना करें?',
      [{ label: 'Compare today and tomorrow', query: 'Compare tomorrow with today.' }]);
  }
  if (intent.topic === 'other' && !intent.clarification && !intent.unsupportedDate) {
    clarification(intent,
      'I could not identify a supported weather question. WeatherGPT is a deterministic interpreter, not a general-purpose language model. Ask about rain, temperature, wind, humidity, a forecast time, or your crop.',
      'यह मौसम प्रश्न समझ नहीं आया। WeatherGPT एक नियम-आधारित सहायक है, सामान्य AI नहीं। बारिश, तापमान, हवा, नमी, समय या फसल के बारे में पूछें।');
  }
  // Legacy normalized strings used by the older answer branches.
  if (intent.topic === 'radar') intent.normalized = 'show radar';
  else if (intent.topic === 'outdoors') intent.normalized += ' best time outside';
  else if (intent.topic === 'rain' && !/\brain\b/.test(intent.normalized)) intent.normalized += ' rain';
  else if (intent.topic === 'temperature' && !/\btemperature\b/.test(intent.normalized)) intent.normalized += ' temperature';

  const slotCount = ['topic', 'time', 'place', 'metric'].length;
  const filled = (intent.topic !== 'other' ? 1 : 0) + 1 + (place.kind === 'none' ? 1 : (place.status === 'resolved' ? 1 : 0.5)) + (intent.metric ? 1 : 0);
  intent.confidence = Math.min(1, filled / slotCount);
  if (place.status === 'pending' || place.status === 'ambiguous' || place.status === 'not-found') intent.unresolved.push('place');
  if (intent.clarification && !intent.unresolved.includes('clarification')) intent.unresolved.push('clarification');
  // Keep aliases in sync after inheritance/time resolution.
  intent.locationQuery = intent.place?.query ?? null;
  return intent;
}

export default interpretWeatherQuestion;
