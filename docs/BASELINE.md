# Phase 0 baseline — measured, not assumed

Recorded 2026-10-26 on commit `8a35570` ("Add files via upload"), before any
feature change. **GitHub is the source of truth**; the Google Drive folder was
used only to confirm the uploaded file set (same 26 paths and byte sizes).

## Node test runner

```
$ node tests/run-node-tests.js
TOTAL: 43 passed, 0 failed
```

* The fixture is a synthetic, frozen 7-day forecast (dates 2026-09-15…21) plus a
  deterministic `current` block. No network is used.
* **Defect found:** the runner prints failures but never sets a non-zero exit
  status. `node tests/run-node-tests.js; echo $?` returns `0` even when a check
  fails. Phase 1 fixes this and proves it with a deliberate failing test.
* The browser-only `tests/nlp.html` / `tests/nlp-tests.js` page duplicates most
  of the Node checks; it was not re-run in this environment at baseline.

## Real-browser verification (headless Chromium, mocked providers)

A headless Chromium 153.0.8010.0 (via `playwright-core` + `@sparticuz/chromium`)
loaded the actual `index.html` from the local static server at 1280×900.
Public network calls were intercepted and answered with deterministic fixtures;
Leaflet 1.9.4 and Chart.js 4.4.8 were served from local npm copies of the exact
versions the page requests. **This is a real browser, but all provider traffic
was mocked** — the sandbox permits outbound requests only to a small allowlist,
so live Open-Meteo/RainViewer/OSM traffic from the browser could not be
exercised here. Live-API behaviour remains unverified (see below).

**16 checks passed, 0 failed, 0 uncaught page exceptions.**

| # | Feature | Result |
| --- | --- | --- |
| 1 | Current conditions (temperature, place, feels-like, metrics) | renders from forecast fixture |
| 2 | Hourly strip | 8 items |
| 3 | Chart.js canvas | present |
| 4 | 7-day daily forecast rows | 7 rows |
| 5 | Rain-chance metric / unit switch | `%` |
| 6 | Leaflet map + OSM tiles | `.leaflet-container` initialised |
| 7 | Map layer switching | wind legend renders |
| 8 | Radar timeline | frames loaded, "past radar only" caption |
| 9 | City search | result list appears |
| 10 | Saved-location toggle | `aria-pressed` flips |
| 11 | Preferences dialog | opens |
| 12 | Advisories view | renders content |
| 13 | Assistant question | answer rendered |
| 14 | Assistant numerical evidence | metrics rendered |
| 15 | Language switch | Hindi placeholder |
| 16 | Page exceptions | none |

### Explicitly not verified at baseline

* Radar **playback animation** and frame stepping (controls exist; only the
  timeline was checked), map sample-point fetching, expanded map/Escape, and
  keyboard-only operation were not exercised at baseline.
* **Voice**: browser speech recognition, microphone permission, speech synthesis
  voices and Hindi TTS cannot be validated headlessly. Event wiring only.
* **Geolocation**: permission prompt and device accuracy not exercised.
* **Live APIs**: Open-Meteo, geocoding, RainViewer, OSM tiles, CDN and Google
  Fonts were mocked. The README's claim of "71 passed, 0 failed" for
  `tests/smoke.html` is from the previous author and is **not verified here**;
  that suite requires live public APIs from a real browser. It is marked
  unverified in the README until a live pass is possible.
* Physical devices, 360/390/768 px layouts, contrast and screen readers.

## README browser-test claim

The uploaded README states "Latest functional browser run: 71 passed, 0 failed"
and desktop 1280 px / mobile 390 px visual verification. Those are **historical
claims from the previous author**; they were not reproducible in this sandbox
(the shipped `tests/smoke.js` needs live APIs). The README is corrected to mark
them as unverified. A deterministic, committed browser suite is added in later
phases.
