// WeatherGPT crop precaution knowledge base — version 1.
//
// HONESTY RULES (see docs/DATA_SOURCES.md for the research log):
//  * `kind: 'sourced'` entries are short summaries of guidance we actually read
//    in the cited ICAR / IARI / IMD publications. Region context is preserved.
//  * `kind: 'general'` entries carry NO citation. They are deliberately vague
//    general precautions ("inspect the crop", "consult your KVK") and are
//    labelled "general precaution, no crop-specific source found".
//  * NO pesticide dose, fertiliser rate, irrigation quantity, seed rate or
//    treatment prescription is stored here, even though some source documents
//    contain such numbers. Product/dose decisions belong to the local KVK.
//  * Weather alone cannot diagnose disease. Humid-spell wording says
//    "conditions that can favour fungal diseases" and asks for scouting.
export const CROP_KB_VERSION = 1;

export const SOURCES = {
  'AAS-WB-2026': {
    title: 'Agromet Advisory Service Bulletin for the State of West Bengal & Andaman & Nicobar Islands, Bulletin No. 85/2026 (23.10.2026)',
    publisher: 'India Meteorological Department (IMD), Agromet Advisory Service',
    url: 'https://mausam.imd.gov.in/kolkata/mcdata/aas.pdf',
    accessDate: '2026-10-26',
    region: 'West Bengal & A&N Islands (district AMFU bulletins)',
    licenceNote: 'Public government advisory bulletin; short summary only, no long quotation.'
  },
  'IARI-2026-59': {
    title: 'Weather Based Agromet Advisory Bulletin, Year 33, No. 59/2026-27 (23 Oct 2026), English and Hindi',
    publisher: 'ICAR–Indian Agricultural Research Institute, Division of Agricultural Physics',
    url: 'https://www.iari.res.in/bms/agromet/index.php',
    accessDate: '2026-10-26',
    region: 'Delhi and NCR',
    licenceNote: 'Public advisory bulletin; short summary only.'
  },
  'ICAR-KHARIF-2025': {
    title: 'Kharif Agro-Advisories for Farmers 2025 (May 2025), ISBN 978-81-983602-6-7',
    publisher: 'Indian Council of Agricultural Research (ICAR), New Delhi',
    url: 'https://www.icar.org.in/sites/default/files/Circulars/ICAR-En-Kharif-Agro-Advisories-for-Farmers-2025.pdf',
    accessDate: '2026-10-26',
    region: 'State chapters; passages read are from the Andaman & Nicobar Islands chapter',
    licenceNote: 'Page states it may be shared for non-commercial use with acknowledgement; short summary only.'
  }
};

export const CROPS = ['wheat', 'rice', 'maize', 'mustard', 'cotton', 'soybean', 'potato', 'tomato', 'sugarcane', 'french-beans'];
export const CROP_LABELS = {
  wheat: { en: 'Wheat', hi: 'गेहूँ' }, rice: { en: 'Rice / paddy', hi: 'धान' },
  maize: { en: 'Maize', hi: 'मक्का' }, mustard: { en: 'Mustard', hi: 'सरसों' },
  cotton: { en: 'Cotton', hi: 'कपास' }, soybean: { en: 'Soybean', hi: 'सोयाबीन' },
  potato: { en: 'Potato', hi: 'आलू' }, tomato: { en: 'Tomato', hi: 'टमाटर' },
  sugarcane: { en: 'Sugarcane', hi: 'गन्ना' }, 'french-beans': { en: 'French Beans', hi: 'फ्रेंच बीन्स' }, other: { en: 'Other crop', hi: 'अन्य फसल' }
};
export const STAGE_LABELS = {
  sowing: { en: 'sowing', hi: 'बुवाई' }, vegetative: { en: 'vegetative', hi: 'वानस्पतिक वृद्धि' },
  flowering: { en: 'flowering', hi: 'फूल आना' }, 'grain filling': { en: 'grain filling', hi: 'दाना भराव' },
  maturity: { en: 'maturity', hi: 'पकाव' }, harvest: { en: 'harvest', hi: 'कटाई' }
};
export const HAZARD_LABELS = {
  heavyRain: { en: 'heavy rain / waterlogging', hi: 'भारी बारिश / जलभराव' },
  heat: { en: 'heat', hi: 'अधिक गर्मी' }, cold: { en: 'cold', hi: 'ठंड' },
  frost: { en: 'possible frost conditions', hi: 'संभावित पाला' },
  wind: { en: 'strong wind / gusts', hi: 'तेज़ हवा / झोंके' },
  drySpell: { en: 'dry spell', hi: 'सूखा दौर' },
  humid: { en: 'prolonged humid / wet spell', hi: 'लंबी नम / गीली अवधि' }
};

