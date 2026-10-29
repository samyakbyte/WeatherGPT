# Data sources research — WeatherGPT

All access dates: **2026-10-26**. Measurements below were made with direct HTTPS
requests to the public endpoints listed. Where a claim could not be verified,
it is marked **unverified** rather than guessed. This document is the evidence
base for Phase 2 (villages), Phase 3 (rainwater acidity) and Phase 4 (crop
guidance); it also records the spatial-resolution wording used in the UI.

---

## 1. Weather model data and resolution (Open-Meteo)

Source: <https://open-meteo.com/en/docs> (Forecast API docs, accessed
2026-10-26) and <https://open-meteo.com/en/features> (accessed via search
result 2026-10-26).

Verbatim facts from the page we read:

* JSON return object: `latitude, longitude` = *"WGS84 of the center of the
  weather grid-cell which was used to generate this forecast. This coordinate
  might be a few kilometres away from the requested coordinate."*
* `elevation` = *"The elevation from a 90 meter digital elevation model."*
* `utc_offset_seconds` = *"UTC offset for the requested timezone, in seconds,
  resolved at request time and fixed throughout the response, including across
  daylight saving time transitions."*
* Data-sources table: **ICON 2–11 km**, **GFS & HRRR 3–25 km**, **ICON CH 1–2 km**
  (regional models). The features page states resolution ranges from **1–2 km
  (regional mesoscale models) to 9–11 km (global models)**, with Open-Meteo
  selecting the highest-resolution model available per location.

**What WeatherGPT may say:** the default `Best match` request blends models; the
API response does **not** identify which model or which exact resolution produced
a given value. WeatherGPT therefore displays the documented **range** (about
1–11 km for regional models, 9–11 km for global models) and explicitly says it
is a **grid-cell forecast, not a measurement at the farm**. It never prints a
single invented "X km resolution" figure for a specific pin. It shows the
returned grid-cell centre coordinates and elevation alongside the requested
coordinates. See also <https://open-meteo.com/en/docs/ecmwf-api> (IFS HRES 9 km,
IFS 0.25° ≈ 25 km) and <https://open-meteo.com/en/docs/dwd-api> (ICON Global
0.1° ≈ 11 km) accessed the same day.

