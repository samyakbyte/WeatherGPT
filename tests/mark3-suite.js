import { messages, missingTranslationKeys, missingBindingKeys, t, plural, tPlural, formatNumber, formatDate, setLocale, getLocale } from '../js/i18n.js';
import { buildAcidityIntelligence, renderAcidityIntelligence } from '../js/acidity-intelligence.js';

export async function mark3Suite(check) {
  check(missingTranslationKeys().length === 0 && missingBindingKeys().length === 0, 'English and Hindi catalogs cover all defined keys and static bindings');
  check(Object.keys(messages.en).length === Object.keys(messages.hi).length, 'translation catalogs have matching key counts');
  check(t('acidity.measurementDetail', { value:'5.2', date:'2026-10-29', method:'meter' }, 'en').includes('5.2') && t('acidity.measurementDetail', { value:'५.२', date:'2026-10-२९', method:'मीटर' }, 'hi').includes('मीटर'), 'interpolated messages support both languages');
  check(formatNumber(12345.6,{maximumFractionDigits:1},'hi').includes('12')&&!/[०-९]/.test(formatNumber(12345.6,{maximumFractionDigits:1},'hi'))&&/[0-9]/.test(formatDate('2026-10-29',{day:'numeric',month:'short'},'hi')), 'Hindi formatting retains Hindi locale with Latin digits for numbers and dates');
  check(formatDate('2026-10-29T12:00:00Z', { day:'numeric', month:'long' }, 'hi').includes('अक्टूबर'), 'Hindi date formatting uses a localized month name');
  check(plural({ one:'{{count}} observation', other:'{{count}} observations' }, 2) === '2 observations' && tPlural('map.pHCount',2,{},'en').endsWith('measurements') && tPlural('map.pHCount',2,{},'hi').startsWith('2') && tPlural('map.pHCount',2,{},'hi').includes('माप'), 'pluralization helper selects locale-aware count forms');
  setLocale('hi'); check(getLocale() === 'hi', 'global locale setter accepts Hindi'); setLocale('en');

  const location={name:'Farm A',latitude:26.9,longitude:75.8}, farm={id:'farm-a',crop:'wheat',latitude:26.9,longitude:75.8};
  const time='2026-10-29T10:00';
  const keys=['sulphur_dioxide','nitrogen_dioxide','pm2_5','pm10','ozone'];
  const atmosphericData={source:'CAMS / Open-Meteo',modelGrid:{latitude:26.875,longitude:75.75},timezoneAbbreviation:'IST',units:Object.fromEntries(keys.map(key=>[key,'μg/m³'])),hourly:{time:[time],...Object.fromEntries(keys.map((key,i)=>[key,[i+1]]))}};
  const environment={status:'ready',requested:{latitude:26.9,longitude:75.8},data:atmosphericData};
  const weather={current:{time},daily:{time:['2026-10-29'],precipitation_sum:[12.5],precipitation_probability_max:[75]}};
  const screening=buildAcidityIntelligence({location,farm,environment,weather,crop:'wheat'});
  check(screening.reliability==='screening' && screening.pHValue===null && screening.prediction===null, 'screening never manufactures a numerical pH estimate');
  check(screening.pollutants?.sulphur_dioxide.value===1 && screening.pollutants?.nitrogen_dioxide.value===2, 'SO₂ and NO₂ are kept as contextual atmospheric values only');
  check(screening.rain.amount===12.5 && screening.rain.probability===75 && screening.hasRainForecast, 'rainfall appears as separate forecast context, not chemistry');
  check(screening.crop==='wheat' && screening.reliability==='screening', 'crop guidance context does not alter measurement status or invent crop damage');
  check(buildAcidityIntelligence({location,farm,weather}).reliability==='unavailable', 'weather or rainfall alone cannot create an acidity screening result');

  const measured=buildAcidityIntelligence({location,farm,environment,weather,readings:[{value:5.2,date:'2026-10-28',method:'pH meter',recordType:'user-recorded',farmId:'farm-a'}]});
  check(measured.reliability==='measured' && measured.pHValue===5.2 && measured.prediction===null, 'user-entered pH is preserved and reported only as a measured record');
  check(buildAcidityIntelligence({location,farm,environment,weather,readings:[{value:4.2,date:'2026-10-28',recordType:'simulated',farmId:'farm-a'}]}).pHValue===null, 'simulated pH never leaks into live user-recorded measurements');
  const mismatch=buildAcidityIntelligence({location,farm:{...farm,latitude:27.1},environment,weather});
  check(mismatch.reliability==='unavailable' && mismatch.pollutants===null && mismatch.rain.amount===null, 'data from another farm/location is not presented as the active farm context');
  const noData=buildAcidityIntelligence({location,farm,environment:{...environment,data:{...atmosphericData,hourly:{time:[time],...Object.fromEntries(keys.map(key=>[key,[null]]))}}},weather});
  check(noData.reliability==='screening' && noData.pollutants && Object.values(noData.pollutants).every(row=>row.value===null) && noData.pHValue===null, 'empty pollutant arrays remain an unavailable screening, never zero or pH');

  const demo={simulated:true,pHReading:{value:4.2,date:'2026-10-29',source:'DEMO / SIMULATED DATA',recordType:'simulated'}};
  const demoSummary=buildAcidityIntelligence({location,farm,environment,weather,demo});
  check(demoSummary.reliability==='demonstration' && demoSummary.measurement===null && demoSummary.pHValue===null && demoSummary.demoReading.value===4.2, 'synthetic demo reading stays isolated from measured values');
  check(buildAcidityIntelligence({location,farm,environment,weather,demo:{simulated:true}}).reliability==='demonstration', 'all demo states are explicitly labelled even without synthetic pH');

  const root={innerHTML:'',dataset:{}};
  renderAcidityIntelligence(root,{location,farm,environment,weather},'en');
  check(root.innerHTML.includes('Rainwater acidity data unavailable') && root.innerHTML.includes('SO₂') && root.dataset.reliability==='screening', 'farmer panel explains unknown pH and exposes technical pollutant details separately');
  const hiRoot={innerHTML:'',dataset:{}};
  renderAcidityIntelligence(hiRoot,{location,farm,environment,weather},'hi');
  check(hiRoot.innerHTML.includes('बारिश के पानी') && hiRoot.innerHTML.includes('वायुमंडलीय') && hiRoot.dataset.reliability==='screening', 'acidity intelligence renderer supports Hindi');
  const escaped={innerHTML:'',dataset:{}};
  renderAcidityIntelligence(escaped,{location,farm,environment,weather,crop:'<img src=x onerror=alert(1)>'},'en');
  check(!escaped.innerHTML.includes('<img src=x') && escaped.innerHTML.includes('&lt;img'), 'farmer-provided labels are escaped in the acidity panel');
}
