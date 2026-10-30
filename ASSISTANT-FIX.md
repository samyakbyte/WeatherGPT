# Assistant location parsing fix — 30 October 2026

Fixed ordinary commute/umbrella questions being geocoded as College Keep or Keep. The parser now removes carrying verbs in action contexts, recognizes generic college/school/work/office/class destinations, filters punctuation-attached function words, and keeps temporal cleanup instead of restoring raw conversational clauses. Explicit College Keep, College Station, State College, Mumbai and existing district/state searches remain supported.

The user's exact question now keeps the selected weather location, resolves tomorrow in that location's timezone, and answers from forecast precipitation data. No new service, model, dependency or cost was added. This remains a deterministic weather assistant, not a general-purpose language model; these fixes do not guarantee comprehension of every possible phrase.

Validation: 566 logic checks and 138 fixture-based Chrome browser checks passed, including 11 added interpretation phrasings, a tomorrow-versus-today rainfall assertion and browser checks for no geocoding request and unchanged selected location. No uncaught page exceptions. Live providers and physical devices were not tested for this patch. REDESIGN-REPORT.md describes the prior redesign; this note supersedes its test counts for the assistant fix.

## Apply

Use the complete WeatherGPT-Mark-7-Assistant-Fixed.zip, or extract WeatherGPT-Assistant-Patch.zip into your existing reworked project, replacing the included files. The only changed application file is js/understanding.js; the other changed files are regression tests. Reload the page with Ctrl+F5.

If the old bug already changed your city to College Keep, select your actual city once through the city search. The fix cannot infer the city you intended or safely undo a previously saved selection.
