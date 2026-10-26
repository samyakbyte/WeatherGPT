// Explicit part-of-day windows in the SELECTED LOCATION's local civil time.
// All windows are half-open [start, end): an hourly sample at 20:00 belongs to
// night, not evening. These windows are used by BOTH evidence selection and
// outdoor-planning scoring, so an answer can never recommend a time outside the
// window the user asked about.
export const PART_WINDOWS = {
  morning:   { start: 6,  end: 12, label: '6 AM–12 PM',     labelHi: 'सुबह (6–12 बजे)',       aliases: ['morning', 'subah', 'सुबह'] },
  afternoon: { start: 12, end: 17, label: '12–5 PM',        labelHi: 'दोपहर (12–5 बजे)',     aliases: ['afternoon', 'dopahar', 'दोपहर'] },
  evening:   { start: 17, end: 20, label: '5–8 PM',         labelHi: 'शाम (5–8 बजे)',       aliases: ['evening', 'shaam', 'sham', 'शाम'] },
  night:     { start: 20, end: 24, label: '8 PM–midnight',  labelHi: 'रात (8–12 बजे)',      aliases: ['night', 'tonight', 'raat', 'रात'] }
};

// Used only when the user did NOT specify a window. Still explicit and documented.
export const DEFAULT_OUTDOOR_WINDOW = { start: 6, end: 20, label: '6 AM–8 PM', labelHi: 'सुबह 6–रात 8 बजे' };

export function partOfDay(hour) {
  for (const [key, w] of Object.entries(PART_WINDOWS)) if (hour >= w.start && hour < w.end) return key;
  return 'night';
}

export function windowLabel(window, language = 'en') {
  return language === 'hi' ? (window.labelHi || window.label) : window.label;
}
