// Decorative condition-driven scenery. Never presented as a live location photo.
const hero=document.getElementById('current-section');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const fine=matchMedia('(hover: hover) and (pointer: fine)');
const scene=document.createElement('div');scene.className='condition-scene';scene.setAttribute('aria-hidden','true');
scene.innerHTML='<div class="scene-photo"></div><div class="scene-photo"></div><div class="scene-depth"><i class="scene-orb"></i><i class="scene-cloud cloud-back"></i><i class="scene-cloud cloud-front"></i><div class="scene-particles"></div></div>';
hero.prepend(scene);
const photos=[...scene.querySelectorAll('.scene-photo')];
const particles=scene.querySelector('.scene-particles');
for(let i=0;i<16;i++){const p=document.createElement('i');p.style.cssText=`--x:${(i*43)%100}%;--delay:${-i*.37}s;--speed:${1.2+(i%5)*.23}s`;particles.append(p);}
let active=0,last='',frame=0;
export function sceneFor(icon,day){
 if(icon==='unknown'||!icon)return 'unknown';
 if(icon==='storm')return 'storm';
 if(icon==='snow')return 'snow';
 if(icon==='cloud-rain')return 'rain';
 if(icon==='fog')return 'fog';
 if(day==='night'&&icon==='cloud')return 'cloud-night';
 if(day==='night'&&icon==='sun-cloud')return 'partial-night';
 if(day==='night'||icon==='moon')return 'night';
 return icon==='sun'?'sun':icon==='sun-cloud'?'partial':'cloud';
}
function sync(){
 const key=sceneFor(document.body.dataset.weather,document.body.dataset.day);
 hero.dataset.scene=key;
 if(key===last)return;last=key;
 const next=1-active;photos[next].dataset.scene=key;photos[next].classList.add('active');photos[active].classList.remove('active');active=next;
 reset();
}
function reset(){hero.style.setProperty('--scene-rx','0deg');hero.style.setProperty('--scene-ry','0deg');hero.style.setProperty('--scene-shift','0px');}
hero.addEventListener('pointermove',e=>{
 if(reduced.matches||!fine.matches||document.body.dataset.ambient!=='running'||document.hidden)return;
 if(frame)return;
 frame=requestAnimationFrame(()=>{frame=0;const b=hero.getBoundingClientRect();hero.style.setProperty('--scene-rx',`${-(e.clientY-b.top-b.height/2)/b.height*5}deg`);hero.style.setProperty('--scene-ry',`${(e.clientX-b.left-b.width/2)/b.width*7}deg`);hero.style.setProperty('--scene-shift',`${(e.clientX-b.left-b.width/2)/b.width*16}px`);});
},{passive:true});
hero.addEventListener('pointerleave',reset);reduced.addEventListener('change',reset);
const observer=new MutationObserver(()=>{sync();if(document.body.dataset.ambient!=='running')reset();});
observer.observe(document.body,{attributes:true,attributeFilter:['data-weather','data-day','data-ambient']});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;reset();});sync();
