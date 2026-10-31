# WeatherGPT: 1,000-statement assistant evaluation

31 October 2026

## Results

Initial run: 933 passed, 67 failed. After fixes: 1,000 passed, zero failed, both with Compromise and with the optional NLP library disabled (2,000 Node evaluations). The same 1,000 scenarios also passed when the interpreter and answer functions ran inside Chrome. Existing logic suite: 640 passed. Browser suite: 161 checks passed, including its 20 actual form submissions, the 1,000-scenario matrix, and existing interface/flow checks. No uncaught page exceptions.

## Fixes

- Question grammar such as "Is rain likely" no longer falls through to a location named Likely.
- Location scanning examines nested clauses: "for cotton in London" and "time for a picnic in London" now retain London.
- Weather risk questions route to the warning/advisory answer.
- Explicit "the day after tomorrow" means two days from today even in a follow-up; "the day after" can still refer to the previous question.
- All previously delivered umbrella/current-weather/college fixes are included.

## What the 1,000 statements cover

800 topic/time/location combinations: 40 phrasings across five date choices and four location contexts. 100 conversational and informal-prefix variants. 50 Hindi questions. 50 follow-up scenarios. The follow-up cases include their preceding question; some follow-up text repeats under different prior topics. These are 1,000 distinct input/context scenarios, not 1,000 independently hand-written prompts.

Topics include rain/umbrella, weather, temperature, feels-like, wind, humidity, cloud, UV, visibility, sunrise/sunset, outdoor planning, wheat/rice/maize/cotton precautions, spraying, harvesting, pH/acidity, warnings, radar and pressure.

Each case checks the intended topic, requested place, day offset, unexpected clarification, a nonempty answer without invalid numbers, topic-relevant answer content and pH data-unavailability disclosure. These assertions do not prove every sentence is factually complete or that every agricultural/time-specific recommendation is optimal.

## Reproduce and limits

`npm run test:assistant` runs the 1,000 cases with and without the optional NLP library. `npm test` runs the existing logic regressions. `npm run test:browser` requires the documented development dependencies/browser setup. The matrix uses deterministic synthetic forecasts; named-place fixtures explicitly represent the requested location. The Chrome matrix invokes the same application interpreter/answer modules directly, rather than submitting all 1,000 questions through the chat form. Twenty separate end-to-end chat submissions remain in the browser suite. These checks do not verify live geocoder/provider availability or physical devices.

This is a repair to a rules-based assistant, not model training or a guarantee of unrestricted language understanding. No new runtime dependency, paid service or model account was added.

## Install

Extract the cumulative patch into the existing reworked project, replace included files, and Ctrl+F5. Or extract the complete updated project. If an old bug changed the selected city, choose the intended city once. Earlier reports record earlier versions; this report describes this update.

The accompanying CSV lists every input/context scenario and result. `docs/ASSISTANT-1000-RESULTS.json` includes every expected intent, actual intent and generated response.
