// Farm management, explainable agricultural intelligence, pH records and local demo mode.
import * as farms from './farms.js';
import * as acidity from './acidity.js';
import { buildProvenance, provenanceHTML } from './provenance.js';
import { buildAgriculturalAlerts, cropName, hazardName, suitabilityFactorRows, suitabilityClassification } from './agriculture.js';
import { makeDemoState } from './demo.js';
import { icon, escapeHTML } from './icons.js';
import { parseCoordinates } from './geocode.js';
import { temp, wind } from './weather.js';
import { POLLUTANTS, selectAirQualityFrame, validAirCoordinates } from './air-quality.js';
import { t, formatNumber, formatDate } from './i18n.js';

export function createFarmUI({ getState, selectLocation, toast, onFarmChange = () => {}, onDemoChange = () => {} }) {
  const $ = id => document.getElementById(id);
  let doc = farms.loadFarms();
  let readings = acidity.loadReadings();
  let editingId = null, phChart = null, temporaryCropSelection = null;
  const label = (obj, language) => language === 'hi' ? (obj?.hi || obj?.en) : (obj?.en || obj?.hi);
  const present = value => value !== null && value !== undefined && Number.isFinite(Number(value));
  const esc = escapeHTML;
  const cropLabel = (crop, language) => cropName(crop, language);
  const enumKey = value => String(value||'').toLowerCase().replaceAll(' ','');
  const stageLabel = (value,language) => value ? t(`farm.stage.${({ 'grainfilling':'grainFilling' })[enumKey(value)]||enumKey(value)}`,{},language) : '';
  const irrigationLabel = (value,language) => value ? t(`farm.irrigation.${({ 'tubewell':'tubeWell' })[enumKey(value)]||enumKey(value)}`,{},language) : '';
  const drainageLabel = (value,language) => value ? t(`farm.option.${value}`,{},language) : '';
  const riskNames = { LOW: 'LOW', MODERATE: 'MODERATE', HIGH: 'HIGH', SEVERE: 'SEVERE', UNKNOWN: 'UNKNOWN' };
  const localDate = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

  function persist() {
    if (!farms.persistFarms(doc)) toast(t('farm.storageUnavailable'));
    onFarmChange(farms.getActiveFarm(doc));
  }

  function renderActiveFarm(language = 'en') {
    const root = $('active-farm-card'); if (!root) return;
    const farm = farms.getActiveFarm(doc);
    if (!farm) { root.innerHTML = `<p class="muted-note">${esc(t('farm.noActive',{},language))}</p>`; return; }
    const coords=`${formatNumber(farm.latitude,{minimumFractionDigits:4,maximumFractionDigits:4},language)}, ${formatNumber(farm.longitude,{minimumFractionDigits:4,maximumFractionDigits:4},language)}`;
    const sowing=farm.sowingDate?t('farm.sown',{date:formatDate(`${farm.sowingDate}T12:00:00Z`,{day:'numeric',month:'short',year:'numeric'},language)},language):'';
    const context=[stageLabel(farm.stage,language),sowing,irrigationLabel(farm.irrigation,language),drainageLabel(farm.drainage,language)].filter(Boolean).join(' · ');
    root.innerHTML = `<div class="active-farm-main"><span class="place-icon">${icon('map-pin')}</span><div><h4>${esc(farm.name)}</h4><p>${esc(cropLabel(farm.crop, language))}${context ? ' · ' + esc(context) : ''}</p><small>${esc(farm.placeLabel || coords)}</small></div><button class="text-button" data-farm-deactivate>${esc(t('farm.deactivate',{},language))}</button></div>`;
    root.querySelector('[data-farm-deactivate]')?.addEventListener('click', () => { doc = farms.setActiveFarm(doc, null); persist(); renderAll(); });
  }

  function renderFarmsList(language = 'en') {
    const root = $('farms-list'); if (!root) return;
    if (!doc.farms.length) { root.innerHTML = `<p class="muted-note">${esc(t('farm.noSaved',{},language))}</p>`; return; }
    root.innerHTML = doc.farms.map(f => {
      const shortCoords=`${formatNumber(Number(f.latitude),{minimumFractionDigits:3,maximumFractionDigits:3},language)}, ${formatNumber(Number(f.longitude),{minimumFractionDigits:3,maximumFractionDigits:3},language)}`;
      const coords=`${formatNumber(Number(f.latitude),{minimumFractionDigits:4,maximumFractionDigits:4},language)}, ${formatNumber(Number(f.longitude),{minimumFractionDigits:4,maximumFractionDigits:4},language)}`;
      return `<article class="farm-card ${f.id === doc.activeFarmId ? 'active' : ''}">
      <div><h4>${esc(f.name)}</h4><p>${esc(cropLabel(f.crop, language))} · ${esc(f.placeLabel || shortCoords)}</p><small>${coords}${f.stage ? ' · ' + esc(stageLabel(f.stage,language)) : ''}</small></div>
      <div class="farm-card-actions"><button data-farm-activate="${esc(f.id)}" class="text-button">${esc(t(f.id === doc.activeFarmId ? 'farm.option.active' : 'farm.use',{},language))}</button><button data-farm-edit="${esc(f.id)}" class="text-button">${esc(t('farm.edit',{},language))}</button><button data-farm-delete="${esc(f.id)}" class="icon-button" aria-label="${esc(t('farm.deleteAria',{farm:f.name},language))}">${icon('trash')}</button></div></article>`;
    }).join('');
    root.querySelectorAll('[data-farm-activate]').forEach(b => b.addEventListener('click', async () => {
      doc = farms.setActiveFarm(doc, b.dataset.farmActivate); persist();
      const farm = farms.getActiveFarm(doc);
      if (farm) await selectLocation(farms.farmToLocation(farm));
      toast(t('farm.activeToast',{farm:farm?.name||t('farm.form.title')}));
      renderAll();
    }));
    root.querySelectorAll('[data-farm-edit]').forEach(b => b.addEventListener('click', () => openForm(doc.farms.find(f => f.id === b.dataset.farmEdit))));
    root.querySelectorAll('[data-farm-delete]').forEach(b => b.addEventListener('click', () => {
      doc = farms.deleteFarm(doc, b.dataset.farmDelete); persist(); renderAll(); toast(t('farm.removedToast'));
    }));
  }

  function openForm(farm = null, preset = null) {
    const section = $('farm-form-section'); if (!section) return;
    editingId = farm?.id || null;
    $('farm-form-title').textContent = farm ? 'Edit farm' : 'Add a farm';
    $('farm-name').value = farm?.name || '';
    $('farm-crop').value = farm?.crop || '';
    $('farm-stage').value = farm?.stage || '';
    $('farm-sowing').value = farm?.sowingDate || '';
    $('farm-irrigation').value = farm?.irrigation || '';
    $('farm-drainage').value = farm?.drainage || 'unknown';
    $('farm-place').value = farm?.placeLabel || preset?.placeLabel || '';
    $('farm-lat').value = farm?.latitude ?? preset?.latitude ?? '';
    $('farm-lon').value = farm?.longitude ?? preset?.longitude ?? '';
    $('farm-notes').value = farm?.notes || '';
    section.hidden = false;
    $('farm-name').focus();
  }

  function closeForm() { const section = $('farm-form-section'); if (section) section.hidden = true; editingId = null; }

  function contextPHRecords(state, demo) {
    if (demo?.pHReading) return [demo.pHReading];
    const farm = farms.getActiveFarm(doc);
    return readings.filter(r => farm
      ? r.farmId === farm.id || (!r.farmId && Number.isFinite(Number(r.latitude)) && Math.abs(Number(r.latitude) - Number(farm.latitude)) < 0.001 && Math.abs(Number(r.longitude) - Number(farm.longitude)) < 0.001)
      : Number.isFinite(Number(r.latitude)) && Math.abs(Number(r.latitude) - Number(state.location.latitude)) < 0.001 && Math.abs(Number(r.longitude) - Number(state.location.longitude)) < 0.001)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderAlerts(container, alerts, notes, language) {
    if (!container) return;
    if (!alerts.length) {
      container.innerHTML = `<div class="agri-empty"><span class="agri-empty-mark">✓</span><div><strong>${language === 'hi' ? 'कोई कॉन्फ़िगर किया गया जोखिम संकेत नहीं' : 'No configured risk thresholds triggered'}</strong><p>${language === 'hi' ? 'उपलब्ध पूर्वानुमान में निर्धारित मौसम सीमाएँ पार नहीं हुईं। यह आधिकारिक सुरक्षा-सूचना नहीं है।' : 'The available forecast does not cross configured screens. This is not an official all-clear.'}</p>${notes?.length ? `<small>${esc(notes.join(' '))}</small>` : ''}</div></div>`;
      return;
    }
    container.innerHTML = alerts.slice(0, 5).map(a => {
      const actionList = (a.actions || []).map(act => {
        const text = typeof act.text === 'string' ? act.text : label(act.text, language);
        return `<li><span class="guidance-tag ${esc(act.kind || 'monitoring')}">${act.kind === 'sourced' ? (language === 'hi' ? 'स्रोत-आधारित' : 'Sourced') : (language === 'hi' ? 'सावधानी' : 'Precaution')}</span> ${esc(text)}${act.regions?.length ? ` <small>(${esc(act.regions.join(', '))})</small>` : ''}</li>`;
      }).join('');
      const why = label(a.why, language), expected = label(a.expected, language);
      const source = typeof a.source === 'string' ? a.source : 'Forecast + crop advisory rules';
      return `<details class="hazard-card agri-alert severity-${a.severity.toLowerCase()}" ${a.severity === 'SEVERE' ? 'open' : ''}>
        <summary><span class="severity-badge ${a.severity.toLowerCase()}">${riskNames[a.severity] || esc(a.severity)}</span><strong>${esc(hazardName(a.kind, language))}</strong><span class="alert-value">${esc(`${a.value} ${a.unit}`)}</span>${icon('chevron-down')}</summary>
        <div class="hazard-body"><p><b>${language === 'hi' ? 'फसल' : 'Crop'}:</b> ${esc(cropLabel(a.crop || farms.getActiveFarm(doc)?.crop, language))} · <b>${language === 'hi' ? 'जोखिम अवधि' : 'Forecast window'}:</b> ${esc(a.windowLabel || 'Next 72 hours')}</p>
        <p><b>${language === 'hi' ? 'पूर्वानुमान' : 'Forecast'}:</b> ${esc(expected)}</p>
        <details class="why-alert"><summary>${language === 'hi' ? 'यह चेतावनी क्यों?' : 'Why this alert?'}</summary><p>${esc(why)}</p></details>
        ${actionList ? `<h4>${language === 'hi' ? 'अनुशंसित सावधानियाँ' : 'Recommended precautions'}</h4><ul>${actionList}</ul>` : ''}
        <p class="alert-source"><b>${language === 'hi' ? 'स्रोत' : 'Source'}:</b> ${esc(source)}${a.simulated ? ' · DEMO / SIMULATED DATA' : ''}</p>
        <small>${esc(label(a.evidence, language) || 'Risk derived from available forecast/measurement data.')}</small><small>${esc(label(a.limitations, language) || 'Forecast screens are uncertain; verify locally. Weather alone cannot diagnose crop disease.')}</small></div></details>`;
    }).join('');
  }

  function renderSuitability(root, result, crop, language, demo, onCropSelect) {
    if (!root) return;
    const hi=language==='hi';
    const title=hi?'साझा मौसम अनुकूलता स्क्रीन':'Shared weather suitability screen';
    const picker=`<label class="suitability-crop-picker" for="suitability-crop-select"><span>${esc(t('crop.selectLabel',{},language))}</span><select id="suitability-crop-select" aria-label="${esc(t('crop.selectLabel',{},language))}"><option value="">${esc(t('crop.selectPlaceholder',{},language))}</option>${farms.CROPS.map(key=>`<option value="${esc(key)}">${esc(cropLabel(key,language))}</option>`).join('')}</select></label>`;
    if (!crop) {
      root.innerHTML=`<header><span class="card-kicker">${title}</span></header>${picker}<p class="score-prompt">${esc(t('crop.selectPrompt',{},language))}</p><small class="score-temporary-note">${esc(t('crop.temporaryNote',{},language))}</small><small class="score-disclaimer">${esc(t('crop.scorePHSeparate',{},language))}</small>`;
    } else {
      const score=result?.score, factorRows=suitabilityFactorRows(result||{},language);
      const summary=score==null?(hi?'पूर्वानुमान उपलब्ध नहीं':'Forecast unavailable'):(hi?`मौसम स्क्रीन ${score}/100`:`${score}/100 weather screen`);
      const coverage=hi?`उपलब्ध कारक कवरेज: ${result?.dataCoverage??0}%`:`Available factor coverage: ${result?.dataCoverage??0}%`;
      const classification=suitabilityClassification(result?.classification||'Unavailable',language);
      const note=hi?`उपलब्ध पूर्वानुमान कारकों से साझा मौसम स्क्रीन। डेटा कवरेज ${result?.dataCoverage??0}%; अनुपलब्ध कारकों के भार पुनः सामान्यीकृत होते हैं। फसल चुनने से सलाह का संदर्भ बदलता है, साझा स्कोर नहीं।`:(result?.note||'No forecast data; no score calculated.');
      const weights=hi?'उपलब्ध होने पर भार: तापमान 40%, वर्षा 30%, हवा 15%, आर्द्रता 15%; अनुपलब्ध कारक हटाकर शेष भार सामान्यीकृत किए जाते हैं। ये सामान्य स्क्रीनिंग सीमाएँ हैं।':'Weights when available: temperature 40%, rainfall 30%, wind 15%, humidity 15%; missing factors are omitted and remaining weights renormalized. These are general screening defaults.';
      const disclaimer=hi?'यह मौसम-स्क्रीनिंग है, फसल स्वास्थ्य, उपज या प्रमाणित फसल-क्षति सीमा नहीं। वर्षा-जल pH इस स्कोर में शामिल नहीं है।':'This is a weather screen, not crop health, yield, or a validated crop-damage threshold. Rainwater pH is not part of this score.';
      root.innerHTML=`<header><span class="card-kicker">${title}${demo?' · SIMULATED':''}</span></header>${picker}<div class="score-layout"><div class="score-ring" style="--score:${score??0}%"><span>${score==null?'—':score}<small>/100</small></span></div><div class="score-copy"><strong>${esc(classification)}</strong><span>${esc(summary)}</span><small>${esc(coverage)}</small></div></div><details class="score-explanation"><summary>${hi?'स्कोर कैसे बना?':'How this score is calculated'}</summary><p>${esc(note)}</p><ul>${factorRows.map(f=>`<li><b>${esc(f.label)}:</b> ${esc(f.status)} · ${esc(f.value)}<small>${esc(f.reason)}</small></li>`).join('')}</ul><small>${esc(weights)}</small></details><p class="score-disclaimer">${esc(disclaimer)}</p>`;
    }
    const select=root.querySelector('#suitability-crop-select');
    if(select){select.value=crop||'';select.addEventListener('change',()=>onCropSelect?.(select.value||null));}
  }

  function renderAciditySummary(root, language, live) {
    if(!root)return;
    const hi=language==='hi',loc=live.location||{},outlook=live.acidityOutlook||{};
    const coordMatch=(a,b)=>validAirCoordinates(a?.latitude,a?.longitude)&&validAirCoordinates(b?.latitude,b?.longitude)&&Math.abs(Number(a.latitude)-Number(b.latitude))<0.003&&Math.abs(Number(a.longitude)-Number(b.longitude))<0.003;
    const modelReady=outlook.status==='ready'&&coordMatch(outlook.requested,loc)&&outlook.data;
    const frame=modelReady?selectAirQualityFrame(outlook.data,live.weather?.current?.time||''):null;
    const daily=live.weather?.daily||{},current=live.weather?.current||{};
    const rain=present(daily.precipitation_sum?.[0])?`${formatNumber(Number(daily.precipitation_sum[0]),{minimumFractionDigits:1,maximumFractionDigits:1},language)} mm${present(daily.precipitation_probability_max?.[0])?` · ${formatNumber(Number(daily.precipitation_probability_max[0]),{},language)}%`:''}`:(hi?'उपलब्ध नहीं':'Unavailable');
    const pollutant=(key)=>frame&&present(frame.values?.[key])?`${formatNumber(Number(frame.values[key]),{minimumFractionDigits:1,maximumFractionDigits:1},language)} ${outlook.data.units?.[key]||'μg/m³'}`:(hi?'उपलब्ध नहीं':'Unavailable');
    const humidity=present(current.relative_humidity_2m)?`${formatNumber(Number(current.relative_humidity_2m),{},language)}%`:(hi?'उपलब्ध नहीं':'Unavailable');
    const windValue=present(current.wind_speed_10m)?`${formatNumber(Number(current.wind_speed_10m),{maximumFractionDigits:1},language)} ${live.weather?.current_units?.wind_speed_10m||'km/h'}`:(hi?'उपलब्ध नहीं':'Unavailable');
    const record=readings.filter(r=>r?.recordType!=='simulated'&&present(r.value)&&r.date&&((loc.farmId&&r.farmId===loc.farmId)||(!r.farmId&&coordMatch(r,loc)))).sort((a,b)=>b.date.localeCompare(a.date))[0]||null;
    let concern=hi?'अपर्याप्त डेटा':'Insufficient data',concernClass='insufficient',measuredNote='';
    if(record){
      const band=acidity.classifyPH(record.value).band;
      const key=band==='near-natural'?'outlook.low':band==='slightly-acidic'?'outlook.moderate':band==='low-ph'||band==='very-low-ph'?'outlook.elevated':'outlook.insufficient';
      concern=t(key,{},language);concernClass=key.split('.').at(-1);
      measuredNote=`<p class="outlook-measured">${esc(t('outlook.measuredSample',{value:formatNumber(Number(record.value),{minimumFractionDigits:1,maximumFractionDigits:1},language),date:formatDate(`${record.date}T12:00:00Z`,{day:'numeric',month:'short',year:'numeric'},language)},language))}</p>`;
    }
    const loading=outlook.status==='loading';
    const updated=modelReady?formatDate(new Date(outlook.updatedAt||outlook.data.fetchedAt||Date.now()),{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'},language):(hi?'उपलब्ध नहीं':'Unavailable');
    const source=modelReady?`${esc(outlook.data.source||'Open-Meteo Air Quality API')} · Open-Meteo Weather API`:'Open-Meteo Weather & Air Quality APIs';
    root.innerHTML=`<header class="outlook-header"><span class="card-kicker">${esc(t('outlook.title',{},language))}</span><span class="outlook-pill ${concernClass}">${esc(t('outlook.concern',{},language))}: <b>${esc(concern)}</b></span></header><p class="outlook-location"><b>${esc(t('outlook.location',{},language))}:</b> ${esc(loc.name|| (hi?'चयनित स्थान':'Selected location'))}</p>${loading?`<p class="outlook-loading" role="status">${esc(t('outlook.loading',{},language))}</p>`:''}${measuredNote}<div class="outlook-metrics"><div><span>${esc(t('outlook.rainfall',{},language))}</span><b>${esc(rain)}</b></div><div><span>SO₂</span><b>${esc(pollutant('sulphur_dioxide'))}</b></div><div><span>NO₂</span><b>${esc(pollutant('nitrogen_dioxide'))}</b></div><div><span>${esc(t('outlook.humidity',{},language))}</span><b>${esc(humidity)}</b></div><div><span>${esc(t('outlook.wind',{},language))}</span><b>${esc(windValue)}</b></div></div><p class="outlook-explanation">${esc(record?t('outlook.measuredExplain',{},language):t('outlook.insufficientExplain',{},language))}</p><p class="outlook-advice">${esc(t('outlook.advice',{},language))}</p><small class="outlook-provenance"><b>${esc(t('outlook.source',{},language))}:</b> ${source}<br>${esc(t('outlook.updated',{},language))}: ${esc(updated)}${frame?` · ${esc(frame.time)}`:''}</small><button type="button" class="text-button outlook-record-button" data-record-ph>${esc(t('outlook.record',{},language))}</button>`;
    root.dataset.concern=concernClass;
  }

  function renderEnvironmentalSummary() {
    const root=$('farm-environment-summary');if(!root)return;
    const live=getState(),farm=farms.getActiveFarm(doc),hi=live.prefs?.language==='hi',language=hi?'hi':'en';
    if(!farm||!validAirCoordinates(farm.latitude,farm.longitude)){root.hidden=true;return;}
    root.hidden=false;
    const env=live.acidityOutlook?.status&&live.acidityOutlook.status!=='idle'?live.acidityOutlook:live.environment,request=env?.requested;
    const matches=validAirCoordinates(request?.latitude,request?.longitude)&&Math.abs(Number(request.latitude)-Number(farm.latitude))<0.003&&Math.abs(Number(request.longitude)-Number(farm.longitude))<0.003;
    const openButton=`<button type="button" class="text-button" data-open-farm-atmosphere>${hi?'इस खेत की वायुमंडलीय निगरानी खोलें':'Open atmosphere for this farm'}</button>`;
    if(!matches||!env||env.status==='idle'){
      root.innerHTML=`<div class="farm-environment-heading"><span class="card-kicker">${hi?'पर्यावरणीय जानकारी':'Environmental information'}</span><span>${hi?'इस खेत के लिए अभी लोड नहीं हुई':'Not loaded for this farm yet'}</span></div><p>${hi?'वायुमंडलीय परत खोलने पर चयनित खेत के लिए मॉडल SO₂, NO₂ और कण-सांद्रता उपलब्धता जाँची जाएगी।':'Open the atmospheric layer to check model SO₂, NO₂ and particulate data for the selected farm.'}</p>${openButton}`;
      return;
    }
    if(env.status==='loading'){
      root.innerHTML=`<div class="farm-environment-heading"><span class="card-kicker">${hi?'पर्यावरणीय जानकारी':'Environmental information'}</span><span>${hi?'मॉडल डेटा लोड हो रहा है…':'Loading model data…'}</span></div><p>${hi?'खेत के निर्देशांकों के लिए वायुमंडलीय मॉडल जाँचा जा रहा है।':'Checking atmospheric model data for this farm location.'}</p>`;
      return;
    }
    if(env.status!=='ready'||!env.data){
      root.innerHTML=`<div class="farm-environment-heading"><span class="card-kicker">${hi?'पर्यावरणीय जानकारी':'Environmental information'}</span><span>${hi?'डेटा अनुपलब्ध':'Data unavailable'}</span></div><p>${esc(env.error|| (hi?'इस खेत के लिए वायुमंडलीय डेटा उपलब्ध नहीं है।':'Atmospheric data is unavailable for this farm.'))}</p>${openButton}`;
      return;
    }
    const data=env.data,target=live.weather?.current?.time||'',frame=selectAirQualityFrame(data,target);
    if(!frame){root.innerHTML=`<p>${hi?'वायुमंडलीय पूर्वानुमान समय उपलब्ध नहीं है।':'No atmospheric forecast timestamps are available.'}</p>${openButton}`;return;}
    const cells=Object.entries(POLLUTANTS).map(([key,p])=>{
      const value=frame.values[key],unit=data.units[key]||'';
      return `<div><span>${esc(p[hi?'hi':'en'])}</span><b>${present(value)?`${formatNumber(Number(value),{minimumFractionDigits:1,maximumFractionDigits:1},language)} ${esc(unit)}`:(hi?'उपलब्ध नहीं':'Unavailable')}</b></div>`;
    }).join('');
    const weatherMatches=Math.abs(Number(live.location?.latitude)-Number(farm.latitude))<0.003&&Math.abs(Number(live.location?.longitude)-Number(farm.longitude))<0.003;
    const daily=weatherMatches?live.weather?.daily:null;
    const rain=daily&&present(daily.precipitation_sum?.[0])?`${formatNumber(Number(daily.precipitation_sum[0]),{minimumFractionDigits:1,maximumFractionDigits:1},language)} mm${present(daily.precipitation_probability_max?.[0])?` · ${formatNumber(Number(daily.precipitation_probability_max[0]),{},language)}% ${hi?'संभावना':'probability'}`:''}`:(hi?'उपलब्ध नहीं':'Unavailable');
    root.innerHTML=`<header class="farm-environment-heading"><span class="card-kicker">${hi?'पर्यावरणीय जानकारी':'Environmental information'}</span><span class="env-model-tag">${hi?'मॉडल पूर्वानुमान':'MODELED FORECAST'}</span></header><div class="farm-environment-grid">${cells}</div><p>${hi?'वर्षा पूर्वानुमान':'Rainfall forecast'}: ${esc(rain)} · ${esc(frame.time)}</p><small>${hi?'यह वायुमंडलीय मॉडल संदर्भ है, सेंसर माप या वर्षा-जल pH नहीं। इससे फसल को नुकसान या असुरक्षित होने का निष्कर्ष नहीं निकलता।':'Modeled atmospheric context, not sensor measurements or rainwater pH. It does not establish crop damage or safety.'}${live.demo?` ${hi?'डेमो के दौरान लाइव डेटा अलग रहता है।':'Live model data remains separate during the demo.'}`:''}</small>${openButton}`;
  }

  function renderWeek(root, days, weather, language, demo) {
    if (!root) return;
    const hi = language === 'hi';
    if (!days.length) { root.innerHTML = `<span class="card-kicker">${hi ? 'सात-दिवसीय फसल जोखिम' : 'Seven-day crop risk'}</span><p>${hi ? 'पूर्वानुमान उपलब्ध नहीं।' : 'Seven-day forecast unavailable; no risk is fabricated.'}</p>`; return; }
    const highest = days.reduce((best, d) => ({ UNKNOWN: 0, LOW: 1, MODERATE: 2, HIGH: 3, SEVERE: 4 }[d.risk] > ({ UNKNOWN: 0, LOW: 1, MODERATE: 2, HIGH: 3, SEVERE: 4 }[best.risk]) ? d : best), days[0]);
    const highestText = hi ? ({LOW:'कम',MODERATE:'मध्यम',HIGH:'उच्च',SEVERE:'गंभीर',UNKNOWN:'अज्ञात'}[highest.risk]) : highest.risk;
    const highestDate = new Date(`${highest.date}T12:00:00Z`).toLocaleDateString(hi ? 'hi-IN-u-nu-latn' : 'en-US', { weekday:'short', day:'numeric', month:'short', timeZone:'UTC' });
    const daily = weather.daily;
    const dayCards = days.map(day => {
      const i = day.index, date = new Date(`${day.date}T12:00:00Z`).toLocaleDateString(language === 'hi' ? 'hi-IN-u-nu-latn' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
      const high = daily.temperature_2m_max?.[i], low = daily.temperature_2m_min?.[i], rain = daily.precipitation_sum?.[i], gust = daily.wind_gusts_10m_max?.[i];
      const riskText = hi ? ({LOW:'कम',MODERATE:'मध्यम',HIGH:'उच्च',SEVERE:'गंभीर',UNKNOWN:'अज्ञात'}[day.risk]) : day.risk;
      const prefs = getState().prefs || {};
      const weatherLine = `${present(low) ? `${temp(low, prefs, true)}–` : ''}${present(high) ? temp(high, prefs, true) : '—'} · ${present(rain) ? `${Number(rain).toFixed(1)} mm` : 'rain —'}${present(gust) ? ` · gust ${wind(gust, prefs, true)}` : ''}`;
      const eventNames = day.events.map(e => hazardName(e.kind, language)).join(', ');
      const action = day.precaution ? label(day.precaution, language) : (hi ? 'नियमित रूप से खेत की निगरानी करें।' : 'Continue routine field scouting; no configured hazard screen was triggered.');
      const reason = day.events.map(e => e.reason).join(' ');
      const sourceText = day.source === 'DEMO / SIMULATED DATA' ? (hi ? 'डेमो / काल्पनिक डेटा' : day.source) : (hi ? 'Open-Meteo पूर्वानुमान' : day.source);
      const limitationText = hi ? 'यह मॉडल-ग्रिड का पूर्वानुमान है, खेत का माप नहीं। स्क्रीनिंग सीमाएँ आधिकारिक चेतावनी या फसल-क्षति सीमा नहीं हैं।' : day.limitation;
      return `<details class="week-risk-day"><summary><span class="week-day-date">${esc(date)}</span><span class="severity-badge ${day.risk.toLowerCase()}">${esc(riskText)}</span><span class="week-day-temp">${esc(weatherLine)}</span></summary><div><b>${hi ? 'मुख्य संकेत' : 'Main potential hazard'}:</b> ${esc(eventNames || (hi ? 'कोई कॉन्फ़िगर संकेत नहीं' : 'No configured hazard screen'))}<p>${esc(action)}</p>${reason ? `<small>${esc(reason)}</small>` : ''}<small>${hi ? 'स्रोत' : 'Source'}: ${esc(sourceText)} · ${esc(limitationText)}</small></div></details>`;
    }).join('');
    root.innerHTML = `<header class="week-risk-header"><span class="card-kicker">${hi ? 'सात-दिवसीय फसल मौसम जोखिम' : 'Seven-day crop weather risk'}${demo ? ' · SIMULATED' : ''}</span><span>${hi ? 'सबसे अधिक' : 'Highest'}: <b class="severity-badge ${highest.risk.toLowerCase()}">${esc(highestText)}</b> · ${esc(highestDate)}</span></header><div class="week-risk-list">${dayCards}</div><small class="risk-note">${hi ? 'मॉडल पूर्वानुमान खेत का माप नहीं है।' : 'Forecasts are model estimates for grid cells, not field measurements. Risk levels use transparent configured weather screens, not official warnings.'}</small>`;
  }

  function renderDashboard() {
    const live = getState(), language = live.prefs?.language || 'en', farm = farms.getActiveFarm(doc);
    const demo = live.demo ? makeDemoState(live.demo, live, live.weather?.current?.time ? new Date(live.weather.current.time) : new Date()) : null;
    const state = demo ? { ...live, weather: demo.weather, location: { ...live.location, ...demo.location } } : live;
    const crop = demo?.crop || (farm ? farm.crop : temporaryCropSelection);
    const summary = $('farm-summary-line'), actions = $('farm-actions');
    if (summary) summary.textContent = farm
      ? t('farm.summaryActive',{farm:farm.name,crop:crop?cropLabel(crop,language):t('crop.noCrop',{},language),place:farm.placeLabel||`${formatNumber(farm.latitude,{maximumFractionDigits:3},language)}, ${formatNumber(farm.longitude,{maximumFractionDigits:3},language)}`},language)
      : crop?t('crop.summaryTemporary',{location:live.location.name,crop:cropLabel(crop,language)},language):t('crop.summaryNone',{location:live.location.name},language);
    const assessment = buildAgriculturalAlerts(state, { crop, stage: farm?.stage, readings, demo, language });
    if (actions) {
      if (!state.weather) actions.innerHTML = `<div class="empty-state">${icon('cloud-off')}<p>${language === 'hi' ? 'पूर्वानुमान उपलब्ध नहीं। जोखिम की गणना नहीं की जा सकती।' : 'Forecast unavailable. No agricultural weather risk is calculated.'}</p></div>`;
      else renderAlerts(actions, assessment.alerts, assessment.notes, language);
    }
    renderSuitability($('suitability-card'), assessment.suitability, crop, language, demo, selected => {
      if(farm){
        if(farm.crop===selected)return;
        const outcome=farms.updateFarm(doc,farm.id,{crop:selected});
        if(outcome.error){toast(outcome.error);return;}
        doc=outcome.doc;persist();onFarmChange(farms.getActiveFarm(doc));
        toast(t('crop.savedToFarm',{crop:selected?cropLabel(selected,language):t('crop.noCrop',{},language)},language));
      }else{
        temporaryCropSelection=selected;
        toast(t('crop.temporarySelected',{crop:selected?cropLabel(selected,language):t('crop.noCrop',{},language)},language));
      }
      renderAll();
    });
    renderAciditySummary($('acidity-summary-card'), language, live);
    renderWeek($('week-risk-card'), assessment.days, state.weather, language, demo);
    renderEnvironmentalSummary();
    const controls = $('demo-controls');
    if (controls) {
      const select = $('demo-scenario'); if (select && live.demo) select.value = live.demo;
      const exit = $('demo-exit'), start = $('demo-start');
      if (exit) exit.hidden = !live.demo;
      if (start) start.textContent = live.demo ? 'Switch scenario' : 'Start demonstration';
      if (live.demo) controls.open = true;
    }
    renderProvenance();
    renderAcidity();
    rootMapButtons();
  }

  function rootMapButtons() {
    document.querySelectorAll('[data-open-ph-map]').forEach(button => button.addEventListener('click', () => {
      window.location.hash = 'map';
      document.dispatchEvent(new CustomEvent('weathergpt:show-acidity'));
    }));
    document.querySelectorAll('[data-open-atmosphere]').forEach(button => button.addEventListener('click', () => {
      window.location.hash='map';
      document.dispatchEvent(new CustomEvent('weathergpt:show-atmosphere'));
    }));
    document.querySelectorAll('[data-open-farm-atmosphere]').forEach(button => button.addEventListener('click', () => {
      const farm=farms.getActiveFarm(doc);if(!farm)return;
      window.location.hash='map';
      const current=getState().location||{};
      if(Math.abs(Number(current.latitude)-Number(farm.latitude))>=0.003||Math.abs(Number(current.longitude)-Number(farm.longitude))>=0.003){
        selectLocation({...current,...farm,name:farm.name,country:farm.country||'Farm location'});
      }
      document.dispatchEvent(new CustomEvent('weathergpt:show-atmosphere'));
    }));
  }

  function renderProvenance() {
    const root = $('provenance-content'); if (!root) return;
    const s = getState(), language = s.prefs?.language || 'en';
    if (s.demo) {
      const scenario = makeDemoState(s.demo, s, s.weather?.current?.time ? new Date(s.weather.current.time) : new Date());
      root.innerHTML = language === 'hi'
        ? `<p><b>डेमो / काल्पनिक डेटा:</b> ${esc(scenario?.scenario.description || 'काल्पनिक परिदृश्य')}। मौसम और pH मान स्थानीय रूप से बनाए गए हैं; कोई लाइव मौसम API या मापा गया pH स्रोत इन्हें प्रदान नहीं करता। यह डेटा सहेजा नहीं जाता।</p><p class="muted-note">लाइव मौसम ऊपर अलग से यथावत है। यह पैनल डेमो के लिए Open-Meteo मॉडल ग्रिड का दावा नहीं करता।</p>`
        : `<p><b>DEMO / SIMULATED DATA:</b> ${esc(scenario?.scenario.description || 'Synthetic scenario')}. Weather and pH values are locally generated; no live weather API or measured-pH source supplied them. Nothing is saved.</p><p class="muted-note">Live weather remains separate above. This panel does not claim an Open-Meteo model grid for the demo.</p>`;
      return;
    }
    const p = buildProvenance(s, language);
    root.innerHTML = p ? provenanceHTML(p, language) + `<p class="muted-note">${esc(p.resolution)}</p><p class="muted-note">${esc(p.radarNote)}</p>` : (language === 'hi' ? 'स्रोत, निर्देशांक और मॉडल-ग्रिड विवरण देखने के लिए पूर्वानुमान लोड करें।' : 'Load a forecast to see the source, coordinates and model-grid details.');
  }

  function renderAcidity() {
    const root = $('acidity-content'); if (!root) return;
    phChart?.destroy(); phChart = null;
    const state = getState(), language = state.prefs?.language || 'en', farm = farms.getActiveFarm(doc);
    root.innerHTML = acidity.acidityHTML(language, readings, {
      locationName: farm?.name || state.location?.name || '',
      latitude: farm?.latitude ?? state.location?.latitude,
      longitude: farm?.longitude ?? state.location?.longitude
    });
    const form = $('ph-reading-form');
    if (form) {
      const dateInput = $('ph-date');
      if (dateInput && !dateInput.value) dateInput.value = localDate();
      form.addEventListener('submit', event => {
        event.preventDefault();
        const outcome = acidity.addReading(readings, {
          value: $('ph-value').value, date: $('ph-date').value,
          method: $('ph-method').value, source: $('ph-source').value,
          location: $('ph-location').value, latitude: $('ph-latitude').value,
          longitude: $('ph-longitude').value, notes: $('ph-notes').value,
          farmId: farm?.id || null
        });
        readings = outcome.readings;
        if (outcome.error) toast(outcome.error);
        else toast('User-recorded pH measurement saved on this device.');
        document.dispatchEvent(new CustomEvent('weathergpt:acidity-updated'));
        renderAll();
      });
    }
    root.querySelectorAll('[data-delete-ph]').forEach(button => button.addEventListener('click', () => {
      readings = acidity.deleteReading(readings, button.dataset.deletePh);
      document.dispatchEvent(new CustomEvent('weathergpt:acidity-updated'));
      renderAll(); toast('pH measurement removed from this device.');
    }));
    const canvas = $('ph-history-chart');
    if (canvas && globalThis.Chart && readings.length) {
      const sorted = readings.slice().sort((a, b) => a.date.localeCompare(b.date));
      phChart = new Chart(canvas, {
        type: 'line',
        data: { labels: sorted.map(r => formatDate(`${r.date}T12:00:00Z`,{day:'numeric',month:'short'},language)), datasets: [{ label: t('ph.chartLabel',{},language), data: sorted.map(r => Number(r.value)), borderColor: '#4e9b75', backgroundColor: 'rgba(78,155,117,.14)', pointBackgroundColor: sorted.map(r => acidity.classifyPH(r.value).color), pointRadius: 4, borderWidth: 2, tension: 0.18, fill: true }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => t('ph.chartTooltip',{value:formatNumber(Number(c.parsed.y),{minimumFractionDigits:1,maximumFractionDigits:1},language),source:sorted[c.dataIndex]?.source||(language==='hi'?'उपयोगकर्ता द्वारा दर्ज':'User-recorded')},language) } } }, scales: { y: { min: 0, max: 14, title: { display: true, text: t('ph.chartYAxis',{},language) } }, x: { title: { display: true, text: t('ph.chartXAxis',{},language) } } } }
      });
    }
  }

  function wire() {
    $('farm-form')?.addEventListener('submit', event => {
      event.preventDefault();
      const raw = {
        name: $('farm-name').value, crop: $('farm-crop').value || null,
        stage: $('farm-stage').value || null, sowingDate: $('farm-sowing').value || null,
        irrigation: $('farm-irrigation').value || null, drainage: $('farm-drainage').value,
        placeLabel: $('farm-place').value, latitude: Number($('farm-lat').value),
        longitude: Number($('farm-lon').value), notes: $('farm-notes').value
      };
      const coords = parseCoordinates(`${raw.latitude}, ${raw.longitude}`);
      if (!coords || coords.invalid) { toast('Enter valid decimal-degree coordinates (latitude −90…90, longitude −180…180).'); return; }
      const outcome = editingId ? farms.updateFarm(doc, editingId, raw) : farms.addFarm(doc, raw);
      if (outcome.error) { toast(outcome.error); return; }
      doc = outcome.doc;
      if (!editingId) doc = farms.setActiveFarm(doc, outcome.farm.id);
      persist(); closeForm(); renderAll();
      toast(`${outcome.farm.name} saved on this device and set as the active farm.`);
      selectLocation(farms.farmToLocation(outcome.farm));
    });
    $('farm-form-cancel')?.addEventListener('click', closeForm);
    $('add-farm-current')?.addEventListener('click', () => {
      const s = getState();
      openForm(null, { latitude: Number(s.location.latitude).toFixed(4), longitude: Number(s.location.longitude).toFixed(4), placeLabel: `${s.location.name}${s.location.region ? ', ' + s.location.region : ''}` });
    });
    $('add-farm-coords')?.addEventListener('click', () => { openForm(null, { latitude: '', longitude: '', placeLabel: '' }); $('farm-lat').focus(); });
    $('add-farm-map')?.addEventListener('click', () => { window.location.hash = 'map'; toast('Click (or tap) the map to drop a draggable pin, then confirm the point.'); });
    const startDemo = scenario => {
      if (!['acid-rain', 'extreme-heat', 'heavy-rain', 'normal'].includes(scenario)) return;
      const select = $('demo-scenario'); if (select) select.value = scenario;
      onDemoChange(scenario); renderAll(); toast(`Demo scenario active: ${scenario}. All agricultural demo values are simulated and not saved.`);
    };
    $('demo-start')?.addEventListener('click', () => startDemo($('demo-scenario')?.value || 'acid-rain'));
    document.querySelectorAll('[data-demo-key]').forEach(button => button.addEventListener('click', () => startDemo(button.dataset.demoKey)));
    $('demo-exit')?.addEventListener('click', () => { onDemoChange(null); renderAll(); toast('Demo ended. Live weather and saved records are restored.'); });
    $('acidity-details')?.addEventListener('toggle', () => setTimeout(() => phChart?.resize(), 40));
    $('acidity-summary-card')?.addEventListener('click',event=>{if(event.target.closest('[data-record-ph]'))document.dispatchEvent(new CustomEvent('weathergpt:record-ph'));});
  }

  function renderAll() {
    const language = getState().prefs?.language || 'en';
    renderActiveFarm(language); renderFarmsList(language); renderDashboard();
  }

  wire();
  onFarmChange(farms.getActiveFarm(doc));
  return {
    renderAll, openForm,
    getActiveFarm: () => farms.getActiveFarm(doc),
    doc: () => doc,
    readings: () => readings.slice(),
    setPoint: point => openForm(null, { latitude: Number(point.latitude).toFixed(4), longitude: Number(point.longitude).toFixed(4), placeLabel: point.name || '' })
  };
}

export default createFarmUI;
