import { hydrateIcons, icon, escapeHTML } from './icons.js';
import { DEFAULT_LOCATION, fetchWeather, validCoordinates, readStorage, writeStorage } from './api.js';
import { searchPlaces } from './geocode.js';
import { createFarmUI } from './farm-ui.js';
import { temp, wind, number, condition, direction, currentHourIndex, localHour, deriveAdvisories, dailySummary } from './weather.js';
import { createWeatherMap } from './map.js';
import { createForecast } from './forecast.js';
import { createAssistant } from './assistant.js';
import { demoScenario } from './demo.js';
import { loadNLPEngine, topicNames } from './nlp.js';
import { parseWeatherQuestion } from './intent.js';

hydrateIcons();
const $=id=>document.getElementById(id);
const storedLocation=readStorage('weathergpt.location',DEFAULT_LOCATION);
const storedPrefs=readStorage('weathergpt.preferences',{});
const rawSaved=readStorage('weathergpt.saved',[]);
const isValidLocation=p=>p&&typeof p.name==='string'&&p.name.length<150&&validCoordinates(p.latitude,p.longitude);
const state={
  location:isValidLocation(storedLocation)?storedLocation:DEFAULT_LOCATION,
  weather:null,
  prefs:{temperature:storedPrefs.temperature==='fahrenheit'?'fahrenheit':'celsius',wind:storedPrefs.wind==='mph'?'mph':'kmh',language:storedPrefs.language==='hi'?'hi':'en'},
  saved:Array.isArray(rawSaved)?rawSaved.filter(isValidLocation).slice(0,30):[],view:'overview',loading:false,epoch:0,farm:null,demo:null
};
const getState=()=>state;
let weatherController,searchController,searchTimer,toastTimer,clockTimer;
let mapView,forecastView,assistantView;
let results=[],currentSearch=0;

