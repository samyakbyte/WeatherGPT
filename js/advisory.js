import { temp, wind, number, present, condition } from './weather.js';
// Crop-specific weather advisories. Two visibly different kinds of content:
//  (A) FORECAST CALCULATION — numbers computed from the loaded provider arrays;
//  (B) SOURCED/GENERAL GUIDANCE — short precautions from data/crops.js, each
//      carrying its source id (or an explicit "no crop-specific source" flag).
// No dose, prescription, yield promise or disease diagnosis.
import { computeHazards } from './hazards.js';
import { getGuidance, sourceById, CROP_LABELS, STAGE_LABELS, HAZARD_LABELS, CROPS } from '../data/crops.js';
import { buildProvenance } from './provenance.js';
import * as tz from './timezone.js';

const cropFromText = (q = '') => {
  const map = {
    wheat: /\bwheat\b|गेहूँ|गेहूं|gehu|gehun/, rice: /\brice\b|\bpaddy\b|धान|dhan|chawal/,
    maize: /\bmaize\b|\bcorn\b|मक्का|makka|makai/, mustard: /\bmustard\b|सरसों|sarson/,
    cotton: /\bcotton\b|कपास|kapas/, soybean: /\bsoybean\b|सोयाबीन/,
    potato: /\bpotato\b|आलू|aloo/, tomato: /\btomato\b|टमाटर|tamatar/,
    sugarcane: /\bsugarcane\b|गन्ना|ganna/
  };
  for (const [crop, re] of Object.entries(map)) if (re.test(q)) return crop;
  // Unknown crop names from "I grow X" are returned verbatim so the caller can
  // say honestly that no crop-specific guidance exists (generic fallback).
  const grown = q.match(/\bi grow ([a-z][a-z-]{2,29})\b/) || q.match(/\bmy ([a-z][a-z-]{2,29}) crop\b/);
  if (grown) return grown[1];
  return null;
};

const stageFromText = (q = '') => {
  const map = {
    sowing: /\bsowing\b|sown|बुवाई|buvai|buai/, vegetative: /\bvegetative\b|seedling|वानस्पतिक|पौध/,
    flowering: /\bflowering\b|flower|फूल/, 'grain filling': /\bgrain filling\b|दाना/,
    maturity: /\bmatur(?:e|ity)\b|पकाव|पका/, harvest: /\bharvest\b|कटाई|katai/
  };
  for (const [stage, re] of Object.entries(map)) if (re.test(q)) return stage;
  return null;
};

const GRID = {
  en: 'Forecast for a model grid cell, not a measurement at your field.',
  hi: 'यह मॉडल ग्रिड सेल का पूर्वानुमान है, आपके खेत का माप नहीं।'
};

function label(obj, language) { return language === 'hi' ? (obj?.hi || obj?.en) : (obj?.en || obj?.hi); }