Terms: the free tier is documented as **non-commercial, <10,000 calls/day**
(<https://open-meteo.com/en/docs/geocoding-api>, usage licence selector, and
<https://open-meteo.com/en/terms>). Production/commercial use needs a plan.
Attribution: Open-Meteo; map data © OpenStreetMap contributors (ODbL).

Other weather dependencies: RainViewer past radar
(<https://api.rainviewer.com/public/weather-maps.json>), OSM raster tiles
(<https://tile.openstreetmap.org/{z}/{x}/{y}.png>), Leaflet 1.9.4 and
Chart.js 4.4.8 (jsDelivr), DM Sans/Manrope (Google Fonts). Radar coverage
varies, blank radar is not evidence of no rain.

---

## 2. Geocoding for Indian villages (Phase 2)

### Sources evaluated

| Source | Coverage observed | Licence / terms | Browser calls | Verdict |
| --- | --- | --- | --- | --- |
| **Open-Meteo Geocoding** `geocoding-api.open-meteo.com/v1/search` | City/town oriented. Returns `admin1..admin4`, `feature_code`, population, timezone, elevation. `name` matches a prefix (≥3 chars); a comma-separated country/**admin1 qualifier must match exactly**. | Free tier non-commercial, <10,000 calls/day; docs at `open-meteo.com/en/docs/geocoding-api`. | Yes, CORS-friendly JSON. | **Primary** for cities/states and a fast first pass. |
| **OSM Nominatim** `nominatim.openstreetmap.org/search` | Villages and hamlets with `address.village`, `state_district`, `state`, `postcode`, `type: village\|hamlet`, `display_name`, coordinates. | ODbL, attribution required. Usage policy: **max 1 request/second**, a valid identifying `Referer` or `User-Agent`, caching, **no autocomplete** (per-keystroke searching forbidden), apps must be able to switch the service at request. <https://operations.osmfoundation.org/policies/nominatim/>. | Yes, but only on explicit user submit — never on each keystroke. | **Secondary** for villages with district/state context. |
| **Photon** `photon.komoot.io/api/` | OSM-derived GeoJSON with `osm_value: village\|hamlet`, `county`, `state`, `country`, coordinates. | "You can use the API for your project, but please be fair - extensive usage will be throttled… no guarantee of availability." <https://photon.komoot.io/>. OSM/ODbL attribution applies. | Yes. | **Tertiary** fallback when Nominatim fails. |
| **LGD / data.gov.in** (official village directory) | Authoritative administrative list of Indian villages and codes, published by the Ministry of Panchayati Raj under NDSAP; catalogue at <https://www.data.gov.in/catalog/local-government-directory-lgd>, portal <https://lgdirectory.gov.in/>. A CKAN mirror lists a **93.2 MiB CSV, 664,395 villages** (2023) at <https://ckandev.indiadataportal.com/dataset/lgd-codes/…>. | Open government data (NDSAP); the mirror states Open Data Commons Attribution License. Official download/API behaviour and **whether coordinates are included** were **not verified** in this session. | Bulk CSV is not practical for a static frontend; would need a backend or a pre-built index. | **Pending** — promising but needs a verified, licensed, coordinate-bearing extract and a backend/index. Not implemented. |

### Measured test set (2026-10-26)

Small, deliberately duplicate-heavy set of real village names:

| Query | Open-Meteo | Nominatim | Photon |
| --- | --- | --- | --- |
| `Rampura, Alwar, Rajasthan` | `name=Rampura&count=10` returned 10 populated places (Punjab, MP, UP, Haryana, Rajasthan, Pakistan…); `name=Rampura, Rajasthan` returned 10 Rajasthan entries, none in Alwar district. **No Alwar/Reni village in the first 10.** | 3 results: 2 `village` + 1 `hamlet`, all with `state_district: Alwar`, `state: Rajasthan`, tehsil and postcode; e.g. Rampura, Reni Tehsil, Alwar (27.1258341, 76.7779326). | 5 results: villages/hamlets incl. `Rampura Patan`, `Nangla Rampura`; district field is a tehsil, state present. |
| `Kishanpura, Jaipur, Rajasthan` | not measured (Open-Meteo showed the same city-level bias above). | 5 results: 3 `village` + 2 `hamlet`, all `state_district: Jaipur` with distinct tehsils and coordinates. | 5 results: 3 `village` + 2 `hamlet`, matching Nominatim coordinates but with weaker district detail. |

**Decision:** primary = Open-Meteo (fast, cached, timezone + admin fields);
fallback = Nominatim for village/district queries; tertiary = Photon. All
requests are user-initiated (debounced ≥400 ms, minimum 3 characters), cached,
abortable, and rate-limited client-side to ≤1 Nominatim request/second. The UI
shows name, district/tehsil, state, coordinates and place type, and **never
silently picks one** when several matches exist. Repeat village names produce a
choice list. This is documented in the UI and README.

---

## 3. Rainwater acidity / acid deposition (Phase 3)

### Candidates investigated

1. **IMD Meteorological Monograph, "The Chemistry of Rain: Long-Term
   Observations and Insights from Indian GAW Stations"**, MoES/IMD/HS/Chemistry
   of Rain/02(2024)/64, 15 January 2025, 57 pp.
   <https://imdpune.gov.in/Reports/Met%20Monograph_e%20book.pdf> (PDF read
   2026-10-26). What is measured: event-based rainwater samples analysed at
   IMD's Pune precipitation-chemistry laboratory — pH, electrical conductivity
   and major ions (SO₄²⁻, NO₃⁻, Cl⁻, NH₄⁺, Ca²⁺, Mg²⁺, Na⁺, K⁺). The preface
   says IMD monitors precipitation chemistry at **11 GAW stations** and that
   samples were analysed for **1987–2021**; the study reports **ten** stations.
   Example station text actually read: Allahabad wet-season pH 4.4–8.2,
   dry-season 4.3–7.9, averages 5.0 / 5.1 over 1987–2021. Values are
   long-term/seasonal statistics, not current observations. Coverage: named
   Indian GAW stations only. Update frequency: this monograph is a one-off
   publication (Jan 2025); **no API, no machine-readable current feed found**.
   Terms: "Unclassified / Distribution: Unrestricted", but copyright
   "©2025 by India Meteorological Department, All Rights Reserved."
2. **IMD MAUSAM journal, "Precipitation chemistry over the Indian region"**,
   Vol. 43 No. 3 (1992), BAPMoN data 1976–87, event-based pH on filtered
   samples, monthly mixed samples for ion analysis.
   <https://mausamjournal.imd.gov.in/index.php/MAUSAM/article/view/3450>
   (the article page says *"Download data is not yet available"*). Historic
   research article, not a live dataset.
3. **EANET** (Acid Deposition Monitoring Network in East Asia): wet-deposition
   pH, EC, ions, monthly/annual XLSX and PDF data reports downloadable without
   registration; hourly/weekly CSV requires registration.
   <https://monitoring.eanet.asia/document/public/index>,
   <https://www.eanet.asia/about/monitoring/>. EANET measures wet deposition
   (rainwater pH etc.), soil/vegetation and inland waters. The accessible EANET
   material describes monitoring in East/Southeast Asia; **no Indian monitoring
   station was identified in the material we could access** (this is not a legal
   determination of membership). No API was found; reports are static files.
4. Peer-reviewed syntheses (e.g. Springer, "Annual and decadal variation in
   chemical composition of rain water at all the ten GAW stations in India",
   2016) report long-term mean pH ranges, but they are paywalled/aggregated
   literature, not a per-farm, dated, machine-readable source.

### Outcome

**No suitable local, current, programmatically accessible measured rainwater-pH
dataset was found.** The only credible Indian measurements are **historical
station studies** (1970s–2021) at a handful of GAW/BAPMoN stations, published
as PDFs/monographs with no API and no per-observation coordinates or licence
statement that clearly permits redistribution inside this app. Extrapolating a
station's historical pH to a farm would be misleading, and deriving pH from AQI,
rain probability, temperature or pollution proxies has no validated method and
is explicitly out of scope.

Therefore the UI shows exactly: **"Rainwater acidity data unavailable for this
location."** — no number, no placeholder. It links to the IMD monograph and the
MAUSAM article as research context, and separately offers **user-provided pH
readings** (value 0–14, date, method, notes), stored only on the device and
labelled as user-recorded. A record may include value (0–14), date, method,
source, place, coordinates, farm linkage and notes; older records without
coordinates remain in history but are not plotted. Rainwater pH, soil pH and
irrigation-water quality are three separate fields in the data model and in
assistant answers; the app never recommends soil treatment from a rainwater
reading.

---

## 4. Agricultural guidance sources (Phase 4)

Only documents actually opened and read on 2026-10-26 are used as sourced
guidance. Short summaries only — no long quotations, no doses, no prescriptions.

| ID | Source | What was read | Region / scope |
| --- | --- | --- | --- |
| `AAS-WB-2026` | IMD, **Agromet Advisory Service Bulletin for the State of West Bengal & A&N Islands**, Bulletin No. 85/2026, issued 23.10.2026. <https://mausam.imd.gov.in/kolkata/mcdata/aas.pdf> | Heavy-rain/thunderstorm actions: provide proper drainage channels in fields, stick support for crops, cover harvested produce in the field, drain excess water from standing crops; dry-weather advice: irrigate according to soil moisture and crop need, spray only on clear sunny days; "do not spray during rainfall or when rain is expected immediately after spraying". | West Bengal & A&N Islands district bulletins; issued twice weekly by AMFUs. |
| `IARI-2026-59` | ICAR-Indian Agricultural Research Institute, **Weather Based Agromet Advisory Bulletin**, Year 33, No. 59/2026-27, 23 Oct 2026, English and Hindi. <https://www.iari.res.in/bms/agromet/index.php> and <https://www.iari.res.in/bms/agromet/index-hindi.php> | Harvest mature rice during a dry window, dry in the field 2–3 days, dry grain to below 12% moisture before storage; transplant healthy cauliflower/cabbage/broccoli/tomato seedlings onto raised beds; use crop residues as mulch to conserve moisture. | Delhi and NCR only. |
| `ICAR-KHARIF-2025` | ICAR, **Kharif Agro-Advisories for Farmers 2025**, May 2025, ISBN 978-81-983602-6-7; page states "may be used/shared freely for non-commercial purposes with proper acknowledgement". <https://www.icar.org.in/sites/default/files/Circulars/ICAR-En-Kharif-Agro-Advisories-for-Farmers-2025.pdf> | Raised beds/ridges on well-drained soil to prevent water stagnation during high kharif rainfall; raised nursery beds with good drainage to avoid waterlogging; ensure drainage especially in low-lying fields; during dry spells provide life-saving irrigation; maintain 20–30 cm bunds and a 30 cm drainage channel between rice nursery beds. | State-by-state chapters; the passages read are from the **Andaman & Nicobar Islands** chapter. They are labelled as such in the knowledge base. |
| `GKMS-SOP` | IMD, **GKMS Standard Operating Procedure**, Publication No. MoES/IMD/AASD/SOP/01(2020)/02. <https://mausam.imd.gov.in/imd_latest/contents/pdf/gkms_sop.pdf> (search excerpt only — **not fully read**) | Describes district/block agromet advisories prepared twice weekly for 690 districts by 130 AMFUs. Used only to explain the official service that farmers should consult; **no guidance text is taken from it** because we did not read the full document. | India (programme description). |

Knowledge-base entries are flagged either `sourced` (with one of the IDs above,
publisher, URL, access date, region) or `general` — *"general precaution, no
crop-specific source found"*. No entry carries a pesticide/fertiliser dose,
irrigation quantity or treatment prescription. For product/dose decisions the
UI points to the nearest KVK / state agriculture department. Disease language
is limited to "conditions that can favour fungal diseases; inspect your crop
and consult your local KVK or agriculture officer" — the app does not diagnose
disease from weather.

### Unverified / pending

* ICAR-CRIDA National Agromet Advisory Service Bulletin PDFs
  (<https://www.icar-crida.res.in/Weather_info_Agromet_Advisory.html>) — one
  archived bulletin URL failed to fetch in this session; not cited.
* Crop-stage-specific, India-wide official thresholds for hazard levels were
  not found. Thresholds in `data/hazard-thresholds.js` are **engineering
  defaults for detection**, clearly labelled as configurable and not official
  agronomic thresholds.

---

## 5. Agricultural screening, forecast risk and demonstrations

The dashboard consumes the existing seven-day Open-Meteo model forecast
documented in §1; it does not add or fabricate live weather. The three-day
alert/advisory knowledge base described in §4 remains distinct from the
seven-day view.

`data/hazard-thresholds.js` is the single source for heat, cold, rain, wind,
humidity and dry-spell screens. These values retain the existing WeatherGPT
weather-alert defaults where applicable and are engineering detection rules,
not official IMD warnings or crop-damage thresholds. The dashboard states this
limitation beside each result. Humidity is a weather-associated disease-pressure
signal only; the app does not diagnose disease.

The suitability number is a deterministic **shared, crop-agnostic weather
screen**: temperature 40%, rainfall 30%, gusts 15%, hourly humidity 15%. A
factor with insufficient/missing input is omitted and the remaining weights
renormalized; the UI reports available-factor coverage and each factor's value,
status, and reason. The available data and configured screens are not calibrated
to crop response curves. Selecting a crop chooses its advisory context, but does
not change the shared score. It is explicitly not crop health, yield, an
agronomic recommendation, or proof that conditions are safe. Rainwater pH is
not a score input; absent pH stays unknown.

Presentation scenarios (`acid-rain` pH 4.2/French Beans, 44 °C/Tomato,
heavy-rain/Wheat, and normal conditions) are code-defined synthetic fixtures in
`js/demo.js`. They use no weather or pH provider, are labelled throughout the
UI, exist only in memory, do not modify live weather, farms or user pH history,
and disappear on exit/reload. The acid-rain demonstration's simulated pH value
is not an observation and cannot be saved as one. Real map pH markers are only
geolocated user-recorded measurements; the app has no connected live pH station
feed and draws no interpolated pH surface.

---

## 6. Atmospheric monitoring (Open-Meteo Air Quality API)

**Endpoint:** `https://air-quality-api.open-meteo.com/v1/air-quality` —
<https://open-meteo.com/en/docs/air-quality-api>. WeatherGPT requests one selected
coordinate at a time with documented `hourly` fields `sulphur_dioxide`,
`nitrogen_dioxide`, `pm2_5`, `pm10`, and `ozone`, `forecast_days=2`, and
`timezone=auto`. Request coordinates are rounded to three decimal places; the
response's returned latitude/longitude are retained and shown as the model-grid
centre when provided. The UI uses the provider's pollutant units (normally
µg/m³) and hourly timestamps; a missing value or unit is shown as unavailable,
never as zero.

These are **atmospheric model/forecast grid estimates**, not direct sensor or
ground-station observations. Open-Meteo documents this API's CAMS European Air
Quality Forecast at 0.1° (about 11 km) and CAMS Global Atmospheric Composition
Forecasts at 0.4° (about 45 km); the European and global domains are not coupled
and can differ. The provider does not identify the selected model in each
response, so WeatherGPT does not claim which model supplied an individual value.
The returned coordinates identify the provider's selected grid point. WeatherGPT
displays that single point and does not interpolate it, paint a heatmap, or imply
street/field precision. No regional multi-point grid is requested. Pollutant
values are shown individually; the app does not infer rainwater pH, acid-rain
probability, health impact, or crop damage from them. Elevated SO₂/NO₂ can be
relevant to atmospheric chemistry and deposition but does not establish the
acidity of rain at a location.

The browser caches successful per-URL responses for 15 minutes, deduplicates
matching in-flight requests, cancels outdated map-selection requests, bounds
the cache, and issues no per-pixel requests. A user-triggered refresh bypasses
the valid cache; HTTP 429 responses receive a temporary retry cooldown. No API
key or backend is used. The Open-Meteo Air Quality API is documented as
non-commercial with fewer than 10,000 daily API calls; review the provider's
current terms before deployment or commercial use. Attribution links to
Open-Meteo and its Air Quality API documentation are shown in the interface.

Rainfall context is separately read from the existing Open-Meteo weather
forecast. `current.precipitation` is labelled a model current estimate;
`daily.precipitation_sum` and `daily.precipitation_probability_max` are labelled
forecast values. Rain probability is not observed rainfall and none of these
weather values is rainwater chemistry. No separate Copernicus CAMS client was
added; atmospheric concentrations are obtained only through the documented
Open-Meteo API integration.

The app retains the independent user-recorded pH system. Its points remain
marked `MEASURED · USER-RECORDED`; old records without coordinates remain in
history and are not assigned invented map coordinates. Demo pH remains
`SIMULATED` and is never written to the pH cache or persistence.