function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function renderDemoBanner(){
  const root=$('demo-banner');if(!root)return;
  const scenario=demoScenario(state.demo);
  if(!scenario){root.hidden=true;root.replaceChildren();delete document.body.dataset.demo;return;}
  root.hidden=false;document.body.dataset.demo='true';
  root.innerHTML=`<span class="demo-banner-mark">DEMO / SIMULATED DATA</span><span><strong>${escapeHTML(scenario.label)} scenario · ${escapeHTML(scenario.description)}</strong><small>Only agricultural intelligence and the acidity overlay use simulation. Live weather remains unchanged; nothing simulated is saved.</small></span><button type="button" id="demo-banner-exit" class="text-button">Return to live</button>`;
  $('demo-banner-exit')?.addEventListener('click',()=>{state.demo=null;renderDemoBanner();farmUI?.renderAll();mapView?.refreshAcidity();toast('Demo ended. Live weather and saved records are restored.');});
}
function labelLocation(){return `${state.location.name}${state.location.country&&state.location.country!=='Map coordinates'&&state.location.country!=='Selected map point'&&state.location.country!=='Model sample point'?', '+state.location.country:''}`;}
function isSaved(p=state.location){return state.saved.some(s=>Math.abs(s.latitude-p.latitude)<.005&&Math.abs(s.longitude-p.longitude)<.005);}
function updateSavedButton(){const saved=isSaved();$('save-location').setAttribute('aria-pressed',String(saved));$('save-location').setAttribute('aria-label',saved?'Remove saved location':'Save location');$('save-location').title=saved?'Remove saved location':'Save location';$('save-location').innerHTML=icon(saved?'check':'bookmark');}
function setClock(){
  const timezone=state.weather?.timezone||state.location.timezone||'Asia/Kolkata';
  try{
    $('today-date').textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:timezone});
    $('local-time').textContent=`${new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:timezone})} · ${timezone.replaceAll('_',' ')}`;
  }catch{$('today-date').textContent=new Date().toLocaleDateString('en-US',{month:'long',day:'numeric'});$('local-time').textContent='Times in selected location';}
}
function renderCurrent(){
  const data=state.weather,prefs=state.prefs;
  $('location-name').textContent=labelLocation();updateSavedButton();setClock();
  if(!data){
    $('current-temperature').innerHTML='—<sup>°</sup>';
    $('current-weather-icon').innerHTML=icon('sun-cloud');
    $('current-condition').textContent=state.loading?'Loading atmospheric data…':'Weather unavailable';
    ['feels-like','today-high','today-low','current-wind','current-humidity','current-pressure','current-visibility','current-rain','current-uv','current-sunset'].forEach(id=>$(id).textContent='—');
    $('weather-updated').textContent=state.loading?'Fetching forecast…':'Retry the weather service';
    $('day-summary').textContent=state.loading?'Getting the latest forecast for your location.':'Live conditions could not be loaded. Try again or choose another location.';
    $('connection-status').textContent=state.loading?'Connecting to weather':'Weather unavailable';
    return;
  }
  const c=data.current,h=data.hourly,d=data.daily,i=currentHourIndex(data),weather=condition(c.weather_code,!!c.is_day);
  const temperature=temp(c.temperature_2m,prefs).replace('°','');
  $('current-temperature').innerHTML=`${temperature}<sup>°</sup>`;
  $('current-weather-icon').innerHTML=`${icon(weather.icon)}<span class="hero-emoji" aria-hidden="true">${weather.emoji}</span>`;
  $('current-condition').innerHTML=`<span class="condition-pill"><span class="condition-emoji" aria-hidden="true">${weather.emoji}</span><span>${weather.label}</span></span>`;
  $('feels-like').textContent=temp(c.apparent_temperature,prefs);
  $('today-high').textContent=temp(d.temperature_2m_max[0],prefs);
  $('today-low').textContent=temp(d.temperature_2m_min[0],prefs);
  $('weather-updated').textContent=`Model · ${localHour(c.time)}`;
  $('day-summary').textContent=dailySummary(data,prefs);
  $('current-wind').innerHTML=`${wind(c.wind_speed_10m,prefs,false)} <small>${prefs.wind==='mph'?'mph':'km/h'} ${direction(c.wind_direction_10m)}</small>`;
  $('current-humidity').innerHTML=`${number(c.relative_humidity_2m)}<small> %</small>`;
  $('current-pressure').innerHTML=`${number(c.pressure_msl)} <small>hPa</small>`;
  $('current-visibility').innerHTML=`${h.visibility[i] == null?'—':number(h.visibility[i]/1000,1)} <small>km</small>`;
  $('current-rain').innerHTML=`💧 <b>${number(c.precipitation,1)} mm</b>`;
  $('current-uv').innerHTML=`☀️ <b>${number(h.uv_index[i],1)}</b>`;
  $('current-sunset').innerHTML=`🌇 <b>${localHour(d.sunset[0])}</b>`;
  $('connection-status').textContent='Weather data connected';
  $('connection-status').previousElementSibling.style.background='#4e9d7c';
  document.body.dataset.weather=weather.icon;
}
function renderAdvisories(){
  const list=$('advisories-list');
  if(!state.weather){
    $('outlook-level').textContent='UNKNOWN';$('outlook-summary').textContent='Guidance is unavailable until the forecast is loaded.';
    list.innerHTML=`<div class="empty-state">${icon('cloud-off')}<h3>Forecast guidance unavailable</h3><p>Retry the weather service or search for another location. No loaded data means we cannot assess advisory thresholds.</p></div>`;
    $('advisory-count').hidden=true;return;
  }
  const advisories=deriveAdvisories(state.weather);
  $('advisory-count').textContent=advisories.length;$('advisory-count').hidden=!advisories.length;
  $('outlook-level').textContent=advisories[0]?.severity||'NORMAL';
  $('outlook-level').style.background=advisories.length?'#f5ecdb':'#edf5ee';$('outlook-level').style.color=advisories.length?'#a0854e':'#60956a';
  $('outlook-summary').textContent=advisories.length?`${advisories[0].title}. ${advisories.length>1?`${advisories.length} forecast advisories to keep in mind.`:'A little preparation can make a difference.'}`:'No configured advisory thresholds are triggered. Stay informed as conditions can change.';
  list.innerHTML=advisories.length?advisories.map((a,i)=>`<details class="advisory-item" ${i===0?'open':''}><summary><span class="severity-badge ${a.severity.toLowerCase()}">${a.severity}</span><strong>${escapeHTML(a.title)}</strong>${icon('chevron-down')}</summary><p>${escapeHTML(a.body)}</p><small>${escapeHTML(a.threshold)}</small><small>Source: Open-Meteo forecast · ${escapeHTML(state.location.name)} · Not an official warning.</small></details>`).join(''):`<div class="empty-state">${icon('shield-check')}<h3>No forecast thresholds triggered</h3><p>The available forecast does not cross our configured heat, precipitation, wind, storm, UV, or freezing thresholds. This is not an all-clear from an official warning service.</p></div>`;
}
function renderSaved(){
  updateSavedButton();
  const root=$('saved-locations');
  if(!state.saved.length){root.innerHTML=`<div class="empty-state">${icon('bookmark')}<h3>Your world, a little closer</h3><p>Save your hometown, your next destination, or anywhere that matters. Use the bookmark beside a location to add it here.</p><button class="primary-button" id="empty-save">${icon('plus')}Save ${escapeHTML(state.location.name)}</button></div>`;root.querySelector('button').addEventListener('click',()=>toggleSave(true));return;}
  root.innerHTML=state.saved.map((p,i)=>`<article class="saved-place"><span class="place-icon">${icon('map-pin')}</span><div><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.country||'Map location')} · ${p.latitude.toFixed(2)}°, ${p.longitude.toFixed(2)}°</p></div><button class="text-button" data-open="${i}">View weather ${icon('arrow-right')}</button><button class="icon-button" data-remove="${i}" aria-label="Remove ${escapeHTML(p.name)} from saved locations">${icon('trash')}</button></article>`).join('');
  root.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>{selectLocation(state.saved[Number(b.dataset.open)]);window.location.hash='overview';}));
  root.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{state.saved.splice(Number(b.dataset.remove),1);persistSaved();renderSaved();toast('Location removed from this device.');}));
}
function persistSaved(){if(!writeStorage('weathergpt.saved',state.saved))toast('Browser storage is unavailable. Changes will last only for this session.');}
function toggleSave(onlyAdd=false){
  if(isSaved()){
    if(onlyAdd){toast('This location is already saved.');return;}
    state.saved=state.saved.filter(p=>Math.abs(p.latitude-state.location.latitude)>=.005||Math.abs(p.longitude-state.location.longitude)>=.005);toast('Location removed from saved places.');
  }else{
    if(state.saved.length>=30){toast('You can save up to 30 places. Remove one to add another.');return;}
    state.saved.push({...state.location});toast(`${state.location.name} saved on this device.`);
  }
  persistSaved();renderSaved();
}
async function selectLocation(location,fromMap=false){
  if(!isValidLocation(location)){toast('That location is not valid. Try another search.');return;}
  // Monotonic epoch: only the newest location request may write state.weather.
  const epoch=++state.epoch;
  weatherController?.abort();weatherController=new AbortController();const signal=weatherController.signal;
  state.location={...location};state.weather=null;state.loading=true;
  writeStorage('weathergpt.location',state.location);
  $('weather-error').hidden=true;renderCurrent();renderAdvisories();
  forecastView?.render();$('forecast-empty').textContent='Fetching forecast…';
  assistantView?.updateContext();mapView?.setLocation(state.location,true,fromMap);mapView?.renderPanel();farmUI?.renderAll();
  closeSearch();
  try{
    const data=await fetchWeather(location,signal);if(signal.aborted||epoch!==state.epoch)return;
    state.weather=data;state.loading=false;renderCurrent();renderAdvisories();forecastView?.render();mapView?.renderPanel();mapView?.refreshAcidity();assistantView?.updateContext();farmUI?.renderAll();
    console.info('[WeatherGPT] Live forecast loaded:',location.name,data.timezone);
    document.dispatchEvent(new CustomEvent('weathergpt:weather-loaded',{detail:{location:location.name}}));
    return data;
  }catch(error){
    if(error.name==='AbortError'||epoch!==state.epoch)return;
    state.loading=false;state.weather=null;renderCurrent();renderAdvisories();forecastView?.render();mapView?.renderPanel();mapView?.refreshAcidity();farmUI?.renderAll();
    $('weather-error').hidden=false;$('weather-error').querySelector('span').textContent=error.message;
    $('connection-status').previousElementSibling.style.background='#bca05e';
    $('map-panel-weather').textContent='Weather unavailable';
    console.warn('[WeatherGPT] Weather request unavailable:',error.message);
  }
}
function closeSearch(){$('search-results').hidden=true;$('location-search').setAttribute('aria-expanded','false');}
function showSearchMessage(message){$('search-results').hidden=false;$('location-search').setAttribute('aria-expanded','true');$('search-results').innerHTML=`<p class="search-message">${escapeHTML(message)}</p>`;}
function renderSearchResults(locations,query,intent,warnings=[]){
  let html='';
  const isQuestion=intent&&(intent.topic!=='other'||/\b(how|what|will|can|is|when|kaisa|baarish|rain|weather|temp|forecast|umbrella|छाता|मौसम|बारिश|गर्मी|हवा)\b/i.test(query)||query.includes('?'));
  if(isQuestion){
    const topicLabel=topicNames[intent.topic]||'Forecast query';
    html+=`<button type="button" class="search-nlp-prompt" data-nlp-ask="${escapeHTML(query)}"><span class="search-nlp-icon">${icon('sparkles')}</span><span><strong>Ask WeatherGPT: “${escapeHTML(query)}”</strong><small>Natural Language Query · ${intent.place?.query?`Place: ${escapeHTML(intent.place.query)} · `:''}${escapeHTML(topicLabel)}</small></span><span class="search-nlp-badge">ASK</span></button>`;
  }
  if(warnings.length)html+=`<p class="search-message">${escapeHTML(warnings.join(' '))}</p>`;
  if(locations.length){
    html+=locations.map((p,i)=>`<button data-location="${i}">${icon('map-pin')}<span><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML([p.district||p.region,p.state,p.country].filter(Boolean).join(', '))} · ${Number(p.latitude).toFixed(3)}°, ${Number(p.longitude).toFixed(3)}° · ${escapeHTML(p.type||'place')} · ${escapeHTML(p.sourceLabel||'')}</small>${p.needsConfirm?`<em>${escapeHTML(p.note)}</em>`:''}</span></button>`).join('');
    html+=`<button type="button" class="search-explicit" data-explicit-search="${escapeHTML(query)}">${icon('search')} More village results (exact search, uses OSM Nominatim)</button>`;
  }else if(!isQuestion){
    html=`<p class="search-message">No locations found. Add a district/state, or enter latitude, longitude.</p><button type="button" class="search-explicit" data-explicit-search="${escapeHTML(query)}">Try an exact village search</button>`;
  }
  $('search-results').innerHTML=html;
  $('search-results').querySelectorAll('[data-nlp-ask]').forEach(btn=>btn.addEventListener('click',()=>{
    const q=btn.dataset.nlpAsk;$('location-search').value='';closeSearch();assistantView?.submit(q);
  }));
  $('search-results').querySelectorAll('[data-explicit-search]').forEach(btn=>btn.addEventListener('click',()=>runSearch(btn.dataset.explicitSearch,true)));
  $('search-results').querySelectorAll('[data-location]').forEach(button=>button.addEventListener('click',()=>{
    const place=locations[Number(button.dataset.location)];
    $('location-search').value='';selectLocation(place);$('location-search').focus();
  }));
}
async function runSearch(query,explicit=false){
  clearTimeout(searchTimer);searchController?.abort();
  const trimmed=String(query||'').trim();currentSearch++;
  if(trimmed.length<2){closeSearch();return;}
  showSearchMessage(explicit?'Searching villages with district/state context…':'Finding places…');
  const requestId=currentSearch;
  searchController=new AbortController();
  const intent=parseWeatherQuestion(trimmed,state.prefs.language);
  try{
    const outcome=await searchPlaces(trimmed,{signal:searchController.signal,explicit});
    if(requestId!==currentSearch)return;
    results=outcome.results;
    $('search-results').hidden=false;$('location-search').setAttribute('aria-expanded','true');
    renderSearchResults(results,trimmed,intent,outcome.warnings);
  }catch(error){
    if(error.name!=='AbortError'&&requestId===currentSearch){
      const isQuestion=intent&&(intent.topic!=='other'||trimmed.includes('?'));
      if(isQuestion){$('search-results').hidden=false;$('location-search').setAttribute('aria-expanded','true');renderSearchResults([],trimmed,intent,[error.message||'Place search is unavailable.']);}
      else showSearchMessage(error.message||'Location search is unavailable. Try again.');
    }
  }
}
$('location-search').addEventListener('input',()=>{
  const query=$('location-search').value.trim();currentSearch++;
  if(query.length<2){closeSearch();return;}
  showSearchMessage('Finding places…');
  const requestId=currentSearch;
  clearTimeout(searchTimer);searchController?.abort();
  searchTimer=setTimeout(()=>{if(requestId===currentSearch)runSearch(query,false);},450);
});
$('location-search').addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeSearch();return;}
  if(e.key==='ArrowDown'){e.preventDefault();$('search-results').querySelector('button')?.focus();}
  if(e.key==='Enter'&&!$('search-results').hidden){e.preventDefault();const first=$('search-results').querySelector('[data-location]');if(first)first.click();else runSearch($('location-search').value.trim(),true);}
});
$('search-results').addEventListener('keydown',e=>{
  const buttons=[...$('search-results').querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
  if(e.key==='ArrowDown'){e.preventDefault();buttons[(index+1)%buttons.length]?.focus();}
  if(e.key==='ArrowUp'){e.preventDefault();if(index===0)$('location-search').focus();else buttons[index-1]?.focus();}
  if(e.key==='Escape'){closeSearch();$('location-search').focus();}
});
document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))closeSearch();});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();$('location-search').focus();}if(e.key==='Escape')closeNavigation();});
$('locate-button').addEventListener('click',()=>{
  if(!navigator.geolocation){toast('Geolocation is not supported. Search for a city instead.');return;}
  $('locate-button').disabled=true;toast('Locating you… your browser may ask for permission.');
  navigator.geolocation.getCurrentPosition(position=>{
    $('locate-button').disabled=false;selectLocation({name:'Your location',country:'',latitude:position.coords.latitude,longitude:position.coords.longitude});
  },error=>{$('locate-button').disabled=false;toast(error.code===1?'Location permission was denied. Search for your city instead.':'Your location could not be determined. Try again or search for a city.');},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
});
$('retry-weather').addEventListener('click',()=>selectLocation(state.location));
$('save-location').addEventListener('click',()=>toggleSave());$('save-current-secondary').addEventListener('click',()=>toggleSave(true));
const narrowSidebar=window.matchMedia('(max-width: 700px)');
function syncNavigationAccess(){
  const open=$('sidebar').classList.contains('open');
  $('sidebar').inert=narrowSidebar.matches&&!open;
  document.querySelector('.app-shell').inert=narrowSidebar.matches&&open;
}
function openNavigation(){$('sidebar').classList.add('open');$('nav-scrim').hidden=false;$('menu-button').setAttribute('aria-expanded','true');syncNavigationAccess();$('sidebar').querySelector('a').focus();}
function closeNavigation(){const open=$('sidebar').classList.contains('open');$('sidebar').classList.remove('open');$('nav-scrim').hidden=true;$('menu-button').setAttribute('aria-expanded','false');syncNavigationAccess();if(open&&narrowSidebar.matches)$('menu-button').focus();}
narrowSidebar.addEventListener('change',()=>{closeNavigation();syncNavigationAccess();});
syncNavigationAccess();
document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();$('main-content').focus();$('main-content').scrollIntoView({block:'start'});});
document.querySelectorAll('[data-layer],[data-metric],[data-period]').forEach(button=>button.setAttribute('aria-pressed',String(button.classList.contains('active'))));
$('menu-button').addEventListener('click',()=>{if($('sidebar').classList.contains('open'))closeNavigation();else openNavigation();});$('nav-scrim').addEventListener('click',closeNavigation);
$('sidebar').addEventListener('keydown',e=>{if(e.key==='Tab'&&$('sidebar').classList.contains('open')){const controls=[...$('sidebar').querySelectorAll('a,button')],first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
const routes={overview:['Overview','A clearer view of your day.','Local conditions. Global perspective. A little more certainty.'],map:['Live map','A world of weather, in view.','Explore real geographic data. Follow the conditions around you.'],forecast:['Forecast','Look a little further ahead.','Hourly detail and a seven-day perspective, in one clear forecast.'],alerts:['Weather advisories','Stay informed. Be prepared.','Forecast-based guidance for the weather that deserves your attention.'],assistant:['Weather assistant','A forecast with perspective.','Your local weather, translated into everyday decisions.'],locations:['Saved locations','Every place has a forecast.','Keep the places that matter within easy reach.']};
function route(){
  const hash=window.location.hash.slice(1),view=routes[hash]?hash:'overview';state.view=view;document.body.dataset.view=view;
  $('breadcrumb-current').textContent=routes[view][0];
  const title=routes[view][1];$('page-title').innerHTML=`${escapeHTML(title.slice(0,-1))}<span>.</span>`;$('page-subtitle').textContent=routes[view][2];
  document.title=`${routes[view][0]} · WeatherGPT`;
  document.querySelectorAll('[data-route]').forEach(a=>{a.classList.toggle('active',a.dataset.route===view);if(a.dataset.route===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  $('current-section').hidden=view!=='overview';$('farm-dashboard').hidden=view!=='overview';$('map-section').hidden=!['overview','map'].includes(view);$('insights-column').hidden=view!=='overview';$('forecast-section').hidden=!['overview','forecast'].includes(view);
  ['alerts','assistant','locations'].forEach(v=>$(v+'-view').hidden=v!==view);
  $('forecast-detail-link').hidden=view==='forecast';
  mapView?.setVisible(['overview','map'].includes(view));mapView?.resize();forecastView?.resize();
  if(view!=='assistant')assistantView?.stop();
  if(view==='locations')renderSaved();closeNavigation();window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('hashchange',route);
$('open-assistant').addEventListener('click',()=>{window.location.hash='assistant';setTimeout(()=>$('assistant-query').focus(),100);});
function openDialog(id){$(id).showModal();}
$('settings-button').addEventListener('click',()=>openDialog('settings-dialog'));$('profile-button').addEventListener('click',()=>openDialog('settings-dialog'));
['sources-button','footer-sources'].forEach(id=>$(id).addEventListener('click',()=>openDialog('sources-dialog')));
['settings-dialog','sources-dialog'].forEach(id=>$(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();}}));
$('temperature-unit').value=state.prefs.temperature;$('wind-unit').value=state.prefs.wind;
$('temperature-unit').addEventListener('change',e=>{state.prefs.temperature=e.target.value;updatePreferences();});
$('wind-unit').addEventListener('change',e=>{state.prefs.wind=e.target.value;updatePreferences();});
function updatePreferences(){writeStorage('weathergpt.preferences',state.prefs);renderCurrent();forecastView?.render();mapView?.refreshUnits();farmUI?.renderAll();toast('Preferences updated. New assistant answers will use these units.');}

let farmUI;
forecastView=createForecast(getState);
mapView=createWeatherMap({getState,onSelect:selectLocation,toast,onSaveFarm:point=>farmUI?.setPoint(point)});
assistantView=createAssistant({getState,selectLocation,switchLayer:layer=>mapView.switchLayer(layer),setLanguage:language=>{state.prefs.language=language==='hi'?'hi':'en';writeStorage('weathergpt.preferences',state.prefs);farmUI?.renderAll();},toast});
farmUI=createFarmUI({getState,selectLocation,toast,
  onFarmChange:farm=>{state.farm=farm;mapView?.refreshAcidity();},
  onDemoChange:key=>{state.demo=key;renderDemoBanner();mapView?.refreshAcidity();farmUI?.renderAll();if(key==='acid-rain')mapView?.switchLayer('acidity');}
});
document.addEventListener('weathergpt:acidity-updated',()=>mapView?.refreshAcidity());
document.addEventListener('weathergpt:show-acidity',()=>mapView?.switchLayer('acidity'));
$('overview-nlp-form')?.addEventListener('submit',e=>{
  e.preventDefault();
  const input=$('overview-nlp-input');
  const val=input?.value.trim();
  if(!val)return;
  input.value='';
  assistantView?.submit(val);
});
loadNLPEngine().catch(()=>{});
renderSaved();farmUI?.renderAll();renderDemoBanner();route();selectLocation(state.location);
clockTimer=setInterval(setClock,60000);
window.addEventListener('online',()=>toast('You’re back online. Retry any unavailable weather data.'));
window.addEventListener('offline',()=>toast('You’re offline. Already loaded forecasts remain visible; new data is unavailable.'));
// Forecasts are refreshed on return to the tab after ten minutes, never in the background.
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!state.loading&&state.weather&&Date.now()-state.weather.fetchedAt>600000)selectLocation(state.location);});
console.info('[WeatherGPT] Workspace initialized. Public providers; no private keys or simulated weather.');
