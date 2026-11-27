import {readFile,writeFile} from 'node:fs/promises';
import {makeState,engine} from './harness.js';
import {interpretWeatherQuestion} from '../js/nlp.js';
import {analyzeQuestion} from '../js/assistant.js';
const questions=(await readFile(new URL('./everyday-language.txt',import.meta.url),'utf8')).trim().split(/\r?\n/).map(line=>{const [topic,when,language,q]=line.split('|');return {topic,when,language,q};});
if(questions.length!==100)throw Error('Expected 100 authored questions, got '+questions.length);
const rows=[];
for(const [qi,test] of questions.entries())for(let scenario=0;scenario<100;scenario++){
 const missing=scenario%10===9, rain=scenario;
 const state=makeState({language:test.language,weather:missing?null:undefined,hourlyValues:{precipitation_probability:rain},dailyValues:{precipitation_probability_max:rain}});
 const intent=interpretWeatherQuestion(test.q,state,{engine});const a=analyzeQuestion(test.q,state,intent);const failures=[];
 if(intent.place.query)failures.push('invented place '+intent.place.query);
 if(intent.topic!==(test.topic==='ph'?'acidity':test.topic)&&!(test.topic==='ph'&&intent.helpKind))failures.push('wrong topic '+intent.topic);
 if(intent.dayOffset!==({today:0,tomorrow:1,after:2}[test.when]))failures.push('wrong day');
 if(test.language==='hi'&&!/[\u0900-\u097f]/.test(a.text))failures.push('Hindi reply missing');
 if(/NaN|undefined|Infinity/.test(a.text))failures.push('invalid value');
 if(intent.clarification)failures.push('ordinary question not understood');
 if(missing&&a.metrics?.length)failures.push('values invented without weather');
 if(test.topic==='rain'&&!missing&&!a.text.includes(rain+'%'))failures.push('wrong rain evidence');
 if(test.topic==='crop'&&!missing&&!/crop|field|फसल|खेत/i.test(a.text))failures.push('missing crop advice');
 if(test.topic==='ph'&&a.metrics?.length)failures.push('pH invented');
 rows.push({id:rows.length+1,questionId:qi+1,...test,scenario,missing,rain,actual:a.text,failures});
}
const failed=rows.filter(x=>x.failures.length);await writeFile(new URL('../docs/EVERYDAY-10000-RESULTS.json',import.meta.url),JSON.stringify({uniqueQuestions:questions.length,total:rows.length,passed:rows.length-failed.length,failed:failed.length,rows},null,2));
console.log(`${rows.length-failed.length} passed, ${failed.length} failed; ${questions.length} distinct questions`);
for(const id of [...new Set(failed.map(x=>x.questionId))]){const r=failed.find(x=>x.questionId===id);console.log(JSON.stringify({id,q:r.q,failures:r.failures,answer:r.actual.slice(0,140)}));}
if(failed.length)process.exitCode=1;
