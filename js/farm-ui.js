// Farm management UI, active-farm dashboard, data provenance and rainwater
// acidity panel. All data stays on the device (js/farms.js, js/acidity.js).
import * as farms from './farms.js';
import * as acidity from './acidity.js';
import { buildProvenance, provenanceHTML } from './provenance.js';
import { buildAdvisories } from './advisory.js';
import { computeHazards } from './hazards.js';
import { HAZARD_LABELS } from '../data/crops.js';
import { icon, escapeHTML } from './icons.js';
import { parseCoordinates } from './geocode.js';

export function createFarmUI({ getState, selectLocation, toast, onFarmChange = () => {} }) {
  const $ = id => document.getElementById(id);
  let doc = farms.loadFarms();
  let readings = acidity.loadReadings();
  let editingId = null;

  const label = (obj, language) => language === 'hi' ? (obj?.hi || obj?.en) : (obj?.en || obj?.hi);

  function persist() {
    if (!farms.persistFarms(doc)) toast('Browser storage is unavailable. Farm changes will last only for this session.');
    onFarmChange(farms.getActiveFarm(doc));
  }

  function renderActiveFarm(language = 'en') {
    const root = $('active-farm-card'); if (!root) return;
    const farm = farms.getActiveFarm(doc);
    if (!farm) { root.innerHTML = '<p class="muted-note">No active farm. Choose one below or add a farm from the current location.</p>'; return; }
    const crop = farm.crop ? (farm.crop[0].toUpperCase() + farm.crop.slice(1)) : 'No crop set';
    root.innerHTML = `<div class="active-farm-main"><span class="place-icon">${icon('map-pin')}</span><div><h4>${escapeHTML(farm.name)}</h4><p>${escapeHTML(crop)}${farm.stage ? ' · ' + escapeHTML(farm.stage) : ''}${farm.sowingDate ? ' · sown ' + escapeHTML(farm.sowingDate) : ''}</p><small>${escapeHTML(farm.placeLabel || `${farm.latitude.toFixed(4)}, ${farm.longitude.toFixed(4)}`)}</small></div><button class="text-button" data-farm-deactivate>Deactivate</button></div>`;
    root.querySelector('[data-farm-deactivate]')?.addEventListener('click', () => { doc = farms.setActiveFarm(doc, null); persist(); renderAll(); });
  }

  function renderFarmsList() {
    const root = $('farms-list'); if (!root) return;
    if (!doc.farms.length) { root.innerHTML = '<p class="muted-note">No farms saved yet. Farms are stored only in this browser.</p>'; return; }
    root.innerHTML = doc.farms.map(f => `<article class="farm-card ${f.id === doc.activeFarmId ? 'active' : ''}">
      <div><h4>${escapeHTML(f.name)}</h4><p>${escapeHTML(f.crop || 'No crop')} · ${escapeHTML(f.placeLabel || `${Number(f.latitude).toFixed(3)}, ${Number(f.longitude).toFixed(3)}`)}</p><small>${Number(f.latitude).toFixed(4)}, ${Number(f.longitude).toFixed(4)}${f.stage ? ' · ' + escapeHTML(f.stage) : ''}</small></div>
      <div class="farm-card-actions"><button data-farm-activate="${escapeHTML(f.id)}" class="text-button">${f.id === doc.activeFarmId ? 'Active' : 'Use'}</button><button data-farm-edit="${escapeHTML(f.id)}" class="text-button">Edit</button><button data-farm-delete="${escapeHTML(f.id)}" class="icon-button" aria-label="Delete ${escapeHTML(f.name)}">${icon('trash')}</button></div></article>`).join('');
    root.querySelectorAll('[data-farm-activate]').forEach(b => b.addEventListener('click', async () => {
      doc = farms.setActiveFarm(doc, b.dataset.farmActivate); persist();
      const farm = farms.getActiveFarm(doc);
      if (farm) await selectLocation(farms.farmToLocation(farm));
      toast(`${farm?.name || 'Farm'} is now active. Dashboard, map, forecast and assistant use its location.`);
      renderAll();
    }));
    root.querySelectorAll('[data-farm-edit]').forEach(b => b.addEventListener('click', () => openForm(doc.farms.find(f => f.id === b.dataset.farmEdit))));
    root.querySelectorAll('[data-farm-delete]').forEach(b => b.addEventListener('click', () => {
      doc = farms.deleteFarm(doc, b.dataset.farmDelete); persist(); renderAll(); toast('Farm removed from this device.');
    }));
  }

  function openForm(farm = null, preset = null) {
    const section = $('farm-form-section'); if (!section) return;
    editingId = farm?.id || null;
    $('farm-form-title').textContent = farm ? 'Edit farm' : 'Add a farm';
    $('farm-name').value = farm?.name || '';
    $('farm-crop').value = farm?.crop || '';
    $('farm-stage').value = farm?.stage || '';
    $('farm-sowing').value = farm?.sowingDate || '';
    $('farm-irrigation').value = farm?.irrigation || '';
    $('farm-drainage').value = farm?.drainage || 'unknown';
    $('farm-place').value = farm?.placeLabel || preset?.placeLabel || '';
    $('farm-lat').value = farm?.latitude ?? preset?.latitude ?? '';
    $('farm-lon').value = farm?.longitude ?? preset?.longitude ?? '';
    $('farm-notes').value = farm?.notes || '';
    section.hidden = false;
    $('farm-name').focus();
  }

  function closeForm() { const section = $('farm-form-section'); if (section) section.hidden = true; editingId = null; }

  function renderDashboard() {
    const state = getState(), language = state.prefs?.language || 'en';
    const farm = farms.getActiveFarm(doc);
    const summary = $('farm-summary-line'), actions = $('farm-actions');
    if (summary) summary.textContent = farm
      ? `${farm.name} · ${farm.crop || 'crop not set'} · ${farm.placeLabel || `${farm.latitude.toFixed(3)}, ${farm.longitude.toFixed(3)}`}`
      : 'No farm selected. Add one in Saved locations to see crop-specific guidance.';
    if (actions) {
      if (!state.weather) {
        actions.innerHTML = `<div class="empty-state">${icon('cloud-off')}<p>Forecast unavailable. Retry the weather service to calculate the next 72 hours of risk.</p></div>`;
      } else {
        const { hazards, notes } = computeHazards(state);
        const advisories = buildAdvisories(state, { language, crop: farm?.crop, stage: farm?.stage });
        if (!hazards.length) {
          actions.innerHTML = `<p class="muted-note">No configured forecast hazard threshold crossed in the next 72 hours. Keep scouting and check official IMD / KVK advisories.</p>${notes.length ? `<small>${escapeHTML(notes.join(' '))}</small>` : ''}`;
        } else {
          actions.innerHTML = advisories.slice(0, 4).map(a => `<details class="hazard-card severity-${a.severity.toLowerCase()}" ${a.severity === 'SEVERE' ? 'open' : ''}><summary><span class="severity-badge ${a.severity.toLowerCase()}">${a.severity}</span><strong>${escapeHTML(label(HAZARD_LABELS[a.hazard] || { en: a.hazard }, language))}</strong><span>${escapeHTML(`${a.value} ${a.unit}`)}</span>${icon('chevron-down')}</summary>
            <div class="hazard-body"><p><b>${language === 'hi' ? 'मौसम' : 'Weather'}:</b> ${escapeHTML(label(a.expected, language))}</p><p><b>${language === 'hi' ? 'असर' : 'Why'}:</b> ${escapeHTML(label(a.why, language))}</p>
            <ul>${a.actions.map(act => `<li><span class="guidance-tag ${act.kind}">${act.kind === 'sourced' ? (language === 'hi' ? 'स्रोत-आधारित' : 'Sourced') : (language === 'hi' ? 'सामान्य' : 'General')}</span> ${escapeHTML(act.text)}${act.regions?.length ? ` <small>(${escapeHTML(act.regions.join(', '))})</small>` : ''}</li>`).join('')}</ul>
            <small>${escapeHTML(label(a.evidence, language))}</small><small>${escapeHTML(label(a.limitations, language))}</small></div></details>`).join('') +
            (notes.length ? `<p class="muted-note">${escapeHTML(notes.join(' '))}</p>` : '');
        }
      }
    }
    renderProvenance();
    renderAcidity();
  }

  function renderProvenance() {
    const root = $('provenance-content'); if (!root) return;
    const p = buildProvenance(getState(), getState().prefs?.language || 'en');
    root.innerHTML = p ? provenanceHTML(p, getState().prefs?.language || 'en') + `<p class="muted-note">${escapeHTML(p.resolution)}</p><p class="muted-note">${escapeHTML(p.radarNote)}</p>` : 'Load a forecast to see the source, coordinates and model-grid details.';
  }

  function renderAcidity() {
    const root = $('acidity-content'); if (!root) return;
    const language = getState().prefs?.language || 'en';
    root.innerHTML = acidity.acidityHTML(language, readings);
    const form = $('ph-reading-form');
    if (form) {
      const dateInput = $('ph-date');
      if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const outcome = acidity.addReading(readings, {
          value: $('ph-value').value, date: $('ph-date').value,
          method: $('ph-method').value, notes: $('ph-notes').value,
          farmId: farms.getActiveFarm(doc)?.id || null
        });
        readings = outcome.readings;
        if (outcome.error) toast(outcome.error);
        else toast('User-provided pH reading saved on this device only.');
        renderAcidity();
      });
    }
  }

  function wire() {
    $('farm-form')?.addEventListener('submit', event => {
      event.preventDefault();
      const raw = {
        name: $('farm-name').value, crop: $('farm-crop').value || null,
        stage: $('farm-stage').value || null, sowingDate: $('farm-sowing').value || null,
        irrigation: $('farm-irrigation').value || null, drainage: $('farm-drainage').value,
        placeLabel: $('farm-place').value, latitude: Number($('farm-lat').value),
        longitude: Number($('farm-lon').value), notes: $('farm-notes').value
      };
      const coords = parseCoordinates(`${raw.latitude}, ${raw.longitude}`);
      if (!coords || coords.invalid) { toast('Enter valid decimal-degree coordinates (latitude −90…90, longitude −180…180).'); return; }
      const outcome = editingId ? farms.updateFarm(doc, editingId, raw) : farms.addFarm(doc, raw);
      if (outcome.error) { toast(outcome.error); return; }
      doc = outcome.doc;
      if (!editingId) doc = farms.setActiveFarm(doc, outcome.farm.id);
      persist(); closeForm(); renderAll();
      toast(`${outcome.farm.name} saved on this device and set as the active farm.`);
      selectLocation(farms.farmToLocation(outcome.farm));
    });
    $('farm-form-cancel')?.addEventListener('click', closeForm);
    $('add-farm-current')?.addEventListener('click', () => {
      const s = getState();
      openForm(null, { latitude: Number(s.location.latitude).toFixed(4), longitude: Number(s.location.longitude).toFixed(4), placeLabel: `${s.location.name}${s.location.region ? ', ' + s.location.region : ''}` });
    });
    $('add-farm-coords')?.addEventListener('click', () => {
      openForm(null, { latitude: '', longitude: '', placeLabel: '' });
      $('farm-lat').focus();
    });
    $('add-farm-map')?.addEventListener('click', () => {
      window.location.hash = 'map';
      toast('Click (or tap) the map to drop a draggable pin, then confirm the point.');
    });
  }

  function renderAll() { renderActiveFarm(getState().prefs?.language || 'en'); renderFarmsList(); renderDashboard(); }

  wire();
  onFarmChange(farms.getActiveFarm(doc));
  return {
    renderAll, openForm,
    getActiveFarm: () => farms.getActiveFarm(doc),
    doc: () => doc,
    setPoint: point => openForm(null, { latitude: Number(point.latitude).toFixed(4), longitude: Number(point.longitude).toFixed(4), placeLabel: point.name || '' })
  };
}

export default createFarmUI;
