import {readFile,writeFile} from 'node:fs/promises';
import {makeState,engine} from './harness.js';
import {interpretWeatherQuestion} from '../js/nlp.js';
import {analyzeQuestion} from '../js/assistant.js';
const normalize=s=>s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,'').trim();
const prior=new Set();
for(const name of ['assistant-1000-cases','diverse-1000-cases','extra-200','new-1000-cases','additional-600-cases'])for(const row of JSON.parse(await readFile(new URL(`./${name}.json`,import.meta.url),'utf8')))prior.add(normalize(row.question||row.q));
const subjects=[['temperature','temperature_2m'],['apparent temperature','apparent_temperature'],['relative humidity','relative_humidity_2m'],['cloud cover','cloud_cover'],['UV index','uv_index'],['visibility','visibility'],['sea-level pressure',null],['rainwater pH',null]];
const templates=['For {t}, give {m} with the available evidence.','I am choosing when to leave. Read {m} for {t}.','My outdoor lesson needs a {m} check for {t}.','Use this location and report {m} for {t}.','Before my journey, tell me the {m} value for {t}.'];
const rows=[],seen=new Set();
for(let day=1;day<=5;day++)for(let hour=0;hour<20;hour++)for(const [subject,field] of subjects)for(let variant=0;variant<5;variant++){
 const date=`2026-09-${15+day}`,time=`${date} at ${String(hour).padStart(2,'0')}:00`;
 const q=templates[variant].replace('{m}',subject).replace('{t}',time);
 const normalized=normalize(q);if(prior.has(normalized)||seen.has(normalized))throw Error('Duplicate '+q);seen.add(normalized);
 const index=day*24+hour,missing=(day*20+hour+variant)%7===0;
 const expected=field==='visibility'?(1000+(hour*500)):field==='uv_index'?(hour%12):field?.includes('temperature')?hour-7:hour*4;
 const state=makeState();if(field)state.weather.hourly[field]=state.weather.hourly.time.map((_,i)=>i===index?(missing?null:expected):field==='visibility'?25000:91);
 // Neighbouring hours intentionally differ. No interpolation may supply a missing target.
 const results=[];
 for(const nlp of [engine,null]){
  const intent=interpretWeatherQuestion(q,state,{engine:nlp});const a=analyzeQuestion(q,state,intent);const failures=[];
  if(intent.place.query)failures.push('invented place '+intent.place.query);
  if(a.action)failures.push('unexpected action');
  if(/NaN|undefined|Infinity/.test(a.text))failures.push('invalid number');
  if(field){
   if(intent.date!==date||intent.clock?.hour!==hour)failures.push('wrong date/hour');
   if(missing){if(!/unavailable|missing/i.test(a.text)||a.metrics?.length)failures.push('missing target replaced or concealed');}
   else {const metric=a.metrics?.[0]?.value||'';const value=field==='visibility'?expected/1000:expected;const parsed=Number(metric.replace(/,/g,'').match(/-?\d+(?:\.\d+)?/)?.[0]);if(parsed!==value)failures.push(`expected ${value}, metric ${metric}`);}
  }else if(subject==='sea-level pressure'){if(a.metrics?.length||!/current|hourly|available/i.test(a.text))failures.push('future pressure invented');}
  else if(a.metrics?.length||!(/pH|acidity/i.test(a.text)&&/unavailable|not connected|no current/i.test(a.text)))failures.push('pH availability not explained');
  results.push({text:a.text,failures});
 }
 rows.push({id:rows.length+1,question:q,subject,date,hour,missing:field?missing:null,expected:field&&!missing?expected:null,actual:results[0].text,failures:results.flatMap((r,i)=>r.failures.map(f=>(i?'without NLP: ':'')+f))});
}
const failed=rows.filter(r=>r.failures.length);
await writeFile(new URL('../docs/HARD-4000-RESULTS.json',import.meta.url),JSON.stringify({total:rows.length,passed:rows.length-failed.length,failed:failed.length,rows},null,2));
console.log(`${rows.length-failed.length} passed, ${failed.length} failed`);
for(const row of failed.slice(0,30))console.log(JSON.stringify(row));
if(failed.length)process.exitCode=1;
