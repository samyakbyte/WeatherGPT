#!/usr/bin/env node
// Real-browser verification with deterministic mocked providers.
//   npm install        (adds playwright-core, @sparticuz/chromium, leaflet, chart.js)
//   npm run test:browser
// Uses headless Chromium 153 via @sparticuz/chromium; serves the repository
// over a local static server; intercepts all external traffic with fixtures.
// Screenshots are written to screenshots/ (gitignored).
import { createRequire } from 'module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildForecast, buildAirQuality, GEOCODE, VILLAGES, PHOTON, RADAR, PNG } from './browser-fixtures.js';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SHOTS = join(ROOT, 'screenshots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain' };

let passed = 0, failed = 0;
const failures = [];
let browser, server;
const check = (ok, label) => { if (ok) passed++; else { failed++; failures.push(label); console.error('[FAIL]', label); } console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); };
async function shot(page, name) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await page.screenshot({ path: join(SHOTS, name), fullPage: false, timeout: 25000, animations: 'disabled' }); return true; }
    catch (error) { if (attempt === 1) { console.error('[screenshot failed]', name, error.message.slice(0, 100)); return false; } await page.waitForTimeout(400); }
  }
  return false;
}

async function chromiumSetup() {
  const chromium = require('@sparticuz/chromium').default;
  const { inflate } = require('@sparticuz/chromium');
  // Extract the bundled AL2023 shared libraries (libnss3, libnspr4, ...) and
  // put them on LD_LIBRARY_PATH for the browser process.
  // The package exports map hides package.json, so derive it from the entry file.
  const entry = require.resolve('@sparticuz/chromium');
  const pkgRoot = resolve(dirname(entry), '..');
  await inflate(join(pkgRoot, 'bin', 'al2023.tar.br'));
  const exe = await chromium.executablePath();
  return { chromium, exe, libDir: '/tmp/al2023/lib' };
}

