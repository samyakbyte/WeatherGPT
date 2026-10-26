# WeatherGPT — architecture map

Last updated: 2026-10-26 (Phase 0 audit; revised as later phases land).

WeatherGPT is a **static, zero-build ES-module application**. `index.html` is the
single page; the browser imports modules directly. There is no bundler, server-side
runtime, database, authentication or LLM in this version. Everything is served over
HTTP(S) — `file://` does not work for ES modules.

## Module map (baseline, commit `8a35570`)

| Module | Responsibility |
| --- | --- |
| `index.html` | Semantic shell: sidebar, topbar search, current conditions, map preview, forecast, advisories, assistant, saved places, preferences/data dialogs. All element IDs are referenced from JS. |
| `css/style.css` | Minified design tokens, layout, components, responsive rules (41771 B, one line). |
| `css/interactions.css` | Map detail panel, voice feedback, NLP interpretation/evidence UI; **also contains a second, partially conflicting set of component overrides and media queries** (654 lines). |
| `js/api.js` | Public provider requests: Open-Meteo forecast + geocoding, map model samples, RainViewer radar metadata; in-memory TTL cache, 18 s timeout, AbortController, coordinate validation, `localStorage` read/write helpers. |
| `js/weather.js` | WMO code → label/icon, unit formatting, `present()` null guard, local-hour labels, `currentHourIndex`, `forecastHours`, `deriveAdvisories` (threshold-based WATCH/WARNING/SEVERE), `dailySummary`. |
| `js/intent.js` | Legacy `parseWeatherQuestion`: Devanagari/Latin normalisation, a small city dictionary, regex place/date/topic/period extraction. Used by search and by `assistant.js` when no structured intent is supplied. |
| `js/nlp.js` | `interpretWeatherQuestion`: Compromise token/place analysis + weather rules; date arithmetic (weekday/ISO/relative), clock/range parsing, clarifications, follow-up inheritance. Exports `topicNames` and `loadNLPEngine` (lazy-loads the vendored UMD bundle). |
| `js/vendor/compromise.js` | Vendored Compromise NLP UMD bundle (351 KB, one line). License at `js/vendor/compromise-LICENSE.txt`. Loaded as a classic script, not imported. |
| `js/nlp-insights.js` | Metric answers for humidity/clouds/UV/visibility/pressure and the "current conditions" answer. Uses provider fields only; missing values never become zero. |
| `js/insights.js` | `periodEvidence` (selects hourly indices inside a part-of-day window), `periodInsight` (peak hourly precipitation + temperature range + timeline), and `hindiInsight` (Hindi answer tree). |
| `js/assistant.js` | `analyzeQuestion` (English answer tree) and `createAssistant` (DOM conversation, interpretation chips, clarification buttons, browser SpeechRecognition + speechSynthesis, language selector). Also resolves a place via geocoding and re-interprets dates in the new location's forecast. |
| `js/app.js` | Application state, routing by hash, search with debounce/abort, location lifecycle (`selectLocation`), preferences, saved places, dialogs, reduced-motion/navigation handling, 10-minute tab refresh. |
| `js/map.js` | Leaflet map, OSM tiles, 12 sampled model points with layer colours, radar frames/playback/timeline, selected-location panel, expanded map. Returns a no-op stub when Leaflet fails to load. |
| `js/forecast.js` | Chart.js hourly/daily chart + hourly strip + 7-day rows; `data-*` controls for period/metric. |
| `js/icons.js` | SVG path table, `hydrateIcons`, `escapeHTML`. |
| `tests/run-node-tests.js` | Node suite (43 checks at baseline). Uses `createRequire` for the UMD bundle and synthetic, frozen forecast fixtures. |
| `tests/nlp-tests.js`, `tests/nlp.html` | Browser-only NLP regression page (43-ish checks). |
| `tests/smoke.js`, `tests/smoke.html` | Browser suite: pure checks + real app in an iframe against live APIs. |
| `tests/nlp-visual*`, `tests/assistant-view.html`, `tests/map-view.html` | Redirect/visual inspection helpers. |

## Data flow

```
user question / search
  → intent.js + nlp.js (slots: place, day offset, clock/period, topic, language)
  → api.js searchLocations (Open-Meteo geocoding) → app.js selectLocation
  → api.js fetchWeather (Open-Meteo, timezone=auto, 7 days)
  → state.weather (current / hourly / daily / timezone / utc_offset_seconds)
  → weather.js + insights.js / nlp-insights.js / assistant.js choose evidence
  → assistant.js renders text + metrics + timeline, or app.js/forecast.js/map.js render views
```

