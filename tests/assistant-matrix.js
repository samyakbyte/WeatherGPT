import { interpretWeatherQuestion } from '../js/nlp.js';
import { analyzeQuestion } from '../js/assistant.js';
export function evaluateStatement(test,state,engine){
 const failures=[];
 const previous=test.previous?interpretWeatherQuestion(test.previous,state,{engine}):null;
 const intent=interpretWeatherQuestion(test.q,state,{engine,previous});
 if(intent.topic!==test.topic)failures.push(`topic ${intent.topic}, expected ${test.topic}`);
 if(intent.place.query!==test.place)failures.push(`place ${intent.place.query}, expected ${test.place}`);
 if(intent.dayOffset!==test.dayOffset)failures.push(`day ${intent.dayOffset}, expected ${test.dayOffset}`);
 if(intent.clarification)failures.push('unexpected clarification');
 // Named-place answer fixtures explicitly represent the requested location;
 // this exercises answer generation, not live geocoding/provider accuracy.
 const response=analyzeQuestion(test.q,state,intent);
 const text=response.text||'';
 if(!text||/NaN|undefined|Infinity|could not identify|limited types/i.test(text))failures.push('empty/invalid/unsupported answer');
 const content={rain:/umbrella|rain|छाता|बारिश/i,weather:/weather|°|temperature|मौसम|तापमान/i,temperature:/temperature|°|तापमान/i,feels:/feels|°|महसूस/i,wind:/wind|km.h|mph|हवा/i,humidity:/humidity|%|नमी|आर्द्रता/i,clouds:/cloud|%|बादल/i,uv:/UV/i,visibility:/visibility|km|दृश्यता/i,sun:/sunrise|sunset|सूर्य/i,outdoors:/walk|window|outdoor|picnic|टहल|समय/i,crop:/crop|field|precaution|फसल|खेत|सलाह/i,acidity:/pH|acidity|अम्ल/i,alerts:/warning|risk|threshold|advis|चेतावनी/i,radar:/radar|रडार/i,pressure:/pressure|hPa|दबाव/i};
 if(!content[test.topic]?.test(text))failures.push('answer does not address expected topic');
 if(test.topic==='acidity'&&!/unavailable|not connected|no.*measured|नहीं.*जुड़/i.test(text))failures.push('missing pH availability disclosure');
 return {question:test.q,previous:test.previous||null,group:test.group,expected:{topic:test.topic,place:test.place,dayOffset:test.dayOffset},actual:{topic:intent.topic,place:intent.place.query,dayOffset:intent.dayOffset},passed:!failures.length,failures,response:text};
}
