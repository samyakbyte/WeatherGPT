// Bounded help and capability handling. These are explicit application contracts,
// not a general-purpose language model. No external action is performed here.
import { PH_ESTIMATE_LIMIT } from './acidity.js';
const replies = {
 medical: ['limit', 'I cannot diagnose a medical condition, prescribe treatment, or certify personal safety from weather data. The forecast and UV readings are environmental information, not a medical assessment.'],
 treatment: ['limit', 'I cannot prescribe a pesticide, fertilizer, lime or water-treatment dose, identify a disease, or verify a chemical mixture from weather data. A rainwater pH reading alone cannot diagnose a crop problem. Product details, field inspection and appropriate soil/water tests are missing. The crop view provides forecast-based precautions, not a diagnosis or prescription.'],
 field: ['limit', 'I do not have a field sensor or inspection result for soil moisture, soil temperature, crop maturity, grain moisture, plant health, soil pH or water quality. Rain forecasts do not supply those measurements. I can show weather conditions and general crop precautions; an exact irrigation, sowing or harvest prescription needs field information.'],
 exact: ['limit', 'I cannot guarantee an exact outcome or provide building-level, second-by-second forecasts. I cannot guarantee crop yield or rainwater pH safety either. This app has a limited model forecast, not live operational information about roads, flights, schools or individual property. Ask for a supported forecast period, and I will identify available values and limits.'],
 history: ['limit', 'Historical observations, past radar archives and climate-normal datasets are not connected to this app. I cannot reconstruct a past measurement or infer a climate trend from the current seven-day forecast.'],
 external: ['limit', 'I cannot send messages, purchase items, operate equipment, access private accounts/files, change browser permissions or perform actions in other apps. Nothing has been sent, bought, deleted or changed by this answer. Farm and pH records have not been changed. I can help interpret the weather shown here.'],
 unrelated: ['limit', 'This assistant supports local weather, forecasts, crop precautions, rainwater-acidity availability and help with this website. It does not have a general-purpose language model or access to news, shopping, bookings or personal accounts. Please ask a weather question or use the relevant service for that task.'],
 ph: ['explain', 'Rainwater acidity data unavailable for this location: no current measured local rainwater pH feed is connected. Missing pH is not zero or neutral water. Rainwater pH, soil pH, pollutant concentration and water quality are different quantities; this weather forecast cannot establish a treatment, drinking-water safety or an exact future pH.'],
 phRecords: ['explain', 'No current measured pH feed is connected. If you mean rainwater pH samples, use the rainwater-acidity measurement controls to enter your own sample at the correct farm/location and date, and review or remove saved records there. Entries are labelled User-provided and stored on this device; they are not independently verified. I have not added, edited, imported or deleted a sample from this chat. A saved observation is not a future pH forecast, and I cannot verify your meter or laboratory method.'],
 farm: ['explain', 'Use the farm manager to add or select a farm and edit its name, coordinates, crop and growth stage. Saved farm records are device-local; clearing browser storage can remove them. Select the intended farm before reading its forecast. This chat has not created, renamed, exported, uploaded or deleted a farm. For unsupported actions such as cloud sync or photo attachment, this assistant cannot perform them.'],
 settings: ['explain', 'Use Settings for temperature and wind units, the language selector for language, and Pause atmosphere for decorative motion. The assistant has microphone/read-aloud controls and Clear for the conversation. Use the map controls for layers and radar playback; use the forecast controls for hours/days and View all forecast values for the table. The chart supports arrow keys, Home and End. Browser permissions must be changed in the browser. This answer has not changed a setting.'],
 data: ['explain', 'Unavailable values must remain missing, not be treated as zero. A partial forecast cannot support a complete-period guarantee. Check the displayed source/timestamp and retry a failed provider request; search manually if geolocation is denied. Weather, map tiles, radar, air quality and measured pH have separate availability. I cannot recover an unsaved observation or promise offline updates.'],
 radar: ['explain', 'The radar map uses RainViewer frames and shows available past/recent frames, not a guaranteed future storm path. Use the map timeline, frame buttons and play/pause control to inspect their timestamps. Coverage and tile/network failures can leave gaps. I cannot infer an exact arrival time or lightning path from these frames. This explanation has not started playback or changed the layer.'],
 warning: ['explain', 'Official warning feeds, lightning tracking, road closures and property-level flood assessments are not connected. App advisories are calculations from the loaded model forecast and configured thresholds, not official warnings or safety certificates. No triggered threshold does not prove there is no danger. Check the relevant local meteorological authority for official instructions.'],
 probability: ['explain', 'Rain probability is a forecast chance for the provider’s time interval; it is not a rainfall amount, a fraction of the day or a guaranteed fraction of your field. A zero or high percentage is not a guarantee. A small nonzero chance can justify a compact umbrella; incomplete values do not justify assuming dry weather. Recheck the latest forecast before leaving.'],
 evidence: ['explain', 'The weather values are model estimates for a grid cell, not direct measurements at every field or building. The timestamp identifies the model time shown by the app. User-provided samples have separate provenance. Some local showers and field conditions can differ. I will not invent a confidence score or turn a forecast into a guarantee.'],
 units: ['explain', 'Temperature describes the air value; feels-like is an apparent-temperature estimate. Relative humidity describes moisture relative to saturation at that temperature. Sustained wind and brief gust peaks are different readings. Pressure here is sea-level pressure, commonly displayed in hPa. UV index is a separate exposure indicator; cloud cover alone does not determine rainfall. Use the value and units shown for the specific quantity.'],
 time: ['explain', 'Forecast dates and hours are resolved in the selected location’s time zone. Check the resolved date/time label below the answer. Ask with a specific local hour and AM/PM, or an ISO date such as YYYY-MM-DD. If a window is outside the loaded forecast or has passed, I cannot substitute another period without saying so.'],
 comparison: ['limit', 'I support a direct comparison of today’s and tomorrow’s maximum temperature. I cannot reliably perform this other comparison in one answer. Ask for each quantity, time or location separately; I will show the available values and units rather than invent a ranking.'],
 multiple: ['clarify', 'That request contains several different tasks. Please choose one forecast quantity or one farm/pH question first, with its location and time. I will keep the selected location unless you explicitly name another. I cannot perform an external action or guarantee an outcome as part of a weather answer.'],
 followup: ['clarify', 'Please name the weather quantity and time you want me to explain. I can reuse a prior forecast topic for simple date/time follow-ups, but I cannot reliably infer every reference to “that” or “it.” No location or saved record has been changed.']
};
export function requestHelp(raw) {
 const q=String(raw).toLowerCase().replace(/[’‘]/g,"'")
  .replace(/\bwithout (?:a |any )?(?:chemical|pesticide|fertili[sz]er) dose\b/g,'');
 const has=re=>re.test(q);
 if(has(/\b(?:saved|selected) farm\b/))return 'farm';
 if(has(/\b(?:ph|rainwater)\b/) && has(/\bpollutants?\b/))return 'ph';
 // Specific request forms precede broad explanation words. Never interpret
 // "mean for my crop" as a question about the definition of a model.
 if(has(/\b(?:confidence score|confidence percentage)\b|sources.*disagree|model timestamp|forecast calculations.*inspect|(?:weather|model).*\b(?:measurements at|direct measurements)|forecast.derived advisories.*observations/))return 'evidence';
 if(has(/\b(?:prescription|prescribe)\b/) && has(/headache|medical|medicine|fever/))return 'medical';
 if(has(/\bprescription\b/) && has(/pesticide|crop|fungicide|herbicide/))return 'treatment';
 if(has(/\b(?:rank|ranking)\b|which.*farms.*windier|humidity.*higher than yesterday/))return 'comparison';
 if(has(/\b(?:number of raindrops|second.by.second)\b/))return 'exact';
 if(has(/climate.normal/))return 'history';
 if(has(/stop radar autoplay/))return 'settings';
 if(has(/radar|rainfall map/) && !has(/^(?:open|show|please show|can you show)/) && !has(/archive|years? ago|last (?:week|month|year)|from (?:201\d|202\d)/))return 'radar';
 if(has(/gold price/))return 'unrelated';
 if(has(/\b(?:settings|keyboard)\b|(?:switch|change).*hourly.*daily|(?:stop|pause|turn off).*decorative.*(?:background|animation|atmosphere)/))return 'settings';
 if(has(/\b(?:missing|unavailable|partial|incomplete|null|blank|offline)\b|dash.*(?:shown|instead)|(?:location|city) changed.*load|only two loaded forecast hours/) && !has(/ph|acidity|rainwater|warning|alert|radar|sample|record/))return 'data';
 if(has(/(?:probability|chance).*\b(?:mean|guarantee|promise|fraction|percentage|describes)\b|\b(?:explain|meaning).*rain probability/))return 'probability';
 if(has(/forecast confidence.*(?:supplied|score)|(?:manufacture|invent).*confidence/))return 'evidence';
 if(has(/(?:gust.*sustained wind|sustained wind.*gust)/)&&has(/difference|different/))return 'units';
 if(has(/infection|diagnos.*skin/))return 'medical';
 if(has(/spots on.*leaves/)&&has(/cause|identify/))return 'treatment';
 if(has(/clear.*browser storage/))return 'farm';
 if(has(/train.*late/))return 'exact';
 if(has(/पीएच/) && has(/दर्ज|रिकॉर्ड/))return 'phRecords';
 if(has(/water.quality|neutral ph|acidic rain|official.*(?:chemistry|ph)|rainwater.*(?:safe|harmless)|(?:laboratory|water).*quality test/))return 'ph';
 if(has(/water sample location|two samples|user measurement.*official/))return 'phRecords';
 if(has(/waterlogging|grain losses|soil readings/))return 'field';
 if(has(/forecast calculations.*farming|spray guidance.*official/))return 'treatment';
 if(has(/changed my farm location/))return 'farm';
 if(has(/medical testing|fungal infection|prescription.*headache/))return 'medical';
 if(has(/residue levels|insect.*eating|unlabelled chemical|restricted pesticide|crop warnings diagnoses/))return 'treatment';
 if(has(/past cyclone|years ago/))return 'history';
 if(has(/reminder.*another app/))return 'external';
 if(has(/(?:label|associate|mark|remove).*(?:ph|rainwater|chemistry)|(?:ph|rainwater).*unverified/))return 'phRecords';
 if(has(/(?:change|select|edit).*crop.*(?:stage|farm)|saved field name|weather location.*active farm/))return 'farm';
 if(has(/save.*preferred city|forecast in hindi/))return 'settings';
 if(has(/incomplete|shown as a dash/))return 'data';
 if(has(/cloud.*(?:exact rain|prove rain)|forecast differ|capture every small shower|uncertainty in soil|general precautions still useful|forecast-derived advisory/))return 'evidence';
 if(has(/(?:rainwater ph.*measur|ph.*same units)/))return 'ph';
 if(has(/(?:explain|what).*(?:uv index measures)/))return 'units';
 if(has(/(?:animate|explain).*(?:rainfall map|radar)/))return 'radar';
 if(has(/diagnos.*(?:heatstroke|medical|allerg|infection)|medicat|prescri.*(?:medicine|medical)|asthma|doctor|patient|antibiotic|oxygen level|dehydrat|dizz|fever|illness|medical advice|sunscreen dose|personal heat tolerance|fluid restriction|skin damage/))return 'medical';
 if(has(/(?:pesticide|fertili[sz]er|herbicide|fungicide|chemical|lime|acid).*(?:dose|dosage|amount|ratio|mix|concentration|legal|residue|waiting period)|(?:dose|dosage|mix|millilitres|prescrib|how much).*(?:pesticide|fertili[sz]er|herbicide|fungicide|chemical|lime|acid)|diagnos.*(?:crop|disease)|(?:identify|cause|treatment|cure).*(?:pest|disease|leaves|plant problem|spots)|(?:prove|confirm|guarantee).*(?:blight|infestation|crop disease)|nutrient deficiency|resistance pattern|product decisions|दवा डाल/))return 'treatment';
 if(has(/(?:soil moisture|soil temperature|seedbed moisture|grain.*moisture|roots.*water.stress|germination percentage|sowing depth|seed rate|irrigation.*(?:duration|demand)|litres per plant|flow rate|exact.*(?:irrigat|watering)|sensor|soil test|soil texture|groundwater|evapotranspiration|storage shed|crop.*mature|wheat.*mature|harvest readiness|trafficable|lodged plants|dry enough to spray|soil crusting|डिट्टी|मिट्टी की नमी)/))return 'field';
 if(has(/(?:drink|drinking|bacteria|heavy metals|alkalinity|water.treatment|safe.*water|water.*safe|water quality|soil.*acid|acid.*soil|how much lime|water tank|chemical mixing|पीएच.*(?:माप|दवा)).*/)&&has(/ph|water|rain|soil|पीएच/))return 'ph';
 if(has(/(?:\bsend\b|\btext\b|\bemail\b|\border\b|\bbook\b|purchase|subscribe|upload|remotely operate|(?:can you|please) call|bank transfer|install|unlock|bypass|retrieve somebody|access my|read files|share my coordinates|turn on.*pump|social media|other apps|perform.*action|claim.*performed|change my phone|track.*continuously|notification.*closed|delete every)/))return 'external';
 if(has(/poem|romantic|quadratic|movie|(?:won|score).*cricket|joke|legal contract|resume|price of gold|election|(?:order|cook).*dinner|(?:best|buy|recommend).*laptop|quantum|write a song|motorcycle|generate a photo|bank balance|password|hotel|maths|richest|edit a video|formal interview|business plan|support besides weather/))return 'unrelated';
 if(has(/historical|(?:last|past).*(?:year|month|summer|winter|week.*pressure|radar)|(?:2015|1998|2000|2010)|(?:thirty|forty|twenty|century|centuries|thirty.year)|climate (?:normal|trend)|coldest day.*history|record uv|when i was born|yesterday.*(?:rain|weather)|rain.*yesterday|(?:reconstruct|recover).*(?:observation|forecast)|archive/))return 'history';
 if(has(/guarantee|promise|certify|exact (?:second|number of raindrops|height|lightning|crop yield)|second.by.second|every second|six months|fifty years|next year|indefinitely|street.by.street|precisely this building|inside my house|specific tree|earthquake|volcano|tsunami|drain.*overflow|flight.*depart|train.*delay|school closures|bridge.*open|mountain route|hail damage/))return 'exact';
 if(has(/(?:ph|acidity|chemistry).*(?:record|sample|history|enter|save|delete|edit|import|calibrat|meter|method|timestamp)|(?:measured|record|enter|save|delete|edit|import|calibrat).*(?:ph|acidity|chemistry)|पीएच.*दर्ज/))return 'phRecords';
 if(has(/(?:farm).*(?:rename|edit|delete|save|register|sync|photo|export|account|storage|name|coordinates|stage|switch|select|record)|\b(?:add|rename|edit|delete|save|register|switch|select|remove|export|manage)\b.*\bfarm\b|temporary crop|clearing browser storage/))return 'farm';
 if(has(/settings|(?:change|switch).*(?:celsius|fahrenheit|units|language|miles per hour)|read.aloud|spoken language|microphone access|turn off.*(?:background|sound)|pause.*(?:decorative|atmosphere)|reduced.motion|bookmark|clear.*conversation|keyboard|enlarge.*text|where.*(?:layer|timestamp|forecast values|data.source|overview)|stop radar autoplay|language persist|permissions|hourly forecast to daily|table for|table of/))return 'settings';
 if(has(/radar|rainfall map|रडार/)&&!has(/^(?:open|show|please show|can you show|रडार नक्शा खोलो)/))return 'radar';
 if(has(/official|warning feed|alert.*mean|missing alert|missing warning|safety certificate|radar.*path|lightning.*(?:tracked|track)|road closure|house.*flood|severe.weather.*limitations|source.*hazard|hazard.*(?:threshold|calculation)|configured.*threshold/))return 'warning';
 if(has(/(?:probability|chance).*(?:mean|guarantee|fraction|percent.*day|half.*field|millimetres|for sure)|(?:zero|80 percent|40 percent|50 percent).*rain|rain.*(?:percentage of|twice as|half)|8 percent|rounded zero|rain.*worth.*umbrella|बारिश की संभावना शून्य/))return 'probability';
 if(has(/(?:what|why|explain|does|is).*(?:\bmean\b(?! for)|different|difference|measure|grid cell|forecast confidence|model value|user.entered|user.provided|confidence score|local shower|a timestamp|timestamps|time zone|local times)|why.*forecast.*change|sources disagree|recheck.*weather|unknown|known and unknown|which parts|separate.*(?:guidance|general|measured)|weather.*diagnos/)){
  if(has(/ph|acidity|chemistry/))return 'ph';
  if(has(/time zone|local time|tomorrow mean|resolved date/))return 'time';
  if(has(/temperature.*feels|relative humidity|wind gust|pressure mean|uv index|cloud cover.*rainfall/))return 'units';
  return 'evidence';
 }
 if(has(/unavailable|missing|blank|not loaded|failed|offline|null|partial|gaps|old forecast|timestamp.*old|provider.*error|geolocation.*denied|denied geolocation|retry|cancel.*old answer|city changed|(?<!cloud )coverage|loaded.*(?:two|only)|data.*not.*load|मौसम डेटा नहीं/))return 'data';
 if(has(/(?:ph|acidity|rainwater).*(?:safe|treatment|neutral|soil|alkalinity|guarantee|future|estimate|convert|cause)|(?:infer|invent|convert|predict).*(?:ph|acidity)|बिना माप.*पीएच/))return 'ph';
 if(has(/compare|comparison|which.*(?:windier|least|cleaner|safer)|twice as|higher than yesterday|lower than tomorrow|morning or evening/)&&!has(/tomorrow.*(?:hotter|warmer|colder|cooler).*today|today.*tomorrow.*maximum|today.*tomorrow.*temperature|today.*and tomorrow.*temperature/))return 'comparison';
 if(!has(/\binstead of\b/) && has(/\band\b|, then/) && ((q.match(/\b(?:rain|wind|humidity|temperature|sunset|ph|radar|uv|irrigate|spray|save|book)\b/g)||[]).length>1))return 'multiple';
 if(has(/^(?:can you (?:explain that|say that|repeat|repeat the)|give me the shorter|what should i do about it|why did you choose|is that a measured|what is the source for that|does that mean|which day were|please forget|please use my selected|no, i meant)/))return 'followup';
 return null;
}
const hindiReplies={
 medical:'मौसम डेटा से बीमारी का निदान, दवा की मात्रा या व्यक्तिगत सुरक्षा की पुष्टि नहीं कर सकता। मौसम और UV मान पर्यावरण की जानकारी हैं, चिकित्सा जाँच नहीं।',
 treatment:'मौसम से रोग या कीट की पहचान, कीटनाशक, खाद, चूना या रसायन की मात्रा तय नहीं कर सकता। उत्पाद विवरण, खेत की जाँच और उपयुक्त मिट्टी/पानी परीक्षण चाहिए। फसल सलाह सामान्य या स्रोत-आधारित सावधानी है, उपचार नहीं।',
 field:'मेरे पास खेत की मिट्टी की नमी, तापमान, फसल की परिपक्वता या पानी की गुणवत्ता का प्रत्यक्ष माप नहीं है। केवल मौसम से सिंचाई की मात्रा, बुवाई या कटाई का सटीक निर्णय नहीं दे सकता। स्थानीय माप और फसल विवरण आवश्यक हैं।',
 exact:'सटीक परिणाम या सुरक्षा की गारंटी नहीं दे सकता। यह सीमित मॉडल पूर्वानुमान है; भवन, सड़क, उड़ान, स्कूल या प्रत्येक क्षण की वास्तविक स्थिति की पुष्टि नहीं करता। उपलब्ध समय के मौसम मान पूछें।',
 history:'ऐतिहासिक मौसम, पुराने रडार और जलवायु आँकड़े जुड़े नहीं हैं। पुराने माप का पुनर्निर्माण या सात दिन के पूर्वानुमान से जलवायु परिवर्तन का निष्कर्ष नहीं निकाल सकता।',
 external:'इस चैट से संदेश, खरीद, भुगतान, उपकरण संचालन, निजी खाते, दूसरी ऐप या ब्राउज़र अनुमति नहीं बदल सकता। कोई संदेश भेजा या रिकॉर्ड हटाया नहीं गया है।',
 unrelated:'यह सहायक मौसम, पूर्वानुमान, फसल सावधानी, वर्षा-जल अम्लता और इस वेबसाइट की मदद तक सीमित है। सामान्य AI, समाचार, खरीदारी या निजी खातों की सेवा जुड़ी नहीं है।',
 ph:'स्थानीय मापा हुआ वर्षा-जल pH डेटा उपलब्ध नहीं है। अनुपलब्ध का अर्थ शून्य या तटस्थ पानी नहीं है। वर्षा-जल, मिट्टी का pH, प्रदूषण और पानी की सुरक्षा अलग विषय हैं। बिना परीक्षण के उपचार, पीने की सुरक्षा या भविष्य का सटीक pH नहीं बता सकता।',
 phRecords:'pH मापन नियंत्रण में सही खेत/स्थान और तारीख के साथ अपना नमूना दर्ज करें। उपयोगकर्ता द्वारा दर्ज रिकॉर्ड इसी उपकरण पर रहते हैं और स्वतंत्र रूप से सत्यापित नहीं हैं। चैट से कोई रिकॉर्ड जोड़ा, बदला या हटाया नहीं गया। पुराना नमूना भविष्य का pH पूर्वानुमान नहीं है।',
 farm:'खेत प्रबंधक में खेत जोड़ें/चुनें और नाम, निर्देशांक, फसल तथा अवस्था संपादित करें। रिकॉर्ड इसी उपकरण पर रहते हैं; ब्राउज़र डेटा मिटाने से हट सकते हैं। चैट ने खेत बनाया, बदला, अपलोड या हटाया नहीं है।',
 settings:'सेटिंग्स में तापमान और हवा की इकाइयाँ बदलें। भाषा चयन, वातावरण रोकने का बटन, बोलकर पढ़ने का विकल्प और चैट साफ़ करने का नियंत्रण उपयोग करें। नक्शे में परत/रडार और पूर्वानुमान में घंटे/दिन तथा सभी मानों की तालिका उपलब्ध है। चैट ने सेटिंग नहीं बदली।',
 data:'अनुपलब्ध मान को शून्य न मानें। अधूरा पूर्वानुमान पूरी अवधि की गारंटी नहीं देता। स्रोत और समय देखें, असफल अनुरोध दोबारा आज़माएँ; स्थान अनुमति न मिलने पर शहर खोजें। मौसम, नक्शा, रडार, वायु गुणवत्ता और pH की उपलब्धता अलग है।',
 radar:'RainViewer रडार उपलब्ध पुराने/हाल के फ़्रेम दिखाता है, भविष्य के तूफान का निश्चित मार्ग नहीं। समयरेखा और रोकने/चलाने के नियंत्रण नक्शे में हैं। कवरेज या नेटवर्क की कमी से अंतराल हो सकते हैं। इस उत्तर ने परत या प्लेबैक नहीं बदला।',
 warning:'आधिकारिक चेतावनी, बिजली की लाइव ट्रैकिंग, सड़क बंद होने या घर-स्तर की बाढ़ जानकारी जुड़ी नहीं है। ऐप की सावधानियाँ मॉडल और सीमाओं पर आधारित गणनाएँ हैं, सुरक्षा प्रमाणपत्र नहीं। आधिकारिक सूचना स्थानीय मौसम प्राधिकरण से जाँचें।',
 probability:'बारिश का प्रतिशत समय-अवधि की पूर्वानुमानित संभावना है, वर्षा की मात्रा या दिन/खेत का निश्चित भाग नहीं। शून्य या अधिक प्रतिशत गारंटी नहीं है। छोटी संभावना में छोटा छाता उपयोगी हो सकता है; अधूरे मान को सूखा मौसम न मानें। निकलने से पहले फिर जाँचें।',
 evidence:'मौसम मान मॉडल ग्रिड के अनुमान हैं, हर खेत का प्रत्यक्ष माप नहीं। समय मॉडल की बताई स्थिति दर्शाता है। उपयोगकर्ता नमूनों का स्रोत अलग है। स्थानीय बारिश भिन्न हो सकती है; मैं मनगढ़ंत विश्वास-अंक या गारंटी नहीं दूँगा।',
 units:'तापमान हवा का मान है और महसूस होने वाला तापमान अलग अनुमान। सापेक्ष नमी, लगातार हवा और छोटे तेज़ झोंके अलग माप हैं। यहाँ दबाव समुद्र-तल दबाव (hPa) है। UV अलग सूचकांक है; केवल बादल से वर्षा की मात्रा तय नहीं होती।',
 time:'दिन और घंटे चुने स्थान के समय क्षेत्र में समझे जाते हैं। उत्तर का दिन/समय लेबल देखें। स्पष्ट स्थानीय घंटा, AM/PM या YYYY-MM-DD तारीख दें। बीती या अनुपलब्ध अवधि के बदले दूसरी अवधि नहीं दिखानी चाहिए।',
 comparison:'आज और कल के अधिकतम तापमान की सीधी तुलना समर्थित है। इस दूसरी तुलना को एक उत्तर में विश्वसनीय रूप से नहीं कर सकता। मात्रा, समय या स्थान अलग-अलग पूछें; मनगढ़ंत क्रम नहीं दूँगा।',
 multiple:'इस प्रश्न में कई अलग काम हैं। पहले एक मौसम मात्रा या एक फसल/pH प्रश्न, स्थान और समय के साथ चुनें। दूसरा स्थान स्पष्ट न होने पर चुना स्थान ही रहेगा। बाहरी कार्रवाई या परिणाम की गारंटी नहीं दे सकता।',
 followup:'कृपया मौसम की मात्रा और समय बताएँ। सरल अगले दिन/समय के प्रश्न में पिछला विषय लिया जा सकता है, लेकिन हर “वह/यह” का संदर्भ विश्वसनीय रूप से नहीं समझ सकता। स्थान या रिकॉर्ड बदला नहीं गया।'
};
export function helpAnswer(kind, state, language='en', question='') {
 const [supportMode, baseText]=replies[kind]||replies.followup;
 const text=baseText+(kind==='ph'?' '+PH_ESTIMATE_LIMIT.en:'');
 const subject=question.match(/\b(?:rainfall|rain|humidity|wind|cloud|uv|visibility|sunset|sunrise|pressure|temperature|feels-like|apparent temperature|outdoor|picnic)\b/i)?.[0];
 const agricultural=/\b(?:crop|wheat|rice|cotton|maize|soybean|farm|field|spray|spraying|irrigation|sowing|harvest|seedling)\b/i.test(question);
 const farmNote=agricultural&&['data','exact','external','warning','evidence'].includes(kind)?' For crop decisions, weather estimates do not replace field inspection, soil information or crop-stage details.':'';
 const prefix=subject?`${subject[0].toUpperCase()+subject.slice(1)}: `:'';
 return {text:language==='hi'?(hindiReplies[kind]||hindiReplies.followup):prefix+text+farmNote,metrics:[],choices:[],language,supportMode,helpKind:kind};
}
