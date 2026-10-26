// This drives the real app at the browser's actual viewport width. No copied UI,
// weather mocks, forced breakpoints, or fabricated assistant responses.
const frame=document.getElementById('actual-app');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(predicate){const start=Date.now();while(Date.now()-start<50000){if(predicate())return;await pause(150);}throw new Error('The real application did not finish loading.');}
try{
  await wait(()=>frame.contentDocument?.querySelector('.hour-item'));
  const doc=frame.contentDocument,win=frame.contentWindow;
  const language=doc.querySelector('#assistant-language');language.value='en';language.dispatchEvent(new win.Event('change',{bubbles:true}));
  doc.querySelector('#assistant-query').value='Will it rain in Jaipur tomorrow evening?';
  doc.querySelector('#assistant-form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>doc.querySelector('.response-timeline')&&doc.querySelector('#nlp-slots').textContent.includes('Jaipur'));
  doc.querySelector('#conversation').scrollTop=0;win.scrollTo(0,0);
  document.body.dataset.ready='true';console.info('[VISUAL] Actual assistant with local NLP and live forecast is ready.');
}catch(error){document.body.dataset.failed='true';console.error('[VISUAL]',error.message);}
