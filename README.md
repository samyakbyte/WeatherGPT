# WeatherGPT

**A map-first weather intelligence workspace.**

WeatherGPT makes weather information easier to use: select a place, explore its forecast, and ask what the conditions mean for your day. Weather data supplies the numbers; the interpreter selects and explains them. This is a working static frontend prototype, not a deployed full-stack AI service or a safety-critical warning system.

## Completed features

### Weather workspace
- Responsive overview with model-derived current temperature, condition, feels-like temperature, humidity, wind/direction, sea-level pressure, visibility, precipitation, UV and sunset.
- Current location, local forecast times, daily high/low and a concise daily summary.
- Debounced city search, coordinate search (`latitude, longitude`) and permission-based device geolocation.
- Shared location context across overview, map, forecast, advisories and assistant.
- Sliding mobile navigation, keyboard focus handling, skip link, dialogs, reduced-motion support and loading/error/empty states.

### Geographic exploration
- Real OpenStreetMap tiles in Leaflet, pan/zoom, recenter and expanded map.
- Temperature, wind, cloud cover, humidity and sea-level pressure layers: **12 sampled current model values**, not continuous weather rasters or satellite imagery.
- Model sample colors correspond to the layer legend. Wind arrows show direction of flow.
- Click a map point or weather sample to update the active location.
- Selected-location panel with current conditions, wind/humidity, three upcoming forecast hours, advisory link and assistant access. On phones, it becomes a scrollable bottom sheet.
- Hidden-map location updates are deferred until the map becomes visible; they do not attempt to animate a zero-size Leaflet viewport.

### Radar and forecasts
- Available RainViewer precipitation radar frames, timestamps, previous/next controls, scrubber, play/pause and 0.5×/1×/2× playback.
- Only provider-supplied nowcast frames are eligible to appear. When none are supplied, the timeline explicitly says past radar only.
- Coverage disclosure: blank radar is **not** evidence of no rain, especially in areas with limited coverage such as India.
- Interactive 24-hour temperature, precipitation-probability and wind charts; 7-day daily forecast rows.
- Tap hourly points for chart tooltips; switch forecast period and metric.

### Grounded weather conversation
- Separate place/time/intent parsing, evidence selection, numerical calculations and response rendering.
- English questions about rain, umbrella guidance, today versus tomorrow, a particular hour, morning/afternoon/evening windows, winds, feels-like temperature, sunrise/sunset and suitable outdoor hours.
- `Will it rain in Jaipur tomorrow evening?` resolves Jaipur through geocoding, loads its actual forecast, selects tomorrow's 17:00–19:00 hourly samples for the **5–8 PM** window, and renders the supporting hourly values.
- Window precipitation is described as **peak hourly probability**, not a calculated probability for the entire interval.
- `Is tomorrow going to be hotter than today?` compares the two forecast daily highs; it does not confuse this with feels-like temperature.
- Common Hindi questions and basic Romanized Hindi phrases. Hindi responses explain the actual data, not just translated buttons.
- English/Hindi conversation selector; Hindi-script input is also recognized automatically. Voice recognition requests `en-IN` or `hi-IN` according to the selection.
- Hindi clock phrases such as `कल शाम ७ बजे`; ambiguous phrases such as `कल 7 बजे` ask for clarification.
- Browser speech recognition with transcription/listening state, optional text-to-speech, speaking feedback and stop-audio control. Permission, unsupported-browser and missing-Hindi-voice fallbacks are provided.
- Unknown or unavailable information is not replaced with invented weather. Historical/climate requests explicitly disclose that those datasets are not connected.
- No conversation history is persisted. Spoken audio may be processed by the browser's speech provider; city searches are sent to the geocoding provider.

### Advisories and personal preferences
- Explicit forecast-derived WATCH / WARNING / SEVERE thresholds for heat, heavy precipitation, gusts, thunderstorm codes, high UV and freezing temperatures.
- Advisories show their triggering thresholds and are **not official IMD/CAP/SACHET warnings**.
- Official warning status is unknown, not “no active warnings.” Links to IMD and SACHET let users check authoritative information separately.
- Up to 30 saved locations on the device, Celsius/Fahrenheit and km/h/mph preferences, and conversation-language preference.

## Architecture and files

No build step, package installation, server or credentials are required. Serve the project over HTTP(S); ES modules should not be opened via `file://`.

