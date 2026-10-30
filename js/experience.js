import { animate } from './vendor/animejs/anime.esm.min.mjs';

const hero = document.getElementById('current-section');
const toggle = document.getElementById('motion-toggle');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let paused = false;
let inView = true;
let transition;
try { paused = localStorage.getItem('weathergpt.motion-paused') === 'true'; } catch {}

function syncMotion() {
  const stopped = paused || reduced.matches || document.hidden || !inView || hero.hidden;
  document.body.dataset.ambient = stopped ? 'paused' : 'running';
  const hi = document.documentElement.lang === 'hi';
  toggle.textContent = reduced.matches
    ? (hi ? 'कम गति चालू' : 'Reduced motion on')
    : paused ? (hi ? 'गतिशील दृश्य चलाएँ' : 'Resume atmosphere')
      : (hi ? 'गतिशील दृश्य रोकें' : 'Pause atmosphere');
  toggle.setAttribute('aria-pressed', String(paused || reduced.matches));
  toggle.disabled = reduced.matches;
  if (reduced.matches || document.hidden) transition?.revert();
}

toggle.addEventListener('click', () => {
  paused = !paused;
  try { localStorage.setItem('weathergpt.motion-paused', String(paused)); } catch {}
  syncMotion();
});
reduced.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', syncMotion);
const observer = new IntersectionObserver(([entry]) => {
  inView = entry.isIntersecting;
  syncMotion();
}, { threshold: 0.05 });
observer.observe(hero);
const localeObserver = new MutationObserver(syncMotion);
localeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

function routeTransition() {
  syncMotion();
  transition?.revert();
  if (reduced.matches || document.hidden) return;
  const view = location.hash.slice(1);
  const target = document.getElementById(({map:'map-section',forecast:'forecast-section',alerts:'alerts-view',assistant:'assistant-view',locations:'locations-view'})[view] || 'current-section');
  if (target && !target.hidden) transition = animate(target, { opacity: [0.65, 1], translateY: [6, 0], duration: 320, ease: 'outQuart' });
}
window.addEventListener('hashchange', () => requestAnimationFrame(routeTransition));
window.addEventListener('pagehide', () => { transition?.revert(); document.body.dataset.ambient = 'paused'; });
window.addEventListener('pageshow', syncMotion);
syncMotion();
if (!reduced.matches && !hero.hidden) transition = animate(hero.querySelector('.current-primary'), { opacity: [0.65, 1], translateY: [8, 0], duration: 500, ease: 'outQuart' });
