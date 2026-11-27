# WeatherGPT — Atmospheric Observatory

WeatherGPT turns local forecast and environmental data into practical decisions for daily life and farming. Its audience needs a readable instrument outdoors and at a desk; the mode is Operate.

## Direction

A cinematic photographic weather scene beside a precise forecast instrument. Charcoal navigation and chart surfaces frame a warm gold forecast line. Pale supporting surfaces separate map, assistant and farming tasks. Desktop uses a compact icon rail and a 7:5 hero/forecast split; mobile stacks the same real information. The generated landscape is decorative, not a location photograph.

Considered visual sources: monsoon sky (chosen atmosphere), aviation weather charts (label precision), field notebooks (compact supporting evidence), coastal light (palette), observatory publications (type hierarchy), railway timetables (comparison alignment), and topographic atlases (map clarity). These informed one direction, not seven competing styles.

## Tokens

- Ink `#172e43`; secondary ink `#526a7e`; ground `#101c28`; surface `#ffffff`.
- Interactive blue `#155f9c`; pale blue `#e8f2fb`; deep navigation `#112e47`.
- Sunlight `#f4c779` is atmospheric decoration, not a warning indicator.
- Preserve existing semantic warning, danger and success colors and explicit labels.
- Manrope for headings and numbers; DM Sans for reading; Noto Sans Devanagari for Hindi. Existing font families only, fewer requested weights.
- 4/8px spacing rhythm; 32px desktop gutters; 16px mobile gutters. 24px main surface corners, 8px controls. Borders separate data; shadows only elevate overlays.

## Layout and motion

Persistent navigation on desktop; existing accessible drawer on small screens. Current weather, forecast, next-twelve-hours summary, map/assistant guidance, agriculture. No feature IDs or routes removed. Large temperature remains appropriate to the primary weather task. Atmospheric geometry sits behind the text, with one 123,762-byte six-scene WebP atlas and no video.

Anime.js is reused for an initial weather reveal and user-triggered route transitions. A small CSS atmosphere uses transform/opacity only. A visible pause control, reduced-motion preference, offscreen observation and page visibility all stop ambient motion. Data values never count up from fabricated starting values.

## Feature map

| Existing feature | Redesigned destination |
|---|---|
| Search, coordinates, geolocation, global language | Top toolbar |
| Current weather, freshness, save place | Atmospheric current-weather panel |
| Hourly/daily temperature, rain, wind | Forecast beside current weather on desktop, below it on phones |
| Layer selection, radar, point selection, environmental map | Map section and full map route |
| Assistant, voice, Hindi/English, interpretation | Overview assistant panel and full assistant route |
| Alerts and limitations | Overview guidance and advisories route |
| Crop suitability, rainwater chemistry, risk, provenance | Farm workspace below map |
| Saved places/farms and forms | Saved locations route |
| Units and privacy/source disclosures | Existing preferences and data dialogs |

No new data source, paid service, React migration or runtime dependency is introduced.

## Rework interaction details

The forecast has a live value readout and pointer/keyboard selection (Left/Right, Home/End), with an active-point halo and crosshair. All values remain available in the existing expandable table. Fine-pointer devices receive a decorative cursor ring without hiding the native cursor; touch and reduced-motion users do not. Supporting sections reveal once using opacity/transform. Continuous image drift respects pause, reduced motion, viewport and document visibility. No new runtime library was added.

## Observatory refinement

The current-weather panel uses shaded cloud volumes, a moon with surface detail, a solar halo, and a subtle pointer-driven offset between the photograph and foreground geometry. Overcast and partly cloudy nights retain their cloud cover. Rain and snow particles run only for matching conditions; the existing atmosphere controller pauses continuous effects when hidden, offscreen, or explicitly paused. The previous photographic atlas is reused without adding bytes of imagery.

The forecast instrument adds stable previous/next buttons for touch, an explicit day/time and metric readout, and synchronized chart/strip selection. Keyboard and button selection announce values; passive pointer movement does not continuously interrupt screen readers. Hour buttons show AM/PM. A three-measurement summary below the primary panels links to rain, temperature and wind exploration and reports partial forecast coverage instead of treating missing readings as zero.

Dark surfaces use text #ecf4f9, secondary text #b2c7d7, and borders #a7cce52b. Forecast temperature, rain and wind accents are #f2d09a, #95d6ff and #99e4d2, accompanied by labels and units. The map and assistant retain pale reading surfaces. Assistant prompts, input focus, navigation tooltips and mobile spacing share the same 8px spacing rhythm. Only transform and opacity carry atmospheric motion; no scroll hijacking or count-up measurements.
