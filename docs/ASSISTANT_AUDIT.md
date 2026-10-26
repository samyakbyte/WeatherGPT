# Assistant pipeline audit (Phase 0)

Scope: location extraction, topic detection, date/time parsing, metric selection,
answer generation, language handling and context handling. Findings were
reproduced against the baseline code with a frozen synthetic forecast; the exact
observed output is quoted for each reported bug.

## Pipeline as shipped

1. `js/intent.js#parseWeatherQuestion` — normalises Devanagari digits and a
   Hindi/Latin phrase dictionary, then regex-extracts a coordinate, a known city
   from a hard-coded 22-entry dictionary, an `in|for|to …` phrase, or a `… में`
   phrase. Picks `topic` with a chain of `/regex/.test()` and a `period` from
   the first matching part-of-day word.
2. `js/nlp.js#interpretWeatherQuestion` — re-normalises synonyms, runs Compromise
   `#Place+`, **re-runs** its own `in|for|to` place regex, then applies
   weekday/ISO/relative date arithmetic, clock/range parsing, follow-up
   inheritance and clarifications. It writes legacy fields
   (`locationQuery`, `dayOffset`, `period`, `clock`, `topic`, `language`, …).
3. `js/assistant.js#createAssistant.submit` — geocodes `intent.locationQuery`,
   calls `app.selectLocation`, re-interprets the question against the new
   forecast, then calls `analyzeQuestion`.
4. `js/assistant.js#analyzeQuestion` — an English `if/else` chain over
   `intent.normalized`; `js/insights.js#hindiInsight` is a **separate, much
   smaller** Hindi chain; `js/nlp-insights.js` handles five metrics.

### Structural problems

* **Two place extractors and two normalisers.** Whether a phrase becomes a place
  depends on regex ordering and on which of three lookaheads fires first. There
  is no single validated intent object, no candidate list, and no notion of an
  unresolved slot or confidence.
* **Temporal phrases are stripped by hard-coded lookahead lists.** `nlp.js`'s
  `in\s+(?:\d|one|two|three)` stops at three; `four` and larger number words
  are not covered. Hindi/Romanized number words are absent.
* **`in` is treated as locative before it is tested as temporal.** "in four
  days" and "in the evening" can therefore become part of a place name.
* **Activity words are not removed before place extraction.** Compromise may tag
  verbs as places; the `to walk` pattern is accepted as a location.
* **Language is inferred from the preference, not the text.** With हिन्दी
  selected, English text is routed to the Hindi answer tree.
* **Two answer trees with different coverage.** English handles ~15 topics;
  `hindiInsight` handles comparison, alerts, clock, period, feels, rain, wind,
  sun and weather — not temperature, humidity, UV, visibility, pressure, clouds,
  outdoors, radar or crop advice.
* **Metric selection is decoupled from the requested time.** `feels`, `current`,
  `outdoors` and several daily answers read `data.current` or a fixed window.
* **Follow-up inheritance** is a regex on the raw question; it reuses date,
  topic and period but has no validation that the inherited slot still fits.
* **No request identity across async work.** `submit()` awaits geocode →
  `selectLocation` → re-parse → answer without checking that the user or the
  active location changed meanwhile. `selectLocation` aborts only the weather
  fetch, not the whole answer chain.
* **Time zone.** `today` comes from `weather.current.time.slice(0,10)`; the
  browser's clock is used only when no forecast is loaded. `utc_offset_seconds`
  and `timezone_abbreviation` from the provider are ignored. DST and
  midnight transitions between the user and the target place are untested.

## The five reported bugs — reproduced

Frozen fixture: `today = 2026-10-26`, hourly values constant (28°C,
apparent 30°C, 40% precipitation probability), daily high 32°C.

1. **"Feels like tomorrow at 7 PM?"**
   Parsed correctly (`topic: feels`, `dayOffset: 1`, `clock.hour: 19`), but the
   answer was: *"It is 29°C in Jaipur, with an apparent temperature of 31°C and
   65% humidity…"* — `analyzeQuestion`'s `feels` branch unconditionally reads
   `data.current.apparent_temperature`. **Root cause:** metric selection ignores
   the resolved date/time window.
2. **Hindi selected + "Temperature tomorrow?" / "Open radar"**
   Both returned the generic *"मैं सीमित प्रकार के मौसम प्रश्न समझता हूँ…"*
   unsupported reply. Parsed `topic` was `temperature` / `radar`, but
   `preferredLanguage==='hi'` forced `language:'hi'` and `hindiInsight` has no
   branch for those topics. **Root cause:** language inferred from preference +
   divergent answer trees.
3. **"Best time to walk tomorrow evening?"**
   `locationQuery === 'walk'` (from `to walk`). The outdoor answer then
   recommends **"around 6 AM"** although `period` was `{17,20,'5–8 PM'}`.
   **Root causes:** activity words not removed before place extraction, and the
   outdoor scorer hard-codes 6 AM–7 PM instead of the requested window.
4. **"Rain in London in four days?"**
   `locationQuery === 'London in four days'`, which would be sent verbatim to
   the geocoder. `dayOffset` was correctly 4. **Root cause:** the temporal
   phrase "in four days" was not in the removal list (only digits and
   one/two/three).
5. (Outdoor evening bug is item 3; the fifth distinct reported issue is the
   Hindi radar/temperature pair counted separately above.)

Additional gaps found while probing: `aaj ka tapman` (Romanized Hindi) returns
`topic:'other'` and a clarification; `kal baarish hogi kya` parses as rain but
answers in English; Hindi numbers exist only for a few digits; no support for
crop/farm intents, coordinate validation against a geocoder, or ambiguous
village names.

## Phase 1 design response

* One structured interpreter (`js/understanding.js`) returns a validated intent
  object: `topic`, `metric`, `place {query, candidates, status, context}`,
  `time {date, dayOffset, startHour, endHour, hour, granularity, zone, label}`,
  `language`, `script`, `confidence`, `unresolved[]`, `clarification`, plus
  backwards-compatible legacy aliases so existing views/tests keep working.
* Temporal phrases (English, Devanagari, Romanized Hindi), activity words and
  topic words are removed **before** place extraction; `in` is disambiguated by
  the token that follows it.
* Place candidates are validated by the geocoder; unresolved or ambiguous
  candidates become a short clarification with a choice list, never a silent
  substitution.
* Explicit, documented part-of-day windows (`data/time-windows.js`) drive both
  evidence selection and outdoor scoring.
* A single answer engine selects the metric **from the resolved window** in
  EN/HI, states the resolved date/time and zone in the reply, and reports
  missing forecast values honestly.
* Request IDs guard the geocode → weather → answer chain.
* Target-location time zone (`weather.timezone`, `utc_offset_seconds`,
  `timezone_abbreviation`) plus a frozen clock hook make "today/tomorrow" and
  midnight/DST cases deterministic and testable.
