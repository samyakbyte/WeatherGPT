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
* **Defect found (fixed in Phase 1):** the runner printed failures but never set
  a non-zero exit status. `node tests/run-node-tests.js; echo $?` returned `0`
  even when a check failed.
  Proof after the fix (deliberate failing test inserted, then removed):
  ```
  $ node tests/run-node-tests.js     # with one deliberate failing check
  [FAIL] DELIBERATE_FAILING_TEST_PROOF
  TOTAL: 392 passed, 1 failed
  exit code: 1
  $ node tests/run-node-tests.js     # after removal
  TOTAL: 392 passed, 0 failed
  exit code: 0
  ```
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

## Final verification (all phases, 2026-10-26)

| Suite | Command | Result |
| --- | --- | --- |
| Deterministic Node | `npm test` | **467 passed, 0 failed** (43 legacy + 7 bug regressions + 316 interpretation assertions over 126 phrasings + 26 reliability + 34 crop advisory + 25 farms/storage + 16 acidity) |
| Real-browser (mocked providers) | `npm run test:browser` | **47 passed, 0 failed**, 0 uncaught page exceptions |
| Runner failure semantics | deliberate failing check inserted/removed | exit code `1` with failure, `0` after removal |

The browser suite uses headless Chromium 153.0.8010.0 (via `playwright-core` +
`@sparticuz/chromium`), a local static server, and deterministic fixtures for
Open-Meteo, geocoding, Photon/Nominatim, RainViewer, OSM tiles, Leaflet,
Chart.js and Google Fonts. It verifies all original workspace features plus the
new farm dashboard, provenance, acidity, farm CRUD persistence, corrected
assistant behaviour, 360/390/768/1280 px layouts (no horizontal overflow),
keyboard focus, computed temperature bars and reduced-motion radar behaviour.

Screenshots (generated, gitignored): `screenshots/overview-360.png`,
`overview-390.png`, `overview-768.png`, `overview-1280.png`,
`assistant-390.png`, `farms-390.png`, plus `browser-results.json`.

**A live-API browser pass was not possible** from this sandbox (outbound
network is restricted to a small allowlist). It remains pending, together with
real microphone / Hindi TTS voices / geolocation permission / physical-device
checks — see the manual checklist in the README.

## README browser-test claim

The uploaded README states "Latest functional browser run: 71 passed, 0 failed"
and desktop 1280 px / mobile 390 px visual verification. Those are **historical
claims from the previous author**; they were not reproducible in this sandbox
(the shipped `tests/smoke.js` needs live APIs). The README is corrected to mark
them as unverified. A deterministic, committed browser suite is added in later
phases.
