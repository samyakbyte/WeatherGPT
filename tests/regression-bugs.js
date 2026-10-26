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
