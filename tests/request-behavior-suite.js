import {makeState,engine} from './harness.js';
import {interpretWeatherQuestion} from '../js/nlp.js';
import {analyzeQuestion} from '../js/assistant.js';
export function requestBehaviorSuite(check){
 const run=(q,state=makeState())=>{const intent=interpretWeatherQuestion(q,state,{engine});return {intent,response:analyzeQuestion(q,state,intent)};};
 const combinedState=makeState({hourlyFn:{precipitation_probability:i=>i>=24&&i<48?73:7,wind_speed_10m:i=>i>=24&&i<48?37:3}});
 const combined=run('Will it rain tomorrow, and how windy will it be?',combinedState);
 check(/73%/.test(combined.response.text)&&/37 km\/h/.test(combined.response.text),'compound answer uses tomorrow values for both rain and sustained wind');
 const hot=makeState({hourlyFn:{temperature_2m:i=>i===43?41:12}});
 check(/41/.test(run('Temperature tomorrow at 7 PM?',hot).response.text),'requested hour uses its own temperature, not another hour');
 const cloud=makeState({hourlyFn:{cloud_cover:i=>i===42?83:11}});
 const solar=run('Cloud cover at sunset tomorrow?',cloud);
 check(solar.intent.topic==='clouds'&&/83/.test(solar.response.text),'cloud question at sunset uses forecast cloud value at provider sunset hour');
 check(!!run('Temperature before sunrise tomorrow?').intent.clarification,'unspecified before-sunrise time asks for a precise window');
 const humidity=run('Humidity for my selected field location?');
 check(humidity.intent.topic==='humidity'&&/65/.test(humidity.response.text),'field mentioned as context does not replace humidity answer with crop advice');
 const crop=run('Will forecast rain affect my pesticide spraying plan?');
 check(crop.intent.topic==='crop'&&!/umbrella/i.test(crop.response.text),'spraying decision does not produce umbrella advice');
 const current=run('Is it raining at this moment according to the model?');
 check(current.intent.topic==='weather'&&/Right now/i.test(current.response.text),'current rain question uses current-condition snapshot');
 for(const q of ['Why is the radar map blank?','What is the difference between radar and the hourly forecast?']){
   const a=run(q);check(a.response.supportMode==='explain'&&!a.response.action,'radar explanation has no map action: '+q);
 }
 check(run('Open radar').response.action==='radar','explicit radar command still works');
 const medical=run('Can you diagnose heatstroke from the weather alone?');
 check(medical.response.supportMode==='limit'&&!medical.response.metrics.length&&medical.intent.place.query===null,'medical request has explicit boundary and no location search');
 const settings=makeState();const saved=JSON.stringify(settings.prefs);const a=run('Can you switch wind speed to miles per hour?',settings);
 check(a.response.supportMode==='explain'&&JSON.stringify(settings.prefs)===saved&&!a.response.action,'settings help does not falsely perform a preference change');
 const ph=run('Can you infer exact pH from pollution levels?');
 check(/not|cannot|unavailable/i.test(ph.response.text)&&!/pH (?:is|will be) \d/i.test(ph.response.text),'pH estimate is not invented from pollution');
 const hi=run('मैंने पीएच मापा है, कहाँ दर्ज करूँ?');
 check(hi.response.language==='hi'&&/[\u0900-\u097f]/.test(hi.response.text),'new help messages respect Hindi questions');
 const empty=run('Temperature tomorrow?',makeState({weather:null}));
 check(!empty.response.metrics.length&&/not.*loaded|don.t have.*loaded/i.test(empty.response.text),'no numeric temperature invented without weather');
 const before=run('What is the current weather at my saved place?');
 check(before.intent.place.query===null,'saved-place phrasing does not search for ordinary words');
}
