# Bounded hard-case batch

4,000 new normalized-unique question strings, checked against 3,800 earlier cases. Construction: eight subjects × five formulations × 100 date/hour combinations. These are parameterized adversarial tests, not 4,000 independent conversational intents. Six numerical subjects have target-specific values different from neighbouring hours. Some target values are missing; zero and negative temperatures are included. Future pressure and unmeasured rainwater pH must disclose limits. Every case runs with and without Compromise. The tests verify requested date/hour, target metric value or missingness, location preservation, no unexpected action and no invalid numerical output. They do not exhaustively cover multi-intent dialogue, real geocoder ambiguity or live forecast accuracy.

Baseline: 3,900 passed, 100 failed. Final: all 4,000 passed. One pressure-routing defect caused those 100 failures: outdoor context overrode the explicit pressure subject. Fixed by prioritizing pressure. Expectations were retained.

pH: blank/null/boolean/array inputs could previously convert into numerical readings. Strict decimal-value parsing now preserves missing input and rejects invalid types, while valid pH zero remains valid. 25 focused pH boundary checks pass. Existing record and scale functionality remains available. Assistant explanations now explain why atmospheric context cannot establish a pH probability.

No pH prediction model was invented. Air quality, air density and weather alone do not provide a validated estimate of dissolved acidity or a calibrated probability. Local paired precipitation chemistry data, suitable model development, held-out validation and uncertainty calibration would be required. Existing atmospheric screening remains context only. Sources: https://www.epa.gov/acidrain/what-acid-rain and https://pubs.usgs.gov/gip/acidrain/2.html .

Run `node tests/run-hard-4000.js` and `node tests/ph-input-boundaries.js`. Existing regressions are run separately. This batch uses deterministic data and executes the question bank through application functions, not 4,000 browser submissions. The ChatGPT five-hour allowance and RU consumption are not visible to the agent; no quota compliance measurement is claimed. Work was bounded to this batch and its repairs.

No runtime dependencies added. The complete ZIP includes previous functionality and skills. The incremental patch overlays WeatherGPT-Mark-7-600. See the answers CSV for all questions and evidence, including unavailable values.
