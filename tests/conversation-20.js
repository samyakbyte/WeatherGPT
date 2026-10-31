import { interpretWeatherQuestion } from '../js/nlp.js';
import { analyzeQuestion } from '../js/assistant.js';
import { makeState, engine } from './harness.js';
export const statements = [
 ['should i keep umbrella with me','rain'],
 ['shoul i keep umbrella with me','rain'],
 ['Tomorrow I am off to college; will I need my umbrella?','rain'],
 ['I farm wheat. What precautions should I take for the current weather?','crop'],
 ['My wheat crop is growing; what precautions should I take?','crop'],
 ['I grow rice and want precautions for tomorrow','crop'],
 ['Can I spray my crops tomorrow morning?','crop'],
 ['What is the pH of rainwater here?','acidity'],
 ['Is the rainwater acidic for my farm?','acidity'],
 ['Can you tell me the measured pH at my location?','acidity'],
 ['How hot will it be tomorrow?','temperature'],
 ['Tell me how humid it is right now','humidity'],
 ['What will the wind be like tomorrow evening?','wind'],
 ['Should I worry about UV exposure today?','uv'],
 ['I want to walk tomorrow evening; what is the best time?','outdoors'],
 ['Any weather warnings for my area today?','alerts'],
 ['When is sunset today?','sun'],
 ['Please show the radar for my area','radar'],
 ['What does the weather look like right now?','weather'],
 ['Should I carry an umbrella in Jaipur tomorrow?','rain','Jaipur']
];
export function conversationSuite(check) {
 for(const [q,topic,place=null] of statements){
  const state=makeState();const intent=interpretWeatherQuestion(q,state,{engine});
  const response=analyzeQuestion(q,state,intent);
  check(intent.topic===topic&&intent.place.query===place&&!intent.clarification,`${q}: intent=${intent.topic}, place=${intent.place.query}`);
  check(place!==null || (Boolean(response.text)&&!/could not find|several places|limited types|unrecognized/i.test(response.text)),`${q}: usable response`);
  const relevant={rain:/umbrella|rain/i,crop:/crop|field|wheat|rice|precaution/i,acidity:/pH|acidity/i,temperature:/temperature|°/i,humidity:/humidity|%/i,wind:/wind|km\/h/i,uv:/UV/i,outdoors:/window|walk|outdoor/i,alerts:/warning|risk|threshold|advis/i,sun:/sunset/i,radar:/radar/i,weather:/°|temperature/i};
  check(place!==null||relevant[topic].test(response.text),`${q}: answer addresses ${topic}`);
  if(topic==='acidity') check(/unavailable|not connected|no.*measur/i.test(response.text),`${q}: no invented pH`);
 }
}
