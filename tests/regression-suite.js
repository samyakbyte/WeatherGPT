// Runs the table-driven interpretation cases. This module is imported by the
// unified Node runner; it can also be executed directly for a quick check.
import { interpretWeatherQuestion } from '../js/nlp.js';
import { engine, makeState, createRunner } from './harness.js';
import { cases, PREVIOUS_QUESTION } from './interpretation-cases.js';

const FROZEN_NOW = '2026-09-15T06:45:00Z'; // 12:15 IST on 2026-09-15

function stateFor(options = {}) {
  return makeState({ now: FROZEN_NOW, language: options.lang === 'hi' ? 'hi' : 'en' });
}

function actual(intent, key) {
  switch (key) {
    case 'place': return intent.place?.query ?? null;
    case 'placeContext': return intent.place?.context ?? {};
    case 'placeKind': return intent.place?.kind;
    case 'topic': return intent.topic;
    case 'metric': return intent.metric;
    case 'dayOffset': return intent.dayOffset;
    case 'date': return intent.date;
    case 'hour': return intent.time?.hour ?? null;
    case 'window': return intent.time?.window?.key ?? null;
    case 'start': return intent.time?.startHour ?? null;
    case 'end': return intent.time?.endHour ?? null;
    case 'kind': return intent.time?.kind ?? null;
    case 'language': return intent.language;
    case 'clarification': return Boolean(intent.clarification);
    case 'unsupported': return Boolean(intent.unsupportedDate);
    case 'historical': return Boolean(intent.historical);
    case 'action': return intent.action ?? null;
    default: return undefined;
  }
}

function equal(a, b) {
  if (b && typeof b === 'object') {
    return Object.entries(b).every(([k, v]) => equal(a?.[k], v));
  }
  return a === b;
}

export function interpretationSuite(check) {
  for (const testCase of cases) {
    const state = stateFor(testCase.o || {});
    let previous = null;
    if (testCase.previous) {
      previous = interpretWeatherQuestion(PREVIOUS_QUESTION, state, { engine });
    }
    const intent = interpretWeatherQuestion(testCase.q, state, { engine, previous });
    for (const [key, expected] of Object.entries(testCase.e)) {
      const got = actual(intent, key);
      check(equal(got, expected), `${testCase.q} → ${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
    }
  }
  return cases.length;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const runner = createRunner('interpretation table');
  const n = interpretationSuite(runner.check);
  runner.print();
  console.log(`${n} phrasings checked`);
  process.exitCode = runner.result().failed ? 1 : 0;
}
