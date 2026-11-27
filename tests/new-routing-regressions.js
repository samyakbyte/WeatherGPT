import {makeState,engine} from './harness.js';
import {interpretWeatherQuestion} from '../js/nlp.js';
import {analyzeQuestion} from '../js/assistant.js';
export function newRoutingRegressions(check){
 const run=(q,s=makeState(),previous=null)=>{const intent=interpretWeatherQuestion(q,s,{engine,previous});return {intent,answer:analyzeQuestion(q,s,intent)};};
 const now=run('Pressure right now?');
 check(/1,?009 hPa/.test(now.answer.text)&&/2026-09-15T12:15/.test(now.answer.text)&&!/whole day/.test(now.answer.text),'current pressure uses current value and timestamp, not whole-day scope');
 for(const q of ['Pressure tomorrow at 7 PM?','Pressure today at 7 PM?','Pressure this afternoon?','Pressure tomorrow?'])check(!run(q).answer.metrics.length&&!/1,?009/.test(run(q).answer.text),'no current pressure substituted for future request: '+q);
 const s=makeState();s.weather.current.pressure_msl=null;
 check(!run('Pressure now?',s).answer.metrics.length&&/unavailable/.test(run('Pressure now?',s).answer.text),'missing current pressure stays unavailable');
 for(const city of ['College Station','College Keep','Reading'])check(run(`Rain in ${city} tomorrow?`).intent.place.query===city,'explicit place preserved: '+city);
 check(run('Read humidity tomorrow at 4 PM').intent.place.query===null,'read command cannot become a location');
 const prev=run('Rain tomorrow evening?').intent;
 const follow=run('Will it be windy then?',makeState(),prev);
 check(follow.intent.topic==='wind'&&follow.intent.dayOffset===1&&follow.intent.period?.key==='evening','explicit topic follow-up inherits prior date and window');
 check(run('Can you prescribe a pesticide dose for rice?').answer.helpKind==='treatment','positive dose request retains capability boundary');
 check(!run('Rice spraying precautions without a chemical dose.').answer.supportMode,'negative dose clause does not replace supported crop precautions');
}
