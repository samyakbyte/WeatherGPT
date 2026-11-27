import {readFile,writeFile} from 'node:fs/promises';
import {makeState,engine} from './harness.js';
import {interpretWeatherQuestion} from '../js/nlp.js';
import {analyzeQuestion} from '../js/assistant.js';
const cases=JSON.parse(await readFile(new URL('./natural-10000-cases.json',import.meta.url),'utf8')),rows=[];
for(const test of cases){
 const state=makeState({language:test.language,locationName:test.place,hourlyValues:{precipitation_probability:73},dailyValues:{precipitation_probability_max:73}});
 const intent=interpretWeatherQuestion(test.question,state,{engine});const a=analyzeQuestion(test.question,state,intent);const failures=[];
 if(intent.place.query!==test.place && !(intent.helpKind&&intent.place.query===null))failures.push('place '+intent.place.query);
 if(intent.dayOffset!==test.day)failures.push('day '+intent.dayOffset);
 if(test.topic!=='ph'&&intent.topic!==test.topic)failures.push('topic '+intent.topic);
 if(intent.clarification)failures.push('clarification');
 if(test.language==='hi'&&!/[\u0900-\u097f]/.test(a.text))failures.push('language');
 if(test.topic==='rain'&&!a.text.includes('73%'))failures.push('rain answer');
 if(test.topic==='ph'&&a.metrics?.length)failures.push('invented pH');
 if(/NaN|undefined|Infinity/.test(a.text))failures.push('invalid value');
 rows.push({...test,actual:a.text,failures});
}
const failed=rows.filter(x=>x.failures.length);await writeFile(new URL('../docs/NATURAL-10000-RESULTS.json',import.meta.url),JSON.stringify({total:rows.length,passed:rows.length-failed.length,failed:failed.length,rows},null,2));
console.log(`${rows.length-failed.length} passed, ${failed.length} failed`);
const keys=new Set();for(const r of failed){const k=r.baseQuestionId+':'+r.failures.join();if(keys.has(k))continue;keys.add(k);if(keys.size<35)console.log(JSON.stringify(r));}
if(failed.length)process.exitCode=1;