const GENERAL = (en, hi, hazard, extra = {}) => ({
  kind: 'general', source: null, sourceNote: 'General precaution, no crop-specific source found.',
  hazard, en, hi, regions: [], timing: 'Before the expected weather, then inspect afterwards.', ...extra
});
const SOURCED = (sourceId, en, hi, hazard, regions, extra = {}) => ({
  kind: 'sourced', source: sourceId, sourceNote: `Short summary of ${SOURCES[sourceId].publisher} guidance (${SOURCES[sourceId].region}).`,
  hazard, en, hi, regions, timing: 'Before the expected weather, then inspect afterwards.', ...extra
});

// Sourced, general (non crop-specific) precautions actually read in the sources.
const SOURCED_COMMON = [
  SOURCED('AAS-WB-2026',
    'Keep field drainage channels clear so excess rain water can leave quickly. Provide support to tall crops and vegetables before gusty wind. Do not spray during rainfall or when rain is expected immediately afterwards.',
    'बारिश का अतिरिक्त पानी जल्दी निकल सके, इसलिए खेत की नाली साफ़ रखें। तेज़ हवा से पहले लंबी फसलों और सब्ज़ियों को सहारा दें। बारिश के दौरान या उसके तुरंत पहले छिड़काव न करें।',
    'heavyRain', ['West Bengal', 'Andaman & Nicobar Islands']),
  SOURCED('AAS-WB-2026',
    'Cover harvested produce lying in the field, and drain standing water from crop fields. Spray insecticides, pesticides or herbicides only on clear, sunny days.',
    'खेत में रखी कटी हुई उपज को ढक दें और खड़ी फसल से पानी निकालें। कीटनाशक या खरपतवारनाशक का छिड़काव केवल साफ़, धूप वाले दिन करें।',
    'heavyRain', ['West Bengal', 'Andaman & Nicobar Islands']),
  SOURCED('ICAR-KHARIF-2025',
    'Use well-drained soil and raised beds or ridges where high rainfall can stagnate water; ensure drainage especially in low-lying fields. During dry spells, arrange life-saving irrigation.',
    'जहाँ अधिक बारिश से पानी रुकता हो, वहाँ अच्छी जल निकासी वाली मिट्टी और ऊँची क्यारियाँ/मेड़ें बनाएँ; निचले खेतों में निकासी विशेष रूप से रखें। सूखे दौर में जीवन-रक्षक सिंचाई का प्रबंध करें।',
    'heavyRain', ['Andaman & Nicobar Islands (state chapter)']),
  SOURCED('IARI-2026-59',
    'Harvest mature rice during a dry window, dry it in the field for 2–3 days, and dry grain thoroughly before storage. Raise nursery beds for vegetables and transplant healthy seedlings onto raised beds.',
    'पकी धान की फसल शुष्क मौसम में काटें, 2–3 दिन खेत में सुखाएँ और भंडारण से पहले अनाज अच्छी तरह सुखा लें। सब्ज़ियों के लिए ऊँची क्यारियाँ बनाएँ और स्वस्थ पौधे ऊँची क्यारियों पर लगाएँ।',
    'heavyRain', ['Delhi and NCR']),
  SOURCED('AAS-WB-2026',
    'In prolonged wet weather, monitor fields regularly for disease; avoid spraying when rain is imminent and follow locally registered recommendations only after scouting.',
    'लंबी गीली अवधि में खेत की नियमित जाँच करें; बारिश से ठीक पहले छिड़काव न करें और फसल जाँच के बाद ही स्थानीय रूप से पंजीकृत सिफ़ारिशें अपनाएँ।',
    'humid', ['West Bengal', 'Andaman & Nicobar Islands']),
  SOURCED('AAS-WB-2026',
    'Provide stick support to crops and vegetables before heavy rain and gusty wind; inspect and strengthen supports afterwards.',
    'भारी बारिश और तेज़ झोंकों से पहले फसलों और सब्ज़ियों को डंडे का सहारा दें; बाद में सहारे की जाँच कर मज़बूत करें।',
    'wind', ['West Bengal', 'Andaman & Nicobar Islands'])
];

