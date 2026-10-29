import { fetchSamples, fetchRadar } from './api.js';
import { icon, escapeHTML } from './icons.js';
import { temp, wind, number, direction, present, condition, currentHourIndex, localHour, deriveAdvisories } from './weather.js';
import { classifyPH, loadReadings } from './acidity.js';
import { makeDemoState } from './demo.js';
import { fetchAirQuality, selectAirQualityFrame, POLLUTANTS, AIR_QUALITY_VARIABLES, validAirCoordinates } from './air-quality.js';

export function createWeatherMap({ getState, onSelect, toast, onSaveFarm = () => {}, onEnvironmentChange = () => {} }) {
  const $ = id => document.getElementById(id);
  let map, selectedMarker, samplesGroup, acidityGroup, airQualityGroup, sampleData = [], sampleController, sampleTimer;
  let airController, airRequest = 0, airData = null, airStatus = 'idle', airError = '', airRetryAfter = 0;
  let activeAirPollutant = 'sulphur_dioxide';
  let pinMarker = null, pinPoint = null;
  let activeLayer = 'temperature', radarData, radarIndex = 0, playing = false, playTimer, speed = 1, radarLayer, visible = true;
  let radarRequest = 0, radarTileFailed = false, pendingCenter = null;
  const radarLayers = new Map();
  const status = (message, retry) => {
    $('map-status').hidden = !message;
    $('map-status').textContent = message || '';
    if (retry) { const button = document.createElement('button'); button.textContent = 'Retry'; button.addEventListener('click',retry); $('map-status').append(button); }
  };
  if (!window.L) {
    status('The map library could not load. Check your connection and reload the page. Forecasts are still available.');
    return { setLocation:()=>{}, renderPanel:()=>{}, resize:()=>{}, setVisible:()=>{}, refreshUnits:()=>{}, refreshAcidity:()=>{}, refreshEnvironmentUI:()=>{}, switchLayer:()=>{} };
  }
  const { location } = getState();
  map = L.map('weather-map',{zoomControl:false, minZoom:2,maxZoom:12,zoomSnap:.25,worldCopyJump:true,preferCanvas:true,scrollWheelZoom:false}).setView([location.latitude-3,location.longitude+1],4.5);
  L.control.zoom({position:'topright'}).addTo(map);
  const base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>', maxZoom:19, className:'geography-tiles'
  }).addTo(map);
  let baseErrors=0;
  base.on('tileerror',()=>{ if(++baseErrors===5) status('Some map tiles could not load. Check your connection; weather values remain available.'); });
  samplesGroup = L.layerGroup().addTo(map);
  acidityGroup = L.layerGroup();
  airQualityGroup = L.layerGroup();
  // Clicking drops a DRAGGABLE preview pin with an explicit confirm step.
  // Nothing is selected until the user confirms, so an accidental tap cannot
  // silently change the active farm location.
  map.on('click',e=>{
    const longitude = ((e.latlng.lng+180)%360+360)%360-180;
    const latitude = e.latlng.lat;
    pinPoint = {
      name: `${Math.abs(latitude).toFixed(2)}° ${latitude>=0?'N':'S'}, ${Math.abs(longitude).toFixed(2)}° ${longitude>=0?'E':'W'}`,
      country: 'Selected map point', latitude, longitude
    };
    pinMarker?.remove();
    pinMarker = L.marker([latitude,longitude],{draggable:true,autoPan:true,keyboard:true,
      icon:L.divIcon({className:'selected-location-marker',html:'<div class="selected-map-pin"></div>',iconSize:[15,15],iconAnchor:[7.5,7.5]}),zIndexOffset:1500}).addTo(map);
    pinMarker.on('dragend',()=>{
      const p=pinMarker.getLatLng();
      const lng=((p.lng+180)%360+360)%360-180;
      pinPoint={name:`${Math.abs(p.lat).toFixed(2)}° ${p.lat>=0?'N':'S'}, ${Math.abs(lng).toFixed(2)}° ${lng>=0?'E':'W'}`,country:'Selected map point',latitude:p.lat,longitude:lng};
      showPinConfirm();
    });
    showPinConfirm();
  });
  function showPinConfirm(){
    const panel=$('map-pin-confirm');if(!panel||!pinPoint)return;
    $('map-pin-coords').textContent=`${Number(pinPoint.latitude).toFixed(4)}, ${Number(pinPoint.longitude).toFixed(4)} — ${pinPoint.name}`;
    panel.hidden=false;
    $('map-pin-use').focus();
  }
  function clearPin(){
    const panel=$('map-pin-confirm');if(panel)panel.hidden=true;
    pinMarker?.remove();pinMarker=null;pinPoint=null;
  }
  $('map-pin-use')?.addEventListener('click',()=>{if(pinPoint)onSelect({...pinPoint},true);clearPin();});
  $('map-pin-farm')?.addEventListener('click',()=>{if(pinPoint)onSaveFarm({...pinPoint});clearPin();window.location.hash='locations';});
  $('map-pin-cancel')?.addEventListener('click',clearPin);
  map.on('moveend',()=> { clearTimeout(sampleTimer); if(!['radar','acidity','atmosphere'].includes(activeLayer) && visible) sampleTimer=setTimeout(loadSamples,1000); });
  // Wheel zoom is enabled only after focus to avoid hijacking page scrolling.
  $('weather-map').addEventListener('focusin',()=>map.scrollWheelZoom.enable());
  $('weather-map').addEventListener('focusout',()=>map.scrollWheelZoom.disable());
  document.querySelectorAll('[data-layer]').forEach(button=>button.addEventListener('click',()=>switchLayer(button.dataset.layer)));
  $('more-layers').addEventListener('change',e=>{if(e.target.value) switchLayer(e.target.value);});
  $('environment-pollutant').addEventListener('change',e=>{
    if(!Object.hasOwn(POLLUTANTS,e.target.value))return;
    activeAirPollutant=e.target.value;renderAirMarker();updateLegend();renderEnvironmentPanel();
  });
  $('environment-refresh').addEventListener('click',()=>loadAtmosphere(true));
  $('environment-close').addEventListener('click',()=>{$('environment-panel').hidden=true;});
  $('environment-content').addEventListener('click',e=>{
    if(e.target.closest('[data-record-ph]'))document.dispatchEvent(new CustomEvent('weathergpt:record-ph'));
    if(e.target.closest('[data-open-atmosphere]'))switchLayer('atmosphere');
    if(e.target.closest('[data-retry-atmosphere]'))loadAtmosphere(true);
  });
  $('map-recenter').addEventListener('click',()=>{ const p=getState().location; map.flyTo([p.latitude,p.longitude],5,{animate:!reduceMotion(),duration:.7}); });
  $('expand-map').addEventListener('click',()=>{
    const expanded = $('map-section').classList.toggle('expanded');
    $('expand-map').setAttribute('aria-label',expanded?'Restore weather map':'Expand weather map');
    $('expand-map').innerHTML=icon(expanded?'x':'expand');
    map.scrollWheelZoom[expanded?'enable':'disable']();
    setTimeout(()=>{if(visible)map.invalidateSize();},100);
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && $('map-section').classList.contains('expanded')) $('expand-map').click();});
  $('close-map-panel').addEventListener('click',()=>{$('map-location-panel').hidden=true;});
  $('map-panel-ask').addEventListener('click',()=>{locationHashAssistant();});
  $('radar-play').addEventListener('click',()=>{if(activeLayer!=='radar'){switchLayer('radar');return;}togglePlay();});
  $('radar-prev').addEventListener('click',()=>{stop();showFrame(radarIndex-1);});
  $('radar-next').addEventListener('click',()=>{stop();showFrame(radarIndex+1);});
  $('radar-timeline').addEventListener('input',e=>{stop();showFrame(Number(e.target.value));});
  $('radar-speed').addEventListener('click',()=>{speed = speed===1?2:speed===2?.5:1;$('radar-speed').textContent=`${speed}×`;if(playing){stop();togglePlay();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden) stop();});
  setLocation(location,false);
  updateLegend(); updateTimeline();
  // Initial samples are scheduled by setVisible after the router establishes the viewport.

  function reduceMotion(){return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
  function locationHashAssistant(){window.location.hash='assistant';setTimeout(()=>$('assistant-query').focus(),100);}
  function setLocation(p, fly = true, openPanel = false) {
    selectedMarker?.remove();
    selectedMarker=L.marker([p.latitude,p.longitude],{icon:L.divIcon({className:'selected-location-marker',html:'<div class="selected-map-pin"></div>',iconSize:[15,15],iconAnchor:[7.5,7.5]}),zIndexOffset:1000}).addTo(map);
    if(activeLayer==='acidity'||activeLayer==='atmosphere')selectedMarker.remove();
    selectedMarker.bindTooltip(escapeHTML(p.name),{permanent:true,direction:'right',offset:[10,0],className:'selected-map-tooltip'});
    selectedMarker.on('click',()=>{renderPanel();$('map-location-panel').hidden=false;});
    if(fly){
      map.stop();
      const zoom=Math.max(4.5,Math.min(map.getZoom(),7));
      if(visible && $('weather-map').clientWidth && $('weather-map').clientHeight){
        pendingCenter=null;
        map.flyTo([p.latitude,p.longitude],zoom,{animate:!reduceMotion(),duration:.8});
      }else pendingCenter={lat:p.latitude,lng:p.longitude,zoom};
    }
    if(openPanel){$('map-location-panel').hidden=false;renderPanel();}
    else if(!$('map-location-panel').hidden)renderPanel();
    if(activeLayer==='acidity')renderAcidityMarkers();
    if(activeLayer==='atmosphere'&&visible)loadAtmosphere();
  }
  function renderPanel(){
    const {location,weather,prefs,loading}=getState();
    $('map-panel-name').textContent=location.name;
    $('map-panel-weather').textContent=weather?`${temp(weather.current.temperature_2m,prefs,true)} · ${condition(weather.current.weather_code,!!weather.current.is_day).label}`:loading?'Fetching conditions…':'Weather unavailable';
    $('map-panel-metrics').textContent=weather?`Wind ${wind(weather.current.wind_speed_10m,prefs)} ${direction(weather.current.wind_direction_10m)} · Humidity ${number(weather.current.relative_humidity_2m)}%`:loading?'Updating this location’s weather.':'Retry the weather service or choose another location.';
    $('map-panel-forecast').replaceChildren();
    $('map-panel-advisories').hidden=!weather;
    if(weather){
      const h=weather.hourly,start=currentHourIndex(weather);
      $('map-panel-forecast').innerHTML=[1,2,3].filter(offset=>start+offset<h.time.length).map(offset=>{const i=start+offset;return `<div><small>${escapeHTML(localHour(h.time[i],true))}</small>${icon(condition(h.weather_code[i]).icon)}<strong>${temp(h.temperature_2m[i],prefs)}</strong><small>${number(h.precipitation_probability[i])}% rain</small></div>`;}).join('');
      const count=deriveAdvisories(weather).length;
      $('map-panel-advisories').textContent=count?`${count} forecast ${count===1?'advisory':'advisories'} · View guidance →`:'View forecast guidance →';
    }
  }
  function samplePoints(){
    const b=map.getBounds(), points=[];
    const south=Math.max(-70,b.getSouth()),north=Math.min(75,b.getNorth());
    const west=b.getWest(),east=b.getEast();
    const rows=3,cols=4;
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      const lat=south+(north-south)*(.22+r*.29);
      const raw=west+(east-west)*(.14+c*.235);
      const lng=((raw+180)%360+360)%360-180;
      points.push({lat,lng});
    }
    return points;
  }
  async function loadSamples(){
    if(['radar','acidity','atmosphere'].includes(activeLayer)||!visible)return;
    sampleController?.abort(); sampleController=new AbortController();
    const signal=sampleController.signal;
    $('map-data-label').textContent='Updating geographic model samples…';
    try{
      const results=await fetchSamples(samplePoints(),signal);
      if(signal.aborted||activeLayer==='radar')return;
      sampleData=results;
      status(''); renderSamples();
    }catch(error){
      if(error.name==='AbortError')return;
      // Never leave values from a previous region presented as a new region.
      samplesGroup.clearLayers(); sampleData=[];
      $('map-data-label').textContent='Model samples unavailable';
      status('The geographic weather samples are unavailable. Your selected-location forecast is separate.',loadSamples);
    }
  }
  function sampleValue(p){
    const c=p.current;
    return activeLayer==='temperature'?c.temperature_2m:activeLayer==='wind'?c.wind_speed_10m:activeLayer==='clouds'?c.cloud_cover:activeLayer==='humidity'?c.relative_humidity_2m:c.pressure_msl;
  }
  function sampleColor(value){
    const scales={temperature:[[0,15,30,45],['#76a8c1','#a7c9a3','#e7d081','#d98e6d']],wind:[[0,25,60],['#dce8dc','#adcbb9','#6a9e90']],clouds:[[0,50,100],['#f2f4ef','#b9c8cd','#859eac']],humidity:[[0,50,100],['#eee7cf','#c1d7cc','#81aeb6']],pressure:[[980,1013,1040],['#c6b4ce','#e3dddc','#a1b9cb']]};
    const [stops,colors]=scales[activeLayer];
    if(value<=stops[0])return colors[0];
    if(value>=stops.at(-1))return colors.at(-1);
    const upper=stops.findIndex(v=>v>=value),lower=upper-1;
    const fraction=(value-stops[lower])/(stops[upper]-stops[lower]);
    const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    const a=rgb(colors[lower]),b=rgb(colors[upper]);
    return '#'+a.map((n,i)=>Math.round(n+(b[i]-n)*fraction).toString(16).padStart(2,'0')).join('');
  }
  function renderSamples(){
    if(['radar','acidity','atmosphere'].includes(activeLayer))return;
    samplesGroup.clearLayers();
    if(!map.hasLayer(samplesGroup))samplesGroup.addTo(map);
    const prefs=getState().prefs;
    sampleData.forEach(p=>{
      const val=sampleValue(p); if(!present(val))return;
      const color=sampleColor(val);
      L.circleMarker([p.lat,p.lng],{radius:activeLayer==='temperature'?34:29,fillColor:color,fillOpacity:.26,stroke:false,interactive:false}).addTo(samplesGroup);
      const label=activeLayer==='temperature'?temp(val,prefs):activeLayer==='wind'?`${wind(val,prefs,false)}`:activeLayer==='pressure'?number(val):`${number(val)}%`;
      const arrow=activeLayer==='wind'?`<span class="wind-arrow" style="transform:rotate(${Number(p.current.wind_direction_10m)+180}deg)">↑</span>`:'';
      const marker=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'sample-marker',html:`<span class="sample-label" style="background:${color}55;border-color:${color}88">${arrow}${label}</span>`,iconSize:[45,27],iconAnchor:[22.5,13.5]}),keyboard:true,title:`${activeLayer}: ${label}. Select this geographic point.`}).addTo(samplesGroup);
      marker.on('click',()=>onSelect({name:`${Math.abs(p.lat).toFixed(2)}° ${p.lat>=0?'N':'S'}, ${Math.abs(p.lng).toFixed(2)}° ${p.lng>=0?'E':'W'}`,country:'Model sample point',latitude:p.lat,longitude:p.lng},true));
    });
    const time=sampleData[0]?.current?.time;
    $('map-data-label').textContent=`${layerTitle()} · ${sampleData.length} model samples${time?' · '+time.slice(11,16)+' UTC':''}`;
  }
  function environmentLanguage(){return getState().prefs?.language==='hi'?'hi':'en';}
  function envText(en,hi){return environmentLanguage()==='hi'?hi:en;}
  function airErrorText(error){
    if(environmentLanguage()!=='hi')return error?.message||'Atmospheric data is unavailable.';
    if(error?.status===429)return 'वायु-गुणवत्ता सेवा व्यस्त है। कृपया कुछ देर बाद फिर प्रयास करें।';
    if(error?.status===408)return 'वायुमंडलीय डेटा लोड होने में बहुत समय लगा। कनेक्शन उपलब्ध होने पर फिर प्रयास करें।';
    if(error?.status===400)return 'प्रदाता इस स्थान या अनुरोध के लिए डेटा उपलब्ध नहीं कराता।';
    return 'वायुमंडलीय डेटा अभी उपलब्ध नहीं है। कनेक्शन जाँचें और बाद में फिर प्रयास करें।';
  }
  function environmentFrame(){return airData?selectAirQualityFrame(airData,getState().weather?.current?.time||''):null;}
  function rainfallContext(){
    const weather=getState().weather;if(!weather)return null;
    const current=weather.current||{},daily=weather.daily||{};
    const currentMm=present(current.precipitation)?Number(current.precipitation):null;
    const sum=present(daily.precipitation_sum?.[0])?Number(daily.precipitation_sum[0]):null;
    const probability=present(daily.precipitation_probability_max?.[0])?Number(daily.precipitation_probability_max[0]):null;
    return {currentMm, currentTime:current.time||'', forecastMm:sum, probability, date:daily.time?.[0]||'', source:'Open-Meteo weather model'};
  }
  function setAirState(statusValue,error=''){
    airStatus=statusValue;airError=error;
    onEnvironmentChange({status:airStatus,data:airData,error:airError,requested:airData?.requested||getState().location||null});
  }
  function renderAirMarker(){
    if(!airQualityGroup)return;
    airQualityGroup.clearLayers();
    if(activeLayer!=='atmosphere'||!airData)return;
    if(!map.hasLayer(airQualityGroup))airQualityGroup.addTo(map);
    const frame=environmentFrame(),key=activeAirPollutant,value=frame?.values?.[key];
    if(!frame||!present(value))return;
    const info=POLLUTANTS[key],unit=airData.units[key]||envText('unit unavailable','इकाई उपलब्ध नहीं');
    const hi=environmentLanguage()==='hi';
    const requested=airData.requested||{},grid=airData.modelGrid||{};
    if(!validAirCoordinates(grid.latitude,grid.longitude))return;
    const lat=grid.latitude,lng=grid.longitude;
    const marker=L.circleMarker([lat,lng],{radius:10,color:info.color,weight:2,fillColor:info.color,fillOpacity:.88,keyboard:true}).addTo(airQualityGroup);
    marker.bindTooltip(`${info.short} ${Number(value).toFixed(1)} ${unit}`,{direction:'top',offset:[0,-7]});
    marker.bindPopup(`<article class="env-marker-popup"><span>${hi?'मॉडल/पूर्वानुमान ग्रिड मान':'MODELED / FORECAST GRID VALUE'}</span><h3>${escapeHTML(requested.name||getState().location.name)}</h3><b>${escapeHTML(info[hi?'hi':'en'])}: ${Number(value).toFixed(1)} ${escapeHTML(unit)}</b><p>${hi?'समय':'Timestamp'}: ${escapeHTML(frame.time)} ${escapeHTML(airData.timezoneAbbreviation||airData.timezone||'provider local time')}</p><small>${hi?'मॉडल ग्रिड केंद्र':'Model grid centre'}: ${Number.isFinite(grid.latitude)&&Number.isFinite(grid.longitude)?`${grid.latitude.toFixed(3)}, ${grid.longitude.toFixed(3)}`:envText('not supplied','उपलब्ध नहीं')}. ${hi?'यह मॉडल अनुमान है, सेंसर माप नहीं। वायुमंडलीय सांद्रताएँ वर्षा-जल pH नहीं मापतीं।':'This point is a model estimate, not a sensor station. Atmospheric concentrations do not measure rainwater pH.'}</small></article>`,{maxWidth:300});
  }
  function renderEnvironmentPanel(){
    const panel=$('environment-panel'),content=$('environment-content');
    const open=['atmosphere','acidity'].includes(activeLayer);
    panel.hidden=!open;
    if(!open)return;
    const hi=environmentLanguage()==='hi';
    $('environment-kicker').textContent=hi?'पर्यावरणीय जानकारी':'ENVIRONMENTAL INFORMATION';
    $('environment-title').textContent=activeLayer==='atmosphere'?(hi?'वायुमंडलीय निगरानी':'Atmospheric Monitoring'):(hi?'वर्षा-जल pH माप':'Rainwater pH Measurements');
    $('environment-refresh').hidden=activeLayer!=='atmosphere';
    $('environment-refresh').textContent=hi?'ताज़ा करें':'Refresh';
    $('environment-refresh').disabled=activeLayer==='atmosphere'&&(airStatus==='loading'||Date.now()<airRetryAfter);
    if(activeLayer==='acidity'){
      const records=(getState().acidityReadings||loadReadings()).filter(r=>r.recordType!=='simulated'&&validAirCoordinates(r.latitude,r.longitude));
      const demo=getState().demo==='acid-rain';
      const available=!!airData;
      $('map-data-label').textContent=records.length?`${records.length} ${hi?'भू-स्थानित उपयोगकर्ता pH माप':'geolocated user pH measurement'}${records.length===1?'':'s'}`:(hi?'इस दृश्य में मापा pH रिकॉर्ड नहीं':'No measured pH records in view');
      if(records.length){
        content.innerHTML=`<div class="env-empty"><p>${hi?'मानचित्र पर बिंदु केवल उपयोगकर्ता द्वारा दर्ज pH माप हैं।':'Map points are user-recorded rainwater pH measurements only.'}</p>${demo?`<p class="env-demo-note">${hi?'बैंगनी डेमो बिंदु काल्पनिक है, मापा हुआ नहीं।':'Purple demo point is simulated, not measured.'}</p>`:''}<button type="button" class="text-button" data-record-ph>${hi?'माप दर्ज करें':'Record a pH measurement'}</button></div>`;
      }else{
        content.innerHTML=`<div class="env-empty"><p>${hi?'इस क्षेत्र के लिए मापा वर्षा-जल pH रिकॉर्ड नहीं हैं।':'No measured rainwater pH records for this area.'}</p>${available?`<p>${hi?'वायुमंडलीय डेटा अलग परत में उपलब्ध है; वह pH नहीं मापता।':'Atmospheric data is available separately; it does not measure acidity.'}</p>`:`<p>${hi?'वायुमंडलीय निगरानी अलग परत है।':'Atmospheric monitoring is a separate layer.'}</p>`}${demo?`<p class="env-demo-note">${hi?'डेमो बिंदु काल्पनिक है और इतिहास में नहीं सहेजा जाता।':'The demo point is simulated and is not saved to history.'}</p>`:''}<div class="env-actions"><button type="button" class="text-button" data-record-ph>${hi?'वर्षा-जल pH दर्ज करें':'Record rainwater pH'}</button><button type="button" class="text-button" data-open-atmosphere>${hi?'वायुमंडलीय निगरानी खोलें':'Open Atmospheric Monitoring'}</button></div></div>`;
      }
      return;
    }
    const state=getState(),location=state.location||{}, frame=environmentFrame();
    $('map-data-label').textContent=airStatus==='loading'?(hi?'वायु-गुणवत्ता मॉडल लोड हो रहा है…':'Loading air-quality model…'):airStatus==='ready'&&frame?`${hi?'वायुमंडलीय मॉडल':'Atmospheric model'} · ${frame.time}`:airStatus==='error'?(hi?'वायुमंडलीय डेटा अनुपलब्ध':'Atmospheric data unavailable'):(hi?'चयनित स्थान':'Selected location');
    if(airStatus==='loading'){
      content.innerHTML=`<div class="env-loading" role="status"><span class="env-spinner" aria-hidden="true"></span><span>${hi?'चयनित स्थान के लिए वायु-गुणवत्ता मॉडल डेटा ला रहे हैं…':'Fetching modeled air-quality data for the selected location…'}</span></div>`;
      return;
    }
    if(airStatus==='error'||!airData||!frame){
      const message=airError|| (hi?'वायुमंडलीय डेटा उपलब्ध नहीं है।':'Atmospheric data is unavailable.');
      content.innerHTML=`<div class="env-empty"><p>${escapeHTML(message)}</p><small>${hi?'मानचित्र और pH मापन परत उपलब्ध रहती हैं।':'The map and measured-pH layer remain available.'}</small><button type="button" class="text-button" data-retry-atmosphere ${Date.now()<airRetryAfter?'disabled':''}>${hi?'फिर प्रयास करें':'Retry atmospheric data'}</button></div>`;
      return;
    }
    const selected=POLLUTANTS[activeAirPollutant], unitFor=k=>airData.units[k]||envText('unit unavailable','इकाई उपलब्ध नहीं');
    const display=(key)=>present(frame.values[key])?`${Number(frame.values[key]).toFixed(1)} ${escapeHTML(unitFor(key)||'')}`:envText('Unavailable','उपलब्ध नहीं');
    const pollutantCards=Object.entries(POLLUTANTS).map(([key,p])=>`<div class="env-pollutant ${key===activeAirPollutant?'selected':''}"><span class="env-pollutant-dot" style="--pollutant:${p.color}"></span><span>${escapeHTML(p[hi?'hi':'en'])}</span><strong>${display(key)}</strong></div>`).join('');
    const noPollutantData=AIR_QUALITY_VARIABLES.every(key=>!present(frame.values[key]));
    const noDataNote=noPollutantData?`<p class="env-no-data" role="status">${hi?'इस मॉडल समय-बिंदु के लिए कोई प्रदूषक मान उपलब्ध नहीं हैं।':'No pollutant values are available for this model time frame.'}</p>`:'';
    const rain=rainfallContext();
    const rainfall=rain?`<div class="env-rain"><b>${hi?'वर्षा संदर्भ':'Rainfall context'}</b><span>${hi?'मॉडल वर्तमान अनुमान':'Current model estimate'}: ${rain.currentMm===null?envText('Unavailable','उपलब्ध नहीं'):`${rain.currentMm.toFixed(1)} mm`}</span><span>${hi?'आज का पूर्वानुमान':'Today forecast'}: ${rain.forecastMm===null?envText('Unavailable','उपलब्ध नहीं'):`${rain.forecastMm.toFixed(1)} mm`}${rain.probability===null?'':` · ${rain.probability}% ${hi?'संभावना':'probability'}`}</span><small>${hi?'पूर्वानुमान/मॉडल संदर्भ; वर्षा-जल रसायन का माप नहीं।':'Weather-model context; not a rainwater chemistry measurement.'}</small></div>`:`<div class="env-rain"><b>${hi?'वर्षा संदर्भ':'Rainfall context'}</b><span>${envText('Unavailable','उपलब्ध नहीं')}</span></div>`;
    const modelCenter=validAirCoordinates(airData.modelGrid.latitude,airData.modelGrid.longitude)?`${airData.modelGrid.latitude.toFixed(3)}, ${airData.modelGrid.longitude.toFixed(3)}`:envText('not supplied','उपलब्ध नहीं');
    content.innerHTML=`<div class="env-location"><b>${escapeHTML(location.name||airData.requested.name||envText('Selected location','चयनित स्थान'))}</b><small>${hi?'चयनित निर्देशांक':'Selected coordinates'}: ${Number(location.latitude).toFixed(3)}, ${Number(location.longitude).toFixed(3)}</small><small>${hi?'मॉडल ग्रिड केंद्र':'Model grid centre'}: ${modelCenter}</small></div><div class="env-selected" style="--pollutant:${selected.color}"><span>${escapeHTML(selected[hi?'hi':'en'])}</span><strong>${display(activeAirPollutant)}</strong><small>${hi?'मॉडल/पूर्वानुमान मान':'Modeled / forecast value'} · ${escapeHTML(frame.time)} ${escapeHTML(airData.timezoneAbbreviation||airData.timezone||'')}</small></div>${noDataNote}<div class="env-pollutant-list">${pollutantCards}</div>${rainfall}<div class="env-provenance"><b>${hi?'स्रोत':'Source'}:</b> <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener noreferrer">Open-Meteo Air Quality API</a><small>${hi?'वायुमंडलीय प्रदूषक सांद्रता अम्लीय निक्षेपण से संबंधित परिस्थितियों का संदर्भ दे सकती है, लेकिन वे वर्षा-जल pH को सीधे नहीं मापतीं। CAMS-आधारित मॉडल ग्रिड यूरोप में लगभग 11 km और वैश्विक स्तर पर लगभग 45 km हैं; प्रदाता हर प्रतिक्रिया में प्रयुक्त मॉडल की पहचान नहीं बताता।':'Atmospheric pollutant concentrations can help assess conditions relevant to acid deposition, but they do not directly measure rainwater pH. CAMS-backed grids are about 11 km in Europe and 45 km globally; the provider does not identify the contributing model in each response.'}</small></div>`;
    renderAirMarker();
  }
  async function loadAtmosphere(force=false){
    if(activeLayer!=='atmosphere'||!visible)return;
    if(Date.now()<airRetryAfter){setAirState('error',envText('The air-quality service is busy. Please wait briefly, then retry.','वायु-गुणवत्ता सेवा व्यस्त है। कृपया कुछ देर बाद फिर प्रयास करें।'));renderEnvironmentPanel();return;}
    const location=getState().location||{};
    if(!validAirCoordinates(location.latitude,location.longitude)){
      airData=null;setAirState('error',envText('Invalid selected coordinates.','चयनित निर्देशांक अमान्य हैं।'));renderEnvironmentPanel();updateLegend();return;
    }
    airController?.abort();
    const controller=new AbortController(),signal=controller.signal,id=++airRequest;
    airController=controller;airData=null;setAirState('loading');renderEnvironmentPanel();updateLegend();
    try{
      const data=await fetchAirQuality(location,{signal,force});
      if(signal.aborted||id!==airRequest||activeLayer!=='atmosphere')return;
      airData=data;setAirState('ready');renderEnvironmentPanel();renderAirMarker();updateLegend();
    }catch(error){
      if(error?.name==='AbortError'||signal.aborted||id!==airRequest)return;
      airData=null;
      if(error?.status===429)airRetryAfter=Date.now()+(error.retryAfterMs||60000);
      setAirState('error',airErrorText(error));
      renderEnvironmentPanel();updateLegend();
      if(error?.status===429){const delay=Math.max(1000,airRetryAfter-Date.now());setTimeout(()=>{if(activeLayer==='atmosphere')renderEnvironmentPanel();},delay);}
    }
  }
  function renderAcidityMarkers(){

    if(!acidityGroup)return;
    acidityGroup.clearLayers();
    if(!map.hasLayer(acidityGroup))acidityGroup.addTo(map);
    const state=getState(), records=state.acidityReadings||loadReadings();
    const valid=records.filter(r=>r.recordType!=='simulated'&&validAirCoordinates(r.latitude,r.longitude));
    const demo=state.demo?makeDemoState(state.demo,state):null;
    const rows=[...valid.slice(-100),...(demo?.pHReading?[demo.pHReading]:[])];
    rows.forEach(r=>{
      const pH=Number(r.value),c=classifyPH(pH),simulated=r.recordType==='simulated';
      const marker=L.circleMarker([Number(r.latitude),Number(r.longitude)],{
        radius:simulated?10:8,color:simulated?'#7157b8':c.color,weight:simulated?3:2,
        fillColor:c.color,fillOpacity:.88,dashArray:simulated?'4 3':null,keyboard:true
      }).addTo(acidityGroup);
      const stateLocation=state.location||{}, hi=state.prefs?.language==='hi';
      const colocated=Math.abs(Number(stateLocation.latitude)-Number(r.latitude))<0.001&&Math.abs(Number(stateLocation.longitude)-Number(r.longitude))<0.001&&state.weather;
      const current=colocated?`<p><b>${hi?'चयनित स्थान का मॉडल संदर्भ':'Selected-location model context'}</b><br>${hi?'तापमान':'Temperature'} ${escapeHTML(temp(state.weather.current.temperature_2m,state.prefs))}; ${hi?'आर्द्रता':'humidity'} ${escapeHTML(number(state.weather.current.relative_humidity_2m))}%. ${hi?'यह pH माप का हिस्सा नहीं, बल्कि पूर्वानुमान/मॉडल अनुमान है।':'This is a forecast/model estimate, not part of the pH measurement.'}</p>`:'';
      const method=escapeHTML(r.method||(hi?'उल्लेख नहीं':'not stated')),source=escapeHTML(r.source||(hi?'उपयोगकर्ता द्वारा दर्ज':'User-recorded'));
      const classLabel=hi?({'near-natural':'pH 5.6 से अधिक','slightly-acidic':'pH 5.0–5.6','low-ph':'pH 4.0–4.9','very-low-ph':'pH 4.0 से कम'}[c.band]||'उपलब्ध नहीं'):c.label;
      const concern=hi?({'near-natural':'सामान्य वर्षा संदर्भ से ऊपर; फसल-सुरक्षा का निर्णय नहीं।','slightly-acidic':'हल्की अम्लीय वर्षा सीमा; प्रवृत्ति और विधि महत्वपूर्ण हैं।','low-ph':'कम pH माप; विधि की पुष्टि करें और दोहराए गए माप देखें।','very-low-ph':'बहुत कम pH माप; कैलिब्रेटेड उपकरण या प्रयोगशाला से पुष्टि करें।'}[c.band]||'कोई मान्य माप नहीं।'):c.note;
      const precaution=pH<5
        ? (hi?'मापन विधि जाँचें और स्वतंत्र रूप से दोहराएँ। फसल की चिंता बनी रहे तो मिट्टी का अलग परीक्षण कराएँ; केवल वर्षा-जल pH के आधार पर संशोधन न करें।':'Check the measurement method and repeat/independently verify. If crop concerns persist, test soil separately; do not apply amendments from rainwater pH alone.')
        : (hi?'एक ही विधि से दोहराए गए माप दर्ज करें। यह फसल-क्षति की सीमा नहीं है।':'Keep records and compare repeat measurements using a consistent method. This is not a crop-damage threshold.');
      const tag=simulated?'DEMO / SIMULATED DATA':(hi?'मापा · उपयोगकर्ता द्वारा दर्ज':'MEASURED · USER-RECORDED');
      const html=`<article class="ph-map-popup ${simulated?'simulated':''}"><span class="ph-popup-tag">${tag}</span><h3>${escapeHTML(r.location||stateLocation.name||(hi?'दर्ज स्थान':'Recorded location'))}</h3><p class="ph-popup-value" style="--ph-color:${c.color}">${hi?'वर्षा-जल pH':'Rainwater pH'} <strong>${Number.isFinite(pH)?pH.toFixed(1):'—'}</strong></p><p><b>${hi?'वर्गीकरण':'Classification'}:</b> ${escapeHTML(classLabel)}<br><b>${hi?'तारीख':'Date'}:</b> ${escapeHTML(r.date||(hi?'उल्लेख नहीं':'not recorded'))}<br><b>${hi?'विधि':'Method'}:</b> ${method}<br><b>${hi?'स्रोत':'Source'}:</b> ${source}</p><p><b>${hi?'विश्वसनीयता':'Reliability'}:</b> ${hi?'उपयोगकर्ता द्वारा बताया गया; उपकरण अंशांकन या स्रोत स्वतंत्र रूप से सत्यापित नहीं है।':'user-reported; instrument calibration or source report is not independently verified.'}</p><p><b>${hi?'निगरानी संदर्भ':'Monitoring concern'}:</b> ${escapeHTML(concern)}</p><p><b>${hi?'सावधानी':'Precaution'}:</b> ${escapeHTML(precaution)}</p>${current}<p class="ph-popup-foot">${hi?'कोई प्रत्यक्ष वायु-प्रदूषण संकेतक जुड़ा नहीं है। SO₂/NO₂/AQI वर्षा-जल pH का माप नहीं हैं।':'No direct air-pollution indicator is connected. SO₂/NO₂/AQI would not be a rainwater pH measurement.'}</p></article>`;
      marker.bindPopup(html,{maxWidth:320,autoPan:true,keepInView:true});
      marker.bindTooltip(`pH ${pH.toFixed(1)}${simulated?' · DEMO':''}`,{direction:'top',offset:[0,-5]});
    });
    const missing=records.length-valid.length;
    const pHParts=[];
    if(valid.length)pHParts.push(`${valid.length} geolocated user reading${valid.length===1?'':'s'}`);
    if(demo?.pHReading)pHParts.push('1 simulated demo point');
    if(missing)pHParts.push(`${missing} saved without coordinates`);
    $('map-data-label').textContent=pHParts.join(' · ')||'No measured pH records in this view';
    status('');
  }
  function layerTitle(){return {temperature:'Temperature',wind:'Wind',clouds:'Cloud cover',humidity:'Humidity',pressure:'Sea-level pressure',radar:'Precipitation radar',atmosphere:'Atmospheric monitoring',acidity:'Rainwater pH measurements'}[activeLayer];}
  function updateMapMode(){
    const badge=$('map-data-mode'), label=$('map-mode-label');if(!badge||!label)return;
    const pHMode=activeLayer==='acidity',airMode=activeLayer==='atmosphere',demoPH=getState().demo==='acid-rain';
    label.textContent=pHMode?(demoPH?(getState().prefs?.language==='hi'?'उपयोगकर्ता + डेमो':'USER + DEMO'):(getState().prefs?.language==='hi'?'उपयोगकर्ता रिकॉर्ड':'USER RECORDS')):airMode?(getState().prefs?.language==='hi'?'वायु मॉडल':'AIR MODEL'):(getState().prefs?.language==='hi'?'लाइव':'LIVE');
    badge.classList.toggle('ph-mode',pHMode);badge.classList.toggle('air-mode',airMode);
    badge.title=pHMode?'Geolocated user-recorded pH only; no live pH feed is connected. Demo point, if present, is simulated.':airMode?'Open-Meteo modeled atmospheric concentrations, not ground-station measurements.':'Weather map view; forecast and model data are not field measurements.';
  }
  async function switchLayer(layer){
    if(!['temperature','wind','clouds','humidity','pressure','radar','atmosphere','acidity'].includes(layer))return;
    const wasRadar=activeLayer==='radar',sameLayer=activeLayer===layer; activeLayer=layer;stop();status('');updateMapMode();
    if(layer!=='atmosphere'){airController?.abort();airRequest++;if(airStatus==='loading')setAirState('idle');}
    if(layer==='acidity'||layer==='atmosphere'){$('map-location-panel').hidden=true;selectedMarker?.remove();}
    else if(selectedMarker&&!map.hasLayer(selectedMarker))selectedMarker.addTo(map);
    if(layer!=='acidity'&&map.hasLayer(acidityGroup))map.removeLayer(acidityGroup);
    if(layer!=='atmosphere'&&map.hasLayer(airQualityGroup))map.removeLayer(airQualityGroup);
    $('environment-pollutant-wrap').hidden=layer!=='atmosphere';
    document.querySelectorAll('[data-layer]').forEach(b=>{b.classList.toggle('active',b.dataset.layer===layer);b.setAttribute('aria-pressed',String(b.dataset.layer===layer));});
    $('more-layers').value=['humidity','pressure','atmosphere','acidity'].includes(layer)?layer:'';
    $('more-layers').closest('label').style.background=['humidity','pressure','atmosphere','acidity'].includes(layer)?'#eaf2ec':'';
    radarLayers.forEach(l=>{if(map.hasLayer(l))map.removeLayer(l);});radarLayers.clear();radarLayer=null;
    renderEnvironmentPanel();updateLegend();updateTimeline();
    if(layer==='radar'){
      samplesGroup.clearLayers();sampleController?.abort();
      $('map-data-label').textContent='Loading available radar frames…';
      const id=++radarRequest;
      try{
        radarData=await fetchRadar();
        if(activeLayer!=='radar'||id!==radarRequest)return;
        const lastPast=radarData.frames.findLastIndex(f=>!f.future);
        radarIndex=Math.max(0,lastPast);
        radarTileFailed=false;updateTimeline();showFrame(radarIndex);
        status('Coverage varies, particularly in India. Blank radar is not evidence of no rain.');
      }catch(error){
        if(activeLayer!=='radar')return;
        radarData=null;updateTimeline();$('map-data-label').textContent='Radar unavailable';
        status('Radar data could not be loaded. Explore a model layer or retry.',()=>switchLayer('radar'));
      }
    }else if(layer==='atmosphere'){
      samplesGroup.clearLayers();sampleController?.abort();
      renderEnvironmentPanel();
      if(!sameLayer||airStatus==='idle'||airStatus==='error')loadAtmosphere();
    }else if(layer==='acidity'){
      samplesGroup.clearLayers();sampleController?.abort();
      renderAcidityMarkers();
    }else{
      if(map.hasLayer(acidityGroup))map.removeLayer(acidityGroup);
      renderSamples();if(wasRadar||!sampleData.length)loadSamples();
    }
  }
  function updateLegend(){
    const prefs=getState().prefs;
    if(activeLayer==='atmosphere'){
      const hi=prefs?.language==='hi',pollutant=POLLUTANTS[activeAirPollutant];
      $('map-legend').innerHTML=`<div class="legend-title"><span>${hi?'वायुमंडलीय निगरानी':'Atmospheric Monitoring'}</span><span>${escapeHTML(airData?.units?.[activeAirPollutant]||envText('Unit unavailable','इकाई उपलब्ध नहीं'))}</span></div><div class="environment-legend-key"><i style="--pollutant:${pollutant.color}"></i><span>${escapeHTML(pollutant[hi?'hi':'en'])}</span></div><div class="legend-note">${hi?'मॉडल ग्रिड केंद्र उपलब्ध होने पर एक बिंदु; रंग केवल प्रदूषक पहचानता है, स्तर नहीं। यह सेंसर माप नहीं है।':'One model-grid point when the provider supplies its centre; color identifies the pollutant, not its concentration level. Not a sensor reading.'}</div>`;
      return;
    }
    const legend={
      temperature:{title:'Air temperature',unit:prefs.temperature==='fahrenheit'?'°F':'°C',values:[temp(0,prefs),temp(15,prefs),temp(30,prefs),temp(45,prefs)],colors:'#76a8c1,#a7c9a3,#e7d081,#d98e6d',note:'Colored points = model samples, not a raster'},
      wind:{title:'Wind speed',unit:prefs.wind==='mph'?'mph':'km/h',values:[wind(0,prefs,false),wind(25,prefs,false),wind(60,prefs,false)],colors:'#dce8dc,#adcbb9,#6a9e90',note:'Arrow shows direction of flow · point values'},
      clouds:{title:'Cloud cover',unit:'%',values:['0 · Clear','50','100 · Overcast'],colors:'#f2f4ef,#b9c8cd,#859eac',note:'Model cloud cover, not satellite imagery'},
      humidity:{title:'Relative humidity',unit:'%',values:['0 · Dry','50','100 · Saturated'],colors:'#eee7cf,#c1d7cc,#81aeb6',note:'Current model point estimates'},
      pressure:{title:'Sea-level pressure',unit:'hPa',values:['980','1013','1040'],colors:'#c6b4ce,#e3dddc,#a1b9cb',note:'Current model point estimates'},
      radar:{title:'Radar reflectivity',unit:'dBZ',values:['Light','Moderate','Heavy'],colors:'#69adcf,#55b35c,#e2d945,#e47742,#ca5364',note:'Approximate intensity · radar coverage varies'},
      acidity:{title:'Acid Rain & Rainwater pH',unit:'Measured pH',values:['>5.6','5.0–5.6','4.0–4.9','<4.0'],colors:'#438b68,#c7a83b,#db873d,#c95050',note:'Point observations only · gray = no data · bands are not crop-damage limits'}
    }[activeLayer];
    $('map-legend').innerHTML=`<div class="legend-title"><span>${legend.title}</span><span>${legend.unit}</span></div><div class="legend-scale" style="background:linear-gradient(90deg,${legend.colors})"></div><div class="legend-values">${legend.values.map(v=>`<span>${v}</span>`).join('')}</div><div class="legend-note">${legend.note}</div>`;
  }
  function radarTime(f){return new Date(f.time*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'});}
  function updateTimeline(){
    const ready=activeLayer==='radar'&&radarData?.frames?.length;
    $('radar-timeline').disabled=!ready;
    $('radar-prev').disabled=!ready;$('radar-next').disabled=!ready;$('radar-speed').disabled=!ready;
    $('radar-play').disabled=activeLayer==='radar'&&!ready;
    $('radar-play').setAttribute('aria-label',activeLayer==='radar'?'Play radar animation':'Switch to radar playback');
    $('timeline-start').textContent=ready?`${radarTime(radarData.frames[0])} UTC · PAST`:'CURRENT CONDITIONS';
    $('timeline-end').textContent=ready?(radarData.frames.some(f=>f.future)?'FORECAST AVAILABLE':'LATEST OBSERVATION'):'MODEL ESTIMATES';
    $('timeline-current').textContent=ready?'Radar':'Now';
    $('timeline-caption').textContent=ready?(radarData.frames.some(f=>f.future)?'Past observations → now → provider nowcast':'Past radar only · forecast radar is not supplied'):'Spatial samples · select Radar to explore past weather';
    $('radar-timeline').max=ready?radarData.frames.length-1:0;
    $('radar-timeline').value=ready?radarIndex:0;
  }
  function getRadarLayer(i){
    if(radarLayers.has(i))return radarLayers.get(i);
    const frame=radarData.frames[i];
    const layer=L.tileLayer(`${radarData.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,{opacity:0,zIndex:350,maxNativeZoom:7,maxZoom:12,attribution:'Radar &copy; <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">RainViewer</a>',crossOrigin:true,keepBuffer:2});
    layer.on('tileerror',()=>{
      if(activeLayer==='radar'&&!radarTileFailed){radarTileFailed=true;stop();status('Some radar tiles failed to load. Playback is paused; no rain inference can be made.',()=>switchLayer('radar'));}
    });
    radarLayers.set(i,layer);return layer;
  }
  function showFrame(i){
    if(activeLayer!=='radar'||!radarData?.frames.length)return;
    radarIndex=(i+radarData.frames.length)%radarData.frames.length;
    const frame=radarData.frames[radarIndex];
    if(radarLayer)radarLayer.setOpacity(0);
    radarLayer=getRadarLayer(radarIndex);if(!map.hasLayer(radarLayer))radarLayer.addTo(map);radarLayer.setOpacity(.65);
    const next=(radarIndex+1)%radarData.frames.length;
    const nextLayer=getRadarLayer(next);if(!map.hasLayer(nextLayer))nextLayer.addTo(map);
    // Retain only current and neighboring tile sets to bound memory and requests.
    for(const [idx,layer] of radarLayers)if(idx!==radarIndex&&idx!==next){map.removeLayer(layer);radarLayers.delete(idx);}
    $('radar-timeline').value=radarIndex;
    $('timeline-current').textContent=`${radarTime(frame)} UTC`;
    $('map-data-label').textContent=`${frame.future?'Provider nowcast':'Past radar'} · ${new Date(frame.time*1000).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})} ${radarTime(frame)} UTC`;
  }
  function togglePlay(){
    if(playing){stop();return;}if(!radarData)return;
    if(reduceMotion()){status('Radar autoplay is disabled because your system requests reduced motion. Use the previous/next controls instead.');return;}
    playing=true;$('radar-play').innerHTML=icon('pause');$('radar-play').setAttribute('aria-label','Pause radar animation');
    playTimer=setInterval(()=>showFrame(radarIndex+1),1200/speed);
  }
  function stop(){playing=false;clearInterval(playTimer);$('radar-play').innerHTML=icon('play');$('radar-play').setAttribute('aria-label',activeLayer==='radar'?'Play radar animation':'Switch to radar playback');}
  return {
    setLocation,renderPanel,switchLayer,
    resize:()=>setTimeout(()=>{if(visible)map.invalidateSize();},50),
    setVisible(value){
      visible=value;clearTimeout(sampleTimer);
      if(!value){stop();map.stop();sampleController?.abort();airController?.abort();airRequest++;if(airStatus==='loading')setAirState('idle');}
      else{
        map.invalidateSize();
        if(pendingCenter){const p=pendingCenter;pendingCenter=null;map.setView([p.lat,p.lng],p.zoom,{animate:false});sampleData=[];samplesGroup.clearLayers();}
        if(activeLayer==='acidity')renderAcidityMarkers();
        else if(activeLayer==='atmosphere')loadAtmosphere();
        else if(activeLayer!=='radar'&&!sampleData.length)sampleTimer=setTimeout(loadSamples,1000);
      }
    },
    refreshUnits(){updateLegend();if(activeLayer==='acidity')renderAcidityMarkers();else if(activeLayer==='atmosphere'){renderEnvironmentPanel();renderAirMarker();}else renderSamples();renderPanel();},
    refreshAcidity(){if(activeLayer==='acidity'){updateMapMode();renderAcidityMarkers();}},
    refreshEnvironmentUI(){if(activeLayer==='atmosphere'||activeLayer==='acidity'){updateMapMode();renderEnvironmentPanel();updateLegend();}}
  };
}
