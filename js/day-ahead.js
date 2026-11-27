import { currentHourIndex, present, temp, wind, number, localHour } from './weather.js';
import { icon, escapeHTML } from './icons.js';

// Summarize only the available provider hours. Missing hours are never dry hours.
export function nextHours(weather, count=12) {
  if (!weather?.hourly?.time?.length) return [];
  const h=weather.hourly,start=currentHourIndex(weather);
  return ['precipitation_probability','temperature_2m','wind_speed_10m'].map(field=>{
    const points=Array.from({length:Math.min(count,h.time.length-start)},(_,j)=>start+j)
      .filter(i=>typeof h[field]?.[i]==='number' && present(h[field][i])).map(i=>({value:h[field][i],time:h.time[i]}));
    const peak=points.reduce((a,b)=>!a||b.value>a.value?b:a,null);
    return {field,peak,available:points.length,expected:count};
  });
}

export function renderDayAhead(state) {
  const root=document.getElementById('day-ahead');if(!root)return;
  const hi=state.prefs.language==='hi';
  root.setAttribute('aria-label',hi?'अगले 12 घंटे':'Next 12 hours');
  const results=nextHours(state.weather);
  const definitions=[
    ['rain','umbrella',hi?'बारिश की अधिकतम संभावना':'Peak rain chance',r=>`${number(r.value)}%`],
    ['temperature','thermometer',hi?'सबसे गर्म घंटा':'Warmest hour',r=>temp(r.value,state.prefs,true)],
    ['wind','wind',hi?'सबसे तेज़ हवा':'Strongest wind',r=>wind(r.value,state.prefs)]
  ];
  root.innerHTML=`<header><span class="day-ahead-symbol">${icon('clock')}</span><div><h2>${hi?'अगले 12 घंटे':'Your next 12 hours'}</h2><p>${hi?'चुने स्थान का पूर्वानुमान':'A quick look before you head out'}</p></div></header><div class="day-ahead-facts">${definitions.map(([metric,symbol,label,format],i)=>{
    const result=results[i],peak=result?.peak;
    const when=peak?localHour(peak.time):hi?'डेटा उपलब्ध नहीं':'Data unavailable';
    const partial=result?.available<12?(hi?` · ${result.available}/12 घंटे`:` · ${result.available}/12 hours`):'';
    return `<a href="#forecast" class="ahead-fact" data-ahead-metric="${metric}"><span class="ahead-icon">${icon(symbol)}</span><span class="ahead-reading"><span>${label}</span><strong>${escapeHTML(peak?format(peak):'—')}</strong><small>${escapeHTML(when+partial)}</small></span>${icon('arrow-up-right')}</a>`;
  }).join('')}</div>`;
  root.querySelectorAll('[data-ahead-metric]').forEach(link=>link.addEventListener('click',()=>{
    document.querySelector('[data-period="hourly"]')?.click();
    document.querySelector(`[data-metric="${link.dataset.aheadMetric}"]`)?.click();
  }));
}
