import { animate } from './vendor/animejs/anime.esm.min.mjs';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const hero = document.getElementById('current-section');
const ring = document.createElement('div');
ring.className = 'weather-cursor'; ring.setAttribute('aria-hidden','true');
document.body.append(ring);
let frame = 0, x = 0, y = 0;
function track(event) {
  if (!fine.matches || reduced.matches) return;
  x=event.clientX; y=event.clientY;
  ring.classList.toggle('is-link', !!event.target.closest('a,button,summary,input,select'));
  ring.classList.add('visible');
  if (!frame) frame=requestAnimationFrame(()=>{ring.style.transform=`translate3d(${x}px,${y}px,0)`;frame=0;});
}
document.addEventListener('pointermove',track,{passive:true});
document.addEventListener('pointerout',e=>{if(!e.relatedTarget)ring.classList.remove('visible');});
reduced.addEventListener('change',()=>ring.classList.remove('visible'));

const runningReveals=new Set();
reduced.addEventListener("change",()=>{if(reduced.matches){for(const animation of runningReveals)animation.complete();runningReveals.clear();}});
const targets=[...document.querySelectorAll('.workspace-grid > *,#farm-dashboard,.agri-overview-grid > section,.forecast-values')];
const reveals=new IntersectionObserver(entries=>{
  for(const entry of entries) if(entry.isIntersecting){
    reveals.unobserve(entry.target);
    if(!reduced.matches){const animation=animate(entry.target,{opacity:[.25,1],translateY:[28,0],duration:650,ease:'outQuart',onComplete:self=>runningReveals.delete(self)});runningReveals.add(animation);}
  }
},{threshold:.08});
targets.forEach(e=>reveals.observe(e));
hero.addEventListener('pointermove',event=>{
  if(!fine.matches||reduced.matches)return;
  const bounds=hero.getBoundingClientRect();
  hero.style.setProperty('--pointer-x',`${(event.clientX-bounds.left)/bounds.width*100}%`);
  hero.style.setProperty('--pointer-y',`${(event.clientY-bounds.top)/bounds.height*100}%`);
});
hero.addEventListener('pointerleave',()=>{hero.style.setProperty('--pointer-x','50%');hero.style.setProperty('--pointer-y','30%');});
document.querySelectorAll('.primary-nav a').forEach(link=>link.title=link.textContent.trim());
const localeObserver=new MutationObserver(()=>document.querySelectorAll('.primary-nav a').forEach(link=>link.title=link.textContent.trim()));
localeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);ring.classList.remove('visible');});
