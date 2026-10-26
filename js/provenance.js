// Honest provenance for the active location. Uses ONLY fields actually returned
// by the provider. The API does not disclose which model produced a value, so
// we show the documented resolution RANGE, never a single invented figure.
// Sources: https://open-meteo.com/en/docs , https://open-meteo.com/en/features
import { localHour } from './weather.js';

export const RESOLUTION_NOTE =
  'Open-Meteo “Best match” blends models whose documented spatial resolution ranges from about 1–2 km (regional) to 9–11 km (global). The API does not report the resolution used for a specific request.';
export const RESOLUTION_HI =
  'Open-Meteo "Best match" कई मॉडल जोड़ता है, जिनका दस्तावेज़ीकृत क्षेत्रीय विस्तार लगभग 1–2 किमी (क्षेत्रीय) से 9–11 किमी (वैश्विक) है। किसी विशेष अनुरोध के लिए कौन-सा मॉडल चुना गया, यह API नहीं बताती।';

export function buildProvenance(state, language = 'en') {
  const w = state?.weather, location = state?.location;
  if (!w) return null;
  const requested = location ? `${Number(location.latitude).toFixed(4)}, ${Number(location.longitude).toFixed(4)}` : '—';
  const grid = Number.isFinite(Number(w.latitude)) && Number.isFinite(Number(w.longitude))
    ? `${Number(w.latitude).toFixed(4)}, ${Number(w.longitude).toFixed(4)}` : null;
  const elevation = Number.isFinite(Number(w.elevation)) ? `${Number(w.elevation).toFixed(0)} m` : null;
  const updated = w.current?.time ? `${w.current.time.slice(0, 10)} ${localHour(w.current.time)}` : (w.fetchedAt ? new Date(w.fetchedAt).toISOString() : null);
  return {
    source: 'Open-Meteo · Forecast API (best match)',
    sourceUrl: 'https://open-meteo.com/en/docs',
    requestedCoordinates: requested,
    gridCoordinates: grid,
    elevation: elevation,
    elevationNote: 'Elevation is from the provider’s 90 m digital elevation model, not a survey of your field.',
    updatedLocal: updated,
    timezone: w.timezone || location?.timezone || '—',
    zoneLabel: w.timezone_abbreviation || '',
    resolution: language === 'hi' ? RESOLUTION_HI : RESOLUTION_NOTE,
    caveat: language === 'hi'
      ? 'यह ग्रिड सेल के लिए पूर्वानुमान है, आपके खेत पर मापा गया मान नहीं। मॉडल ग्रिड का केंद्र आपके निर्देशांक से कुछ किलोमीटर दूर हो सकता है।'
      : 'Forecast for this grid cell, not measured at your field. The grid-cell centre can be a few kilometres from the requested coordinates.',
    radarNote: language === 'hi'
      ? 'रडार और नक्शे की परतें नमूना/मॉडल मान हैं, पिन पर माप नहीं।'
      : 'Radar and map layers are sampled/modelled values, not measurements at the pin.'
  };
}

export function provenanceHTML(p, language = 'en') {
  if (!p) return '';
  const hi = language === 'hi';
  const row = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  return `<dl class="provenance-grid">
    ${row(hi ? 'स्रोत' : 'Source', `<a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer">${p.source} ↗</a>`)}
    ${row(hi ? 'भेजे गए निर्देशांक' : 'Requested coordinates', p.requestedCoordinates)}
    ${row(hi ? 'मॉडल ग्रिड केंद्र' : 'Model grid-cell centre', p.gridCoordinates || (hi ? 'उपलब्ध नहीं' : 'Not supplied'))}
    ${row(hi ? 'मॉडल ऊँचाई' : 'Model elevation', p.elevation || (hi ? 'उपलब्ध नहीं' : 'Not supplied'))}
    ${row(hi ? 'अंतिम अद्यतन (स्थानीय)' : 'Last update (local)', `${p.updatedLocal || '—'} ${p.zoneLabel || p.timezone}`)}
  </dl><p class="provenance-caveat">${p.caveat}</p>`;
}

export default buildProvenance;
