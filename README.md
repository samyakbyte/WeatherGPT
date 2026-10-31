# WeatherGPT

A static, forecast-first weather intelligence workspace with a deterministic
English/Hindi assistant and farm-focused, forecast-derived guidance.

**WeatherGPT is a browser application, not a deployed service.** It has no
backend, no database, no accounts, no official warning feed and **no LLM**.
Every weather number it shows comes from a public provider response; where data
is missing it says so instead of guessing. It is not safety-critical software.

---

## Quick start

No build step and no credentials are required for normal use.

```bash
# Serve over HTTP(S) — ES modules do not work from file://
python3 -m http.server 8000 --bind 0.0.0.0
# open http://localhost:8000/
```

Optional developer tooling (tests only):

```bash
npm install                 # playwright-core, @sparticuz/chromium, leaflet, chart.js
npm test                    # deterministic Node suite (no network)
npm run test:browser        # real headless Chromium, mocked providers, screenshots
```

`tests/smoke.html` and `tests/nlp.html` are legacy browser pages that use the
**live** public APIs. They are kept for reference but their historical results
are not claimed here (see "Verification" below).

---

## What works

### Weather workspace
* Current model estimates, feels-like temperature, humidity, wind/direction,
  pressure, visibility, precipitation, UV and sunset; local forecast times;
  daily high/low and a daily summary.
* 24-hour temperature / rain-chance / wind charts (Chart.js) and a 7-day view
  whose temperature bars are computed from the week's real min/max range, with
  accessible text values.
* Leaflet map with OpenStreetMap tiles, five sampled model layers (temperature,
  wind, clouds, humidity, pressure), a draggable pin with an explicit confirm
  step, an expanded map and a selected-location panel.
* RainViewer past radar frames with stepping, scrubbing, speed control and
  playback; reduced-motion users get stepping only. Blank radar never means
  "no rain".
* Debounced city/village search with district/state context and explicit
  duplicate-choice lists; coordinate entry (with swapped lat/lon confirmation);
  browser geolocation with a permission message and a search fallback.
* Up to 30 saved places and 30 named farms, stored only on this device, with a
  versioned schema and migration from the older saved-places list.
* An active-farm dashboard at the top of the overview: farm summary, the next
  72 hours of forecast-derived hazards and recommended actions, data provenance
  and rainwater acidity.
* Preferences (Celsius/Fahrenheit, km/h/mph, English/Hindi), saved locations,
  dialogs, keyboard navigation, visible focus, reduced motion and
  loading/error/retry states.

### Assistant (deterministic, not generative AI)
* One structured interpreter (`js/understanding.js`) handles English,
  Devanagari Hindi and Romanized Hindi: place, topic, metric, part-of-day
  window, relative/weekday/ISO dates, follow-ups and ambiguity.
* Every answer uses the **requested** place, date, time window and metric; it
  states the resolved date, time and target time zone so misreads are visible.
  Ambiguity produces one short clarifying question with choices. Unresolved
  places are validated against the geocoder and never silently substituted.
* Same topics in both languages: rain, temperature, feels-like, wind, humidity,
  clouds, UV, visibility, pressure, sunrise/sunset, today-vs-tomorrow
  comparison, outdoor planning, radar, alerts and crop advice.
* Browser speech recognition (`en-IN`/`hi-IN`) and optional text-to-speech are
  wired, with explicit unsupported/permission fallbacks. These are **browser
  features** and cannot be verified headlessly (see manual checklist).
* No conversation history is stored.

### Crop advisories
* Forecast hazards are calculated from the loaded hourly/daily arrays using the
  configurable thresholds in `data/hazard-thresholds.js`: heavy rain (24/48/72 h
  totals + peak intensity), heat, cold/frost-risk screening, gusts, consecutive
  dry days and prolonged humid spells. Missing values are reported, never
  defaulted.
* Each advisory has four labelled parts: weather expected (numbers, where,
  when, grid caveat), why the crop/stage may be affected, what to do and when,
  and evidence/limitations. **Calculated forecast facts and sourced/general
  guidance are visibly separate.**
* The knowledge base (`data/crops.js`) covers wheat, rice, maize, mustard,
  cotton, soybean, potato, tomato and sugarcane, plus a labelled generic
  fallback. Sourced entries are short summaries of ICAR / IARI / IMD agromet
  publications we actually read; all other entries say "general precaution, no
  crop-specific source found". **No pesticide dose, fertiliser rate, irrigation
  quantity or treatment prescription is included.** Weather alone is never used
  to diagnose disease.
