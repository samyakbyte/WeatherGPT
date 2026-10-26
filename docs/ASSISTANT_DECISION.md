# Assistant architecture decision

**Decision (2026-10-26): WeatherGPT does NOT add an LLM in this version.** The
assistant is a deterministic, structured, local interpreter. It is never
labelled "AI", "generative" or "LLM-powered" in the UI, README or code.

## What exists today

* `js/understanding.js` produces a validated intent object (topic, metric,
  place with candidates/status, explicit time window, language/script,
  confidence, unresolved slots). It combines a vendored Compromise UMD bundle
  for English tokenisation with weather-domain rules for English, Devanagari
  Hindi and Romanized Hindi.
* `js/answers.js`, `js/insights.js`, `js/nlp-insights.js` and
  `js/advisory.js` generate answers **only** from fields in the loaded
  Open-Meteo forecast or from the versioned, cited crop knowledge base.
  Every numerical statement is traceable to a provider array index.
* `js/request-guard.js` + `state.epoch` prevent stale answers; `js/timezone.js`
  resolves relative dates in the target location's own time zone.
* No credentials, no backend, no network call other than public weather /
  geocoding / radar / tiles / fonts.

## Evaluation against the requirements

| Criterion | Deterministic parser (this version) | Adding an LLM |
| --- | --- | --- |
| **Numeric accuracy** | Numbers are read from a specific forecast index; no generation. Misreads are visible through the resolved date/time line. | Requires schema-validated tools, strict output schemas, provenance checks and refusal rules; otherwise the model can invent numbers. |
| **Multilingual** | 126 frozen phrasings / 316 checks across English, Devanagari and Romanized Hindi; every topic is available in both languages. | Would improve open-ended phrasing coverage, but needs evaluation sets in all three forms and a Hindi-capable model. |
| **Cost** | Zero inference cost; runs in the browser. | Per-request cost plus a hosted backend; needs quotas and rate limiting. |
| **Latency** | Sub-millisecond parse + one cached forecast fetch. | Typically 0.5–3 s extra, plus backend cold starts. |
| **Privacy** | Farm names, crops and notes stay on the device; only coordinates leave it. Question text is processed locally (except voice, which uses the browser provider). | Question text and retrieved weather/agricultural context would be sent to a third-party model unless self-hosted. |
| **Offline / failure** | Works with a cached forecast; provider failure is reported honestly, never substituted. | Needs an automatic fallback to the deterministic assistant when the model/backend is unavailable. |
| **Maintenance** | Rules are data-driven and reviewable (`data/crops.js`, `data/time-windows.js`, `data/hazard-thresholds.js`), with a table-driven regression suite. | Prompts, schemas, model versions and evaluation sets need continuous maintenance; behaviour can drift on model updates. |
| **Known weakness** | Bounded vocabulary. Unrecognised phrasings get a clarification, not a guess. Crop guidance is general unless a source was found. | Would handle more open-ended phrasing, but cannot solve missing data or unverified agronomic sources. |

## Why this is the right decision now

The project's highest-risk failures were **wrong weather interpretation**
(current values substituted for a future window, a place extracted from an
activity word, English questions rejected under a Hindi preference) and
**unverifiable agronomic claims**. An LLM does not fix either by itself: both
require a validated intent object, target-location time handling, source
citations and an honest "data unavailable" path. Those are now in place and are
independently testable. Adding a model before those foundations would add cost,
latency, credentials and a new hallucination surface without improving numeric
trustworthiness.

The structured intent object and `buildAdvisories()` are deliberately
**tool-shaped**: a future backend can expose `get_weather(location, window)` and
`get_crop_guidance(crop, stage, hazard)` as schema-validated tools without
changing the UI contract.

## Conditions for revisiting

If a future version adds an LLM, ALL of the following are required (none are
implemented or claimed now):

1. A separately hosted minimal backend holding credentials; the frontend calls
   only that backend. No private key in frontend code, git history or logs.
2. `.env.example` placeholder names only (present in this repo, currently
   unused): `WEATHERGPT_ASSISTANT_BACKEND_URL`, `WEATHERGPT_LLM_API_KEY`,
   `WEATHERGPT_LLM_MODEL`.
3. Structured, schema-validated tools; every numeric weather statement must
   come from a tool result, and every agricultural statement must map to a
   `data/crops.js` entry with a source.
4. Output schema validation with rejection/repair, input size limits, timeouts,
   rate limiting, and prompt-injection resistance (user text and retrieved text
   are data, never instructions).
5. A feature flag. With no credentials configured the UI must say the
   deterministic assistant is active — never imply AI features are on.
6. An automatic fallback to the deterministic assistant on backend/model
   failure, plus an evaluation set covering English, Hindi and Romanized Hindi.

## Honest status statement for the README / PR

> Assistant mode: deterministic local parser (no LLM). No credentials required.
> LLM mode: not implemented; code, backend, credentials and evaluation set are
> pending. The UI does not claim AI features.
