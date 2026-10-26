import { temp, wind, number, present, currentHourIndex, localHour, condition } from './weather.js';

// Extra NLP topics use only provider fields. Missing values never become zeros.
export function metricInsight(intent,state) {
  const data=state.weather,hi=intent.language==='hi',day=intent.dayOffset,date=data.daily.time[day];
  const h=data.hourly,c=data.current,prefs=state.prefs;
  const result=(text,metrics=[])=>({text,metrics,language:intent.language});
  const current=/\b(?:now|currently|current|right now)\b/.test(intent.normalized);
  const fields={humidity:['relative_humidity_2m','Relative humidity','नमी','%'],clouds:['cloud_cover','Cloud cover','बादल','%'],uv:['uv_index','UV index','UV सूचकांक',''],visibility:['visibility','Visibility','दृश्यता','km']};
  if(intent.topic==='pressure'){
    if(day>0||intent.period||intent.clock)return result(hi?'हवा के दबाव का भविष्य का पूर्वानुमान इस ऐप में लोड नहीं है। “Pressure now” से वर्तमान मॉडल मान देखें।':'This app loads current sea-level pressure, not its hourly forecast. Ask “Pressure now” for the available model estimate.');
    return result(hi?`${state.location.name} में वर्तमान मॉडल के अनुसार समुद्र-तल दबाव ${number(c.pressure_msl)} hPa है।`:`The current model estimate for sea-level pressure in ${state.location.name} is ${number(c.pressure_msl)} hPa.`,[{label:hi?'समुद्र-तल दबाव':'Sea-level pressure',value:`${number(c.pressure_msl)} hPa`}]);
  }
  const [field,label,hindiLabel,unit]=fields[intent.topic]||[];
  if(!field)return null;
  let indexes;
  if(current&&!day&&!intent.period&&!intent.clock)indexes=[currentHourIndex(data)];
  else indexes=h.time.map((t,i)=>({t,i,hour:Number(t.slice(11,13))})).filter(v=>v.t.startsWith(date)&&(!intent.clock||v.hour===intent.clock.hour)&&(!intent.period||v.hour>=intent.period.start&&v.hour<intent.period.end)).map(v=>v.i);
  const values=indexes.map(i=>h[field]?.[i]).filter(present).map(v=>intent.topic==='visibility'?v/1000:v);
  if(!values.length)return result(hi?'इस अवधि के लिए यह मान उपलब्ध नहीं है। कृपया दूसरा समय चुनें।':'This metric is unavailable for the requested period. Try another time.');
  const min=Math.min(...values),max=Math.max(...values),digits=['humidity','clouds'].includes(intent.topic)?0:1;
  const value=min===max?`${number(min,digits)}${unit?` ${unit}`:''}`:`${number(min,digits)}–${number(max,digits)}${unit?` ${unit}`:''}`;
  const scope=`${intent.dateLabel} · ${current&&!day?'Current hour':intent.timeLabel}`;
  return {...result(hi?`${state.location.name}: ${scope} के लिए ${hindiLabel} ${value} है। ये उपलब्ध मॉडल घंटों के मान हैं।`:`For ${state.location.name}, ${label.toLowerCase()} is ${value} across the available model hours for ${scope.toLowerCase()}.`,[{label:hi?hindiLabel:label,value}]),scope:[state.location.name,scope],note:values.length<indexes.length?(hi?'कुछ मान उपलब्ध नहीं हैं।':'Some values in this period are unavailable.'):undefined};
}
export function currentInsight(intent,state) {
  const hi=intent.language==='hi',{current:c}=state.weather,p=state.prefs;
  return {language:intent.language,text:hi?`${state.location.name} में वर्तमान मॉडल तापमान ${temp(c.temperature_2m,p,true)}, महसूस होने वाला तापमान ${temp(c.apparent_temperature,p,true)} और हवा ${wind(c.wind_speed_10m,p)} है। ये स्टेशन के प्रत्यक्ष माप नहीं, मॉडल अनुमान हैं।`:`Right now in ${state.location.name}, the model estimates ${temp(c.temperature_2m,p,true)} with ${condition(c.weather_code,!!c.is_day).label.toLowerCase()}. It feels like ${temp(c.apparent_temperature,p,true)}, with wind around ${wind(c.wind_speed_10m,p)}. These are model estimates, not station observations.`,metrics:[{label:hi?'तापमान':'Temperature',value:temp(c.temperature_2m,p,true)},{label:hi?'महसूस होता है':'Feels like',value:temp(c.apparent_temperature,p,true)},{label:hi?'हवा':'Wind',value:wind(c.wind_speed_10m,p)}]};
}