* The assistant can verify a farmer's claim ("heavy rain is forecast") against
  the actual forecast and say plainly when the forecast does not support it.

### Rainwater acidity
* Research outcome: **no suitable current, local, machine-readable measured
  rainwater pH dataset is connected** (see `docs/DATA_SOURCES.md`). The UI shows
  exactly: **"Rainwater acidity data unavailable for this location."**
* Users may record their own readings (value 0–14, date, method, notes), clearly
  labelled "User-provided" and stored only on this device.
* Rainwater pH, soil pH and irrigation-water quality are three separate
  concepts in the UI, data model and assistant answers. No soil treatment is
  recommended from a rainwater reading.

---

## Architecture

```
index.html                  Semantic shell: workspace, farm dashboard, dialogs
css/style.css               Core design tokens/layout (minified)
css/interactions.css        Panels, farm/hazard/provenance UI, a11y, mobile
js/app.js                   Shared state, routing, search, location lifecycle
js/api.js                   Public provider requests, cache, timeout, abort
js/geocode.js               Open-Meteo → Photon → Nominatim (explicit only)
js/farms.js                 Versioned farm storage + legacy migration
js/farm-ui.js               Farm CRUD UI, active-farm dashboard, acidity panel
js/provenance.js            Source/grid/elevation/update provenance
js/acidity.js               Rainwater acidity + user-provided readings
js/weather.js               WMO codes, units, daily advisories
js/timezone.js              Target-location civil time (IANA/DST), hour windows
js/understanding.js         Single structured intent interpreter (schema v2)
js/intent.js, js/nlp.js     Compatibility facades + lazy Compromise loader
js/answers.js               Unified metric-aware bilingual answer engine
js/insights.js, js/nlp-insights.js  Narrative/period evidence
js/assistant.js             Conversation, speech, request identity/abort
js/advisory.js              Crop advisory composition + assistant integration
js/hazards.js               Forecast-derived hazard calculation
js/map.js, js/forecast.js   Leaflet map/radar, Chart.js forecast
js/icons.js                 SVG icons + HTML escaping
data/time-windows.js        Explicit part-of-day windows
data/hazard-thresholds.js   Documented, configurable detection thresholds
data/crops.js               Versioned crop knowledge base + sources
docs/ARCHITECTURE.md        Module/data-flow/storage map
docs/ASSISTANT_DECISION.md  Why there is no LLM
docs/DATA_SOURCES.md        Geocoding, pH and agricultural research log
docs/BASELINE.md            Baseline + reproducibility notes
tests/                      Node suites, browser suite, fixtures
```

Data flow: question → structured intent → geocoder validation →
`fetchWeather` (Open-Meteo, `timezone=auto`) → `state.weather` → evidence
selection / hazard calculation → English or Hindi answer; `app.js` shares one
`state` object with the map, forecast, advisories and assistant.

### Device storage (`localStorage`)
| Key | Contents |
| --- | --- |
| `weathergpt.location` | Last selected place |
| `weathergpt.saved` | Legacy saved places (read-only, migrated) |
| `weathergpt.preferences` | Units + conversation language |
| `weathergpt.farms.v2` | `{version:2, farms:[...], activeFarmId}` |
| `weathergpt.rain-ph.v1` | User-provided pH readings |

In-memory cache: weather 10 min, map samples 15 min, radar 5 min, geocoding
1 h; requests time out after 7–18 s and are abortable.

---

## Data sources, licences and attribution

