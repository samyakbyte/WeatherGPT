import { icon, escapeHTML } from './icons.js';
import { searchPlaces } from './geocode.js';
import { parseWeatherQuestion } from './intent.js';
import { loadNLPEngine, interpretWeatherQuestion, topicNames } from './nlp.js';
import { applyGeocoderResult } from './understanding.js';
import { createRequestGuard, isFresh } from './request-guard.js';
import { structuredAnswer, withScope } from './answers.js';
import { metricInsight, currentInsight } from './nlp-insights.js';
import { periodInsight, hindiInsight } from './insights.js';
import { temp, wind, condition, number, present, forecastHours, currentHourIndex, localHour, deriveAdvisories, direction } from './weather.js';
import { t } from './i18n.js';

// Deterministic interpreter: every numerical statement comes from the loaded forecast.
// A production LLM adapter would need a separately hosted, credential-protecting backend.
function legacyAnswer(question, state, parsedIntent = null) {
  const {weather:data,location,prefs}=state;
  const intent=parsedIntent||parseWeatherQuestion(question,prefs.language||'en');
  if(intent.clarification)return {text:intent.clarification.text,choices:intent.clarification.choices,metrics:[],language:intent.language};
  if(parsedIntent?.unsupportedDate)return {text:intent.language==='hi'?'चुनी हुई तारीख उपलब्ध 7-दिन के पूर्वानुमान के बाहर है या उसका डेटा जुड़ा नहीं है। कृपया उपलब्ध तारीख चुनें।':'That date is outside the available 7-day forecast, or requires historical data that is not connected. Please choose a date in the loaded forecast.',metrics:[],language:intent.language};
  if(data&&parsedIntent){
    if(!data.daily.time[intent.dayOffset])return {text:'That date is not included in the loaded forecast. Please choose another date.',metrics:[]};
    if(['humidity','pressure','uv','visibility','clouds'].includes(intent.topic))return metricInsight(intent,state);
    if(['weather','temperature'].includes(intent.topic)&&/\b(?:now|currently|current|right now)\b/.test(intent.normalized)&&!intent.dayOffset&&!intent.period&&!intent.clock)return currentInsight(intent,state);
  }
  if(intent.language==='hi')return hindiInsight(intent,state);
  if(!data)return {text:'I don’t have a loaded forecast for this location yet. Retry the weather service, or search for another place, then ask again.',metrics:[]};
  const q=intent.normalized, h=data.hourly,d=data.daily,c=data.current;
  const day=intent.dayOffset;
  const label=intent.dateLabel||['Today','Tomorrow','The day after tomorrow'][day]||data.daily.time[day];
  const result=(text,metrics=[])=>({text,metrics});
  const metric=(label,value)=>({label,value});
  const dayMetrics=(i)=>[metric('Daily high',temp(d.temperature_2m_max[i],prefs,true)),metric('Rain chance · peak',`${number(d.precipitation_probability_max[i])}%`),metric('Daily precipitation',`${number(d.precipitation_sum[i],1)} mm`)];
  if(intent.unsupportedDate)return result(intent.historical?'Historical weather and climate datasets are not connected in this prototype. I can explain the current forecast, but cannot calculate past averages or long-term trends from a 7-day outlook.':'I can interpret today, tomorrow, and the day after tomorrow. For another day within the available 7-day window, use the Forecast view. I won’t substitute today’s weather for a different date.');
  if(/next (month|year)|in (\d{2,}|eight|nine|ten) days/.test(q))return result('This workspace has a 7-day forecast. I can help with today, tomorrow, or the available weekend, but I can’t reliably answer beyond the loaded forecast.');
  if(intent.topic==='radar'||(!parsedIntent&&/show.*(heavy rain|rain|radar)|open.*radar/.test(q)))return {...result('I’ve opened the precipitation radar layer. It shows available past observations, not where heavy rain is expected tomorrow. Coverage varies, and a blank map is not proof of dry weather. For future rain at this location, ask about the forecast.'),action:'radar'};
  if(intent.topic==='comparison'){
    if(!present(d.temperature_2m_max[0])||!present(d.temperature_2m_max[1]))return result('A comparison needs the daily high for both today and tomorrow. One of those forecast values is unavailable; please retry.');
    const diff=d.temperature_2m_max[1]-d.temperature_2m_max[0];
    const delta=prefs.temperature==='fahrenheit'?Math.abs(diff)*9/5:Math.abs(diff);
    return result(`Tomorrow’s high in ${location.name} is ${temp(d.temperature_2m_max[1],prefs,true)}, ${Math.abs(diff)<.5?'about the same as today':`${number(delta,1)}° ${diff>0?'warmer':'cooler'} than today`}. The peak precipitation probability changes from ${number(d.precipitation_probability_max[0])}% today to ${number(d.precipitation_probability_max[1])}% tomorrow.`,[metric('Today’s high',temp(d.temperature_2m_max[0],prefs)),metric('Tomorrow’s high',temp(d.temperature_2m_max[1],prefs)),metric('Tomorrow’s low',temp(d.temperature_2m_min[1],prefs))]);
  }
  if(intent.topic==='feels')return result(`It is ${temp(c.temperature_2m,prefs,true)} in ${location.name}, with an apparent temperature of ${temp(c.apparent_temperature,prefs,true)} and ${number(c.relative_humidity_2m)}% humidity. The feels-like estimate accounts for humidity, wind, and radiation. In warm, humid air, sweat evaporates less effectively; wind can make conditions feel cooler. It isn’t a direct measurement of your personal comfort.`,[metric('Air temperature',temp(c.temperature_2m,prefs)),metric('Feels like',temp(c.apparent_temperature,prefs)),metric('Humidity',`${number(c.relative_humidity_2m)}%`)]);
  if(/weekend/.test(q)){
    const indexes=d.time.map((t,i)=>({i,day:new Date(`${t}T12:00:00`).getDay()})).filter(v=>v.day===0||v.day===6).map(v=>v.i);
    if(!indexes.length)return result('The loaded forecast does not include the coming weekend yet. Please check closer to the date.');
    return result(indexes.map(i=>`${new Date(`${d.time[i]}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}: ${condition(d.weather_code[i]).label.toLowerCase()}, a high of ${temp(d.temperature_2m_max[i],prefs,true)} and a low of ${temp(d.temperature_2m_min[i],prefs,true)}. Peak precipitation chance: ${number(d.precipitation_probability_max[i])}%.`).join('\n\n'));
  }
  if(/storm|alert|warning|flood|safe|danger/.test(q)){
    const advisories=deriveAdvisories(data);
    return result(`I can’t determine whether a storm is approaching or certify that conditions are safe. This assistant does not interpret radar motion or official warning feeds. ${advisories.length?`Forecast-derived guidance for ${location.name}: ${advisories.map(a=>a.title.toLowerCase()).join('; ')}.`:'No configured advisory thresholds are currently triggered by the loaded forecast.'} Check your local meteorological authority for official warnings.`,[metric('Today’s conditions',condition(d.weather_code[0]).label),metric('Max gust today',wind(d.wind_gusts_10m_max[0],prefs))]);
  }
  if(/best time|good time|outside|outdoor|walk|run|jog/.test(q)){
    const candidates=forecastHours(data,day).filter(v=>Number(v.time.slice(11,13))>=6&&Number(v.time.slice(11,13))<=19&&(day>0||v.index>=currentHourIndex(data))).filter(v=>[h.temperature_2m[v.index],h.precipitation_probability[v.index],h.wind_speed_10m[v.index]].every(present));
    if(!candidates.length)return result('There are no remaining hours in today’s 6 AM–7 PM suggestion window. Ask about tomorrow for an outdoor time suggestion.');
    const score=i=>h.precipitation_probability[i]*.6+Math.abs(h.temperature_2m[i]-22)*2+h.wind_speed_10m[i]*.4+(h.uv_index[i]||0)*2;
    const best=candidates.reduce((a,b)=>score(a.index)<=score(b.index)?a:b),i=best.index;
    return result(`${label}, around ${localHour(h.time[i])} looks like a relatively comfortable option for ${location.name}: ${temp(h.temperature_2m[i],prefs,true)}, ${number(h.precipitation_probability[i])}% precipitation chance, and wind around ${wind(h.wind_speed_10m[i],prefs)}. This is a simple comparison of the available 6 AM–7 PM hours, favoring lower rain, wind, UV, and temperatures near 22°C—not a guarantee of safe conditions.`,[metric('Suggested time',localHour(h.time[i])),metric('Temperature',temp(h.temperature_2m[i],prefs)),metric('Rain chance',`${number(h.precipitation_probability[i])}%`)]);
  }
  if(intent.period&&['rain','weather','temperature','wind','other'].includes(intent.topic))return periodInsight(intent,state);
  const hourMatch=q.match(/(?:at|around|by)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if(intent.clock||hourMatch||/morning|afternoon|evening|tonight|next hour/.test(q)){
    let hour=hourMatch?Number(hourMatch[1]):/morning/.test(q)?9:/afternoon/.test(q)?15:/next hour/.test(q)?(Number(c.time.slice(11,13))+1):19;
    if(hourMatch && ((hourMatch[3] && (hour<1 || hour>12)) || (!hourMatch[3] && hour>23) || Number(hourMatch[2]||0)>59))return result('Please use a valid time, such as 7 PM, 09:00, or tomorrow morning.');
    if(hourMatch?.[3]==='pm'&&hour<12)hour+=12;
    if(hourMatch?.[3]==='am'&&hour===12)hour=0;
    if(intent.clock)hour=intent.clock.hour;
    if(intent.clock?.invalid||hour>24||hour<0||Number(hourMatch?.[2]||0)>59)return result('Please use a valid time, such as 7 PM, 09:00, or tomorrow morning.');
    let i;
    if(/next hour/.test(q))i=currentHourIndex(data)+1;
    else i=h.time.findIndex(t=>t===`${d.time[day]}T${String(hour).padStart(2,'0')}:00`);
    if(i<0||i>=h.time.length)return result('That hour is outside the available forecast. Ask about a time in the next seven days.');
    const minuteNote=(intent.clock?.minute||hourMatch?.[2]&&hourMatch[2]!=='00')?' This provider supplies hourly values; I’m using the start of that hour.':'';
    const past=i<currentHourIndex(data)?' This hour has already passed; this is a model estimate, not a recorded station observation.':'';
    const hourDay=h.time[i].startsWith(d.time[0])?'Today':h.time[i].startsWith(d.time[1])?'Tomorrow':h.time[i].slice(0,10);
    return result(`${hourDay} at ${localHour(h.time[i])} in ${location.name}: ${condition(h.weather_code[i]).label.toLowerCase()}, around ${temp(h.temperature_2m[i],prefs,true)} with a ${number(h.precipitation_probability[i])}% chance of precipitation. Winds are forecast around ${wind(h.wind_speed_10m[i],prefs)}.${minuteNote}${past}`,[metric('Temperature',temp(h.temperature_2m[i],prefs)),metric('Feels like',temp(h.apparent_temperature[i],prefs)),metric('Rain chance',`${number(h.precipitation_probability[i])}%`)]);
  }
  if(/rain|umbrella|precipitation|wet/.test(q)){
    const hours=forecastHours(data,day).filter(v=>day>0||v.index>=currentHourIndex(data));
    const valid=hours.filter(v=>present(h.precipitation_probability[v.index]));
    if(!valid.length)return result('Precipitation probabilities are not available for that period. I can’t make a reliable umbrella recommendation.');
    const peak=valid.reduce((a,b)=>h.precipitation_probability[a.index]>=h.precipitation_probability[b.index]?a:b);
    const p=h.precipitation_probability[peak.index],i=peak.index;
    return result(`${p>=40?'Keep an umbrella handy.':p>=20?'An umbrella is worth considering.':'Rain looks less likely, but not impossible.'} ${label} in ${location.name}, the highest ${day===0?'remaining hourly ':''}precipitation chance is ${number(p)}%, around ${localHour(h.time[i])}. The forecast daily total is ${number(d.precipitation_sum[day],1)} mm. Probability isn’t a promise—check again before you head out.`,[metric('Peak hourly chance',`${number(p)}%`),metric('At that time',temp(h.temperature_2m[i],prefs)),metric('Daily precipitation',`${number(d.precipitation_sum[day],1)} mm`)]);
  }
  if(/wind|breez|gust/.test(q))return result(`${label}'s maximum sustained wind in ${location.name} is forecast at ${wind(d.wind_speed_10m_max[day],prefs)}, with gusts up to ${wind(d.wind_gusts_10m_max[day],prefs)}. Right now, wind is ${wind(c.wind_speed_10m,prefs)} from the ${direction(c.wind_direction_10m)}. Gusts are brief peaks, not a constant wind speed.`,[metric('Wind now',wind(c.wind_speed_10m,prefs)),metric(`${label}'s max gust`,wind(d.wind_gusts_10m_max[day],prefs))]);
  if(/sunrise|sunset/.test(q))return result(`${label} in ${location.name}, sunrise is at ${localHour(d.sunrise[day])} and sunset is at ${localHour(d.sunset[day])}. Times are local to ${data.timezone.replaceAll('_',' ')}.`,[metric('Sunrise',localHour(d.sunrise[day])),metric('Sunset',localHour(d.sunset[day]))]);
  if(/cloud|overcast/.test(q)||intent.topic==='clouds'){
    const hours = h.cloud_cover?.slice(day*24, (day+1)*24) || [];
    const avgCloud = hours.length ? Math.round(hours.reduce((a,b)=>a+b,0)/hours.length) : (c.cloud_cover||0);
    return result(`${label} in ${location.name}: Cloud cover is forecast to average ${avgCloud}% across the day.`,[metric('Cloud cover',`${avgCloud}%`),metric('Current sky',`${c.cloud_cover||0}% cloudy`)]);
  }
  if(/weather|temperature|hot|cold|forecast|tomorrow|today|outlook/.test(q))return result(`${label} in ${location.name}: ${condition(d.weather_code[day]).label.toLowerCase()}, with temperatures between ${temp(d.temperature_2m_min[day],prefs,true)} and ${temp(d.temperature_2m_max[day],prefs,true)}. Peak precipitation probability is ${number(d.precipitation_probability_max[day])}%, with maximum sustained wind around ${wind(d.wind_speed_10m_max[day],prefs)}.`,dayMetrics(day));
  return result('I can interpret this location’s forecast for rain, temperatures, wind, sunrise and sunset, today versus tomorrow, or a good time to head outside. Try “Will I need an umbrella tomorrow?” For another city, use the location search or ask “What’s the weather in Jaipur?” I don’t have a general-purpose language model connected.');
}

/**
 * Public answer entry point. One structured intent in, one answer out:
 *  1. clarification / unsupported date — honest, no substitution;
 *  2. unified metric-aware answers (identical coverage in EN and HI);
 *  3. legacy narrative branches for composite topics, with an explicit
 *     resolved date/time/zone appended so misreads are visible.
 */
export function analyzeQuestion(question, state, parsedIntent = null) {
  const { weather: data, prefs } = state;
  const intent = parsedIntent || parseWeatherQuestion(question, prefs?.language || 'en');
  if (intent.clarification) {
    return { text: intent.clarification.text, choices: intent.clarification.choices || [], metrics: [], language: intent.language };
  }
  if (intent.unsupportedDate || intent.historical) {
    const daily = state.weather?.daily?.time;
    const range = daily?.length ? (intent.language === 'hi'
      ? ` उपलब्ध स्थानीय तारीखें: ${daily[0]} से ${daily.at(-1)}।`
      : ` Available local dates: ${daily[0]} to ${daily.at(-1)}.`) : '';
    return {
      text: intent.language === 'hi'
        ? `ऐतिहासिक मौसम और जलवायु डेटा इस ऐप से नहीं जुड़े हैं। चुनी हुई तारीख उपलब्ध 7-दिन के पूर्वानुमान के बाहर है।${range} मैं आज का मौसम दूसरी तारीख के रूप में प्रस्तुत नहीं करूँगा।`
        : `Historical weather and climate datasets are not connected in WeatherGPT. That date is outside the available 7-day forecast.${range} I can explain the loaded forecast, but I will not substitute today’s weather for a different date.`,
      metrics: [], language: intent.language
    };
  }
  const structured = structuredAnswer(intent, state);
  if (structured) return structured;
  if (!data) {
    return { text: 'I don’t have a loaded forecast for this location yet. Retry the weather service, or search for another place, then ask again.', metrics: [], language: intent.language };
  }
  return withScope(legacyAnswer(question, state, intent), intent, state);
}

export function createAssistant({getState,selectLocation,switchLayer,setLanguage,toast}) {
  const $=id=>document.getElementById(id);
  let recognition,listening=false,busy=false,currentSpeech=null,previousIntent=null,latestIntent=null;
  // Request identity: every submit supersedes the previous one. An older
  // geocode/weather/answer chain can never render into the current conversation.
  const guard=createRequestGuard();
  let activeAbort=null,pendingCandidates=[],pendingQuestion=null;
  function updateInterpretation(intent,loading=false){
    const root=$('nlp-interpretation');if(!root)return;
    root.hidden=false;
    const place=intent.place||{};
    const locationLabel=place.query||intent.locationQuery||getState().location.name;
    const placeStatus=place.status==='ambiguous'?(intent.language==='hi'?' · कई विकल्प':' · multiple matches'):place.status==='not-found'?' · not found':'';
    $('nlp-summary').textContent=intent.language==='hi'?'प्रश्न का अर्थ':'Question understood as';
    $('nlp-slots').innerHTML=[locationLabel+placeStatus,intent.time?.resolvedLabel||(intent.date?`${intent.dateLabel} · ${intent.date}`:intent.dateLabel),intent.timeLabel,topicNames[intent.topic]||intent.topic].filter(Boolean).map(value=>`<span>${escapeHTML(value)}</span>`).join('');
    $('nlp-engine').textContent=`${intent.engine} · ${intent.clarification?'Clarification needed':loading?'Resolving location…':'Local interpretation'}${intent.inherited.length?' · Reused '+intent.inherited.join(', '):''}`;
  }
  function stopSpeech(){currentSpeech=null;window.speechSynthesis?.cancel();$('speech-feedback').hidden=true;}
  $('stop-speech').addEventListener('click',stopSpeech);
  $('speak-answers').addEventListener('change',()=>{if(!$('speak-answers').checked)stopSpeech();});
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SpeechRecognition){
    recognition=new SpeechRecognition();recognition.lang=getState().prefs.language==='hi'?'hi-IN':'en-IN';recognition.continuous=false;recognition.interimResults=true;
    recognition.onstart=()=>{listening=true;$('voice-button').classList.add('listening');$('voice-button').setAttribute('aria-label','Stop listening');$('voice-status').textContent=getState().prefs.language==='hi'?'सुन रहे हैं… मौसम का प्रश्न बोलें।':'Listening… speak your weather question.';};
    recognition.onresult=event=>{
      let transcript='';for(let i=0;i<event.results.length;i++)transcript+=event.results[i][0].transcript;
      $('assistant-query').value=transcript.slice(0,400);
      $('voice-status').textContent=`Heard: ${transcript}`;
      if(event.results[event.results.length-1].isFinal){recognition.stop();submit(transcript.slice(0,400));}
    };
    recognition.onerror=event=>{const messages={'not-allowed':'Microphone permission was denied. Enable it in browser settings or type your question.','audio-capture':'No microphone was found. Connect one, or type your question.','no-speech':'No speech was detected. Press the microphone to try again.','network':'The browser speech service could not connect. Type your question instead.','service-not-allowed':'Speech recognition is not allowed in this browser. Type your question instead.'};$('voice-status').textContent=messages[event.error]||'Voice input stopped. You can retry or type your question.';};
    recognition.onend=()=>{listening=false;$('voice-button').classList.remove('listening');$('voice-button').setAttribute('aria-label','Speak a weather question');if(/^(Listening|सुन रहे)/.test($('voice-status').textContent))$('voice-status').textContent=getState().prefs.language==='hi'?'सुनना समाप्त हुआ। फिर प्रयास करें या प्रश्न लिखें।':'Listening ended. Tap the microphone to try again, or type a question.';};
  } else {$('voice-button').title='Speech recognition is not supported in this browser';$('voice-status').textContent='Voice input is unavailable in this browser. You can type a question instead.';}
  if(!('speechSynthesis'in window)){$('speak-answers').disabled=true;$('speak-answers').parentElement.title='Text-to-speech is not supported in this browser.';}
  $('voice-button').addEventListener('click',()=>{if(!recognition){toast('Voice input is unavailable. Try a supported browser or type your question.');return;}if(listening)recognition.stop();else{stopSpeech();try{recognition.start();}catch{toast('The microphone is busy. Wait a moment and try again.');}}});
  $('assistant-form').addEventListener('submit',e=>{e.preventDefault();submit($('assistant-query').value);});
  $('clear-conversation').addEventListener('click',()=>{guard.cancel();activeAbort?.abort();pendingCandidates=[];pendingQuestion=null;busy=false;$('conversation').replaceChildren();previousIntent=null;latestIntent=null;if($('nlp-interpretation'))$('nlp-interpretation').hidden=true;stopSpeech();addResponse({text:t('assistant.freshStart',{},getState().prefs.language==='hi'?'hi':'en'),metrics:[],language:getState().prefs.language},false);});
  document.querySelectorAll('[data-question]').forEach(button=>button.addEventListener('click',()=>submit(button.dataset.question)));
  $('assistant-language').value=getState().prefs.language||'en';
  function updateLanguageControls(){
    const hi=getState().prefs.language==='hi';
    $('assistant-language').value=hi?'hi':'en';
    if(recognition)recognition.lang=hi?'hi-IN':'en-IN';
    $('assistant-query').placeholder=hi?'यहाँ के मौसम के बारे में पूछें…':'Ask about a place, a time, or your day…';
    if($('hindi-prompts'))$('hindi-prompts').hidden=!hi;
    if($('english-prompts'))$('english-prompts').hidden=hi;
    const welcome=document.querySelector('.assistant-welcome');
    if(welcome){const heading=welcome.querySelector('h3'),copy=welcome.querySelector(':scope > p');if(heading)heading.textContent=t('assistant.welcome',{},hi?'hi':'en');if(copy)copy.textContent=t('assistant.welcomeCopy',{},hi?'hi':'en');}
    $('voice-status').textContent=hi?(SpeechRecognition?'प्रश्न लिखें या माइक्रोफ़ोन से बोलें। आवाज़ ब्राउज़र की सेवा द्वारा संसाधित होती है।':'इस ब्राउज़र में आवाज़ की सुविधा उपलब्ध नहीं है। कृपया प्रश्न लिखें।'):(SpeechRecognition?'Ready for your question. Voice uses your browser’s speech service.':'Voice unavailable in this browser. Type a question instead.');
  }
  $('assistant-language').addEventListener('change',()=>{if(listening)recognition?.abort();stopSpeech();setLanguage($('assistant-language').value);updateLanguageControls();});
  updateLanguageControls();
  function speak(text,language){
    if(!('speechSynthesis'in window)){toast('Spoken answers are not supported in this browser.');return;}
    stopSpeech();const speech=new SpeechSynthesisUtterance(text);const hi=language==='hi'||/[\u0900-\u097f]/.test(text);speech.lang=hi?'hi-IN':'en-IN';speech.rate=.96;
    const voices=window.speechSynthesis.getVoices(),voice=voices.find(v=>v.lang.toLowerCase().startsWith(hi?'hi':'en'));
    if(hi&&voices.length&&!voice){toast('इस डिवाइस पर हिन्दी आवाज़ उपलब्ध नहीं है। उत्तर पढ़ सकते हैं; सिस्टम में हिन्दी आवाज़ जोड़ें।');return;}
    if(voice)speech.voice=voice;currentSpeech=speech;
    $('speech-feedback').hidden=false;$('speech-feedback-label').textContent='Preparing spoken answer…';
    speech.onstart=()=>{if(currentSpeech===speech)$('speech-feedback-label').textContent='WeatherGPT is speaking';};
    speech.onend=()=>{if(currentSpeech===speech){currentSpeech=null;$('speech-feedback').hidden=true;}};
    speech.onerror=event=>{if(currentSpeech===speech){currentSpeech=null;$('speech-feedback').hidden=true;}if(event.error!=='interrupted'&&event.error!=='canceled')toast('The spoken answer could not play. The text remains available.');};
    window.speechSynthesis.speak(speech);
  }
  function addResponse(response,allowSpeech=true){
    const {weather,location}=getState();
    const article=document.createElement('article');article.className='response-entry';
    article.innerHTML=`<div class="response-heading">${icon('sparkles')} WEATHERGPT <span>· FORECAST INSIGHT</span></div><p>${escapeHTML(response.text)}</p>${response.metrics?.length?`<div class="response-metrics">${response.metrics.map(m=>`<div class="response-metric"><small>${escapeHTML(m.label)}</small><strong>${escapeHTML(m.value)}</strong></div>`).join('')}</div>`:''}<footer>${icon('map-pin')}<span>${escapeHTML(location.name)}${weather?` · Open-Meteo · model ${escapeHTML(localHour(weather.current.time))} local`:''}</span><button aria-label="Read this answer aloud" title="Read answer aloud">${icon('volume')}</button></footer>`;
    article.lang=response.language==='hi'?'hi':'en';
    if(response.scope?.length){const scope=document.createElement('div');scope.className='response-scope';scope.innerHTML=response.scope.map(label=>`<span>${escapeHTML(label)}</span>`).join('');article.querySelector('.response-heading').after(scope);}
    if(response.timeline?.length){const timeline=document.createElement('div');timeline.className='response-timeline';timeline.setAttribute('aria-label',response.language==='hi'?'प्रति-घंटा पूर्वानुमान':'Hourly forecast evidence');timeline.innerHTML=response.timeline.map(point=>`<div><span>${escapeHTML(point.time)}</span>${icon(point.icon)}<strong>${escapeHTML(point.temperature)}</strong><span class="response-rain-bar" aria-hidden="true"><i style="height:${point.probability===null?0:Math.max(0,Math.min(100,point.probability))}%"></i></span><small>${point.probability===null?'—':number(point.probability)+'%'}</small></div>`).join('');article.querySelector('footer').before(timeline);}
    if(response.note){const note=document.createElement('p');note.className='response-evidence-note';note.textContent=response.note;article.querySelector('footer').before(note);}
    if(response.choices?.length){const choices=document.createElement('div');choices.className='nlp-clarifications';for(const option of response.choices){const button=document.createElement('button');button.type='button';button.textContent=option.label;button.addEventListener('click',()=>submit(option.query));choices.append(button);}article.querySelector('footer').before(choices);}
    article.querySelector('footer button').addEventListener('click',()=>speak(response.text,response.language));
    if(response.action==='radar'){const link=document.createElement('a');link.href='#map';link.className='response-map-link';link.textContent='Explore radar →';article.append(link);}
    $('conversation').append(article);$('conversation').scrollTop=$('conversation').scrollHeight;
    if(allowSpeech&&$('speak-answers').checked)speak(response.text,response.language);
  }
  async function submit(raw,forcedLocation=null){
    const question=String(raw||'').trim().slice(0,400);
    if(!question)return;
    // Internal selection from a disambiguation list (never exposed as weather text).
    const selection=question.match(/^select-place:(\d+)$/);
    if(selection){
      const candidate=pendingCandidates[Number(selection[1])];
      if(!candidate){addResponse({text:'That choice is no longer available. Please run the search again.',metrics:[]});return;}
      pendingCandidates=[];
      const original=pendingQuestion||'What is the weather?';
      pendingQuestion=null;
      return submit(original,candidate);
    }
    const id=guard.next();
    activeAbort?.abort();
    activeAbort=new AbortController();
    const signal=activeAbort.signal;
    const isStale=()=>!guard.isCurrent(id)||signal.aborted;
    busy=true;window.location.hash='assistant';
    $('conversation').querySelector('.assistant-welcome')?.remove();
    const query=document.createElement('p');query.className='query-entry';query.textContent=question;$('conversation').append(query);
    $('assistant-query').value='';$('assistant-form').querySelector('[type=submit]').disabled=true;
    $('voice-status').textContent='Analyzing the available weather conditions…';
    const epochBefore=getState().epoch||0;
    try{
      $('voice-status').textContent='Interpreting place, time, and weather intent…';
      const engine=await loadNLPEngine();
      if(isStale())return;
      let intent=interpretWeatherQuestion(question,getState(),{previous:previousIntent,engine});
      if(forcedLocation){
        intent.place={...intent.place,status:'resolved',resolved:forcedLocation,candidates:[forcedLocation]};
        intent.locationQuery=forcedLocation.name;
      }
      latestIntent=intent;updateInterpretation(intent,Boolean(intent.place?.query&&intent.place.status!=='resolved'));
      if(intent.clarification){addResponse(analyzeQuestion(question,getState(),intent));return;}
      const place=intent.place;
      const needsLocation=place?.query&&place.status!=='resolved'&&!intent.unsupportedDate;
      if(needsLocation){
        const label=place.fullQuery||place.query;
        $('voice-status').textContent=intent.language==='hi'?`${label} का स्थान और मौसम खोज रहे हैं…`:`Finding ${label} and fetching its forecast…`;
        const outcome=await searchPlaces(label,{signal,explicit:true});
        if(isStale())return;
        applyGeocoderResult(intent,outcome.results);
        if(intent.place.status==='ambiguous'){
          pendingCandidates=intent.place.candidates.slice(0,5);
          pendingQuestion=question;
          latestIntent=intent;updateInterpretation(intent);
          addResponse(analyzeQuestion(question,getState(),intent));
          return;
        }
        if(intent.place.status==='not-found'){
          addResponse({text:intent.language==='hi'?`“${label}” नहीं मिला। खोज में ज़िला/राज्य जोड़ें या अक्षांश, देशांतर दर्ज करें।`:`I could not find “${label}”. Add a district or state in the search, or enter latitude, longitude.`,metrics:[],language:intent.language});
          return;
        }
        const loaded=await selectLocation(intent.place.resolved);
        if(isStale()||!isFresh({id,guard,epochAtStart:epochBefore,currentEpoch:getState().epoch||0,expectedEpoch:epochBefore+1,aborted:signal.aborted})||!loaded){
          if(!isStale())addResponse({text:'The requested forecast did not finish loading, or the selected location changed. Please retry for the current location. I won’t substitute a different place’s forecast.',metrics:[],language:intent.language});
          return;
        }
        // Re-resolve dates in the requested place's own forecast timezone.
        intent=interpretWeatherQuestion(question,getState(),{previous:previousIntent,engine});
        if(forcedLocation){intent.place={...intent.place,status:'resolved',resolved:forcedLocation,candidates:[forcedLocation]};}
      }
      if(isStale())return;
      latestIntent=intent;updateInterpretation(intent);
      const response=analyzeQuestion(question,getState(),intent);
      if(!intent.clarification&&!intent.unsupportedDate&&getState().weather)previousIntent={...intent};
      addResponse(response);
      if(response.action==='radar'){switchLayer('radar');toast('Radar layer selected. Open Live map to explore past frames.');}
    }catch(error){
      if(isStale()||error.name==='AbortError')return;
      addResponse({text:'I couldn’t load the requested location’s weather. Check your connection and try the location search. I won’t use another location’s data to answer.',metrics:[],language:getState().prefs.language});
    }finally{
      if(!isStale()){
        busy=false;
        $('assistant-form').querySelector('[type=submit]').disabled=false;
        updateLanguageControls();
        $('conversation').scrollTop=$('conversation').scrollHeight;
      }
    }
  }
  return {submit,refreshLanguage(){updateLanguageControls();},updateContext(){const{location}=getState();if(previousIntent&&previousIntent.contextKey!==`${location.latitude},${location.longitude}`)previousIntent=null;$('assistant-context').textContent=`${getState().prefs.language==='hi'?'मौसम संदर्भ':'Weather context'}: ${location.name}${location.country?', '+location.country:''}`;},stop(){if(listening)recognition?.abort();stopSpeech();}};
}
