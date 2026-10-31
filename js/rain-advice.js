// Product recommendation thresholds, not meteorological certainty.
export function umbrellaAdvice(probability, language = 'en', complete = true) {
  const hi = language === 'hi';
  if (!Number.isFinite(probability) || !complete) return hi
    ? 'बारिश का पूर्वानुमान अधूरा है; छाता छोड़ने की सलाह नहीं दे सकता। एहतियात के लिए साथ रख लें।'
    : 'The rain forecast is incomplete, so I cannot recommend leaving your umbrella behind. Carry one as a precaution.';
  if (probability >= 20) return hi
    ? 'हाँ, छाता साथ रखें—बारिश की संभावना है।'
    : 'Yes, take an umbrella—rain is possible.';
  if (probability > 0) return hi
    ? 'बारिश की संभावना कम है; एहतियात के लिए छोटा छाता साथ रख लें।'
    : 'There is a small chance of rain; take a compact umbrella as a precaution.';
  return hi
    ? 'इस पूर्वानुमान के अनुसार छाते की ज़रूरत नहीं लगती। निकलने से पहले फिर जाँच लें; 0% पूर्ण गारंटी नहीं है।'
    : 'You probably do not need an umbrella based on this forecast. Check again before leaving; 0% is not a guarantee.';
}