| Source | Used for | Terms / attribution |
| --- | --- | --- |
| [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | Current, hourly, daily weather | Free tier documented as non-commercial, <10,000 calls/day. Attribution "Open-Meteo". |
| [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) | Primary place search | Same non-commercial terms; GeoNames-derived data. |
| [Photon](https://photon.komoot.io/) | Village type-ahead fallback | "Be fair, extensive usage will be throttled"; no availability guarantee. © OpenStreetMap contributors (ODbL). |
| [OSM Nominatim](https://operations.osmfoundation.org/policies/nominatim/) | Explicit village search only | ODbL; ≤1 request/second; valid Referer/User-Agent; **no autocomplete**; apps must be switchable. |
| [OpenStreetMap tiles](https://www.openstreetmap.org/copyright) | Map background | © OpenStreetMap contributors, ODbL. |
| [RainViewer](https://www.rainviewer.com/) | Past radar frames | Public metadata/tiles; coverage varies. |
| Leaflet 1.9.4, Chart.js 4.4.8 (jsDelivr) | Map/chart libraries | BSD-3 / MIT respectively; vendored only for tests. |
| DM Sans, Manrope, Noto Sans Devanagari (Google Fonts) | Typography | Open font licences. |
| [IMD AAS Bulletin 85/2026](https://mausam.imd.gov.in/kolkata/mcdata/aas.pdf), [ICAR-IARI Bulletin 59/2026-27](https://www.iari.res.in/bms/agromet/index.php), [ICAR Kharif Agro-Advisories 2025](https://www.icar.org.in/sites/default/files/Circulars/ICAR-En-Kharif-Agro-Advisories-for-Farmers-2025.pdf) | Sourced agricultural precautions | Public government/ICAR advisories; short summaries with attribution and region context. |
| [IMD Met. Monograph "The Chemistry of Rain"](https://imdpune.gov.in/Reports/Met%20Monograph_e%20book.pdf), [MAUSAM 43(3) 1992](https://mausamjournal.imd.gov.in/index.php/MAUSAM/article/view/3450) | Rainwater-acidity research context | Historical station research; **not** displayed as data in the app. |

Full measurements, coverage notes, licence caveats and unresolved items:
[`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

### Spatial resolution and accuracy

Open-Meteo documents model resolutions from about **1–2 km (regional)** to
**9–11 km (global)**; its "Best match" request blends models and the API does
**not** report which model produced a given value. The API returns the
**grid-cell centre coordinates** and an **elevation from a 90 m DEM**; the grid
centre can be a few kilometres from the requested point. WeatherGPT shows those
values in the expandable provenance panel and labels every value "forecast for
this grid cell, not measured at your field". Radar and map layers are sampled /
modelled, not measurements at the pin. Current conditions are model estimates,
not station observations. `utc_offset_seconds` is fixed per response even
across DST transitions, so provider local civil timestamps are used directly.

---

## Privacy

* Farm names, crops, growth stages, sowing dates, irrigation, drainage and
  notes are stored **only in this browser**. Only latitude/longitude are sent to
  the weather API; place-name text is sent to geocoders when you search.
* No accounts, analytics, adverts, cookies or server-side storage.
* No conversation history is persisted.
* Voice input uses your browser's speech service (its provider may process
  audio); text-to-speech is local to the browser. Both are optional.
* Radar tiles, map tiles, CDN libraries and fonts are fetched from third
  parties listed above; your browser contacts them directly.

## Credentials and environment

**None required.** No private key exists in the frontend, repository or git
history. `.env.example` documents placeholder names for a *future* assistant
backend; no code reads them today. See
[`docs/ASSISTANT_DECISION.md`](docs/ASSISTANT_DECISION.md).

## Functional vs pending configuration

| Capability | Status |
| --- | --- |
| Weather, forecasts, charts, map, radar, search, saved places, farms, provenance | **Functional** (needs public network from the browser) |
| Deterministic EN/HI assistant, crop advisories, hazard engine | **Functional** |
| Rainwater acidity | **Functional as an honest unavailability state** + user-entered readings; no sourced local pH feed |
| LLM / generative assistant | **Not implemented** — no backend, no credentials, no flag, no claim |
| Official IMD/CAP/SACHET warning ingestion | **Not implemented** — links only |
| Historical / climate datasets, satellite, lightning, storm-track prediction | **Not implemented** |
| Live-API browser pass from this sandbox | **Pending** — outbound network is allowlisted here; mocked-provider browser suite runs instead |
| Real microphone, Hindi TTS voices, geolocation permission, physical devices | **Needs manual device testing** |

---

## Verification

### Automated (reproducible)
```bash
npm test             # 467 checks, 0 failures (frozen clock / synthetic forecast)
npm run test:browser # 47 checks, 0 failures (real headless Chromium 153, mocked providers)
```
* Node runner exits **non-zero** on any failure (proved with a deliberate
  failing test — see `docs/BASELINE.md`).
* Node coverage: 43 original checks, 7 reported-bug regressions, 126
  interpretation phrasings (316 assertions), time-zone/DST/midnight/ambiguity
  races, farm storage migration, acidity honesty, and crop-advisory scenarios
  (heavy rain, heat, frost, wind, dry spell, humid, no hazard, missing data,
  unsupported crop, Hindi).
* Browser suite writes screenshots to `screenshots/` (gitignored):
  `overview-360.png`, `overview-390.png`, `overview-768.png`,
  `overview-1280.png`, `assistant-390.png`, `farms-390.png`, plus
  `browser-results.json`. It checks no horizontal overflow at 360/390/768/1280,
  keyboard focus, reduced motion disabling radar autoplay, computed temperature
  bars, farm CRUD persistence across reloads, and no uncaught page exceptions.

### Not verified here
* The legacy `tests/smoke.html` suite's historical "71 passed" claim is from
  the previous author and requires live public APIs; it is **unverified** in
  this environment. The new browser suite replaces it for deterministic CI.
* A true live-API browser pass (Open-Meteo / Nominatim / RainViewer / OSM /
  jsDelivr / Google Fonts) could not run from the sandbox's network allowlist.
* Microphone capture, speech-recognition accuracy, installed Hindi TTS voices,
  geolocation permission prompts, screen readers and real devices.

### Manual device-testing checklist
- [ ] Microphone permission grant/deny; transcription in English and Hindi.
- [ ] Text-to-speech: English voice, Hindi voice, missing-Hindi-voice fallback.
- [ ] Geolocation permission, accuracy and the denial fallback.
- [ ] Live search for a village with district/state; duplicate choice list.
- [ ] Map pin drag + confirm; coordinate entry including swapped order.
- [ ] Farms survive a reload; old saved places still appear.
- [ ] 360 px and 390 px layouts with the on-screen keyboard open.
- [ ] Keyboard-only walkthrough and a screen reader on the assistant live region.
- [ ] `prefers-reduced-motion`: radar autoplay disabled, no non-essential animation.
- [ ] Provider failure: stale values clear, retry recovers, no invented data.

## Known limitations

* Bounded interpreter: unsupported phrasings get a clarification, not a guess.
* Crop guidance is mostly general and labelled as such; only a few sourced
  IMD/ICAR/IARI precautions are available, with their region context.
* Hazard thresholds are engineering defaults, not official agronomic thresholds.
* The free Open-Meteo tier is for non-commercial use; OSM's public tile service
  and Nominatim are not unlimited production CDNs. Review terms before
  commercial deployment.
* No official warning feed: absence of an advisory is not an all-clear.
* `css/style.css` is minified and `css/interactions.css` contains an appended
  override layer; a full CSS consolidation is still outstanding.

---

WeatherGPT is a demonstration workspace. Verify official IMD/SACHET warnings
before safety-critical decisions, and consult your nearest KVK or state
agriculture department before crop-treatment decisions.


## Open Sky redesign (30 October 2026)

The redesigned frontend preserves the original static application and all ten project-local skills. See `DESIGN.md` for the visual system and feature map, and `REDESIGN-REPORT.md` for verification, sizes and limitations.

On Windows, serve the project with `python -m http.server 8000 --bind 127.0.0.1`, then open http://localhost:8000. Do not open index.html directly. Internet access is needed for public weather providers, maps, fonts and the existing CDN libraries.

The weather panel has a Pause atmosphere control. It remembers the choice on this device and honors system reduced motion. The forecast includes an expandable table of all plotted values. No new npm dependency was added.

The browser suite can use an installed Chrome or Edge on Windows. After installing the existing development dependencies, set `WEATHERGPT_BROWSER_PATH` to the browser executable and run `npm run test:browser`. In PowerShell, for example:

```powershell
$env:WEATHERGPT_BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npm run test:browser
```

The default bundled Chromium path remains available for the original Linux test environment. Browser tests use deterministic fixtures; their screenshots are examples of the interface, not live weather observations.


### Assistant 1,000-statement regression set

Run `npm run test:assistant` for the reproducible statement matrix, with and without the optional NLP library. Results are written to `docs/ASSISTANT-1000-RESULTS.json`. The browser suite also evaluates the matrix in Chrome and retains its form-interaction checks. See `ASSISTANT-1000-REPORT.md` for test scope and limitations.
