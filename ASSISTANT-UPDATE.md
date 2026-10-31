# Assistant update — 31 October 2026

Includes the previous college/keep parsing fix.

- Current weather/current location phrases use the selected place; explicit Current River remains searchable.
- Rain answers start with practical umbrella guidance in English and Hindi, including time-window questions. A small nonzero chance recommends a compact umbrella; 20% and above recommends taking one; a complete 0% forecast says probably unnecessary, not guaranteed dry. These are product advice thresholds, not official meteorological thresholds. Incomplete probability data does not recommend leaving the umbrella behind.
- Farm responses start with available current model conditions, temperature, humidity and wind plus model timestamp, then retain the existing sourced/general crop precautions and forecast limitations. Missing current readings are stated explicitly.

Verification: 577 deterministic logic checks and 140 fixture-based Chrome browser checks passed, no uncaught page exceptions. Includes both reported questions, no unwanted location changes, real place-name preservation, zero/low/high/missing rain probabilities and missing current observations. Live providers and physical devices were not tested. No new runtime dependencies. This remains a rules-based weather assistant, not a general-purpose language model.

Extract the patch into the existing reworked project, replace included files and Ctrl+F5. Or use the complete project archive. If an earlier bug already changed the selected city, select your actual city once. Prior redesign reports describe their respective earlier test runs.
