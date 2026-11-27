# WeatherGPT additional 1,000-question verification

Completed 9 November 2026. This is a new set of 1,000 individually written question strings in 40 categories, with 25 cases per category. Normalized text was checked against all three earlier banks (1,000 matrix questions, 1,000 varied questions, and 200 additional questions). There are no exact normalized-text duplicates. Intent families and some sentence structures deliberately recur, so these are not 1,000 distinct capabilities or a blind benchmark.

## Results

- Reviewed baseline: 845 passed, 155 failed.
- Final: 1,000 passed, 0 failed with Compromise, and the same 1,000 passed without it.
- Earlier suites: 1,000 varied, 1,000 matrix and 200 additional questions passed.
- Logic checks: 669 passed, 0 failed, including 13 new focused regression checks.
- Chrome: 229 passed, 0 failed, no uncaught page exceptions. Twenty new questions passed through the real chat submit handler, with answer-content checks and no unwanted geocoder requests or changes to selected location.

The full new bank ran through the actual interpreter and answer functions in Node. Twenty of those questions also ran through the browser form. This is not a claim that all 1,000 went through the form or a live provider. Test data is deterministic and uses 15 September 2026 as its current date. Tomorrow's rain chance is 73%, and selected hourly values distinguish temperature, UV, clouds and visibility. Dry, missing-forecast, named-location, Hindi and follow-up cases have separate contexts. Unsupported actions and measurements must produce an honest limitation, rather than fabricated capability. Content checks inspect location, required answer evidence, routing mode, invalid numbers and unintended actions. They do not grade every sentence or prove open-ended language understanding.

## Repairs

- Commands, unit words and generic follow-up phrases no longer become location searches. Explicit College Station, College Keep and Reading remain supported in focused checks.
- Umbrella advice and rain-risk questions no longer route into farm advice.
- Current pressure now returns the available current value and its model timestamp. Future pressure requests still disclose that hourly pressure is unavailable.
- Solar-event synonyms, ultraviolet wording and present-time phrases resolve correctly.
- Simple date follow-ups preserve the previous question, while a new explicit weather topic retains the previous time window when appropriate.
- Irrigation and harvest replies address the requested operation, followed by the existing weather evidence and crop precautions, without inventing field measurements or doses.
- Explanation routing better distinguishes forecast questions, missing data, probability, radar, settings, provenance and unsupported requests. A negated request for a chemical dose does not block ordinary crop precautions.

## Test-review notes

The draft audit initially reported 231 failures. Before the reviewed baseline, three duplicate strings were replaced and assertions were corrected for equivalent visibility/time formats, honest pH-unavailability replies and existing historical limitations. After the pressure fix exposed its numeric output, its check was corrected to accept both 1009 and 1,009. That correction did not change the baseline failure count because the original pressure answer supplied neither value. Question text and all other expectations were frozen after the reviewed baseline. The initial and final results and all actual final responses are included for review.

## Reproduction and package

Run `npm run test:new1000` or `node tests/run-new-1000.js`, then `npm test`, `npm run test:diverse`, `npm run test:assistant` and `node tests/run-extra-200.js`. The portable browser suite remains `npm run test:browser` after installing its existing development dependencies. In this environment it ran with local Google Chrome and mocked providers.

No runtime dependency was added. Four runtime JavaScript files changed, adding 4,729 uncompressed bytes compared with the Additional-200 delivery. Existing design and skills remain included. Full ZIP and incremental patch sizes are recorded in the delivery manifest. The patch overlays the Additional-200 project; the full ZIP is the simplest complete replacement. This work improves a deterministic parser and responses; it does not train a generative model. Unfamiliar wording and complex multi-task questions can still require clarification.

## Category results

| Category | Passed | Failed |
| --- | ---: | ---: |
| umbrella | 25 | 0 |
| temperature | 25 | 0 |
| feels | 25 | 0 |
| humidity | 25 | 0 |
| cloud | 25 | 0 |
| uv | 25 | 0 |
| visibility | 25 | 0 |
| sunset | 25 | 0 |
| sunrise | 25 | 0 |
| pressure | 25 | 0 |
| current | 25 | 0 |
| combined | 25 | 0 |
| wheat | 25 | 0 |
| rice | 25 | 0 |
| crops | 25 | 0 |
| spray | 25 | 0 |
| irrigation | 25 | 0 |
| harvest | 25 | 0 |
| soil | 25 | 0 |
| ph | 25 | 0 |
| ph-records | 25 | 0 |
| water-quality | 25 | 0 |
| farm-records | 25 | 0 |
| settings | 25 | 0 |
| radar | 25 | 0 |
| probability | 25 | 0 |
| missing | 25 | 0 |
| evidence | 25 | 0 |
| medical | 25 | 0 |
| treatment | 25 | 0 |
| external | 25 | 0 |
| history | 25 | 0 |
| guarantees | 25 | 0 |
| named | 25 | 0 |
| dry | 25 | 0 |
| no-weather | 25 | 0 |
| followup | 25 | 0 |
| hindi | 25 | 0 |
| comparison | 25 | 0 |
| unrelated | 25 | 0 |
