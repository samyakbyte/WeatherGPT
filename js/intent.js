// Backwards-compatible entry point. `parseWeatherQuestion` is used by the
// location search and by legacy call sites that have no full application state.
// It now delegates to the single structured interpreter so search, assistant
// and tests all see the same place/date/topic decisions.
import { interpretWeatherQuestion } from './understanding.js';

export function parseWeatherQuestion(raw, preferredLanguage = 'en') {
  return interpretWeatherQuestion(raw, { prefs: { language: preferredLanguage } }, { preferredLanguage });
}