Open-Meteo returns **local civil timestamps without a zone suffix**, an IANA
`timezone`, `timezone_abbreviation`, and a `utc_offset_seconds` that the provider
documents as *fixed throughout the response, including across daylight-saving
transitions*. WeatherGPT therefore treats provider timestamps as opaque local
civil strings and uses the returned IANA zone only for "what is the local date
now" questions. See `docs/BASELINE.md` and the timezone module added in Phase 1.

## State

`js/app.js` owns one mutable `state` object shared by closures:

```js
{
  location: { name, country, region?, latitude, longitude, timezone? },
  weather:  null | { current, hourly, daily, timezone, utc_offset_seconds,
                     latitude, longitude, elevation, fetchedAt },
  prefs:    { temperature: 'celsius'|'fahrenheit', wind: 'kmh'|'mph', language: 'en'|'hi' },
  saved:    [ location, ... ],          // max 30
  view:     'overview'|'map'|'forecast'|'alerts'|'assistant'|'locations',
  loading:  boolean
}
```

`getState()` returns that object by reference; `createForecast`, `createWeatherMap`
and `createAssistant` each hold their own private UI state (chart instance, Leaflet
map, previous intent, speech objects). `selectLocation()` aborts the previous
weather request with an `AbortController` and clears `state.weather` before
fetching, so stale values are not displayed — but see the race audit below.

## Storage keys (all device-local `localStorage`)

| Key | Shape | Notes |
| --- | --- | --- |
| `weathergpt.location` | location object | Last selected place; validated on load. |
| `weathergpt.saved` | array of location objects | Up to 30; filtered on load. No schema version at baseline. |
| `weathergpt.preferences` | `{temperature, wind, language}` | Defaults to celsius/kmh/en. |

API responses are cached **in memory only** (`js/api.js`): weather 10 min, map
samples 15 min, radar metadata 5 min, geocoding 1 hour. No chat history is
persisted. Farm names/crop details added in Phase 2 stay on the device; only
coordinates are sent to the weather API.

## External dependencies (all public, key-free)

Open-Meteo forecast + geocoding, RainViewer radar, OpenStreetMap raster tiles and
Nominatim/Photon geocoding (Phase 2), Leaflet 1.9.4 and Chart.js 4.4.8 from
jsDelivr, DM Sans/Manrope from Google Fonts. Terms, coverage measurements and
resolution figures: `docs/DATA_SOURCES.md`.

## Phase 1 changes (working tree, 2026-10-26)

| New module | Role |
| --- | --- |
| `js/understanding.js` | **Single structured interpreter.** Canonicalises English, Devanagari and Romanized Hindi into one analysis string; removes temporal phrases, activity words and topic words before place extraction; emits a validated intent object (`schemaVersion: 2`) with `topic`, `metric`, `place {query, context, status, candidates}`, `time {date, dayOffset, startHour, endHour, hour, window, zone, resolvedLabel}`, `language`, `script`, `confidence`, `unresolved[]`, `clarification`. `applyGeocoderResult` validates candidates and never silently accepts an unresolved or ambiguous place. |
| `js/timezone.js` | Target-location civil time: `localToday`, `zonedParts` (IANA/DST), `addDays`, `weekdayOf`, `hourLabel`, `resolvedLabel`, `forecastRange`, `selectHourIndices`. Provider local civil strings are compared directly; `utc_offset_seconds` is used only for the displayed zone abbreviation. |
| `data/time-windows.js` | Explicit half-open part-of-day windows (morning 06–12, afternoon 12–17, evening 17–20, night 20–24) plus the default outdoor window (06–20). Shared by evidence selection and outdoor scoring. |
| `js/answers.js` | Unified metric-aware answer engine (feels-like, temperature, humidity, clouds, UV, visibility, pressure), window-constrained outdoor planning, radar, acidity and crop fallback — identical topic coverage in EN and HI. `withScope` appends a checkable resolved date/time/zone to legacy narrative answers. |
| `js/request-guard.js` | Pure latest-request-wins primitive; `state.epoch` in `app.js` applies the same rule to weather loads. |
| `js/intent.js`, `js/nlp.js` | Thin compatibility facades; `loadNLPEngine` still lazy-loads the vendored UMD Compromise bundle for tokenisation only. |

`analyzeQuestion` now: clarification → unsupported/historical date → unified structured answer → legacy narrative branch (with resolved scope). `createAssistant.submit` uses a request id + AbortController, validates geocoder results, offers `select-place:N` choices, and rejects stale answers via `isFresh`.

