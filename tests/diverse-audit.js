import { interpretWeatherQuestion } from '../js/nlp.js';
import { analyzeQuestion } from '../js/assistant.js';
const needsBoundary=new Set(['health-limits','pest-limits','forecast-limits','historical','unrelated','actions-limits']);
const needsExplanation=new Set(['definitions','uncertainty','ph-recording','preferences','farm-management','missing-data']);
const terms={rain:/umbrella|rain|precipitation|poncho/i,current:/weather|conditions|temperature|°/i,temperature:/temperature|°/i,feels:/feels|apparent|°/i,humidity:/humidity|humid|%/i,wind:/wind|gust|mph|km.h/i,clouds:/cloud|overcast|%/i,uv:/UV/i,visibility:/visibility|fog|km/i,sun:/sunrise|sunset|daylight/i,pressure:/pressure|hPa/i,outdoor:/walk|outdoor|window|picnic|forecast/i};
export function auditQuestion(test,state,engine){
 const previous=test.previous?interpretWeatherQuestion(test.previous,state,{engine}):null;
 const intent=interpretWeatherQuestion(test.q,state,{engine,previous});
 const response=analyzeQuestion(test.q,state,intent);const text=response.text||'';
 const failures=[];const mode=response.supportMode||(intent.clarification?'clarify':'forecast');
 if(!text||/NaN|undefined|Infinity/.test(text))failures.push('missing or invalid answer');
 if(intent.place.query!==test.place && !(test.group==='named-places'&&test.index>=20&&intent.clarification))failures.push('unsolicited or incorrect location: '+intent.place.query);
 if(test.topic && !['limit','explain','clarify'].includes(mode)&&intent.topic!==test.topic)failures.push('wrong weather topic: '+intent.topic);
 if(test.topic && /could not identify a supported weather question/i.test(text))failures.push('routine forecast question not understood');
 if(test.topic && !terms[test.group].test(text))failures.push('answer does not address requested subject');
 if(needsBoundary.has(test.group)&&!['limit','clarify','explain'].includes(mode))failures.push('unsupported capability treated as forecast');
 if(needsExplanation.has(test.group)&&mode==='forecast')failures.push('instruction/explanation request treated as forecast');
 if(test.group.startsWith('ph-')&&!/pH|acidity/i.test(text))failures.push('pH answer lacks subject');
 if(['crop-general','spraying','irrigation','harvesting','sowing'].includes(test.group)&&!/crop|field|farm|soil|spray|irrigat|harvest|sow|wheat|rice/i.test(text))failures.push('agricultural question lacks agricultural context');
 if(test.noForecast && response.metrics?.length)failures.push('metrics without loaded forecast');
 if(test.group.startsWith('ph-')&&/pH (?:is|will be) \d/i.test(text))failures.push('unsupported pH number');
 if(test.group==='radar'&&!/^(open|show|can you show)/i.test(test.q)&&response.action)failures.push('radar explanation triggered action');
 return {id:test.id,group:test.group,question:test.q,mode,passed:!failures.length,failures,place:intent.place.query,topic:intent.topic,response:text};
}
