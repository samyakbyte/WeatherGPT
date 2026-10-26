import { analyzeQuestion } from '../js/assistant.js';
import { parseWeatherQuestion } from '../js/intent.js';
import { periodEvidence } from '../js/insights.js';
import { temp, direction, condition, deriveAdvisories } from '../js/weather.js';
import { validCoordinates } from '../js/api.js';
import { escapeHTML } from '../js/icons.js';
const output=document.getElementById('test-results');output.textContent='';
let passed=0,failed=0;
function assert(condition,label){if(condition){passed++;output.textContent+=`PASS ${label}\n`;console.info('[TEST PASS]',label);}else{failed++;output.textContent+=`FAIL ${label}\n`;console.error('[TEST FAIL]',label);}}
function delay(ms){return new Promise(r=>setTimeout(r,ms));}
async function wait(test,ms=20000){const start=Date.now();while(Date.now()-start<ms){if(test())return true;await delay(200);}return false;}
// Test fixtures only: these numbers are never imported by the application UI.
const dates=Array.from({length:7},(_,i)=>`2026-09-${15+i}`);
const hours=dates.flatMap(date=>Array.from({length:24},(_,i)=>`${date}T${String(i).padStart(2,'0')}:00`));
const hourly={time:hours};
for(const [key,value]of Object.entries({temperature_2m:30,apparent_temperature:34,precipitation_probability:60,wind_speed_10m:12,weather_code:61,uv_index:5,relative_humidity_2m:70}))hourly[key]=hours.map(()=>value);
const daily={time:dates};
for(const[key,value]of Object.entries({temperature_2m_max:33,temperature_2m_min:25,precipitation_probability_max:60,precipitation_sum:3,wind_speed_10m_max:20,wind_gusts_10m_max:28,weather_code:61,uv_index_max:5}))daily[key]=dates.map(()=>value);
daily.temperature_2m_max[1]=35;daily.sunrise=dates.map(d=>d+'T06:00');daily.sunset=dates.map(d=>d+'T18:30');
const fixture={location:{name:'Test city'},prefs:{temperature:'celsius',wind:'kmh'},weather:{current:{time:dates[0]+'T12:00',temperature_2m:30,apparent_temperature:34,relative_humidity_2m:70,wind_speed_10m:12,wind_direction_10m:90},hourly,daily,timezone:'Asia/Kolkata'}};
assert(temp(0,{temperature:'fahrenheit'},true)==='32°F','Celsius to Fahrenheit conversion');
assert(temp(null)==='—','Missing values are not silently converted to zero');
assert(direction(90)==='E','Meteorological wind direction');
assert(condition(95).icon==='storm','WMO thunderstorm mapping');
assert(!validCoordinates(91,20)&&validCoordinates(-30,120),'Coordinate range validation');
assert(escapeHTML('<img onerror="x">').includes('&lt;img'),'Untrusted text escaping');
assert(analyzeQuestion('Will I need an umbrella tomorrow?',fixture).text.includes('60%'),'Umbrella answer grounded in forecast');
assert(analyzeQuestion('Compare tomorrow with today.',fixture).text.includes('2.0° warmer'),'Comparison uses actual forecast difference');
assert(analyzeQuestion('What is the weather at 7 PM?',fixture).text.includes('7 PM'),'Local-hour question handling');
assert(analyzeQuestion('Is a storm approaching?',fixture).text.includes('can’t determine'),'Assistant does not invent storm motion');
assert(analyzeQuestion('Tell me a joke',fixture).text.includes('general-purpose'),'Unsupported question disclosure');
assert(analyzeQuestion('Weather?',{...fixture,weather:null}).text.includes('don’t have a loaded forecast'),'Missing forecast blocks weather claims');
assert(deriveAdvisories(fixture.weather).some(a=>a.title.includes('heat')),'Explicit heat threshold produces advisory');
assert(analyzeQuestion('Weather at 13 PM?',fixture).text.includes('valid time'),'Invalid 12-hour time is rejected');
assert(analyzeQuestion('Weather next hour?',{...fixture,weather:{...fixture.weather,current:{...fixture.weather.current,time:dates[0]+'T23:45'}}}).text.startsWith('Tomorrow at 12 AM'),'Next-hour forecast crosses midnight correctly');
const intent=parseWeatherQuestion('Will it rain in Jaipur tomorrow evening?');
assert(intent.locationQuery==='Jaipur'&&intent.dayOffset===1&&intent.period.start===17&&intent.period.end===20,'Flagship question separates city, tomorrow, and evening window');
assert(parseWeatherQuestion('Will it rain in Paris tomorrow evening?').locationQuery==='Paris','Unknown-to-dictionary city extraction excludes time phrase');
assert(parseWeatherQuestion('What is the best time to go outside today?').locationQuery===null,'Outdoor action is not mistaken for a city');
assert(parseWeatherQuestion('कल जयपुर में बारिश होगी?').locationQuery==='Jaipur','Hindi city name maps to geocoding search');
assert(parseWeatherQuestion('Kal Jaipur mein baarish hogi?','hi').topic==='rain','Romanized Hindi basic rain question');
const evidence=periodEvidence(intent,fixture.weather);
assert(evidence.indexes.length===3&&evidence.indexes[0]===41&&evidence.indexes[2]===43,'Evening insight selects only tomorrow 17:00–19:00 samples');
const evening=analyzeQuestion('Will it rain in Jaipur tomorrow evening?',fixture);
assert(evening.timeline.length===3&&evening.metrics[0].value==='60%','Evening response contains grounded hourly evidence');
assert(evening.note.includes('Official warning status is unavailable'),'Unavailable official warning feed is not an all-clear');
assert(analyzeQuestion('Is tomorrow going to be hotter than today?',fixture).text.includes('2.0° warmer'),'Hotter tomorrow means daily comparison, not feels-like explanation');
const hindi=analyzeQuestion('कल जयपुर में बारिश होगी?',fixture);
assert(hindi.language==='hi'&&hindi.text.includes('60%')&&hindi.text.includes('बारिश'),'Hindi answer contains real forecast values and Hindi explanation');
assert(analyzeQuestion('क्या कल आज से अधिक गर्म होगा?',fixture).text.includes('2.0° अधिक'),'Hindi temperature comparison uses calculated difference');
assert(analyzeQuestion('कल शाम ७ बजे मौसम कैसा होगा?',fixture).text.includes('7 PM'),'Hindi digits and evening clock resolve to 19:00');
assert(analyzeQuestion('कल 7 बजे मौसम कैसा होगा?',fixture).text.includes('समय स्पष्ट'),'Ambiguous Hindi clock requests clarification');
assert(analyzeQuestion('What was Jaipur weather in July 2010?',fixture).text.includes('Historical weather'),'Historical query does not reuse a current forecast');
assert(analyzeQuestion('कल बारिश हुई थी?',fixture).text.includes('ऐतिहासिक'),'Hindi past-tense kal is not silently treated as tomorrow');
const missingPeriod={...fixture,weather:{...fixture.weather,hourly:{...hourly,precipitation_probability:hours.map(()=>null)}}};
assert(analyzeQuestion('Rain tomorrow evening?',missingPeriod).metrics.length===0,'Missing hourly evidence does not become zero-percent rain');
const storageBefore=Object.fromEntries(['weathergpt.location','weathergpt.preferences','weathergpt.saved'].map(key=>[key,localStorage.getItem(key)]));
const iframe=document.getElementById('app-under-test');
try{
  await wait(()=>iframe.contentDocument?.querySelector('.hour-item')||iframe.contentDocument?.querySelector('#weather-error:not([hidden])'),25000);
  const win=iframe.contentWindow,doc=win.document;
  const nav=async hash=>{win.location.hash=hash;await delay(170);};
  assert(!!doc.querySelector('.leaflet-container'),'Leaflet map initialized');
  assert(!doc.body.innerText.includes('function renderCurrent'),'No script source leaked into rendered text');
  const live=doc.querySelector('#weather-error').hidden&&doc.querySelectorAll('.hour-item').length>0;
  assert(live,'Real forecast loads from public weather service');
  for(const route of ['map','forecast','alerts','assistant','locations','overview']){
    await nav(route);assert(doc.body.dataset.view===route,`Navigation: ${route}`);
  }
  doc.querySelector('[data-period="daily"]').click();
  assert(!doc.querySelector('#daily-forecast').hidden&&doc.querySelectorAll('.daily-row').length===7,'7-day forecast selection');
  doc.querySelector('[data-metric="rain"]').click();assert(doc.querySelector('#chart-unit').textContent==='%','Precipitation chart selection');
  doc.querySelector('[data-period="hourly"]').click();doc.querySelector('[data-metric="temperature"]').click();
  const before=doc.querySelector('#current-temperature').textContent;
  const unit=doc.querySelector('#temperature-unit');unit.value='fahrenheit';unit.dispatchEvent(new win.Event('change',{bubbles:true}));
  assert(doc.querySelector('#current-temperature').textContent!==before&&doc.querySelector('#chart-unit').textContent==='°F','Unit preference updates weather and chart');
  unit.value='celsius';unit.dispatchEvent(new win.Event('change',{bubbles:true}));
  const savedBefore=doc.querySelector('#save-location').getAttribute('aria-pressed');doc.querySelector('#save-location').click();
  assert(doc.querySelector('#save-location').getAttribute('aria-pressed')!==savedBefore,'Saved-place toggle updates state');doc.querySelector('#save-location').click();
  doc.querySelector('#settings-button').click();assert(doc.querySelector('#settings-dialog').open,'Preferences dialog opens');doc.querySelector('#settings-dialog').close();
  doc.querySelector('#sources-button').click();assert(doc.querySelector('#sources-dialog').open,'Data sources dialog opens');doc.querySelector('#sources-dialog').close();
  const search=doc.querySelector('#location-search');search.value='Jaipur';search.dispatchEvent(new win.Event('input',{bubbles:true}));
  const found=await wait(()=>doc.querySelector('#search-results [data-location]'),20000);assert(found,'Live city search returns locations');
  if(found){doc.querySelector('#search-results [data-location]').click();await wait(()=>doc.querySelector('#location-name').textContent.includes('Jaipur')&&doc.querySelector('#current-condition').textContent!=='Loading atmospheric data…',20000);assert(doc.querySelector('#location-name').textContent.includes('Jaipur')&&doc.querySelector('#weather-error').hidden,'Location selection updates actual weather');}
  await nav('assistant');
  doc.querySelector('#assistant-query').value='Will I need an umbrella tomorrow?';doc.querySelector('#assistant-form').dispatchEvent(new win.Event('submit',{cancelable:true,bubbles:true}));
  await wait(()=>doc.querySelectorAll('.response-entry').length>0);assert(doc.querySelectorAll('.response-entry').length>0,'Weather assistant submits and renders an answer');
  assert(doc.querySelector('.response-entry').textContent.includes('Open-Meteo'),'Assistant response includes source context');
  assert(doc.querySelectorAll('.response-metric').length===3,'Assistant metrics are rendered from forecast');
  if(win.speechSynthesis){
    // Test event wiring only; this does not validate real microphone or speaker hardware.
    const synth=win.speechSynthesis,originalSpeak=synth.speak,originalCancel=synth.cancel;
    try{
      let stopped=false;synth.speak=speech=>speech.onstart?.();synth.cancel=()=>{stopped=true;};
      doc.querySelector('.response-entry footer button').click();
      assert(!doc.querySelector('#speech-feedback').hidden&&doc.querySelector('#speech-feedback-label').textContent.includes('is speaking'),'Speech playback event shows speaking state');
      stopped=false;doc.querySelector('#stop-speech').click();assert(stopped&&doc.querySelector('#speech-feedback').hidden,'Stop audio cancels speech and resets feedback');
    }finally{synth.speak=originalSpeak;synth.cancel=originalCancel;}
  }
  const responseCount=doc.querySelectorAll('.response-entry').length;
  doc.querySelector('#assistant-query').value='Will it rain in Jaipur tomorrow evening?';doc.querySelector('#assistant-form').dispatchEvent(new win.Event('submit',{cancelable:true,bubbles:true}));
  await wait(()=>doc.querySelectorAll('.response-entry').length>responseCount);
  const flagship=[...doc.querySelectorAll('.response-entry')].at(-1);
  assert(flagship.querySelectorAll('.response-timeline>div').length===3,'Live city-and-evening question renders three-hour evidence');
  assert(flagship.textContent.includes('Jaipur')&&flagship.textContent.includes('5–8 PM'),'Live answer exposes resolved place and local time window');
  assert(!doc.querySelector('#nlp-interpretation').hidden&&doc.querySelector('#nlp-engine').textContent.includes('Compromise'),'Local NLP engine and interpretation are visible');
  const ask=async question=>{const n=doc.querySelectorAll('.response-entry').length;doc.querySelector('#assistant-query').value=question;doc.querySelector('#assistant-form').dispatchEvent(new win.Event('submit',{cancelable:true,bubbles:true}));await wait(()=>doc.querySelectorAll('.response-entry').length>n);return [...doc.querySelectorAll('.response-entry')].at(-1);};
  const follow=await ask('And what about wind?');
  assert(follow.querySelectorAll('.response-timeline>div').length===3&&doc.querySelector('#nlp-engine').textContent.includes('Reused date, time window'),'Live follow-up retains tomorrow evening context');
  const clarify=await ask('What is the weather tomorrow at 7?');
  assert(clarify.querySelectorAll('.nlp-clarifications button').length===2,'Ambiguous live clock offers AM/PM clarification');
  const n=doc.querySelectorAll('.response-entry').length;
  clarify.querySelectorAll('.nlp-clarifications button')[1].click();
  await wait(()=>doc.querySelectorAll('.response-entry').length>n);
  const resolved=[...doc.querySelectorAll('.response-entry')].at(-1);
  assert(resolved.textContent.includes('7 PM')&&resolved.querySelectorAll('.response-metric').length===3,'Clarification button executes a grounded 7 PM query');
  doc.querySelector('#clear-conversation').click();
  assert(doc.querySelector('#nlp-interpretation').hidden,'Clear resets NLP interpretation and question context');
  const language=doc.querySelector('#assistant-language');language.value='hi';language.dispatchEvent(new win.Event('change',{bubbles:true}));
  assert(doc.querySelector('#assistant-query').placeholder.includes('मौसम'),'Hindi conversation and voice preference updates UI');
  const priorHindi=doc.querySelectorAll('.response-entry').length;
  doc.querySelector('#assistant-query').value='कल शाम का मौसम कैसा होगा?';doc.querySelector('#assistant-form').dispatchEvent(new win.Event('submit',{cancelable:true,bubbles:true}));
  await wait(()=>doc.querySelectorAll('.response-entry').length>priorHindi);
  const liveHindi=[...doc.querySelectorAll('.response-entry')].at(-1);
  assert(liveHindi.lang==='hi'&&liveHindi.textContent.includes('तापमान')&&liveHindi.querySelectorAll('.response-timeline>div').length===3,'Hindi conversation explains live hourly evidence, not only translated buttons');
  language.value='en';language.dispatchEvent(new win.Event('change',{bubbles:true}));
  await nav('map');
  doc.querySelector('.selected-location-marker').click();
  assert(!doc.querySelector('#map-location-panel').hidden,'Selected map marker opens location panel');
  assert(doc.querySelectorAll('#map-panel-forecast>div').length===3,'Location panel includes three forecast hours');
  assert(doc.querySelector('#map-panel-weather').textContent.includes('°C'),'Location panel includes current conditions and units');
  doc.querySelector('#close-map-panel').click();assert(doc.querySelector('#map-location-panel').hidden,'Location panel closes');
  doc.querySelector('#expand-map').click();assert(doc.querySelector('#map-section').classList.contains('expanded'),'Expanded map opens');
  doc.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!doc.querySelector('#map-section').classList.contains('expanded'),'Escape restores expanded map');
  doc.querySelector('[data-layer="wind"]').click();
  assert(doc.querySelector('#map-legend').textContent.includes('Wind speed'),'Wind layer changes the map legend');
  doc.querySelector('[data-layer="radar"]').click();
  await wait(()=>!doc.querySelector('#radar-timeline').disabled||doc.querySelector('#map-data-label').textContent==='Radar unavailable',20000);
  const radar=!doc.querySelector('#radar-timeline').disabled;
  assert(radar||doc.querySelector('#map-status').textContent.includes('could not be loaded'),'Radar provides live frames or actionable error');
  if(radar){const t=doc.querySelector('#radar-timeline').value;doc.querySelector('#radar-prev').click();assert(doc.querySelector('#radar-timeline').value!==t,'Radar previous-frame control');doc.querySelector('#radar-speed').click();assert(doc.querySelector('#radar-speed').textContent==='2×','Radar playback speed');}
  if(radar){
    const scrubber=doc.querySelector('#radar-timeline');scrubber.value=0;scrubber.dispatchEvent(new win.Event('input',{bubbles:true}));
    const stamp=doc.querySelector('#timeline-current').textContent;
    doc.querySelector('#radar-play').click();await delay(1600);
    assert(doc.querySelector('#timeline-current').textContent!==stamp,'Radar playback advances actual provider timestamps');
    if(doc.querySelector('#radar-play').getAttribute('aria-label').startsWith('Pause'))doc.querySelector('#radar-play').click();
  }
  doc.querySelector('[data-layer="temperature"]').click();await nav('overview');
  // Inject a failure only within this test frame, using a new uncached coordinate.
  const originalFetch=win.fetch;
  try{
    win.fetch=(url,options)=>String(url).includes('api.open-meteo.com/v1/forecast')?Promise.reject(new win.TypeError('Deliberate smoke-test network failure')):originalFetch.call(win,url,options);
    search.value='31.2345, 75.6789';search.dispatchEvent(new win.Event('input',{bubbles:true}));
    await wait(()=>doc.querySelector('#search-results [data-location]'));
    doc.querySelector('#search-results [data-location]').click();
    await wait(()=>!doc.querySelector('#weather-error').hidden);
    assert(!doc.querySelector('#weather-error').hidden&&doc.querySelector('#current-temperature').textContent.includes('—'),'Network error shows recovery UI and removes stale weather');
    await nav('assistant');doc.querySelector('#assistant-query').value='Will it rain tomorrow?';doc.querySelector('#assistant-form').dispatchEvent(new win.Event('submit',{cancelable:true,bubbles:true}));await delay(200);
    assert([...doc.querySelectorAll('.response-entry')].at(-1).textContent.includes('don’t have a loaded forecast'),'Assistant does not invent data during provider failure');
  }finally{win.fetch=originalFetch;}
  doc.querySelector('#retry-weather').click();
  await wait(()=>doc.querySelector('#current-condition').textContent!=='Loading atmospheric data…');
  assert(doc.querySelector('#weather-error').hidden&&doc.querySelectorAll('.hour-item').length>0,'Retry recovers a real forecast after a network error');
  await nav('overview');
}catch(error){assert(false,`Integration runner exception: ${error.message}`);}
finally{for(const[key,value]of Object.entries(storageBefore)){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}}
const state=document.getElementById('test-state');state.textContent=`${passed} passed, ${failed} failed`;state.id='complete';state.className=failed?'fail':'pass';console.info('[TEST SUMMARY]',state.textContent);
