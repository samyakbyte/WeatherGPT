import {readFile,writeFile} from 'node:fs/promises';
import {makeState,engine} from './harness.js';
import {auditQuestion} from './diverse-audit.js';
const cases=JSON.parse(await readFile(new URL('./diverse-1000-cases.json',import.meta.url),'utf8'));
const rows=cases.map(test=>{const state=makeState({weather:test.noForecast?null:undefined,locationName:test.place||'Jaipur'});const row=auditQuestion(test,state,engine);const fallback=auditQuestion(test,state,null);row.withoutNlpPassed=fallback.passed;if(!fallback.passed){row.passed=false;row.failures.push(...fallback.failures.map(x=>'without NLP: '+x));}return row;});
const failed=rows.filter(x=>!x.passed);const groups={};for(const row of rows){groups[row.group]??={passed:0,failed:0};groups[row.group][row.passed?'passed':'failed']++;}
await writeFile(new URL('../docs/DIVERSE-1000-RESULTS.json',import.meta.url),JSON.stringify({total:rows.length,passed:rows.length-failed.length,failed:failed.length,groups,results:rows},null,2));
console.log(JSON.stringify({total:rows.length,passed:rows.length-failed.length,failed:failed.length},null,2));
for(const row of failed.slice(0,15))console.log(row.question+' :: '+row.failures.join('; '));
if(failed.length)process.exitCode=1;
