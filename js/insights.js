import { umbrellaAdvice } from './rain-advice.js';
import { temp, wind, number, present, currentHourIndex, localHour, condition } from './weather.js';

// Evidence selection and bounded arithmetic are separate from question parsing and UI.
export function periodEvidence(intent,data) {
  if(!data||!intent.period)return null;
  const date=data.daily.time[intent.dayOffset];
  if(!date)return null;
  const h=data.hourly,start=currentHourIndex(data);
  const indexes=h.time.map((time,index)=>({time,index,hour:Number(time.slice(11,13))})).filter(v=>v.time.startsWith(date)&&v.hour>=intent.period.start&&v.hour<intent.period.end&&(intent.dayOffset>0||v.index>=start)).map(v=>v.index);
  if(!indexes.length)return null;
  const valid=field=>indexes.map(i=>h[field]?.[i]).filter(present);
  const temperatures=valid('temperature_2m'),probabilities=valid('precipitation_probability'),winds=valid('wind_speed_10m');
  if(!temperatures.length||!probabilities.length)return null;
  return {indexes,date,min:Math.min(...temperatures),max:Math.max(...temperatures),peak:Math.max(...probabilities),maxWind:winds.length?Math.max(...winds):null,complete:temperatures.length===indexes.length&&probabilities.length===indexes.length};
}
const dayWord=(offset,hi)=>hi?['आज','कल','परसों'][offset]:['Today','Tomorrow','The day after tomorrow'][offset];
export function periodInsight(intent,state) {
  const hi=intent.language==='hi',evidence=periodEvidence(intent,state.weather);
  if(!evidence)return {text:hi?'इस समय अवधि का पर्याप्त पूर्वानुमान उपलब्ध नहीं है। आज की अवधि बीत चुकी हो सकती है। कृपया कल का समय पूछें या दोबारा प्रयास करें।':'There isn’t enough forecast data for that time window. Today’s window may already have passed. Try tomorrow or another time.',metrics:[],language:intent.language};
  const{weather:data,location,prefs}=state,{peak,min,max,maxWind,indexes}=evidence;
  const day=(intent.dayOffset<=2?dayWord(intent.dayOffset,hi):intent.date)||state.weather.daily.time[intent.dayOffset],period=intent.period;
  const rainAdvice=umbrellaAdvice(peak,intent.language,evidence.complete);
  const windowLabel=`${day} · ${period.label}`;
  const body=hi?`${location.name} में ${day} ${period.label} के दौरान, उपलब्ध घंटों में बारिश की सबसे अधिक संभावना ${number(peak)}% है। तापमान लगभग ${temp(min,prefs,true)} से ${temp(max,prefs,true)} के बीच रहने का पूर्वानुमान है। ${rainAdvice}`:`In ${location.name}, ${day.toLowerCase()} between ${period.label}, the peak hourly precipitation chance is ${number(peak)}%. Temperatures are forecast between ${temp(min,prefs,true)} and ${temp(max,prefs,true)}.${intent.topic==='rain'?' '+rainAdvice:''}`;
  const windLead=intent.topic==='wind'?(hi?`इस अवधि में अधिकतम हवा ${present(maxWind)?wind(maxWind,prefs):'अनुपलब्ध'} है। `:`The maximum forecast wind in this period is ${present(maxWind)?wind(maxWind,prefs):'unavailable'}. `):'';
  const text=windLead+(intent.topic==='rain'?rainAdvice+' ':'')+body.replace(' '+rainAdvice,'')+(evidence.complete?'':hi?' कुछ घंटों के आँकड़े अधूरे हैं।':' Some hourly values are missing.');
  return {
    text,language:intent.language,scope:[location.name,windowLabel],
    metrics:[{label:hi?'अधिकतम प्रति-घंटा संभावना':'Peak hourly rain chance',value:`${number(peak)}%`},{label:hi?'तापमान की सीमा':'Temperature range',value:`${temp(min,prefs)}–${temp(max,prefs)}`},{label:hi?'अधिकतम हवा':'Max forecast wind',value:wind(maxWind,prefs)}],
    timeline:indexes.map(i=>({time:localHour(data.hourly.time[i],true),temperature:temp(data.hourly.temperature_2m[i],prefs),probability:present(data.hourly.precipitation_probability[i])?Number(data.hourly.precipitation_probability[i]):null,icon:condition(data.hourly.weather_code[i]).icon})),
    note:hi?'प्रतिशत हर अलग घंटे के लिए है, पूरी अवधि की संयुक्त संभावना नहीं। आधिकारिक चेतावनी फ़ीड जुड़ी नहीं है; IMD या SACHET से जाँचें।':'Percentages apply to individual forecast hours, not the probability for the entire window. Official warning status is unavailable here; check IMD or SACHET.'
  };
}
const hindiConditions={sun:'आसमान साफ',moon:'आसमान साफ','sun-cloud':'आंशिक बादल',cloud:'बादल','cloud-rain':'बारिश',storm:'गरज वाला मौसम',snow:'बर्फबारी',fog:'कोहरा'};
export function hindiInsight(intent,state) {
  const{weather:data,location,prefs}=state;
  const output=(text,metrics=[])=>({text,metrics,language:'hi'});
  if(!data)return output('इस स्थान का मौसम डेटा अभी उपलब्ध नहीं है। मौसम सेवा पर दोबारा प्रयास करें या दूसरा स्थान चुनें। बिना डेटा के मैं पूर्वानुमान नहीं बताऊँगा।');
  if(intent.unsupportedDate)return output('यह प्रोटोटाइप वर्तमान मौसम और अगले 7 दिनों का पूर्वानुमान दिखाता है। ऐतिहासिक मौसम या लंबे समय के जलवायु आँकड़े अभी जुड़े नहीं हैं। आज, कल या परसों के बारे में पूछें।');
  const{current:c,daily:d,hourly:h}=data,day=intent.dayOffset,dayName=dayWord(day,true)||intent.date||d.time[day];
  if(intent.topic==='comparison'){
    if(!present(d.temperature_2m_max[0])||!present(d.temperature_2m_max[1]))return output('तुलना के लिए दोनों दिनों का अधिकतम तापमान उपलब्ध होना आवश्यक है। अभी कुछ डेटा अधूरा है।');
    const diff=d.temperature_2m_max[1]-d.temperature_2m_max[0],delta=Math.abs(diff)*(prefs.temperature==='fahrenheit'?1.8:1);
    return output(`${location.name} में कल का अधिकतम तापमान ${temp(d.temperature_2m_max[1],prefs,true)} है। यह आज की तुलना में ${Math.abs(diff)<.5?'लगभग समान':`${number(delta,1)}° ${diff>0?'अधिक':'कम'}`} है। यह दैनिक अधिकतम तापमान की तुलना है, हर घंटे की नहीं।`,[{label:'आज का अधिकतम',value:temp(d.temperature_2m_max[0],prefs)},{label:'कल का अधिकतम',value:temp(d.temperature_2m_max[1],prefs)},{label:'कल का न्यूनतम',value:temp(d.temperature_2m_min[1],prefs)}]);
  }
  if(intent.topic==='alerts')return output('आधिकारिक चेतावनियों की फ़ीड इस प्रोटोटाइप से जुड़ी नहीं है। मैं यह पुष्टि नहीं कर सकता कि कोई चेतावनी सक्रिय है या नहीं, या कोई तूफान पास आ रहा है। IMD या SACHET पर जाँचें। ऐप में दिखाई जाने वाली सलाह पूर्वानुमान से निकली है; वह आधिकारिक चेतावनी नहीं है।');
  if(intent.clock){
    if(intent.clock.invalid)return output('कृपया समय स्पष्ट करें, जैसे “कल शाम 7 बजे” या “कल सुबह 9 बजे”।');
    const i=h.time.findIndex(time=>time===`${d.time[day]}T${String(intent.clock.hour).padStart(2,'0')}:00`);
    if(i<0)return output('उस घंटे का पूर्वानुमान उपलब्ध नहीं है। कृपया दूसरा समय चुनें।');
    return output(`${location.name} में ${dayName} ${localHour(h.time[i])} पर तापमान लगभग ${temp(h.temperature_2m[i],prefs,true)}, बारिश की संभावना ${number(h.precipitation_probability[i])}% और हवा ${wind(h.wind_speed_10m[i],prefs)} रहने का पूर्वानुमान है।${intent.clock.minute?' उपलब्ध डेटा प्रति-घंटा है; घंटे की शुरुआत के मान दिए गए हैं।':''}${i<currentHourIndex(data)?' यह समय बीत चुका है; मान मॉडल के अनुमान हैं, स्टेशन के माप नहीं।':''}`,[{label:'तापमान',value:temp(h.temperature_2m[i],prefs)},{label:'बारिश की संभावना',value:`${number(h.precipitation_probability[i])}%`},{label:'हवा',value:wind(h.wind_speed_10m[i],prefs)}]);
  }
  if(intent.period)return periodInsight(intent,state);
  if(intent.topic==='feels')return output(`${location.name} में तापमान ${temp(c.temperature_2m,prefs,true)} है, लेकिन महसूस होने वाला तापमान ${temp(c.apparent_temperature,prefs,true)} है। नमी ${number(c.relative_humidity_2m)}% है। अधिक नमी में पसीना धीरे सूखता है, जिससे गर्मी अधिक महसूस हो सकती है। हवा और धूप भी इस अनुमान को प्रभावित करते हैं।`,[{label:'तापमान',value:temp(c.temperature_2m,prefs)},{label:'महसूस होता है',value:temp(c.apparent_temperature,prefs)},{label:'नमी',value:`${number(c.relative_humidity_2m)}%`}]);
  if(intent.topic==='rain'){
    const hours=h.time.map((t,i)=>({t,i})).filter(v=>v.t.startsWith(d.time[day])&&(day>0||v.i>=currentHourIndex(data))&&present(h.precipitation_probability[v.i]));
    if(!hours.length)return output('चुनी हुई अवधि के लिए बारिश की संभावना उपलब्ध नहीं है। कृपया कल के बारे में पूछें या मौसम सेवा दोबारा लोड करें।');
    const best=hours.reduce((a,b)=>h.precipitation_probability[a.i]>=h.precipitation_probability[b.i]?a:b),peak=h.precipitation_probability[best.i];
    return output(`${umbrellaAdvice(peak,'hi',hours.length===h.time.filter((t,i)=>t.startsWith(d.time[day])&&(day>0||i>=currentHourIndex(data))).length)} ${location.name} में ${dayName}, उपलब्ध घंटों में बारिश की सबसे अधिक संभावना ${number(peak)}% है, लगभग ${localHour(best.t)} पर। पूरे दिन के कुल वर्षण का पूर्वानुमान ${number(d.precipitation_sum[day],1)} mm है। निकलने से पहले फिर जाँच लें।`,[{label:'प्रति-घंटा अधिकतम संभावना',value:`${number(peak)}%`},{label:'उस समय तापमान',value:temp(h.temperature_2m[best.i],prefs)},{label:'दैनिक कुल वर्षण',value:`${number(d.precipitation_sum[day],1)} mm`}]);
  }
  if(intent.topic==='wind')return output(`${location.name} में ${dayName} हवा की अधिकतम गति लगभग ${wind(d.wind_speed_10m_max[day],prefs)} और झोंके ${wind(d.wind_gusts_10m_max[day],prefs)} तक रहने का पूर्वानुमान है। झोंके थोड़ी देर की तेज़ हवा होते हैं, लगातार गति नहीं।`,[{label:'अधिकतम हवा',value:wind(d.wind_speed_10m_max[day],prefs)},{label:'अधिकतम झोंके',value:wind(d.wind_gusts_10m_max[day],prefs)}]);
  if(intent.topic==='sun')return output(`${location.name} में ${dayName} सूर्योदय ${localHour(d.sunrise[day])} और सूर्यास्त ${localHour(d.sunset[day])} पर है। ये उस स्थान के स्थानीय समय हैं।`);
  if(intent.topic==='weather')return output(`${location.name} में ${dayName} ${hindiConditions[condition(d.weather_code[day]).icon]||'मौसम बदलने'} का पूर्वानुमान है। तापमान ${temp(d.temperature_2m_min[day],prefs,true)} से ${temp(d.temperature_2m_max[day],prefs,true)} के बीच रहेगा। दिन की अधिकतम प्रति-घंटा वर्षण संभावना ${number(d.precipitation_probability_max[day])}% है।`,[{label:'अधिकतम तापमान',value:temp(d.temperature_2m_max[day],prefs)},{label:'न्यूनतम तापमान',value:temp(d.temperature_2m_min[day],prefs)},{label:'अधिकतम वर्षण संभावना',value:`${number(d.precipitation_probability_max[day])}%`}]);
  return output('मैं सीमित प्रकार के मौसम प्रश्न समझता हूँ, सामान्य AI की तरह हर प्रश्न नहीं। उदाहरण: “कल जयपुर में बारिश होगी?”, “कल शाम का मौसम कैसा होगा?” या “क्या कल आज से अधिक गर्म होगा?” स्थान के लिए ऊपर की खोज का भी उपयोग कर सकते हैं।');
}