Tests: `tests/harness.js` (frozen clock/fixtures), `tests/legacy-suite.js` (43 original checks), `tests/regression-bugs.js` (7 checks for the 5 reported bugs), `tests/interpretation-cases.js` + `tests/regression-suite.js` (126 phrasings / 316 checks), `tests/reliability-suite.js` (time zones, DST, midnight, missing values, geocoder ambiguity, races), `tests/run-node-tests.js` (unified runner with non-zero exit status).

## Phase 2–4 additions

| Module | Role |
| --- | --- |
| `js/geocode.js` | Ordered fallbacks: Open-Meteo geocoding → Photon (type-ahead) → Nominatim (explicit user requests only, ≤1 req/s, identifying Referer, caching). Normalises results to `{name, district, state, country, type, latitude, longitude, source, sourceLabel}`. `parsePlaceQuery` splits district/state context; `parseCoordinates` validates decimal degrees and flags swapped/ambiguous pairs. |
| `js/farms.js` | `weathergpt.farms.v2` versioned document; validates every record; migrates `weathergpt.saved` read-only; add/edit/delete/activate; `farmToLocation` exposes only coordinates to the weather layer. |
| `js/farm-ui.js` | Farm CRUD form, active-farm card, farms list, dashboard (next 72 h hazards + actions), provenance details and acidity panel. All rendering is local. |
| `js/provenance.js` | Source, requested vs model grid-cell coordinates, 90 m DEM elevation, local update time, zone, documented resolution range and grid caveat. |
| `js/acidity.js` | Exact unavailability message, three separate concepts, validated user-provided pH readings in `weathergpt.rain-ph.v1`. |
| `data/hazard-thresholds.js` | Single configurable threshold file with comments stating the numbers are engineering defaults, not official agronomic thresholds. |
| `js/hazards.js` | Forecast-derived heavy rain (24/48/72 h), heat, cold/frost screening, gusts, dry spell and humid spell; skips null values and reports them. |
| `data/crops.js` | Versioned knowledge base for nine crops + generic fallback; each entry EN/HI, hazard, stage, regions, source id or explicit "no crop-specific source" flag. No doses. |
| `js/advisory.js` | Four-part advisory (expected weather, why, actions, evidence/limits) with calculated vs sourced/general content separated; assistant integration verifies user weather claims. |
| `js/map.js` (changed) | Draggable preview pin with explicit confirm / "save as farm" / cancel; radar autoplay disabled under reduced motion. |
| `js/forecast.js` (changed) | Daily temperature bars scaled to the week's real min/max, with accessible text. |
| `tests/run-browser-tests.js`, `tests/browser-fixtures.js` | Real-browser suite with mocked providers and screenshots. |

State additions: `state.epoch` (latest-location-wins), `state.farm` (active farm
object). Storage additions are listed in the README. The active farm drives the
dashboard; `selectLocation(farmToLocation(farm))` keeps the map, forecast,
advisories and assistant on the same coordinates.

## Known architectural weaknesses at baseline

1. **Two overlapping parsers.** `intent.js` (regex) and `nlp.js` (Compromise +
   rules) both extract places; ordering decides the winner. Temporal phrases are
   removed by ad-hoc lookaheads, so "in four days" and "to walk" leak into the
   place slot. Phase 1 replaces this with one structured, validated intent object.
2. **Two answer trees.** `hindiInsight` (Hindi) is much smaller than the English
   tree in `assistant.js`, so valid English questions become "unsupported" when
   Hindi is selected and Hindi replies can contain English fragments.
3. **Metric/time coupling.** `feels`, `temperature`, `humidity` and outdoor
   planning read `current` or a fixed 6 AM–7 PM window regardless of the requested
   date/time window.
4. **Language detection from preference.** `preferredLanguage === 'hi'` forces
   Hindi interpretation even for English text.
5. **Race window.** `selectLocation` uses an abort signal, but the assistant's
   `await selectLocation()` result is applied to a conversation that may have
   moved on; there is no request-id check across the geocode → weather → answer
   chain.
6. **CSS duplication.** `css/interactions.css` redefines `.daily-row`,
   `.temp-bar`, `.topbar`, `.hourly-strip` and media queries from `style.css`;
   mobile daily rows hide columns without recomputing the temperature bar.
7. **Empty historical/acidity/crop capability.** No pH, soil or irrigation-water
   datasets and no agricultural knowledge base are connected.
