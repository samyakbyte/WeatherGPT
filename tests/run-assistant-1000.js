import {readFile,writeFile} from 'node:fs/promises';
import {makeState,engine} from './harness.js';
import {evaluateStatement} from './assistant-matrix.js';
const cases=JSON.parse(await readFile(new URL('./assistant-1000-cases.json',import.meta.url),'utf8'));
const results=[];
for(const test of cases){
 const state=makeState({locationName:test.place||'Jaipur'});
 const row=evaluateStatement(test,state,engine);
 const fallback=evaluateStatement(test,state,null);
 row.withoutNlpPassed=fallback.passed;
 if(!fallback.passed){row.passed=false;row.failures.push(...fallback.failures.map(x=>'without NLP: '+x));}
 results.push(row);
}
const failures=results.filter(x=>!x.passed);
const report={total:results.length,passed:results.length-failures.length,failed:failures.length,results};
await writeFile(new URL('../docs/ASSISTANT-1000-RESULTS.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({total:report.total,passed:report.passed,failed:report.failed}));
for(const row of failures.slice(0,25))console.log(row.question+' :: '+row.failures.join('; '));
if(failures.length)process.exitCode=1;