// General, crop-indexed precautions. No invented agronomy, no doses.
const GENERAL_TEMPLATES = {
  heavyRain: GENERAL(
    'Before the rain, check that field drains are open. After it, remove standing water where possible and watch for yellowing or wilting. Ask a local KVK or agriculture officer before any spray or fertiliser.',
    'बारिश से पहले खेत की नालियाँ खुली रखें। बाद में रुका पानी निकालें और पीलापन या मुरझाहट देखें। किसी भी छिड़काव या खाद से पहले नज़दीकी KVK या कृषि अधिकारी से सलाह लें।', 'heavyRain'),
  heat: GENERAL(
    'Check soil moisture in the early morning. If the soil is dry, prioritise the crop’s critical stages and irrigate in cooler hours. Avoid strenuous field work at midday; ask your KVK about heat-tolerant practices.',
    'सुबह जल्दी मिट्टी की नमी जाँचें। सूखी मिट्टी हो तो फसल की महत्वपूर्ण अवस्थाओं को प्राथमिकता दें और ठंडे समय में सिंचाई करें। दोपहर में कठिन खेत कार्य न करें; गर्मी सहनशील उपायों के लिए KVK से पूछें।', 'heat'),
  cold: GENERAL(
    'Young seedlings are most sensitive to cold. Walk the field at dawn, note damaged patches, and ask your KVK about local cold protection before irrigating or spraying.',
    'ठंड में छोटे पौधे सबसे संवेदनशील होते हैं। भोर में खेत की जाँच करें, प्रभावित हिस्से नोट करें और सिंचाई या छिड़काव से पहले स्थानीय सुरक्षा उपायों के लिए KVK से पूछें।', 'cold'),
  frost: GENERAL(
    'Very low night temperatures are forecast. This is only a weather-based screening, not a frost forecast. Inspect low-lying parts of the field at dawn and contact your KVK for crop-specific protection.',
    'रात का न्यूनतम तापमान बहुत कम रहने का पूर्वानुमान है। यह केवल मौसम-आधारित जाँच है, पाले का पूर्वानुमान नहीं। भोर में खेत के निचले हिस्सों की जाँच करें और फसल-विशेष सुरक्षा के लिए KVK से संपर्क करें।', 'frost'),
  wind: GENERAL(
    'Secure loose sheets, nets and supports before the wind. Avoid spraying in gusty conditions. Afterwards check for lodging and broken branches; seek local advice before any corrective spray.',
    'हवा से पहले ढीली चादरें, जाल और सहारे मज़बूत करें। तेज़ झोंकों में छिड़काव न करें। बाद में गिरावट और टूटी शाखाएँ देखें; किसी उपचारात्मक छिड़काव से पहले स्थानीय सलाह लें।', 'wind'),
  drySpell: GENERAL(
    'Several dry days are forecast. Check soil moisture at root depth before irrigating, prioritise flowering and grain/fruit setting stages, and ask your KVK about crop-specific irrigation scheduling.',
    'कई शुष्क दिनों का पूर्वानुमान है। सिंचाई से पहले जड़ की गहराई पर मिट्टी की नमी जाँचें, फूल और दाना/फल बनने की अवस्था को प्राथमिकता दें और फसल-विशेष सिंचाई कार्यक्रम के लिए KVK से पूछें।', 'drySpell'),
  humid: GENERAL(
    'A long humid spell can favour fungal diseases; this is not a disease diagnosis. Scout leaves and stems, improve air movement where practical, and consult your local KVK before choosing any spray.',
    'लंबी नम अवधि में फफूंद रोगों के अनुकूल परिस्थितियाँ बन सकती हैं; यह रोग का निदान नहीं है। पत्तियों और तनों की जाँच करें, जहाँ संभव हो हवा का संचार बढ़ाएँ और किसी छिड़काव से पहले KVK से सलाह लें।', 'humid')
};

/** One entry per crop × hazard, with stage-specific notes where they matter. */
export const ENTRIES = [];
for (const crop of CROPS) {
  for (const [hazard, template] of Object.entries(GENERAL_TEMPLATES)) {
    ENTRIES.push({
      id: `${crop}-${hazard}`, crop, stage: 'any', hazard,
      en: template.en, hi: template.hi, kind: 'general', source: null,
      sourceNote: 'General precaution, no crop-specific source found.',
      regions: [], timing: template.timing
    });
  }
}
for (const [index, entry] of SOURCED_COMMON.entries()) {
  ENTRIES.push({ id: `sourced-${index}`, crop: 'any', stage: 'any', ...entry });
}

export function getGuidance(crop, stage, hazard) {
  const specific = ENTRIES.find(e => e.crop === crop && (e.stage === stage || e.stage === 'any') && e.hazard === hazard);
  const fallback = ENTRIES.find(e => e.crop === 'generic' && e.hazard === hazard) ||
    Object.values(GENERAL_TEMPLATES).find(t => t.hazard === hazard) || GENERAL_TEMPLATES.heavyRain;
  const sourced = ENTRIES.find(e => e.crop === 'any' && e.hazard === hazard);
  return {
    crop, stage: stage || null, hazard,
    general: specific || (crop === 'other' ? fallback : { ...fallback, id: `generic-${crop}-${hazard}`, crop, sourceNote: 'Generic fallback — no crop-specific source found for this crop/stage/hazard.' }),
    sourced: sourced || null,
    cropKnown: CROPS.includes(crop)
  };
}

export function sourceById(id) { return SOURCES[id] || null; }
export default { CROP_KB_VERSION, SOURCES, CROPS, ENTRIES, getGuidance };
