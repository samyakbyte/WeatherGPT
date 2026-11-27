import {classifyPH,validateReading} from '../js/acidity.js';
let passed=0;
for(const value of [null,undefined,'',' ','\n',true,false,[],[5],{},'0x5','5ppm','NaN',NaN,Infinity,-1,15]){
 if(classifyPH(value).band!=='unavailable'||validateReading({value,date:'2026-09-15'}))throw Error('Invalid pH accepted: '+String(value));passed++;
}
for(const value of [0,'0',4,5,5.6,7,14,' 6.2 ']){
 if(classifyPH(value).band==='unavailable'||!validateReading({value,date:'2026-09-15'}))throw Error('Valid pH rejected');passed++;
}
console.log(`${passed} pH boundary checks passed`);
