import {readFile,writeFile} from 'node:fs/promises';
import {makeState,engine} from './harness.js';
import {interpretWeatherQuestion} from '../js/nlp.js';
import {analyzeQuestion} from '../js/assistant.js';
const cases=JSON.parse(await readFile(new URL('./additional-600-cases.json',import.meta.url),'utf8'));
export function auditNewQuestion(test,nlp=engine){
 const dry=test.group==='dry';
 const state=makeState({weather:test.group==='no-weather'?null:undefined,locationName:test.place||'Jaipur',hourlyFn:{precipitation_probability:i=>dry?0:i<24?7:i<48?73:19,temperature_2m:i=>i===43?41:22,apparent_temperature:i=>i===43?46:27,wind_speed_10m:i=>i>=24&&i<48?37:12,cloud_cover:i=>i===42?83:i===43?79:31,visibility:i=>i===43?8000:i===42?5000:10000,uv_index:i=>i===40?6:i===36?9:4}});
 if(state.weather){state.weather.daily.wind_speed_10m_max[1]=37;state.weather.daily.precipitation_probability_max[1]=dry?0:73;if(dry)state.weather.daily.precipitation_sum.fill(0);}
 const previous=test.group==='followup'?interpretWeatherQuestion('Will I need an umbrella today?',state,{engine:nlp}):null;
 const intent=interpretWeatherQuestion(test.question,state,{engine:nlp,previous});
 const answer=analyzeQuestion(test.question,state,intent);const failures=[];
 if(intent.place.query!==test.place)failures.push(`Place: expected ${test.place}, got ${intent.place.query}`);
 for(const pattern of test.requires)if(!new RegExp(pattern,'i').test(answer.text))failures.push('Missing answer evidence: '+pattern);
 if(/NaN|undefined|Infinity/.test(answer.text))failures.push('Invalid value');
 if(test.topic!=='help'&&test.topic!=='none'&&test.group!=='ph'&&(answer.supportMode||intent.clarification))failures.push('Supported question returned help/clarification');
 if(test.topic==='help'&&!answer.supportMode&&!intent.historical&&!intent.unsupportedDate&&test.group!=='water-quality')failures.push('Help/unsupported request answered as forecast');
 if(test.group==='no-weather'&&answer.metrics?.length)failures.push('Numeric metrics without data');
 if(answer.action)failures.push('Unrequested action');
 return {...test,actual:answer.text,actualTopic:intent.topic,helpKind:intent.helpKind,mode:answer.supportMode||'forecast',failures};
}
const rows=cases.map(test=>{const row=auditNewQuestion(test);const fallback=auditNewQuestion(test,null);row.withoutNlpPassed=!fallback.failures.length;row.failures.push(...fallback.failures.map(x=>'Without NLP: '+x));return row;});
const failed=rows.filter(x=>x.failures.length);const groups={};for(const row of rows){groups[row.group]??={passed:0,failed:0};groups[row.group][row.failures.length?'failed':'passed']++;}
await writeFile(new URL('../docs/ADDITIONAL-600-RESULTS.json',import.meta.url),JSON.stringify({total:rows.length,passed:rows.length-failed.length,failed:failed.length,groups,rows},null,2));
console.log(`${rows.length-failed.length} passed, ${failed.length} failed`);for(const f of failed)console.log(`${f.id} ${f.failures.slice(0,3).join('; ')} | ${f.question} | ${f.actual.slice(0,120)}`);
if(failed.length)process.exitCode=1;
