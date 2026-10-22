/* Team Comp: Apex Legends squad builder. Entry point: loads data/legends.json and wires up the page.
   All legend data lives in data/legends.json; the code only reads it.

   Page flow: players (roster) → tune (map, priorities, locked legends) → generate → pick → breakdown.

   Modules (ES modules, no build step):
     core.js      constants, state, helpers
     data.js      data validation
     model.js     weights, scoring, upgrade builds, seating, team finder, swaps  (no DOM)
     summary.js   the written summary
     links.js     share links, player codes, saved settings
     actions.js   things the UI can do to state
     render.js    one function per page block
     app.js       loading and wiring (this file) */

import { $, compKey, el, pairKey, SCORING_DEFAULTS, state, syncSquad } from './core.js';
import { DATA_DIR, loadData } from './source.js';
import { validate } from './data.js';
import { buildPerks, refreshWeights } from './model.js';
import { loadStore, parsePlayers, readHash, upsertPlayer, writeHash } from './links.js';
import { confirmThen, generate, rosterChanged, settingsChanged } from './actions.js';
import { renderAll, renderFilters, renderLock } from './render.js';

async function load() {
  let d, problems;
  try {
    ({ d, problems } = await loadData());
  } catch (e) {
    return showError(e.message + (location.protocol === 'file:' ? '\n\nOpen the page through a local server (e.g. `python3 -m http.server`), not as a file.' : ''));
  }
  if (!problems.length) problems = validate(d);
  if (problems.length) return showError(`Problems in ${DATA_DIR}:\n` + problems.map(p => '  ' + p).join('\n'));

  d.scoring = { ...SCORING_DEFAULTS, ...d.scoring };
  d.synergies ||= [];
  d.maps ||= {};
  state.data = d;
  for (const l of d.legends) state.byId.set(l.id, l);
  for (const s of d.synergies) state.pairs.set(pairKey(...s.pair), s);
  buildPerks();

  const m = d.meta || {};
  $('#data-meta').textContent = [m.season, m.updated && `data updated ${m.updated}`].filter(Boolean).join(' · ');
  $('#data-meta').title = [m.upgradesChecked, m.classesChecked, m.mapsNote].filter(Boolean).join('\n');

  loadStore();
  // optional "players": ["Name~28~code", …] in the JSON seeds everyone's library; local edits win
  for (const code of d.players || []) if (typeof code === 'string') for (const p of parsePlayers(code)) upsertPlayer(p, { overwrite: false });
  syncSquad();
  readHash();
  if (location.hash) writeHash();                    // normalise the link (drops anything it couldn't use)
  state.comps = new Map((d.comps || []).map(c => [compKey(c.legends), { label: c.label.trim(), note: c.note || '' }]));
  refreshWeights();
  renderFilters();
  renderAll();
  $('#btn-generate').disabled = $('#btn-worst').disabled = false;
}

function showError(msg) {
  $('#analysis').replaceChildren(el('pre', { class: 'data-error t-err', text: msg }));
  $('#btn-generate').disabled = true;
  if ($('#btn-worst')) $('#btn-worst').disabled = true;
}


// Everything below needs data/legends.json; until it has loaded (or if it failed) these do nothing.
const ready = (fn) => (...args) => { if (state.data) fn(...args); };
$('#search').addEventListener('input', (e) => { state.query = e.target.value; if (state.data) renderLock(); });
$('#btn-clear').addEventListener('click', ready(() => { state.locked = []; settingsChanged(); }));
$('#btn-generate').addEventListener('click', () => generate(false));
{
  // "show the worst comp" sits beside generate; built here so index.html doesn't need editing
  const go = $('#btn-generate');
  const row = el('div', { class: 'gen-actions' });
  go.before(row);
  row.append(go, el('button', { type: 'button', class: 'btn-term btn-worst', id: 'btn-worst', text: 'show the worst comp', onclick: () => generate(true) }));
  go.disabled = $('#btn-worst').disabled = true;   // enabled at the end of load()
}
$('#btn-roster-reset').addEventListener('click', ready((e) => confirmThen(e.currentTarget, () => {
  state.roster.players.filter(p => !p.filler).forEach(p => { p.prefs = {}; });
  rosterChanged();
})));
$('#btn-tune-reset').addEventListener('click', ready(() => { state.tune = {}; state.map = null; state.plan = null; settingsChanged(); }));
$('#btn-share').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  try { await navigator.clipboard.writeText(location.href); btn.textContent = 'copied'; }
  catch { btn.textContent = 'copy failed'; }
  btn.dataset.done = '';
  $('#share-status').textContent = btn.textContent;
  setTimeout(() => { btn.textContent = 'copy link'; delete btn.dataset.done; }, 1500);
});
window.addEventListener('hashchange', () => { if (state.data) { readHash(); syncSquad(); refreshWeights(); renderAll(); } });

load();
