// A small, transparent intent parser—not an LLM. No meteorological values live here.
const CITY_NAMES = [
  ['नई दिल्ली','New Delhi'],['नयी दिल्ली','New Delhi'],['जयपुर','Jaipur'],['दिल्ली','Delhi'],['मुंबई','Mumbai'],['मुम्बई','Mumbai'],['बेंगलुरु','Bengaluru'],['बैंगलोर','Bengaluru'],['चेन्नई','Chennai'],['कोलकाता','Kolkata'],['हैदराबाद','Hyderabad'],['लखनऊ','Lucknow'],['अहमदाबाद','Ahmedabad'],['पुणे','Pune'],['भोपाल','Bhopal'],['पटना','Patna'],['रांची','Ranchi'],['इंदौर','Indore'],['चंडीगढ़','Chandigarh'],['गुवाहाटी','Guwahati'],['लंदन','London'],['न्यूयॉर्क','New York']
];
export function parseWeatherQuestion(raw, preferredLanguage = 'en') {
  const original=String(raw).trim().slice(0,400);
  const language=/[\u0900-\u097f]/.test(original)||preferredLanguage==='hi'?'hi':'en';
  let normalized=original.toLowerCase().replace(/[०-९]/g,c=>String(c.charCodeAt(0)-0x0966));
  const phrases=[[/परसों/g,'day after tomorrow'],[/कल/g,'tomorrow'],[/आज/g,'today'],[/अभी/g,'now'],[/शाम/g,'evening'],[/सुबह/g,'morning'],[/दोपहर/g,'afternoon'],[/रात/g,'tonight'],[/बारिश|वर्षा|बरसात/g,'rain'],[/छाता/g,'umbrella'],[/तापमान/g,'temperature'],[/मौसम/g,'weather'],[/ज़्यादा गर्म|ज्यादा गर्म|अधिक गर्म/g,'hotter'],[/गर्मी|गर्म/g,'hot'],[/ठंडा|ठंड/g,'cold'],[/तेज़ हवा|तेज हवा|हवा/g,'wind'],[/चेतावनी|अलर्ट/g,'warning'],[/तूफान|आंधी/g,'storm'],[/बाढ़/g,'flood'],[/आर्द्रता|नमी/g,'humidity'],[/तुलना/g,'compare'],[/महसूस/g,'feel'],[/सूर्योदय/g,'sunrise'],[/सूर्यास्त/g,'sunset'],[/धूप/g,'sun'],[/कोहरा/g,'visibility'],[/बादल/g,'clouds'],[/मानसून/g,'rain'],[/ओले/g,'storm']];
  for(const [pattern,replacement]of phrases)normalized=normalized.replace(pattern,` ${replacement} `);
  normalized=normalized.replace(/\bkal\b/g,'tomorrow').replace(/\baaj\b/g,'today').replace(/\bshaam\b/g,'evening').replace(/\bsubah\b/g,'morning').replace(/\b(?:baarish|barish|barishh|barsat)\b/g,'rain').replace(/\bmausam\b/g,'weather').replace(/\bgarmi\b/g,'hot').replace(/\bzya?ada\s+garam\b/g,'hotter').replace(/\b(?:thand|thandi)\b/g,'cold').replace(/\bhawa\b/g,'wind').replace(/\bbadal\b/g,'clouds').replace(/\b(?:dhoop|dhup)\b/g,'sun').replace(/\b(?:toofan|tufan)\b/g,'storm').replace(/\b(?:monsoon|mansoon)\b/g,'rain').replace(/\bchha?ata\b/g,'umbrella');
  normalized=normalized.replace(/\s+/g,' ').trim();
  let locationQuery=null;
  const coordinate=original.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if(coordinate)locationQuery=`${coordinate[1]}, ${coordinate[2]}`;
  if(!locationQuery){
    const names=[...CITY_NAMES].sort((a,b)=>b[0].length-a[0].length);
    const match=names.find(([hindi,english])=>original.includes(hindi)||new RegExp(`\\b${english}\\b`,'i').test(original));
    if(match)locationQuery=match[1];
  }
  if(!locationQuery){
    const pattern=/\b(?:in|for|to)\s+(.+?)(?=\s+(?:tomorrow|today|tonight|this|on|at|around|between|from|during|next|will|be|going|in\s+\d)\b|[?!;,.]|$)/gi;
    for(const match of original.matchAll(pattern)){
      const candidate=match[1].trim();
      if(candidate.length>=2&&candidate.length<=90&&!/^(?:the|a|an|my|this|here|there|today|tomorrow|tonight|rain|weather|go|get|take|carry|know|wear|do|be|expect|bring|check|\d)\b/i.test(candidate))locationQuery=candidate;
    }
  }
  if(!locationQuery){
    const match=original.match(/([\p{L}\s]+?)\s+(?:में|mein|me)\s/iu);
    if(match){const candidate=match[1].replace(/कल|आज|क्या|परसों|\bkal\b|\baaj\b/gi,'').trim();if(candidate.length>=2&&candidate.length<60)locationQuery=candidate;}
  }
  const dayOffset=/day after tomorrow/.test(normalized)?2:/tomorrow/.test(normalized)?1:0;
  const historical=/\byesterday|last (?:year|month|week)|\b(?:19|20)\d{2}\b|historical|climate|30 years|पिछल|जलवायु|बीते/.test(normalized);
  const unsupportedDate=historical||/next (?:week|month|year)|in \d+ days|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(normalized);
  const comparison=/compare|comparison|compared|difference/.test(normalized)||(/today/.test(normalized)&&/tomorrow/.test(normalized)&&/hotter|warmer|cooler|colder|hot|cold/.test(normalized));
  const topic=/warning|alert|storm|flood|safe|danger/.test(normalized)?'alerts':comparison?'comparison':/feel|humidity.*hot/.test(normalized)?'feels':/cloud|overcast/.test(normalized)?'clouds':/rain|umbrella|precipitation|wet/.test(normalized)?'rain':/wind|gust|breez/.test(normalized)?'wind':/sunrise|sunset/.test(normalized)?'sun':/weather|temperature|hot|cold|forecast|outlook/.test(normalized)?'weather':'other';
  const period=/evening/.test(normalized)?{key:'evening',start:17,end:20,label:'5–8 PM'}:/morning/.test(normalized)?{key:'morning',start:6,end:12,label:'6 AM–12 PM'}:/afternoon/.test(normalized)?{key:'afternoon',start:12,end:17,label:'12–5 PM'}:/tonight/.test(normalized)?{key:'tonight',start:20,end:24,label:'8 PM–midnight'}:null;
  const timeMatch=normalized.match(/\b(?:at|around|by)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/),hindiTime=normalized.match(/(\d{1,2})(?::(\d{2}))?\s*बजे/);
  const rawTime=timeMatch||hindiTime;
  let clock=null;
  if(rawTime){
    let hour=Number(rawTime[1]),minute=Number(rawTime[2]||0);const meridiem=rawTime[3];
    let invalid=minute>59||hour>23||(meridiem&&(hour<1||hour>12));
    if(meridiem==='pm'&&hour<12)hour+=12;
    if(meridiem==='am'&&hour===12)hour=0;
    if(!meridiem&&period&&period.start>=12&&hour<12)hour+=12;
    if(hindiTime&&!period&&hour<=12&&!meridiem)invalid=true;
    clock={hour,minute,invalid:Boolean(invalid)};
  }
  const explicitHour=Boolean(clock);
  const ambiguousPast=/\bkal\b|कल/.test(original)&&/थी|था|हुई|हुआ|yesterday|\bthi\b|\btha\b/i.test(original);
  return {original,normalized,language,locationQuery,dayOffset,topic,clock,period:explicitHour?null:period,unsupportedDate:unsupportedDate||ambiguousPast,historical:historical||ambiguousPast};
}
