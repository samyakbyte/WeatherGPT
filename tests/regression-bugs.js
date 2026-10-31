// Phase 1.1 — reproduce the five reported assistant bugs BEFORE fixing them.
// These tests are intentionally written against the public assistant API so they
// keep working after the parser/answer internals are replaced.
import { interpretWeatherQuestion } from '../js/nlp.js';
import { analyzeQuestion } from '../js/assistant.js';
import { engine, makeState, createRunner } from './harness.js';

const parse = (q, state, previous = null) => interpretWeatherQuestion(q, state, { engine, previous });
const answer = (q, state, previous = null) => {
  const intent = parse(q, state, previous);
  return { intent, response: analyzeQuestion(q, state, intent) };
};

export function bugSuite(check) {
  const farmQuestion='I farm wheat. What precautions should I take for the current weather?';
  const farmAnswer=answer(farmQuestion,makeState());
  check(farmAnswer.intent.place.kind==='none'&&!farmAnswer.intent.clarification,'current weather is not a location');
  check(farmAnswer.response.text.startsWith('Right now')&&farmAnswer.response.text.includes('29'),'farm answer starts with loaded current temperature');
  check(farmAnswer.response.text.indexOf('Right now')<farmAnswer.response.text.indexOf('Advice for'),'current weather precedes farm precautions');
  check(parse('Weather in Current River tomorrow',makeState()).place.query==='Current River','real Current River place name remains searchable');
  check(parse('Rain for the current location tomorrow',makeState()).place.kind==='none','current location uses selected city');
  for(const probability of [0,8,45,85]) {
    const state=makeState({hourlyValues:{precipitation_probability:probability}});
    const response=answer('Should I keep an umbrella tomorrow?',state).response;
    check(probability===0?response.text.startsWith('You probably do not need an umbrella'):probability<20?response.text.startsWith('There is a small chance of rain; take a compact umbrella'):response.text.startsWith('Yes, take an umbrella'),`direct umbrella recommendation for ${probability}%`);
  }
  const partial=makeState({hourlyFn:{precipitation_probability:i=>i===25?null:0}});
  check(answer('Umbrella tomorrow?',partial).response.text.startsWith('The rain forecast is incomplete'),'missing rain data does not advise leaving umbrella behind');
  const noCurrent=makeState();noCurrent.weather.current={time:'2026-09-15T10:00'};
  check(answer(farmQuestion,noCurrent).response.text.startsWith('Current weather readings are unavailable'),'missing current readings are explicit');
  const umbrellaState = makeState({hourlyFn:{precipitation_probability:i=>i>=24&&i<48?85:5}});
  const umbrellaQuestion='Tomorrow, I need to go to college, so should I keep an umbrella with me?';
  const umbrellaAnswer=answer(umbrellaQuestion,umbrellaState);
  check(umbrellaAnswer.intent.place.kind==='none'&&umbrellaAnswer.intent.dayOffset===1,
    'umbrella commute uses selected location and tomorrow');
  check(/85/.test(umbrellaAnswer.response.text)&&/umbrella/i.test(umbrellaAnswer.response.text),
    'umbrella commute recommendation uses tomorrow rain probability, not today');
  check(umbrellaAnswer.response.text.includes(umbrellaState.location.name),
    'umbrella commute answer names the selected location');
  // Distinct forecast value at tomorrow 19:00 so "current conditions" cannot pass.
  const idxTomorrow19 = 24 + 19;
  const feelsState = makeState({
    hourlyFn: {
      apparent_temperature: i => i === idxTomorrow19 ? 44 : 30,
      temperature_2m: i => i === idxTomorrow19 ? 39 : 28
    }
  });

  const feels = answer('Feels like tomorrow at 7 PM?', feelsState);
  check(
    feels.intent.topic === 'feels' && feels.intent.dayOffset === 1 && feels.intent.time?.hour === 19,
    'BUG1a: feels-like question resolves to tomorrow 19:00 in a structured time slot'
  );
  check(
    /44/.test(feels.response.text) && !/31°C/.test(feels.response.text),
    'BUG1b: feels-like tomorrow 7 PM uses the forecast apparent temperature (44°C), not current (31°C)'
  );

  const hiState = makeState({ language: 'hi' });
  const tempHi = answer('Temperature tomorrow?', hiState);
  check(
    tempHi.response.language === 'hi' && /तापमान|डिग्री|°C/.test(tempHi.response.text) && !/सीमित प्रकार/.test(tempHi.response.text),
    'BUG2a: Hindi-selected "Temperature tomorrow?" gets a real temperature answer, not "unsupported"'
  );
  const radarHi = answer('Open radar', hiState);
  check(
    radarHi.response.action === 'radar' && !/सीमित प्रकार/.test(radarHi.response.text) && /[ऀ-ॿ]/.test(radarHi.response.text),
    'BUG2b: Hindi-selected "Open radar" activates radar with a Hindi answer'
  );

  const walk = answer('Best time to walk tomorrow evening?', feelsState);
  const place = walk.intent.place?.query ?? walk.intent.locationQuery;
  check(
    !place || place === null,
    `BUG3: activity word "walk" is not extracted as a place (got ${JSON.stringify(place)})`
  );
  check(
    /5 PM|6 PM|7 PM|17|18|19/.test(walk.response.text) && !/6 AM/.test(walk.response.text),
    'BUG4: outdoor planning for tomorrow evening stays inside the 5–8 PM window'
  );

  const london = answer('Rain in London in four days?', feelsState);
  const londonPlace = london.intent.place?.query ?? london.intent.locationQuery;
  check(
    londonPlace === 'London' && london.intent.dayOffset === 4,
    `BUG5: "in four days" is temporal, not part of the place (got ${JSON.stringify(londonPlace)}, offset ${london.intent.dayOffset})`
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const runner = createRunner('Phase 1.1 bug reproduction');
  bugSuite(runner.check);
  runner.print();
  const { failed } = runner.result();
  process.exitCode = failed ? 1 : 0;
}