/** Build advisories for the active farm's forecast. */
export function buildAdvisories(state, { language = 'en', crop = null, stage = null, hours = 72 } = {}) {
  const { hazards, notes, coverage } = computeHazards(state, { hours });
  const activeCrop = crop || state.farm?.crop || null;
  const activeStage = stage || state.farm?.stage || null;
  const place = state.farm?.name || state.location?.name || '';
  const provenance = buildProvenance(state, language);
  return hazards.map(h => {
    const guidance = getGuidance(activeCrop || 'other', activeStage, h.kind);
    const hazardLabel = label(HAZARD_LABELS[h.kind] || { en: h.kind, hi: h.kind }, language);
    const cropLabel = label(CROP_LABELS[activeCrop || 'other'] || CROP_LABELS.other, language);
    const stageLabel = activeStage ? label(STAGE_LABELS[activeStage] || { en: activeStage, hi: activeStage }, language) : null;
    const actions = [];
    if (guidance.general) actions.push({
      text: label(guidance.general, language),
      kind: guidance.general.kind,
      source: guidance.general.source,
      sourceNote: guidance.general.sourceNote,
      regions: guidance.general.regions || [],
      timing: guidance.general.timing
    });
    if (guidance.sourced) actions.push({
      text: label(guidance.sourced, language),
      kind: 'sourced', source: guidance.sourced.source,
      sourceNote: guidance.sourced.sourceNote, regions: guidance.sourced.regions || [],
      timing: guidance.sourced.timing
    });
    const sourceLinks = [...new Set(actions.map(a => a.source).filter(Boolean))].map(id => {
      const s = sourceById(id);
      return s ? `${s.publisher} — ${s.title} (${s.url})` : id;
    });
    const needs = [];
    if (['frost', 'cold', 'heat'].includes(h.kind) && !activeStage) needs.push('stage');
    if (h.kind === 'heavyRain' && !state.farm?.drainage) needs.push('drainage');
    return {
      id: `${h.id}-${activeCrop || 'generic'}`, hazard: h.kind, severity: h.severity,
      metric: h.metric, value: h.value, unit: h.unit,
      crop: activeCrop, stage: activeStage, cropKnown: guidance.cropKnown,
      expected: {
        en: `${place}: ${h.detail} Window: ${h.windowLabel}. ${GRID.en} Model grid centre: ${provenance?.gridCoordinates || 'not supplied'}.`,
        hi: `${place}: ${h.detail} समय: ${h.windowLabel}। ${GRID.hi} मॉडल ग्रिड केंद्र: ${provenance?.gridCoordinates || 'उपलब्ध नहीं'}।`
      },
      why: {
        en: stageLabel
          ? `${cropLabel} at the ${stageLabel} stage can be sensitive to ${hazardLabel}; the effect depends on local soil, drainage and variety. This is a weather-based flag, not a diagnosis.`
          : `${cropLabel} may be affected by ${hazardLabel}; sensitivity depends on growth stage, soil and variety. Tell me the stage to refine this. This is a weather-based flag, not a diagnosis.`,
        hi: stageLabel
          ? `${cropLabel} की ${stageLabel} अवस्था ${hazardLabel} के प्रति संवेदनशील हो सकती है; असर स्थानीय मिट्टी, जल निकासी और किस्म पर निर्भर करता है। यह मौसम-आधारित संकेत है, रोग निदान नहीं।`
          : `${cropLabel} पर ${hazardLabel} का असर हो सकता है; संवेदनशीलता अवस्था, मिट्टी और किस्म पर निर्भर करती है। सलाह और सटीक बनाने के लिए अवस्था बताएँ। यह मौसम-आधारित संकेत है, रोग निदान नहीं।`
      },
      actions,
      evidence: {
        en: `Calculation: Open-Meteo forecast values, thresholds version ${h.thresholdsVersion} (configurable engineering defaults, not official IMD thresholds). ${h.partial ? 'Some hourly values were missing; totals use available hours only. ' : ''}Guidance: ${sourceLinks.length ? sourceLinks.join('; ') : 'general precaution, no crop-specific source found'}.`,
        hi: `गणना: Open-Meteo पूर्वानुमान मान, सीमा संस्करण ${h.thresholdsVersion} (विन्यासयोग्य इंजीनियरिंग सीमाएँ, आधिकारिक IMD सीमाएँ नहीं)। ${h.partial ? 'कुछ घंटों के मान अनुपलब्ध थे; केवल उपलब्ध घंटे प्रयोग हुए। ' : ''}सलाह: ${sourceLinks.length ? sourceLinks.join('; ') : 'सामान्य सावधानी, फसल-विशेष स्रोत नहीं मिला'}।`
      },
      limitations: {
        en: 'Confirm with your nearest KVK or state agriculture department before choosing a product or dose. No official warning feed is connected. Weather alone cannot diagnose disease or guarantee yield.',
        hi: 'उत्पाद या मात्रा चुनने से पहले नज़दीकी KVK या राज्य कृषि विभाग से पुष्टि करें। आधिकारिक चेतावनी फ़ीड जुड़ी नहीं है। केवल मौसम से रोग का निदान या उपज की गारंटी नहीं दी जा सकती।'
      },
      needs, forecastNotes: notes, coverage
    };
  });
}

export function advisoryText(a, language = 'en') {
  const part = key => label(a[key], language);
  const actionText = a.actions.map((action, i) => {
    const tag = action.kind === 'sourced' ? (language === 'hi' ? 'स्रोत-आधारित' : 'Sourced') : (language === 'hi' ? 'सामान्य सावधानी' : 'General precaution');
    const region = action.regions?.length ? ` [${action.regions.join(', ')}]` : '';
    return `${i + 1}. [${tag}] ${action.text}${region}`;
  }).join('\n');
  const header = language === 'hi'
    ? ['१. क्या मौसम आने वाला है', '२. फसल पर असर क्यों', '३. क्या करें', '४. स्रोत और सीमाएँ']
    : ['1. What weather is expected', '2. Why your crop may be affected', '3. What to do and when', '4. Evidence and limits'];
  return `${header[0]}: ${part('expected')}\n${header[1]}: ${part('why')}\n${header[2]}:\n${actionText}\n${header[3]}: ${part('evidence')} ${part('limitations')}`;
}

/** Assistant integration: "I grow wheat near this village. Heavy rain is
 * forecast tomorrow. What should I do?" */
