import { fetchSamples, fetchRadar } from './api.js';
import { icon, escapeHTML } from './icons.js';
import { temp, wind, number, direction, present, condition, currentHourIndex, localHour, deriveAdvisories } from './weather.js';

export function createWeatherMap({ getState, onSelect, toast }) {
  const $ = id => document.getElementById(id);
  let map, selectedMarker, samplesGroup, sampleData = [], sampleController, sampleTimer;
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
    return { setLocation:()=>{}, renderPanel:()=>{}, resize:()=>{}, setVisible:()=>{}, refreshUnits:()=>{}, switchLayer:()=>{} };
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
  map.on('click',e=>{
    const longitude = ((e.latlng.lng+180)%360+360)%360-180;
    onSelect({name:`${Math.abs(e.latlng.lat).toFixed(2)}° ${e.latlng.lat>=0?'N':'S'}, ${Math.abs(longitude).toFixed(2)}° ${longitude>=0?'E':'W'}`,country:'Selected map point',latitude: e.latlng.lat,longitude},true);
  });
  map.on('moveend',()=> { clearTimeout(sampleTimer); if(activeLayer !== 'radar' && visible) sampleTimer=setTimeout(loadSamples,1000); });
  // Wheel zoom is enabled only after focus to avoid hijacking page scrolling.
  $('weather-map').addEventListener('focusin',()=>map.scrollWheelZoom.enable());
  $('weather-map').addEventListener('focusout',()=>map.scrollWheelZoom.disable());
  document.querySelectorAll('[data-layer]').forEach(button=>button.addEventListener('click',()=>switchLayer(button.dataset.layer)));
  $('more-layers').addEventListener('change',e=>{if(e.target.value) switchLayer(e.target.value);});
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
    if(activeLayer==='radar'||!visible)return;
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
    if(activeLayer==='radar')return;
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
  function layerTitle(){return {temperature:'Temperature',wind:'Wind',clouds:'Cloud cover',humidity:'Humidity',pressure:'Sea-level pressure',radar:'Precipitation radar'}[activeLayer];}
  async function switchLayer(layer){
    if(!['temperature','wind','clouds','humidity','pressure','radar'].includes(layer))return;
    const wasRadar=activeLayer==='radar'; activeLayer=layer;stop();status('');
    document.querySelectorAll('[data-layer]').forEach(b=>{b.classList.toggle('active',b.dataset.layer===layer);b.setAttribute('aria-pressed',String(b.dataset.layer===layer));});
    $('more-layers').value=['humidity','pressure'].includes(layer)?layer:'';
    $('more-layers').closest('label').style.background=['humidity','pressure'].includes(layer)?'#eaf2ec':'';
    radarLayers.forEach(l=>{if(map.hasLayer(l))map.removeLayer(l);});radarLayers.clear();radarLayer=null;
    updateLegend();updateTimeline();
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
    }else{renderSamples();if(wasRadar||!sampleData.length)loadSamples();}
  }
  function updateLegend(){
    const prefs=getState().prefs;
    const legend={
      temperature:{title:'Air temperature',unit:prefs.temperature==='fahrenheit'?'°F':'°C',values:[temp(0,prefs),temp(15,prefs),temp(30,prefs),temp(45,prefs)],colors:'#76a8c1,#a7c9a3,#e7d081,#d98e6d',note:'Colored points = model samples, not a raster'},
      wind:{title:'Wind speed',unit:prefs.wind==='mph'?'mph':'km/h',values:[wind(0,prefs,false),wind(25,prefs,false),wind(60,prefs,false)],colors:'#dce8dc,#adcbb9,#6a9e90',note:'Arrow shows direction of flow · point values'},
      clouds:{title:'Cloud cover',unit:'%',values:['0 · Clear','50','100 · Overcast'],colors:'#f2f4ef,#b9c8cd,#859eac',note:'Model cloud cover, not satellite imagery'},
      humidity:{title:'Relative humidity',unit:'%',values:['0 · Dry','50','100 · Saturated'],colors:'#eee7cf,#c1d7cc,#81aeb6',note:'Current model point estimates'},
      pressure:{title:'Sea-level pressure',unit:'hPa',values:['980','1013','1040'],colors:'#c6b4ce,#e3dddc,#a1b9cb',note:'Current model point estimates'},
      radar:{title:'Radar reflectivity',unit:'dBZ',values:['Light','Moderate','Heavy'],colors:'#69adcf,#55b35c,#e2d945,#e47742,#ca5364',note:'Approximate intensity · radar coverage varies'}
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
    playing=true;$('radar-play').innerHTML=icon('pause');$('radar-play').setAttribute('aria-label','Pause radar animation');
    playTimer=setInterval(()=>showFrame(radarIndex+1),1200/speed);
  }
  function stop(){playing=false;clearInterval(playTimer);$('radar-play').innerHTML=icon('play');$('radar-play').setAttribute('aria-label',activeLayer==='radar'?'Play radar animation':'Switch to radar playback');}
  return {
    setLocation,renderPanel,switchLayer,
    resize:()=>setTimeout(()=>{if(visible)map.invalidateSize();},50),
    setVisible(value){
      visible=value;clearTimeout(sampleTimer);
      if(!value){stop();map.stop();sampleController?.abort();}
      else{
        map.invalidateSize();
        if(pendingCenter){const p=pendingCenter;pendingCenter=null;map.setView([p.lat,p.lng],p.zoom,{animate:false});sampleData=[];samplesGroup.clearLayers();}
        if(activeLayer!=='radar'&&!sampleData.length)sampleTimer=setTimeout(loadSamples,1000);
      }
    },
    refreshUnits(){updateLegend();renderSamples();renderPanel();}
  };
}