function staticServer() {
  return createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = join(ROOT, path === '/' ? 'index.html' : path);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end('Not found'); }
  });
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const { chromium, exe, libDir } = await chromiumSetup();
  const { chromium: pw } = require('playwright-core');
  server = staticServer();
  await new Promise(r => server.listen(0, '0.0.0.0', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  browser = await pw.launch({ headless: true, executablePath: exe, args: [...chromium.args, '--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: libDir } });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  context.setDefaultTimeout(8000);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => { pageErrors.push(e.message); console.error('[PAGE ERROR]',e.stack||e.message); });

  const leaflet = await readFile(join(ROOT, 'node_modules/leaflet/dist/leaflet.js')).catch(() => null);
  const leafletCss = await readFile(join(ROOT, 'node_modules/leaflet/dist/leaflet.css')).catch(() => null);
  const chart = await readFile(join(ROOT, 'node_modules/chart.js/dist/chart.umd.js')).catch(() => null);
  const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const airQualityRequests = [];
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.includes('air-quality-api.open-meteo.com/v1/air-quality')) {
      airQualityRequests.push(url);
      if (airQualityRequests.length === 3) {
        const empty = buildAirQuality();
        for (const key of ['sulphur_dioxide', 'nitrogen_dioxide', 'pm2_5', 'pm10', 'ozone']) empty.hourly[key] = empty.hourly.time.map(() => null);
        return route.fulfill(json(empty));
      }
      if (airQualityRequests.length === 5) return route.fulfill({ status: 429, headers: { 'retry-after': '2' }, contentType: 'application/json', body: JSON.stringify({ reason: 'fixture rate limit' }) });
      return route.fulfill(json(buildAirQuality()));
    }
    if (url.includes('api.open-meteo.com/v1/forecast')) return route.fulfill(json(buildForecast()));
    if (url.includes('geocoding-api.open-meteo.com')) return route.fulfill(json(url.includes('Rampura') || url.includes('Alwar') ? { results: [] } : GEOCODE));
    if (url.includes('photon.komoot.io')) return route.fulfill(json(PHOTON));
    if (url.includes('nominatim.openstreetmap.org')) return route.fulfill(json(VILLAGES));
    if (url.includes('api.rainviewer.com/public/weather-maps.json')) return route.fulfill(json(RADAR));
    if (url.includes('tilecache.rainviewer.com') || url.includes('tile.openstreetmap.org')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (url.includes('leaflet@1.9.4/dist/leaflet.js') && leaflet) return route.fulfill({ status: 200, contentType: 'application/javascript', body: leaflet });
    if (url.includes('leaflet@1.9.4/dist/leaflet.css') && leafletCss) return route.fulfill({ status: 200, contentType: 'text/css', body: leafletCss });
    if (url.includes('chart.js@4.4.8/dist/chart.umd.min.js') && chart) return route.fulfill({ status: 200, contentType: 'application/javascript', body: chart });
    if (url.includes('fonts.googleapis.com/css2')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (url.startsWith(base)) return route.continue();
    return route.abort();
  });

  await page.goto(base + '/index.html', { waitUntil: 'load' });
  await page.waitForSelector('.hour-item', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);

  // ── Automatic location context and crop selection ──
  await page.waitForFunction(() => (document.querySelector('#acidity-summary-card')?.textContent||'').includes('2.0 μg/m³'), null, { timeout: 12000 });
  const initialOutlook=await page.locator('#acidity-summary-card').textContent()||'';
  check(initialOutlook.includes('Rainwater Acidity Outlook')&&initialOutlook.includes('Context only — concern not classified')&&initialOutlook.includes('Typical natural rainwater: approximately pH 5.6')&&initialOutlook.includes('not a location-specific prediction')&&initialOutlook.includes('Rainwater pH, sulfate/nitrate')&&await page.locator('#acidity-summary-card .outlook-ph-track').count()===1&&!initialOutlook.includes('Insufficient data'), 'automatic acidity outlook presents available model context, names missing chemistry inputs and avoids unsupported pH');
  check(await page.locator('#suitability-crop-select option').count()===12, 'crop selector lists placeholder plus all 11 supported crops');
  await page.locator('#suitability-crop-select').selectOption('wheat');
  check((await page.locator('#suitability-card').textContent()||'').includes('Wheat')&&(await page.locator('#suitability-card .score-layout').count()===1), 'crop selection immediately calculates suitability without farm registration');
  check(await page.evaluate(()=>!localStorage.getItem('weathergpt.farms.v2')), 'temporary crop choice does not create or overwrite saved farm data');
  check(await page.locator('#demo-controls, #demo-banner, [data-demo-key], #demo-scenario').count()===0, 'presentation demo UI is absent');

  // ── Existing workspace features (no regressions) ──
  check((await page.locator('#current-temperature').textContent() || '').includes('29'), 'current conditions render from forecast');
  check(await page.locator('.leaflet-container').count() === 1, 'Leaflet map initialises');
  check(await page.locator('.hour-item').count() > 0, 'hourly strip renders');
  check(await page.locator('#forecast-chart').count() === 1, 'Chart.js canvas present');
  await page.locator('[data-period="daily"]').click();
  check(await page.locator('.daily-row').count() === 7, '7-day forecast rows');
  const widths = await page.locator('.daily-row .temp-fill').evaluateAll(els => els.map(e => e.style.width));
  check(new Set(widths).size > 1, 'temperature bars are computed from real min/max, not identical gradients');
  check(await page.locator('.daily-row .sr-only').count() === 7, 'daily bars have accessible text values');
  await page.locator('[data-metric="rain"]').click();
  check((await page.locator('#chart-unit').textContent()) === '%', 'rain-chance chart metric');
  await page.locator('[data-period="hourly"]').click(); await page.locator('[data-metric="temperature"]').click();
  await page.locator('[data-layer="wind"]').click();
  check((await page.locator('#map-legend').textContent() || '').includes('Wind speed'), 'map layer switching');
  await page.locator('[data-layer="radar"]').click();
  await page.waitForTimeout(500);
  check(!(await page.locator('#radar-timeline').isDisabled()), 'radar timeline populated');
  const before = await page.locator('#radar-timeline').inputValue();
  await page.locator('#radar-prev').click();
  check((await page.locator('#radar-timeline').inputValue()) !== before, 'radar frame stepping');
  await page.locator('[data-layer="temperature"]').click();
  await page.locator('#location-search').fill('Jaipur');
  await page.waitForSelector('#search-results [data-location]', { timeout: 10000 }).catch(() => {});
  check(await page.locator('#search-results [data-location]').count() > 0, 'city search returns a choice');
  check(await page.locator('[data-explicit-search]').count() > 0, 'explicit village-search control is offered');
  await page.locator('#save-location').click();
  check((await page.locator('#save-location').getAttribute('aria-pressed')) === 'true', 'saved-location toggle');
  await page.locator('#save-location').click();
  await page.locator('#settings-button').evaluate(button=>button.click());
  check(await page.locator('#settings-dialog').evaluate(el => el.open), 'preferences dialog opens');
  await page.locator('#settings-dialog').evaluate(el => el.close());
  await page.locator('#sources-button').evaluate(button=>button.click());
  check((await page.locator('#sources-dialog').textContent() || '').includes('Rainwater acidity'), 'data-sources dialog documents acidity and provenance');
  await page.locator('#sources-dialog').evaluate(el => el.close());

  // ── New Phase 2/3/4 UI ──
  check(await page.locator('#farm-dashboard').count() === 1, 'active-farm / next-72-hours dashboard is present');
  check((await page.locator('#acidity-content').textContent() || '').includes('Rainwater acidity data unavailable for this location.'), 'rainwater acidity shows the exact unavailability message');
  await page.locator('.provenance-details summary').click();
  check((await page.locator('#provenance-content').textContent() || '').includes('Model grid-cell centre'), 'provenance shows requested vs model grid coordinates');
  await page.evaluate(() => { location.hash = 'locations'; });
  await page.waitForTimeout(300);
  check(await page.locator('#farms-list').count() === 1 && await page.locator('#farm-form').count() === 1, 'farm management UI present');
  await page.locator('#add-farm-current').evaluate(button=>button.click());
  check(!(await page.locator('#farm-form-section').isHidden()), 'add-farm form opens with current coordinates');
  await page.locator('#farm-name').fill('Test field');
  await page.locator('#farm-crop').selectOption('wheat');
  await page.locator('#farm-form').dispatchEvent('submit');
  await page.waitForTimeout(400);
  check(await page.locator('.farm-card').count() === 1, 'farm is saved and listed');
  check((await page.locator('#active-farm-card').textContent() || '').includes('Test field'), 'saved farm becomes the active farm');
  check((await page.locator('#farm-summary-line').textContent() || '').includes('Test field'), 'dashboard follows the active farm');
  // Farm survives reload.
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.evaluate(() => { location.hash = 'locations'; });
  await page.waitForTimeout(300);
  check(await page.locator('.farm-card').count() === 1, 'farm persists across reloads');
  check((await page.locator('#active-farm-card').textContent() || '').includes('Test field'), 'active farm persists across reloads');

  // ── Atmospheric monitoring: provider fixture, provenance and farm context ──
  await page.evaluate(() => { location.hash = 'map'; });
  await page.waitForTimeout(250);
  await page.locator('#more-layers').selectOption('atmosphere');
  await page.waitForFunction(() => document.querySelector('#environment-content')?.textContent.includes('Open-Meteo Air Quality API'), null, { timeout: 10000 });
  const environmentText = await page.locator('#environment-content').textContent() || '';
  check(airQualityRequests.length === 2, 'automatic acidity outlook fetches once per page and atmospheric monitoring reuses its cached response');
  const airURL = new URL(airQualityRequests[0]);
  check(airURL.searchParams.get('forecast_days') === '2' && airURL.searchParams.get('timezone') === 'auto' && airURL.searchParams.get('hourly').includes('sulphur_dioxide,nitrogen_dioxide,pm2_5,pm10,ozone'), 'browser integration sends only documented, bounded Air Quality API parameters');
  check(environmentText.includes('2.0 μg/m³') && environmentText.includes('8.0 μg/m³') && environmentText.includes('18.0 μg/m³') && environmentText.includes('28.0 μg/m³') && environmentText.includes('38.0 μg/m³'), 'SO₂, NO₂, PM2.5, PM10 and ozone model values render with provider units');
  check(environmentText.includes('Selected coordinates: 28.614, 77.209') && environmentText.includes('Model grid centre: 26.875, 75.750') && environmentText.includes('2026-10-26T10:00'), 'selected coordinates, returned model-grid centre and provider timestamp remain distinct');
  check(environmentText.includes('not directly measure rainwater pH') && environmentText.includes('Rainfall context'), 'atmosphere panel states limitations and keeps forecast rainfall separate from pH');
  await page.locator('#environment-pollutant').selectOption('pm2_5');
  check((await page.locator('#environment-content').textContent() || '').includes('18.0 μg/m³') && (await page.locator('#map-legend').textContent() || '').includes('PM2.5'), 'pollutant selector updates the selected model-point display and legend');
  await page.locator('#more-layers').selectOption('acidity');
  check((await page.locator('#environment-content').textContent() || '').includes('No measured rainwater pH records for this area.'), 'missing pH records do not suppress atmospheric values and have a clear empty state');
  await page.locator('#more-layers').selectOption('atmosphere');
  await page.waitForFunction(() => document.querySelector('#environment-content')?.textContent.includes('Open-Meteo Air Quality API'), null, { timeout: 10000 });
  check(airQualityRequests.length === 2, 'switching environmental layers reuses the successful cached provider response');
  await page.locator('#environment-refresh').click();
  await page.waitForSelector('#environment-content .env-no-data', { timeout: 10000 });
  check((await page.locator('#environment-content').textContent() || '').includes('No pollutant values are available') && (await page.locator('#environment-content').textContent() || '').includes('Unavailable'), 'valid provider response with null pollutant arrays renders an explicit no-data state, not zero');
  await page.locator('#environment-refresh').click();
  await page.waitForFunction(() => (document.querySelector('#environment-content')?.textContent || '').includes('18.0 μg/m³'), null, { timeout: 10000 });
  check(airQualityRequests.length === 4, 'manual refresh bypasses the cached response and can recover from a provider no-data frame');
  await page.evaluate(() => { location.hash = 'overview'; });
  await page.waitForTimeout(250);
  const farmEnvironmentText = await page.locator('#farm-environment-summary').textContent() || '';
  check(farmEnvironmentText.includes('MODELED FORECAST') && farmEnvironmentText.includes('18.0 μg/m³'), 'matching selected farm receives a modeled environmental summary without changing suitability scoring');
  await page.evaluate(() => { location.hash = 'assistant'; });
  await page.waitForTimeout(200);
  await page.locator('#assistant-language').selectOption('hi');
  await page.evaluate(() => { location.hash = 'map'; });
  await page.waitForTimeout(250);
  await page.locator('#more-layers').selectOption('atmosphere');
  await page.waitForTimeout(200);
  check((await page.locator('#environment-title').textContent() || '').includes('वायुमंडलीय निगरानी') && (await page.locator('#environment-content').textContent() || '').includes('मॉडल/पूर्वानुमान मान'), 'atmospheric panel and selected-value provenance are translated in Hindi');
  check((await page.locator('#map-mode-label').textContent() || '').includes('वायु मॉडल'), 'atmospheric map-mode badge localizes in Hindi');
  await page.evaluate(() => { location.hash = 'assistant'; });
  await page.waitForTimeout(200);
  await page.locator('#assistant-language').selectOption('en');
  await page.evaluate(() => { location.hash = 'map'; });
  await page.waitForTimeout(250);
  await page.locator('#environment-refresh').click();
  await page.waitForFunction(() => (document.querySelector('#environment-content')?.textContent || '').includes('service is busy'), null, { timeout: 10000 });
  check((await page.locator('#environment-content [data-retry-atmosphere]').isDisabled()) && airQualityRequests.length === 5, 'HTTP 429 presents a cooldown and prevents immediate repeated retries');
  await page.locator('#weather-map').scrollIntoViewIfNeeded();
  const priorMapLocation=(await page.locator('#location-name').textContent()||'').trim();
  const clickMap=await page.locator('#weather-map').boundingBox();
  await page.mouse.click(clickMap.x+clickMap.width*.30,clickMap.y+clickMap.height*.72);
  await page.waitForFunction(previous=>(document.querySelector('#location-name')?.textContent||'').trim()!==previous,priorMapLocation,{timeout:8000});
  await page.waitForFunction(()=>(document.querySelector('#acidity-summary-card')?.textContent||'').includes('2.0 μg/m³'),null,{timeout:12000});
  check((await page.locator('#acidity-summary-card').textContent()||'').includes((await page.locator('#location-name').textContent()||'').trim()), 'map click immediately selects a location and auto-refreshes its acidity outlook');

  // Presentation/demo controls are intentionally removed from the product UI.
  check(await page.locator('#demo-controls, #demo-banner, [data-demo-key], #demo-scenario').count()===0, 'presentation demo controls and simulation banners are absent from the homepage');
  await page.evaluate(()=>{location.hash='locations';});await page.waitForTimeout(200);
  await page.locator('#farms-list [data-farm-activate]').first().click();await page.waitForTimeout(300);
  await page.evaluate(()=>{location.hash='overview';});await page.waitForTimeout(200);
  await page.locator('#acidity-details > summary').click();
  await page.locator('#ph-value').fill('4.7');
  await page.locator('#ph-date').fill('2026-10-29');
  await page.locator('#ph-source').fill('browser test strip');
  await page.locator('#ph-reading-form').dispatchEvent('submit');
  check((await page.locator('#acidity-content').textContent() || '').includes('4.7'), 'user pH measurement is saved and appears in history');
  check((await page.locator('#acidity-summary-card').textContent()||'').includes('Measured sample')&&(await page.locator('#acidity-summary-card').textContent()||'').includes('pH 4.7')&&(await page.locator('#acidity-summary-card .outlook-scale-marker.measured-marker').count()===1), 'outlook prominently shows a matching measured sample and marks it on the pH scale');
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('weathergpt.rain-ph.v1') || '[]')[0]?.recordType)) === 'user-recorded', 'saved observation provenance is user-recorded');
  await page.locator('#more-layers').selectOption('acidity');
  check((await page.locator('#map-data-label').textContent() || '').includes('1 geolocated user reading'), 'user pH history refreshes the map marker');
  await page.locator('#weather-map').scrollIntoViewIfNeeded();
  const mapBox = await page.locator('#weather-map').boundingBox();
  await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  check((await page.locator('.leaflet-popup-content').textContent() || '').includes('MEASURED · USER-RECORDED'), 'map popup distinguishes measured pH from simulated data');
  await page.locator('[data-delete-ph]').click();
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('weathergpt.rain-ph.v1') || '[]').length)) === 0, 'user can delete pH records and persistence updates');

  // ── Assistant: corrected behaviour + crop advisory ──
  await page.evaluate(() => { location.hash = 'assistant'; });
  await page.waitForTimeout(200);
  const ask = async question => {
    const n = await page.locator('.response-entry').count();
    await page.locator('#assistant-query').fill(question);
    await page.locator('#assistant-form').dispatchEvent('submit');
    await page.waitForFunction(count => document.querySelectorAll('.response-entry').length > count, n, { timeout: 15000 });
    return page.locator('.response-entry').last();
  };
  const feels = await ask('Feels like tomorrow at 7 PM?');
  check((await feels.textContent() || '').includes('7 PM'), 'feels-like answer resolves tomorrow 7 PM');
  const walk = await ask('Best time to walk tomorrow evening?');
  check(!(await walk.textContent() || '').includes('6 AM'), 'outdoor planning stays inside the evening window');
  const crop = await ask('I grow wheat. Heavy rain is forecast tomorrow. What should I do?');
  check(/forecast|grid cell|Wheat|wheat/i.test(await crop.textContent() || ''), 'crop advisory uses the active farm forecast');
  const cropText = (await crop.textContent() || '');
  check(/Sourced|General precaution|No configured forecast hazard/.test(cropText), 'crop advisory labels sourced/general guidance, or honestly reports no hazard');
  check(/does not show heavy rain|matches the forecast/.test(cropText), 'crop advisory verifies the heavy-rain claim against the forecast');
  await page.evaluate(()=>{location.hash='overview';});await page.waitForTimeout(200);
  await page.locator('#suitability-crop-select').selectOption('tomato');
  const persistedFarm=await page.evaluate(()=>JSON.parse(localStorage.getItem('weathergpt.farms.v2')||'{}').farms?.[0]);
  check(persistedFarm?.crop==='tomato'&&persistedFarm?.name==='Test field'&&(await page.locator('#active-farm-card').textContent()||'').includes('Tomato'), 'explicit crop selection synchronizes only the crop field on the active farm');
  await page.evaluate(()=>{location.hash='assistant';});await page.waitForTimeout(200);
  await page.locator('#assistant-language').selectOption('hi');
  const farmHindi = await page.locator('#farm-dashboard').textContent() || '';
  check(farmHindi.includes('साझा मौसम अनुकूलता स्क्रीन') && farmHindi.includes('तापमान'), 'agricultural score and factor explanations localize in Hindi');
  const hindi = await ask('Temperature tomorrow?');
  check((await hindi.getAttribute('lang')) === 'hi' && /तापमान/.test(await hindi.textContent() || ''), 'Hindi-selected temperature question is answered in Hindi');
  const radar = await ask('Open radar');
  check(/रडार/.test(await radar.textContent() || ''), 'Hindi-selected radar command works');
  await page.locator('#assistant-language').selectOption('en');
  const languageEpoch=await page.evaluate(()=>performance.timeOrigin);
  await page.locator('#global-language').selectOption('hi');
  await page.waitForTimeout(100);
  check(await page.evaluate(()=>document.documentElement.lang)==='hi' && (await page.locator('#page-title').textContent()||'').includes('मौसम'), 'global language switch translates page headings without a reload');
  const unresolvedTranslations=await page.evaluate(async()=>{const i=await import('./js/i18n.js');return i.unresolvedStaticBindings(document)});
  check(unresolvedTranslations.length===0, `every centralized static translation selector maps to the page${unresolvedTranslations.length?`: ${unresolvedTranslations.join(', ')}`:''}`);
  check((await page.locator('#current-condition').textContent()||'').includes('बारिश') && (await page.locator('#assistant-language').inputValue())==='hi', 'global language change updates dynamic weather and assistant controls');
  const hindiOutlookText=await page.locator('#acidity-summary-card').textContent()||'';
  check(hindiOutlookText.includes('प्राकृतिक वर्षा-जल का सामान्य मान')&&hindiOutlookText.includes('अधिक अम्लीय')&&hindiOutlookText.includes('5.6')&&!/[०-९]/.test(hindiOutlookText), 'Hindi acidity reference and scale are translated and keep Latin digits');
  const hindiNumericText=(await page.locator('#current-temperature').textContent()||'')+hindiOutlookText;
  check(/[0-9]/.test(hindiNumericText)&&!/[०-९]/.test(hindiNumericText), 'Hindi weather and acidity values use Latin digits');
  check((await page.evaluate(()=>localStorage.getItem('weathergpt.preferences'))||'').includes('"language":"hi"') && await page.evaluate(()=>performance.timeOrigin)===languageEpoch, 'Hindi preference persists locally without reloading the app');
  await page.evaluate(() => { location.hash = 'map'; });
  await page.waitForTimeout(150);
  await page.locator('#more-layers').selectOption('atmosphere');
  check((await page.locator('#map-legend').textContent()||'').includes('वायुमंडलीय निगरानी'), 'map layer legends translate with the global Hindi preference');
  await page.locator('#sources-button').evaluate(button=>button.click());
  const atmosphereSourceText=await page.locator('#sources-dialog .source-entry:nth-of-type(4) p').textContent()||''; const atmosphereSourceLinks=await page.locator('#sources-dialog .source-entry:nth-of-type(4) a').count(); check(atmosphereSourceText.includes('मॉडल-सांद्रता') && atmosphereSourceLinks===1, 'scientific source details translate while attribution links remain intact');
  await page.locator('#sources-dialog').evaluate(dialog=>dialog.close());
  await page.locator('#settings-button').evaluate(button=>button.click());
  check((await page.locator('#settings-dialog .setting-row:nth-of-type(1) strong').textContent()||'').includes('तापमान') && (await page.locator('#settings-dialog .settings-note').textContent()||'').includes('ब्राउज़र'), 'settings labels and privacy text translate into Hindi');
  await page.locator('#settings-dialog').evaluate(dialog=>dialog.close());
  await page.evaluate(() => { location.hash = 'locations'; });
  await page.waitForTimeout(100);
  await page.locator('#add-farm-current').evaluate(button=>button.click());
  check((await page.locator('#farm-crop option[value="wheat"]').textContent()||'').includes('गेहूँ') && (await page.locator('#farm-form button[type="submit"]').textContent()||'').includes('सहेजें'), 'farm form crop choices and actions translate into Hindi');
  const farmActionsHi=await page.locator('#farms-list .farm-card').first().innerText();
  check(farmActionsHi.includes('सक्रिय')&&farmActionsHi.includes('बदलें'), 'saved-farm status and actions translate into Hindi');
  await page.locator('#global-language').selectOption('en');
  await page.evaluate(() => { location.hash = 'overview'; });

  // ── Keyboard-only walkthrough ──
  await page.evaluate(() => { location.hash = 'overview'; });
  await page.waitForTimeout(200);
  await page.keyboard.press('/');
  check(await page.evaluate(() => document.activeElement?.id) === 'location-search', 'slash focuses search (keyboard)');
  await page.keyboard.press('Escape');
  const focusRing = await page.evaluate(() => { const b = document.querySelector('#settings-button'); b.focus(); return getComputedStyle(b).outlineStyle; });
  check(focusRing !== 'none', 'visible focus style on keyboard focus');

  // ── Responsive layouts + screenshots ──
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 500 ? 780 : 900 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, `no horizontal page overflow at ${width}px (overflow ${overflow}px)`);
    if(width===360){
      await page.locator('#global-language').selectOption('hi'); await page.waitForTimeout(80);
      const hindiOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      check(hindiOverflow<=1, `Hindi layout fits 360px without horizontal overflow (${hindiOverflow}px)`);
      await page.locator('#global-language').selectOption('en');
    }
    check(await shot(page, `overview-${width}.png`), `screenshot captured at ${width}px`);
  }
  await page.evaluate(() => { location.hash = 'assistant'; });
  await page.waitForTimeout(200);
  check(await shot(page, 'assistant-390.png'), 'assistant screenshot captured at 390px');
  await page.evaluate(() => { location.hash = 'locations'; });
  await page.waitForTimeout(200);
  check(await shot(page, 'farms-390.png'), 'farms screenshot captured at 390px');

  // ── Reduced motion: radar autoplay must not start ──
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { location.hash = 'map'; });
  await page.waitForTimeout(200);
  await page.locator('[data-layer="radar"]').click();
  await page.waitForTimeout(400);
  await page.locator('#radar-play').click();
  await page.waitForTimeout(200);
  check((await page.locator('#map-status').textContent() || '').includes('reduced motion'), 'reduced motion disables radar autoplay');

  check(pageErrors.length === 0, `no uncaught page exceptions (${pageErrors.slice(0, 3).join(' | ')})`);
  await writeFile(join(SHOTS, 'browser-results.json'), JSON.stringify({ passed, failed, failures, pageErrors, at: new Date().toISOString() }, null, 2));
  console.log(`\nBROWSER TOTAL: ${passed} passed, ${failed} failed`);
  console.log(`Screenshots: ${SHOTS}`);
  await browser.close();
  await new Promise(r => server.close(r));
  if (failed || pageErrors.length) process.exitCode = 1;
}

main().catch(async error => { console.error('[BROWSER SUITE ERROR]', error); try { await browser?.close(); } catch {} try { server?.close(); } catch {} process.exitCode = 1; });
process.on('exit', () => { /* child processes are reaped by the OS */ });