export function answerCropQuestion(question, intent, state) {
  const language = intent.language || state.prefs?.language || 'en';
  const q = (intent.canonical || intent.normalized || question).toLowerCase();
  const hi = language === 'hi';
  const farm = state.farm || null;
  const crop = cropFromText(q) || farm?.crop || null;
  const stage = stageFromText(q) || farm?.stage || null;
  if (!state.weather) return { text: hi ? 'पूर्वानुमान लोड नहीं है। मौसम सेवा दोबारा आज़माएँ; बिना डेटा के मैं सलाह नहीं दूँगा।' : 'No forecast is loaded. Retry the weather service; I will not give crop advice without data.', metrics: [], language };
  if (!farm && !crop) return {
    text: hi ? 'कृपया पहले सक्रिय खेत चुनें या फसल बताएँ (जैसे "गेहूँ")। तभी मैं आपके स्थान के पूर्वानुमान से सलाह दे सकता हूँ।' : 'Choose an active farm first, or tell me the crop (for example “wheat”). Then I can use your location’s forecast.',
    metrics: [], language, choices: [{ label: hi ? 'गेहूँ' : 'Wheat', query: 'I grow wheat here. What should I do?' }, { label: hi ? 'धान' : 'Rice', query: 'I grow rice here. What should I do?' }]
  };
  const claimedHeavyRain = /\b(?:heavy rain|भारी बारिश|बहुत बारिश|heavy rainfall|baarish)\b/.test(q);
  const { hazards } = computeHazards(state);
  const advisories = buildAdvisories(state, { language, crop, stage });
  const heavy = hazards.find(h => h.kind === 'heavyRain');
  let verification = '';
  if (claimedHeavyRain) {
    verification = heavy
      ? (hi ? `आपकी बात की पुष्टि: आने वाले 24–72 घंटों में ${heavy.value} mm वर्षा का पूर्वानुमान है।` : `Your heavy-rain concern matches the forecast: ${heavy.value} mm is forecast over the next 24–72 hours.`)
      : (hi ? 'मौसम डेटा में भारी बारिश नहीं दिखती: उपलब्ध 72 घंटों में कोई भारी-वर्षा सीमा पार नहीं हुई। फिर भी सामान्य सावधानी नीचे दी गई है।' : 'The loaded forecast does not show heavy rain: no heavy-rain threshold was crossed in the available 72 hours. General precautions are still below.');
  }
  const current = state.weather.current || {};
  const readings = [];
  if (present(current.weather_code)) readings.push(condition(current.weather_code).label);
  if (present(current.temperature_2m)) readings.push(temp(current.temperature_2m,state.prefs,true));
  if (present(current.relative_humidity_2m)) readings.push(`${hi?'नमी':'humidity'} ${number(current.relative_humidity_2m)}%`);
  if (present(current.wind_speed_10m)) readings.push(`${hi?'हवा':'wind'} ${wind(current.wind_speed_10m,state.prefs)}`);
  const snapshot = readings.length
    ? `${hi?'अभी':'Right now'} — ${state.location?.name || (hi?'आपका स्थान':'your location')}: ${readings.join(', ')}. ${current.time ? (hi?'मॉडल समय':'Model time')+': '+current.time+' ('+(state.weather.timezone||'local')+').' : ''}`
    : (hi?'वर्तमान मौसम के मान उपलब्ध नहीं हैं।':'Current weather readings are unavailable.');
  const range = tz.forecastRange(state);
  const intro = hi
    ? `${farm?.name || state.location?.name || 'आपके स्थान'} के लिए ${range.firstDate} से ${range.lastDate} के स्थानीय पूर्वानुमान पर आधारित सलाह (ग्रिड सेल मान, खेत का माप नहीं):`
    : `Advice for ${farm?.name || state.location?.name || 'your location'} from the local forecast ${range.firstDate} to ${range.lastDate} (grid-cell values, not field measurements):`;
  const unsupported = crop && !CROPS.includes(crop)
    ? (hi ? ' इस फसल के लिए कोई स्रोत-आधारित प्रविष्टि नहीं है; सामान्य सावधानियाँ दिखाई जा रही हैं।' : ' No sourced entry exists for this crop; showing the clearly labelled generic fallback.')
    : '';
  const needNote = advisories.some(a => a.needs.includes('stage'))
    ? (hi ? ' फसल की अवस्था बताएँ तो सलाह और सटीक हो सकती है।' : ' Tell me the growth stage to refine this advice.')
    : '';
  const texts = advisories.length
    ? advisories.slice(0, 3).map(a => advisoryText(a, language)).join('\n\n')
    : (hi ? 'अगले 72 घंटों में कोई विन्यासित मौसम जोखिम सीमा पार नहीं हुई। नियमित रूप से खेत की जाँच करते रहें और आधिकारिक IMD/KVK सलाह देखें।' : 'No configured forecast hazard threshold was crossed in the next 72 hours. Keep scouting the field and check official IMD/KVK advisories.');
  return {
    text: `${snapshot}\n\n${intro}${verification ? ' ' + verification : ''}${unsupported}${needNote}\n\n${texts}`.trim(),
    metrics: advisories.slice(0, 3).map(a => ({ label: a.hazard, value: `${a.value} ${a.unit}` })),
    language,
    advisories,
    note: hi ? 'गणना और सलाह अलग-अलग चिह्नित हैं। कोई खुराक या उपचार निर्धारित नहीं किया गया है।' : 'Forecast calculations and guidance are labelled separately. No dose or treatment is prescribed.'
  };
}

export default buildAdvisories;
