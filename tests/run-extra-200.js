import {readFile,writeFile} from 'node:fs/promises';
import {makeState,engine} from './harness.js';
import {interpretWeatherQuestion} from '../js/nlp.js';
import {analyzeQuestion} from '../js/assistant.js';
const cases=JSON.parse(await readFile(new URL('./extra-200.json',import.meta.url),'utf8'));
const rows=[];
for (const test of cases) {
 const dry=test.group==='dry-forecast';
 const state=makeState({weather:test.group==='missing-weather'?null:undefined,locationName:test.place||'Jaipur',hourlyFn:{precipitation_probability:i=>dry?0:i<24?7:i<48?73:19,temperature_2m:i=>i===43?41:22,apparent_temperature:i=>i===43?46:27,wind_speed_10m:i=>i>=24&&i<48?37:12,cloud_cover:i=>i===42?83:i===43?79:31,visibility:i=>i===43?8000:i===42?5000:10000,uv_index:i=>i===40?6:i===36?9:4}});
 if(state.weather){state.weather.daily.wind_speed_10m_max[1]=37;if(dry)state.weather.daily.precipitation_sum.fill(0);}
 const previous=test.group==='followups'?interpretWeatherQuestion('Will I need an umbrella today?',state,{engine}):null;
 const intent=interpretWeatherQuestion(test.question,state,{engine,previous});
 const answer=analyzeQuestion(test.question,state,intent);const failures=[];
 if(intent.place.query!==test.place)failures.push(`Place: expected ${test.place}, got ${intent.place.query}`);
 for(const pattern of test.requires)if(!new RegExp(pattern,'i').test(answer.text))failures.push('Missing answer evidence: '+pattern);
 if(/NaN|undefined|Infinity/.test(answer.text))failures.push('Invalid value');
 if(test.group==='missing-weather'&&answer.metrics?.length)failures.push('Numeric metrics without data');
 if(test.group==='radar-help'&&answer.action)failures.push('Unrequested radar action');
 rows.push({...test,actual:answer.text,topic:intent.topic,failures});
}
const failed=rows.filter(x=>x.failures.length);
await writeFile(new URL('../docs/EXTRA-200-RESULTS.json',import.meta.url),JSON.stringify({total:rows.length,passed:rows.length-failed.length,failed:failed.length,rows},null,2));
console.log(`${rows.length-failed.length} passed, ${failed.length} failed`);for(const f of failed)console.log(`${f.id} ${f.failures.join('; ')} | ${f.question} | ${f.actual.slice(0,75)}`);
if(failed.length)process.exitCode=1;
