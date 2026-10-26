// Compatibility facade. The interpretation logic now lives in one structured
// module (js/understanding.js); this file keeps the historic import paths for
// the application shell, the browser test pages and the Node test runner.
export { topicNames, interpretWeatherQuestion, applyGeocoderResult, canonicalize, removeTemporal } from './understanding.js';

// Compromise is a vendored UMD bundle loaded as a classic script. It supplies
// tokenisation only; all slot decisions are made by our own weather rules. If
// the bundle fails to load, the interpreter still works and says so visibly.
let enginePromise;
export function loadNLPEngine() {
  if (typeof window !== 'undefined' && typeof window.nlp === 'function') return Promise.resolve(window.nlp);
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (!enginePromise) enginePromise = new Promise(resolve => {
    const script = document.createElement('script');
    script.src = new URL('./vendor/compromise.js', import.meta.url).href;
    script.async = true;
    let settled = false;
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => finish(null), 8000);
    script.onload = () => finish(typeof window.nlp === 'function' ? window.nlp : null);
    script.onerror = () => finish(null);
    document.head.append(script);
  });
  return enginePromise;
}
