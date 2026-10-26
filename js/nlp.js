import { parseWeatherQuestion } from './intent.js';

// Local symbolic NLP. Compromise supplies English token/POS/entity analysis;
// weather-domain rules resolve slots and validate them before any data is used.
let enginePromise;
export function loadNLPEngine() {
  if (typeof window.nlp === 'function') return Promise.resolve(window.nlp);
  if (!enginePromise) enginePromise = new Promise(resolve => {
    const script=document.createElement('script');
    script.src=new URL('./vendor/compromise.js',import.meta.url).href;
    script.async=true;
    let settled=false;
    const finish=value=>{if(!settled){settled=true;clearTimeout(timer);resolve(value);}};
    const timer=setTimeout(()=>finish(null),8000);
    script.onload=()=>finish(typeof window.nlp==='function'?window.nlp:null);
    script.onerror=()=>finish(null);
    document.head.append(script);
  });
  return enginePromise;
}
const DAY_MS=86400000;
const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const words={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
const asNumber=value=>/^\d+$/.test(value)?Number(value):words[value];
const dayStamp=date=>Date.parse(`${date}T12:00:00Z`);
const dateAfter=(date,days)=>new Date(dayStamp(date)+days*DAY_MS).toISOString().slice(0,10);
export const topicNames={rain:'Rain / umbrella',weather:'Weather outlook',temperature:'Temperature',wind:'Wind',clouds:'Cloud cover',humidity:'Humidity',pressure:'Pressure',uv:'UV exposure',visibility:'Visibility',comparison:'Temperature comparison',feels:'Feels-like temperature',sun:'Sunrise / sunset',alerts:'Warnings / safety',outdoors:'Outdoor planning',radar:'Radar map',other:'Unrecognized topic'};

function normalizeQuestion(text) {
  return text.normalize('NFKC').replace(/[’‘]/g,"'").replace(/[०-९]/g,c=>String(c.charCodeAt(0)-0x0966))
    .replace(/\b(?:tmrw|tmr|tommorow|tommorrow)\b/gi,'tomorrow')
    .replace(/\b(?:wether|wheather)\b/gi,'weather')
    .replace(/\b(?:precip|precipitation|drizzle|downpour|showers?|raining|rainy|monsoon|mansoon)\b/gi,'rain')
    .replace(/\b(?:brolly|raincoat)\b/gi,'umbrella')
    .replace(/\b(?:breezy|windy|gusty)\b/gi,'wind')
    .replace(/\b(?:muggy|humid)\b/gi,'humidity')
    .replace(/\b(?:temp|temps)\b/gi,'temperature')
    .replace(/\b(?:scorching|sweltering|warm)\b/gi,'hot')
    .replace(/\b(?:chilly|freezing)\b/gi,'cold')
    .replace(/\b(noon|midday)\b/gi,'12 PM').replace(/\bmidnight\b/gi,'12 AM')
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(am|pm)\b/gi,(_,n,m)=>`${words[n.toLowerCase()]} ${m}`)
    .replace(/\ba\.?m\.?\b/gi,'AM').replace(/\bp\.?m\.?\b/gi,'PM').replace(/\s+/g,' ').trim();
}
function findTopic(text,base) {
  if(/\b(?:radar|rain map)\b/.test(text)&&/\b(?:show|open|switch|map|radar)\b/.test(text))return 'radar';
  if(/\b(?:alert|warning|storm|flood|safe|danger|cyclone|lightning)\b/.test(text))return 'alerts';
  if(base.topic==='comparison'||(/tomorrow/.test(text)&&/hotter|warmer|cooler|colder/.test(text)))return 'comparison';
  if(/feel|apparent/.test(text))return 'feels';
  if(/\b(?:humidity|moisture)\b/.test(text))return 'humidity';
  if(/\b(?:cloud|clouds|cloudy|overcast)\b/.test(text))return 'clouds';
  if(/\b(?:pressure|barometer)\b/.test(text))return 'pressure';
  if(/\b(?:uv|sunburn|sunscreen)\b/.test(text))return 'uv';
  if(/\b(?:visibility|fog|mist)\b/.test(text))return 'visibility';
  if(/\b(?:walk|run|jog|outside|outdoor|picnic|cycling|hike|hiking)\b/.test(text))return 'outdoors';
  if(/\b(?:rain|umbrella|wet)\b/.test(text))return 'rain';
  if(/\b(?:wind|gust)\b/.test(text))return 'wind';
  if(/\b(?:temperature|hot|cold)\b/.test(text))return 'temperature';
  if(/sunrise|sunset/.test(text))return 'sun';
  if(/\b(?:weather|forecast|outlook|conditions)\b/.test(text))return 'weather';
  return base.topic;
}
function cleanPlace(value) {
  return value.replace(/\b(?:today|tomorrow|tonight|on|at|around|between|from|this|next|in \d)\b.*$/i,'').replace(/['’]s$/,'').replace(/^[\s,]+|[\s,?.!]+$/g,'').trim();
}
function validPlace(value) {
  return value&&value.length<=90&&!/^(?:the|a|an|my|this|that|here|there|me|today|tomorrow|tonight|now|go|get|take|carry|know|wear|do|be|expect|bring|check)\b/i.test(value)&&!/^\d/.test(value)&&!/^(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+days?\b/i.test(value)&&!weekdays.includes(value.toLowerCase());
}
function clockLabel(hour) {return `${hour%12||12} ${hour>=12?'PM':'AM'}`;}
function clarification(intent,en,hi,choices=[]) {
  intent.clarification={text:intent.language==='hi'?hi:en,choices};
}
export function interpretWeatherQuestion(raw,state,{previous=null,engine=null}={}) {
  const original=String(raw).trim().slice(0,400),input=normalizeQuestion(original);
  const intent={...parseWeatherQuestion(input,state.prefs?.language||'en'),original,engine:engine?'Compromise + weather rules':'Weather rules (NLP library unavailable)',tokens:[],inherited:[],clarification:null};
  let q=intent.normalized;
  let places=[];
  if(engine&&!/[\u0900-\u097f]/.test(input)) {
    try {
      const doc=engine(input);
      intent.tokens=doc.terms().out('array').slice(0,50);
      places=doc.match('#Place+').out('array').map(cleanPlace).filter(validPlace);
    } catch {intent.engine='Weather rules (NLP analysis unavailable)';}
  }
  // Explicit place syntax wins over dictionary guesses (e.g. New Delhi vs Delhi).
  const explicit=[...input.matchAll(/\b(?:in|for|to)\s+(.+?)(?=\s+(?:tomorrow|today|tonight|this|on|at|around|between|from|during|next|will|be|going|in\s+(?:\d|one|two|three))\b|[?!;]|$)/gi)].map(m=>cleanPlace(m[1])).filter(validPlace);
  const possessive=input.match(/^([\p{L} .'-]+?)['’]s\s+(?:weather|forecast|temperature|rain|wind)/u);
  if(possessive)intent.locationQuery=cleanPlace(possessive[1]);
  else if(explicit.length)intent.locationQuery=explicit[0];
  else if(!intent.locationQuery&&places.length===1)intent.locationQuery=places[0];
  if(intent.locationQuery&&!validPlace(intent.locationQuery)&&!/^[-\d.]+\s*,\s*[-\d.]+$/.test(intent.locationQuery))intent.locationQuery=null;
  // Multi-place requests are explicitly out of scope; never silently pick one.
  if((intent.locationQuery&&/\b(?:and|versus|vs)\b/i.test(intent.locationQuery))||places.length>1&&!places.every(p=>intent.locationQuery?.includes(p))) {
    clarification(intent,'Please ask about one location at a time. Which city should I use?','एक समय पर एक स्थान पूछें। किस शहर का मौसम चाहिए?');
  }
  intent.topic=findTopic(q,intent);
  const followup=/^(?:and\b|what about\b|how about\b|also\b|और|वहाँ|wahaan\b)/i.test(input);
  const samePlace=previous?.contextKey===`${state.location?.latitude},${state.location?.longitude}`;
  if(followup&&previous&&samePlace){
    if(intent.topic==='other'){intent.topic=previous.topic;intent.inherited.push('topic');}
    if(!/today|tomorrow|tonight|next|\bin\s+(?:\d|one|two|three)|\bon\b|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2}/.test(q)){
      intent.dayOffset=previous.dayOffset;intent.inherited.push('date');
    }
    if(!intent.period&&!intent.clock&&!/now|currently|next hour/.test(q)&&previous.period){intent.period={...previous.period};intent.inherited.push('time window');}
  } else if(followup&&intent.topic==='other'&&!intent.locationQuery){
    clarification(intent,'What weather detail would you like—rain, temperature, or wind?','किस बारे में जानना है—बारिश, तापमान या हवा?',[
      {label:'Rain tomorrow',query:'Will it rain tomorrow?'},{label:'Temperature tomorrow',query:'Temperature tomorrow?'}
    ]);
  }
  if(followup&&intent.topic==='other'&&intent.locationQuery)intent.topic='weather';
  const localDate=state.weather?.current?.time?.slice(0,10)||new Intl.DateTimeFormat('en-CA',{timeZone:state.location?.timezone||'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  // Use a stable ISO civil date, independent of the browser's timezone/DST.
  const today=/^\d{4}-\d{2}-\d{2}$/.test(localDate)?localDate:state.weather?.daily?.time?.[0];
  const relative=q.match(/\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+days?\b/);
  const weekday=q.match(/\b(?:(next|this)\s+|on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  const iso=q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  let resolvedDate=false;
  if(relative){intent.dayOffset=asNumber(relative[1]);resolvedDate=true;}
  else if(weekday&&today){
    const nowDay=new Date(dayStamp(today)).getUTCDay();
    let delta=(weekdays.indexOf(weekday[2])-nowDay+7)%7;
    if(weekday[1]==='next'&&delta===0)delta=7;
    intent.dayOffset=delta;resolvedDate=true;
    intent.dateInterpretation=`${weekday[0]} = nearest ${weekday[2]}${delta===0?' (today)':''}`;
  }else if(iso&&today){
    const stamp=dayStamp(iso[1]);
    if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==iso[1])clarification(intent,'That date is not valid. Use YYYY-MM-DD.','तारीख मान्य नहीं है। YYYY-MM-DD का उपयोग करें।');
    else{intent.dayOffset=Math.round((stamp-dayStamp(today))/DAY_MS);resolvedDate=true;}
  }
  if(resolvedDate){intent.historical=intent.dayOffset<0;intent.unsupportedDate=intent.dayOffset<0||intent.dayOffset>6;}
  // Reject unsupported date syntax rather than using today's forecast.
  if(!resolvedDate&&/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d|\b\d{1,2}\/\d{1,2}\b/.test(q))clarification(intent,'Please write the date as YYYY-MM-DD so I do not mix up day and month.','कृपया तारीख YYYY-MM-DD में लिखें, ताकि दिन और महीना न बदलें।');
  if(intent.topic==='comparison'&&((resolvedDate&&intent.dayOffset!==1)||/day after tomorrow|weekend/.test(q)))clarification(intent,'Temperature comparison currently supports today versus tomorrow. Would you like that comparison?','तुलना अभी आज और कल के अधिकतम तापमान के लिए उपलब्ध है। यही तुलना करें?', [{label:'Compare today and tomorrow',query:'Compare tomorrow with today.'}]);
  const range=q.match(/\b(?:between|from)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:and|to|[-–])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  const hourPhrase=q.match(/(?:\bat\s+|\baround\s+|\bby\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if(range){
    let a=Number(range[1]),b=Number(range[4]),aMer=range[3],bMer=range[6];
    if(!aMer&&bMer)aMer=bMer;
    if(!bMer&&aMer)bMer=aMer;
    const ambiguous=(!aMer&&a<=12)||(!bMer&&b<=12);
    const invalid=(aMer&&(a<1||a>12))||(bMer&&(b<1||b>12))||a>23||b>24||Number(range[2]||0)>59||Number(range[5]||0)>59;
    if(aMer==='pm'&&a<12)a+=12;if(aMer==='am'&&a===12)a=0;
    if(bMer==='pm'&&b<12)b+=12;if(bMer==='am'&&b===12)b=0;
    if(ambiguous||invalid||b<=a||range[2]&&range[2]!=='00'||range[5]&&range[5]!=='00')clarification(intent,'Please use a same-day, whole-hour range with AM/PM, such as “from 5 PM to 8 PM”. Overnight ranges are not supported yet.','AM/PM के साथ एक ही दिन की पूरे घंटों वाली अवधि पूछें, जैसे “from 5 PM to 8 PM”।');
    else{intent.period={key:'custom',start:a,end:b,label:`${clockLabel(a)}–${clockLabel(b)}`};intent.clock=null;}
  }else if(hourPhrase){
    let hour=Number(hourPhrase[1]);const invalid=hour<1||hour>12||Number(hourPhrase[2]||0)>59;
    if(hourPhrase[3]==='pm'&&hour<12)hour+=12;if(hourPhrase[3]==='am'&&hour===12)hour=0;
    intent.clock={hour,minute:Number(hourPhrase[2]||0),invalid};intent.period=null;
  }else if(intent.clock&&!/[\u0900-\u097f]/.test(input)&&intent.clock.hour>0&&intent.clock.hour<=12&&!/\d{1,2}:\d{2}|morning|evening|afternoon|tonight/.test(q)){
    const h=intent.clock.hour;
    clarification(intent,`Did you mean ${h} AM or ${h} PM?`,`आपका मतलब ${h} AM है या ${h} PM?`,['AM','PM'].map(m=>({label:`${h} ${m}`,query:input.replace(new RegExp(`\\b${h}\\b`),`${h} ${m}`)})));
  }
  if(intent.clock?.invalid)clarification(intent,'Please use a valid, unambiguous time, such as 7 PM or 09:00.','कृपया स्पष्ट समय लिखें, जैसे “शाम 7 बजे” या “सुबह 9 बजे”।');
  if(intent.topic==='other'&&!intent.clarification&&!intent.unsupportedDate)clarification(intent,'I could not identify a supported weather question. Try asking about rain, temperature, wind, humidity, or a forecast time.','यह मौसम प्रश्न समझ नहीं आया। बारिश, तापमान, हवा, नमी या समय के बारे में पूछें।');
  if(intent.topic==='radar')intent.normalized='show radar';
  else if(intent.topic==='outdoors')intent.normalized+=' best time outside';
  else if(intent.topic==='rain'&&!/\brain\b/.test(intent.normalized))intent.normalized+=' rain';
  else if(intent.topic==='temperature')intent.normalized+=' temperature';
  intent.date=today&&Number.isFinite(intent.dayOffset)?dateAfter(today,intent.dayOffset):null;
  intent.contextKey=`${state.location?.latitude},${state.location?.longitude}`;
  intent.dateLabel=intent.dayOffset===0?'Today':intent.dayOffset===1?'Tomorrow':intent.dayOffset===2?'The day after tomorrow':intent.date||`In ${intent.dayOffset} days`;
  intent.timeLabel=intent.clock?`${clockLabel(intent.clock.hour)}${intent.clock.minute?` (hourly estimate for :${String(intent.clock.minute).padStart(2,'0')})`:''}`:intent.period?.label||'Daily outlook';
  return intent;
}