```text
index.html                 Semantic application shell and dialogs
css/style.css              Design tokens, layout, core components, responsive rules
css/interactions.css       Map detail panel, voice feedback, bilingual/evidence UI
js/app.js                  State, routing, search, location lifecycle, preferences
js/api.js                  Public provider requests, caching, validation, cancellation
js/weather.js              WMO conditions, units, dates, forecast advisories
js/intent.js               Bounded English/Hindi question interpretation
js/insights.js             Time-window evidence and grounded Hindi responses
js/assistant.js            Conversation orchestration, responses and browser speech
js/map.js                  Leaflet geography, sampled layers and radar playback
js/forecast.js             Forecast period/metric controls and Chart.js rendering
js/icons.js                Consistent SVG icons and text escaping
 tests/smoke.html           Development browser test runner
 tests/smoke.js             Pure interpretation tests and real-app interaction tests
 tests/assistant-view.html Redirect to the real assistant for visual inspection
 tests/map-view.html       Redirect to the real live map for visual inspection
```

### Data → interpretation → interface
1. `intent.js` interprets supported place, date, time-window and topic phrases.
2. `api.js` gets geocoding and forecast data from public providers.
3. `weather.js` / `insights.js` select data, convert units and calculate bounded summaries.
4. `assistant.js` renders an explanation, numerical evidence, source context and optional speech.
5. `app.js` maintains the active context shared with the map and forecast.

This separation is an extension point for a future backend and LLM adapter. It does **not** mean an LLM, GFS/WRF execution, RAG service or official-warning ingestion is already implemented.

## Functional entry URIs

| URI | Purpose |
| --- | --- |
| `/` or `/index.html` | Overview; restores the last device location or starts at New Delhi |
| `/index.html#overview` | Current conditions, map preview, forecast, assistant suggestions |
| `/index.html#map` | Larger geographic weather workspace |
| `/index.html#forecast` | Hourly and daily forecast exploration |
| `/index.html#alerts` | Forecast-derived advisories and official-source links |
| `/index.html#assistant` | Grounded text/voice weather conversation |
| `/index.html#locations` | Device-saved locations |
| `/tests/smoke.html` | Development test runner; uses the actual app in an iframe |
| `/tests/assistant-view.html` | Redirect-only visual test entry into the actual assistant |
| `/tests/map-view.html` | Redirect-only visual test entry into the actual live map |

No application query parameters are required. Preferences and data-source dialogs open from sidebar controls. `/` focuses search when not typing in an input; search supports arrow keys and Enter. Escape closes navigation, native dialogs or expanded map as appropriate.

## Public URLs and external dependencies

**Production URL: not deployed in this session.** No hosted API, production database or custom domain has been provisioned.

- Forecast/current model data: `https://api.open-meteo.com/v1/forecast`
- City geocoding: `https://geocoding-api.open-meteo.com/v1/search`
- Radar metadata: `https://api.rainviewer.com/public/weather-maps.json`
- Radar tiles: HTTPS RainViewer host and frame paths returned by metadata.
- Geography: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
- Official information links only: `https://mausam.imd.gov.in/` and `https://sachet.ndma.gov.in/`
- Leaflet 1.9.4 and Chart.js 4.4.8 from jsDelivr; DM Sans and Manrope from Google Fonts.

Map attribution is retained. CARTO was replaced after visual verification found API-key-required tiles. All displayed weather is fetched, never filled with hardcoded demo values.

## Data structures and storage

No Table API, D1, CosmosDB, PostgreSQL, Redis or other shared database is used in this version.

- **Location:** `{ name, country, region?, latitude, longitude, timezone? }`.
- **Weather:** Open-Meteo `current`, `hourly`, `daily`, `timezone`, unit metadata and a client `fetchedAt` timestamp. Hourly/daily values are parallel arrays indexed by provider-local timestamps.
- **Intent:** bounded topic, location query, day offset, optional clock/period, language and unsupported/historical flags.
- **Insight:** text, numerical metrics, optional location/time scope, hourly timeline and caveats.
- **Radar:** provider host, timestamped past/available-nowcast frames and active frame index.
- `localStorage['weathergpt.location']`: last selected location.
- `localStorage['weathergpt.saved']`: up to 30 saved places.
- `localStorage['weathergpt.preferences']`: temperature, wind and conversation language.
- In-memory expiring response cache: weather 10 minutes; map samples 15 minutes; radar metadata 5 minutes; geocoding 1 hour. Requests have an 18-second timeout. Search/map fetches are debounced and stale requests can be aborted.
- Forecast refresh on returning to the tab after 10 minutes. No background ingestion service.

