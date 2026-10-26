// Forecast-derived hazard DETECTION thresholds for WeatherGPT.
//
// IMPORTANT: these are engineering defaults for surfacing notable weather in a
// 7-day forecast. They are NOT official IMD thresholds, NOT agronomic damage
// thresholds, and NOT a disease model. No crop-specific, India-wide official
// threshold set was found during the research recorded in docs/DATA_SOURCES.md.
// The values are conservative, configurable in one place, and always shown with
// their numbers so a farmer/adviser can judge them. Confirm locally with the
// nearest KVK or state agriculture department before acting on them.
//
// Basis: the WATCH/WARNING/SEVERE numbers below intentionally match the
// pre-existing WeatherGPT `deriveAdvisories()` demonstration thresholds
// (js/weather.js) so the dashboard and the older advisories view agree. The
// accumulation windows and humidity/frost combinations are simple heuristics
// computed from the loaded Open-Meteo forecast; they carry no official status.
export const HAZARD_THRESHOLDS = {
  version: 1,
  heavyRain: {
    // Daily precipitation_sum (mm) within the next 3 days.
    watch24: 20, warning24: 50, severe24: 100,
    watch48: 60, watch72: 90,
    // Hourly precipitation (mm/h) considered an intense burst.
    intensityHourly: 7.5
  },
  heat: {
    // Daily maximum air temperature (°C), next 3 days.
    watch: 35, warning: 40, severe: 45
  },
  cold: {
    // Daily minimum air temperature (°C), next 3 days.
    watch: 5,
    // "Frost-risk conditions": very low minimum temperature WITH a clear,
    // dry night. This is a screening condition, NOT a frost forecast.
    frostTemperature: 2,
    frostMaxCloudCover: 50,
    frostMaxHumidity: 85
  },
  wind: {
    // Maximum forecast gust (km/h).
    watch: 40, warning: 65, severe: 90
  },
  drySpell: {
    // Consecutive days with less than this much precipitation (mm).
    days: 5,
    dailyPrecipitation: 1
  },
  humid: {
    // Consecutive hours at/above this relative humidity (%) with rain or
    // wet hours — conditions that CAN favour fungal disease, not a diagnosis.
    relativeHumidity: 85,
    hours: 48
  },
  uv: { high: 8 },
  // How far ahead the dashboard looks, in hours from the current model hour.
  horizonHours: 72
};

export default HAZARD_THRESHOLDS;
