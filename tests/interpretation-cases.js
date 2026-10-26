// Table-driven interpretation regression suite. 100+ phrasings across English,
// Devanagari Hindi and Romanized Hindi. No case may be special-cased in
// production code: these are families of equivalent phrasings.
//
// Expectations are checked against the STRUCTURED intent object:
//   place, placeContext, topic, metric, dayOffset, date, hour, window, start,
//   end, kind, language, clarification, unsupported, historical, action.
const EN = {};
const HI = { lang: 'hi' };

export const cases = [
  // ── Place extraction: temporal phrases and activity words must not leak ──
  { q: 'Will it rain in Jaipur tomorrow evening?', e: { place: 'Jaipur', topic: 'rain', dayOffset: 1, window: 'evening', start: 17, end: 20 } },
  { q: 'Rain in London in four days?', e: { place: 'London', topic: 'rain', dayOffset: 4 } },
  { q: 'Rain in London in 4 days?', e: { place: 'London', topic: 'rain', dayOffset: 4 } },
  { q: 'Weather in Paris in three days?', e: { place: 'Paris', topic: 'weather', dayOffset: 3 } },
  { q: 'Rain in Paris in ten days?', e: { place: 'Paris', topic: 'rain', dayOffset: 10, unsupported: true } },
  { q: "What's the weather in New Delhi tomorrow?", e: { place: 'New Delhi', topic: 'weather', dayOffset: 1 } },
  { q: "Berlin's forecast on Friday", e: { place: 'Berlin', topic: 'weather', date: '2026-09-18' } },
  { q: 'Temperature in Mumbai in five days', e: { place: 'Mumbai', topic: 'temperature', dayOffset: 5 } },
  { q: 'Will there be showers in Paris in three days?', e: { place: 'Paris', topic: 'rain', dayOffset: 3 } },
  { q: 'Rain in three days?', e: { place: null, topic: 'rain', dayOffset: 3 } },
  { q: 'Best time to walk tomorrow evening?', e: { place: null, topic: 'outdoors', window: 'evening' } },
  { q: 'Best time to run tomorrow morning?', e: { place: null, topic: 'outdoors', window: 'morning' } },
  { q: 'Should I harvest wheat tomorrow?', e: { place: null, topic: 'crop', dayOffset: 1 } },
  { q: 'Spray pesticide in my field tomorrow', e: { place: null, topic: 'crop', dayOffset: 1 } },
  { q: 'Weather in Rampura, Alwar, Rajasthan', e: { place: 'Rampura', placeContext: { district: 'Alwar', state: 'Rajasthan' }, topic: 'weather' } },
  { q: 'Rampura Alwar', e: { place: 'Rampura Alwar' } },
  { q: 'Weather in Paris and London?', e: { clarification: true } },
  { q: 'Weather versus Berlin and Paris?', e: { clarification: true } },
  { q: 'Show weather near 26.90, 75.80', e: { placeKind: 'coordinates', topic: 'weather' } },
  { q: 'Rain in Jaipur tomorrow at 7 PM', e: { place: 'Jaipur', topic: 'rain', hour: 19, date: '2026-09-16' } },
  { q: 'Rain tomorrow evening in Delhi', e: { place: 'Delhi', topic: 'rain', window: 'evening' } },
  { q: 'Temperature in four days in London?', e: { place: 'London', topic: 'temperature', dayOffset: 4 } },
  { q: 'What is the best time to go outside today?', e: { place: null, topic: 'outdoors', dayOffset: 0 } },
  { q: 'Do I need a brolly tmrw?', e: { place: null, topic: 'rain', dayOffset: 1 } },
  { q: 'Rain forecast for London tomorrow', e: { place: 'London', topic: 'rain', dayOffset: 1 } },

  // ── Dates: relative, weekday, ISO, invalid, historical, out of range ──
  { q: 'Rain today?', e: { topic: 'rain', dayOffset: 0, date: '2026-09-15' } },
  { q: 'Rain tomorrow?', e: { topic: 'rain', dayOffset: 1, date: '2026-09-16' } },
  { q: 'Rain day after tomorrow?', e: { topic: 'rain', dayOffset: 2, date: '2026-09-17' } },
  { q: 'Rain tonight?', e: { topic: 'rain', dayOffset: 0, window: 'night' } },
  { q: 'Weather in five days?', e: { topic: 'weather', dayOffset: 5 } },
  { q: 'Weather in 6 days?', e: { topic: 'weather', dayOffset: 6 } },
  { q: 'Weather in seven days?', e: { topic: 'weather', dayOffset: 7, unsupported: true } },
  { q: 'Temperature on Friday?', e: { topic: 'temperature', dayOffset: 3, date: '2026-09-18' } },
  { q: 'Weather next Monday?', e: { topic: 'weather', dayOffset: 6, date: '2026-09-21' } },
  { q: 'Weather on 2026-09-20?', e: { topic: 'weather', dayOffset: 5, date: '2026-09-20' } },
  { q: 'Weather on 2026-09-14?', e: { topic: 'weather', historical: true, unsupported: true } },
  { q: 'Weather on 2026-02-30?', e: { clarification: true } },
  { q: 'Weather on 09/20?', e: { clarification: true } },
  { q: 'What was the weather in July 2010?', e: { historical: true, unsupported: true } },
  { q: 'Weather next month?', e: { unsupported: true } },
  { q: 'Weather yesterday?', e: { historical: true, unsupported: true } },

  // ── Clock + part-of-day windows ──
  { q: 'Rain at 7 PM tomorrow?', e: { topic: 'rain', hour: 19, kind: 'point' } },
  { q: 'Rain at 7?', e: { clarification: true } },
  { q: 'Rain at 09:00 tomorrow?', e: { topic: 'rain', hour: 9 } },
  { q: 'Rain at 13 PM?', e: { clarification: true } },
  { q: 'Rain at noon tomorrow?', e: { topic: 'rain', hour: 12 } },
  { q: 'Rain at midnight tomorrow?', e: { topic: 'rain', hour: 0 } },
  { q: 'Rain at seven PM tomorrow?', e: { topic: 'rain', hour: 19 } },
  { q: 'Rain tomorrow from 5 PM to 8 PM?', e: { topic: 'rain', window: 'custom', start: 17, end: 20, kind: 'range' } },
  { q: 'Rain tomorrow from 11 PM to 2 AM?', e: { clarification: true } },
  { q: 'Rain tomorrow morning?', e: { topic: 'rain', window: 'morning', start: 6, end: 12 } },
  { q: 'Rain tomorrow afternoon?', e: { topic: 'rain', window: 'afternoon', start: 12, end: 17 } },
  { q: 'Temperature tomorrow evening?', e: { topic: 'temperature', window: 'evening', start: 17, end: 20 } },
  { q: 'Weather tomorrow night?', e: { topic: 'weather', window: 'night', start: 20, end: 24 } },

  // ── Metrics / topics ──
  { q: 'Feels like tomorrow at 7 PM?', e: { topic: 'feels', metric: 'apparent_temperature', hour: 19, dayOffset: 1 } },
  { q: 'How does it feel outside now?', e: { topic: 'feels' } },
  { q: 'How cloudy is it tomorrow?', e: { topic: 'clouds', metric: 'cloud_cover' } },
  { q: 'Humidity now?', e: { topic: 'humidity', metric: 'relative_humidity_2m' } },
  { q: 'UV at 3 PM tomorrow?', e: { topic: 'uv', metric: 'uv_index', hour: 15 } },
  { q: 'Visibility tomorrow morning?', e: { topic: 'visibility', metric: 'visibility', window: 'morning' } },
  { q: 'Pressure tomorrow?', e: { topic: 'pressure', metric: 'pressure_msl' } },
  { q: 'Sunrise tomorrow?', e: { topic: 'sun' } },
  { q: 'Open radar', e: { topic: 'radar', action: 'radar' } },
  { q: 'Show rain map', e: { topic: 'radar', action: 'radar' } },
  { q: 'Show rain tomorrow evening?', e: { topic: 'rain' } },
  { q: 'Is a storm approaching?', e: { topic: 'alerts' } },
  { q: 'Any flood warning today?', e: { topic: 'alerts' } },
  { q: 'Is tomorrow hotter than today?', e: { topic: 'comparison' } },
  { q: 'Compare today and tomorrow', e: { topic: 'comparison' } },
  { q: 'Tell me a joke', e: { clarification: true } },
  { q: 'Weather?', e: { topic: 'weather' } },
  { q: 'Save this location', e: { topic: 'farm', action: 'save-location' } },
  { q: 'Rainwater acidity here?', e: { topic: 'acidity' } },

  // ── Hindi (Devanagari) ──
  { q: 'कल जयपुर में बारिश होगी?', e: { language: 'hi', place: 'Jaipur', topic: 'rain', dayOffset: 1 } },
  { q: 'आज का तापमान क्या है?', e: { language: 'hi', topic: 'temperature', dayOffset: 0 } },
  { q: 'कल शाम ७ बजे मौसम कैसा होगा?', e: { language: 'hi', topic: 'weather', hour: 19 } },
  { q: 'कल 7 बजे मौसम कैसा होगा?', e: { language: 'hi', clarification: true } },
  { q: 'कल सुबह बारिश होगी?', e: { language: 'hi', topic: 'rain', window: 'morning' } },
  { q: 'परसों दिल्ली में तापमान?', e: { language: 'hi', place: 'Delhi', topic: 'temperature', dayOffset: 2 } },
  { q: 'क्या कल आज से अधिक गर्म होगा?', e: { language: 'hi', topic: 'comparison' } },
  { q: 'आज नमी कितनी है?', e: { language: 'hi', topic: 'humidity' } },
  { q: 'रडार खोलो', e: { language: 'hi', topic: 'radar', action: 'radar' } },
  { q: 'मेरी गेहूँ की फसल के लिए सलाह', e: { language: 'hi', topic: 'crop' } },
  { q: 'कल दोपहर में हवा कैसी रहेगी?', e: { language: 'hi', topic: 'wind', window: 'afternoon' } },
  { q: 'आज सूर्यास्त कब है?', e: { language: 'hi', topic: 'sun' } },
  { q: 'कल बारिश हुई थी?', e: { language: 'hi', historical: true } },
  { q: 'जयपुर में कल बारिश?', e: { language: 'hi', place: 'Jaipur', topic: 'rain', dayOffset: 1 } },
  { q: 'कल शाम 7 बजे तापमान?', e: { language: 'hi', topic: 'temperature', hour: 19 } },
  { q: 'कल रात का मौसम?', e: { language: 'hi', topic: 'weather', window: 'night' } },
  { q: 'कल शाम बाहर घूमने का समय?', e: { language: 'hi', topic: 'outdoors', window: 'evening' } },
  { q: 'वर्षा जल की अम्लता', e: { language: 'hi', topic: 'acidity' } },
  { q: 'कल भारी बारिश में खेत की सलाह', e: { language: 'hi', topic: 'crop', dayOffset: 1 } },
  { q: 'आज अधिकतम तापमान क्या है?', e: { language: 'hi', topic: 'temperature' } },

  // ── Romanized Hindi ──
  { q: 'kal baarish hogi kya', e: { language: 'hi', topic: 'rain', dayOffset: 1 } },
  { q: 'aaj ka tapman', e: { language: 'hi', topic: 'temperature', dayOffset: 0 } },
  { q: 'radar kholo', e: { language: 'hi', topic: 'radar', action: 'radar' } },
  { q: 'kal shaam 7 baje mausam kaisa hoga', e: { language: 'hi', topic: 'weather', hour: 19 } },
  { q: 'parso Delhi mein baarish', e: { language: 'hi', place: 'Delhi', topic: 'rain', dayOffset: 2 } },
  { q: 'aaj subah ka mausam', e: { language: 'hi', topic: 'weather', window: 'morning' } },
  { q: 'kal dopahar mein garmi kitni hogi', e: { language: 'hi', topic: 'temperature', window: 'afternoon' } },
  { q: 'mere khet ke liye salah', e: { language: 'hi', topic: 'crop' } },
  { q: 'kal raat ko hawa', e: { language: 'hi', topic: 'wind', window: 'night' } },
  { q: 'gehu ki fasal mein baarish ka asar', e: { language: 'hi', topic: 'crop' } },
  { q: 'kal shaam bahar ghoomne ka time', e: { language: 'hi', topic: 'outdoors', window: 'evening' } },
  { q: 'kya kal umbrella chahiye', e: { language: 'hi', topic: 'rain', dayOffset: 1 } },
  { q: 'kal shaam 5 se 8 baje baarish', e: { language: 'hi', topic: 'rain', window: 'custom', start: 17, end: 20 } },
  { q: 'aaj nami kitni hai', e: { language: 'hi', topic: 'humidity' } },
  { q: 'kya kal aaj se zyada garam hoga', e: { language: 'hi', topic: 'comparison' } },

  // ── Hindi preference with English input (previously "unsupported") ──
  { q: 'Temperature tomorrow?', o: HI, e: { language: 'hi', topic: 'temperature', dayOffset: 1 } },
  { q: 'Open radar', o: HI, e: { language: 'hi', topic: 'radar', action: 'radar' } },
  { q: 'Humidity now?', o: HI, e: { language: 'hi', topic: 'humidity' } },
  { q: 'Best time to walk tomorrow evening?', o: HI, e: { language: 'hi', topic: 'outdoors', window: 'evening' } },
  { q: 'Rain tomorrow?', o: EN, e: { language: 'en', topic: 'rain', dayOffset: 1 } },

  // ── Follow-ups (previous: "Will it rain in Jaipur tomorrow evening?") ──
  { q: 'And what about wind?', previous: true, e: { topic: 'wind', dayOffset: 1, window: 'evening' } },
  { q: 'And the day after?', previous: true, e: { topic: 'rain', dayOffset: 2 } },
  { q: 'What about Jaipur?', previous: true, e: { place: 'Jaipur', topic: 'rain' } },
  { q: 'Will it be windy then?', previous: true, e: { topic: 'wind', dayOffset: 1, window: 'evening' } },
  { q: 'And tomorrow morning?', previous: true, e: { topic: 'rain', window: 'morning', dayOffset: 1 } },
  { q: 'What about humidity?', previous: true, e: { topic: 'humidity', dayOffset: 1, window: 'evening' } },
  { q: 'And today?', previous: true, e: { topic: 'rain', dayOffset: 0 } },
  { q: 'What about London?', previous: true, e: { place: 'London', topic: 'rain' } },

  // ── Ambiguity must ask, never substitute ──
  { q: 'Weather at 7?', e: { clarification: true } },
  { q: 'Weather on 09/20?', e: { clarification: true } },
  { q: 'Weather in Paris and London?', e: { clarification: true } },
  { q: 'Rain tomorrow from 11 PM to 2 AM?', e: { clarification: true } },
  { q: 'And tomorrow?', e: { clarification: true } }
];

export const PREVIOUS_QUESTION = 'Will it rain in Jaipur tomorrow evening?';
export default cases;