## Verification

Latest functional browser run reported by the original author: **71 passed, 0 failed; no page exceptions.** **This is a historical claim and is currently unverified**: the shipped `tests/smoke.html` suite needs live public APIs and could not be reproduced in this environment. See `docs/BASELINE.md` for the reproducible baseline. Tests include:
- Real forecast and city search, shared location changes, all main routes.
- Unit conversion, daily/hourly charts, saved locations and dialogs.
- English/Hindi parsing, the Jaipur-evening example, hourly evidence and calculated comparisons.
- Hindi numeral/clock handling, ambiguous time clarification and historical-data boundaries.
- Map panel, map expansion/Escape, layer legend, real radar frame stepping and playback timestamps.
- Injected weather-service failure: stale values clear, assistant does not invent data, and Retry recovers a real forecast even while the map is hidden.
- Speech start/stop event wiring using a **test-only speech stub**. This does not test actual microphone/audio hardware.

Visual verification was reported by the original author on the real overview and assistant at **1280px desktop** and **390px mobile**. **Not independently verified in this environment.** The redirect-only visual entry pages navigate to `index.html` itself; they do not approximate mobile CSS inside a desktop wrapper.

Test fixtures exist only under `tests/`; the production UI never imports them. The runner restores saved storage keys afterwards. Exclude development test files from a production release if desired.

### Still needs device/manual validation
- A dedicated full Live map mobile screenshot could not complete because the browser-rendering service was saturated. The map embedded in the overview was visually verified on mobile; the full map route and controls passed functional tests.
- Real microphone capture, permission prompts and recognition accuracy on the demonstration device.
- Actual Hindi/English speech playback and installed system voices.
- Browser geolocation permissions and accuracy.
- Keyboard/screen-reader audit, broader browser testing, low-connectivity testing, service quotas and load testing.

## Explicitly not implemented

- General-purpose LLM reasoning/tool calling or a private-key AI integration.
- Custom backend, server-side API proxy, authentication/accounts, protected admin area, server rate limiting or environment-variable secret management.
- Official IMD/SACHET/CAP feed ingestion, warning polygons/geofencing, push notifications or emergency all-clear determination.
- Weather-station/sensor observations. Current values here are **model estimates**.
- Satellite imagery, lightning detection, storm-track prediction, continuous weather raster layers or guaranteed radar coverage in India.
- Historical weather/climate analysis, agricultural models, direct GFS/WRF execution or multi-model uncertainty comparisons.
- General translation or unrestricted natural-language understanding. Hindi is a bounded common-weather-question interpreter, not an LLM. The entire application UI is not translated.
- Arbitrary-date questions and every phrasing. The Forecast view exposes seven days; conversational parsing focuses on supported relative dates and time phrases.
- Secure user/cloud storage, offline maps/weather or service availability guarantees.

## Recommended next steps

1. **Rehearse the WeatherGPT demo:** search Jaipur → inspect the map → ask the evening-rain question → compare today/tomorrow → select हिन्दी and ask `कल जयपुर में बारिश होगी?` → demonstrate voice if the device supports it.
2. **Finish device QA:** microphone permissions, Hindi voices, geolocation, keyboard use and realistic mobile connectivity.
3. **Deploy the frontend** using the Publish tab or an explicitly approved Hosted Deploy. Do not treat saved project changes as an already-updated live domain.
4. **For a real LLM:** build a separately hosted credential-protecting backend with schema-validated weather tools, bounded output, provenance and refusal when data is absent. This static environment cannot implement that backend.
5. **Official warnings:** obtain an authorized, documented source; normalize event, area, severity, validity and attribution; distinguish unavailable feeds from zero active alerts before adding geographic matching.
6. **Only then add historical/climate, satellite and advanced model integrations**, with appropriate data rights and scientific review. Kubernetes, MQTT and a WRF run are not needed for this internal-round prototype.
7. **Production readiness:** review provider terms, availability and quotas. Open-Meteo's free service is intended for non-commercial use; OpenStreetMap's public tile service is not an unlimited production CDN. No load test or security certification is claimed.

## Reference video

Reviewed the uploaded prototype portion (approximately 11–29 seconds), not the presentation. Interaction inspiration: clear condition hierarchy, selectable map layers, selected-place detail and voice questions with spoken responses. WeatherGPT's layout, identity and visual system are original.
