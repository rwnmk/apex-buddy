/* Solo queue page (solo.html): you, the map and your teammates' picks → the three best picks for you.
   The model is in solo.js; this file is loading, state, the link, and rendering.

   Link: #y=Rowan~28~CD3qSmyq.123&m=olympus&a=wraith:h,bangalore
     y: you, as a player code (none = "anyone").  m: map.  a: teammates' legends; ":h" = hovering.
   This browser remembers who you are and the map (apex-team-comp.solo.v1); teammates live only in
   the link, so a new match starts clean. The player library is read from the analyser's storage
   and never written here. */

import { $, compKey, displayOrder, el, nameOf, pairKey, PREF_GLYPH, RANK_LABEL, roleRanks, ROLES, SCORING_DEFAULTS, sleep, state, syncSquad } from './core.js';
import { loadData } from './source.js';
import { validate } from './data.js';
import { buildPerks, refreshWeights, shownScore } from './model.js';
import { loadStore, parsePlayers, playerCode } from './links.js';
import { planLabel } from './summary.js';
import { ALSO, analyserHash, clearCache, judgeComp, needed, SHOWN, soloPicks } from './solo.js';

const SOLO_KEY = 'apex-team-comp.solo.v1';
const MATES = 2;
const CHUNK = 150;                 // comps scored between repaints while filling the cache

const solo = {
  me: null,        // { name, prefs, roles } or null for "anyone"
  mates: [],       // [{ id, hover }]
  target: null,    // teammate slot the picker fills next (null = first empty)
  run: 0           // bumped per update, so a slow blind run stops when something changes
};

/* ---- link + storage ---- */

function readHash() {
  if (location.hash.length <= 1) return;
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('y')) solo.me = parsePlayers(params.get('y'))[0] || null;
  if (location.hash.length > 1) state.map = state.data.maps[params.get('m')] ? params.get('m') : null;   // a link with no m= means any map
  solo.mates = [];
  for (const part of (params.get('a') || '').split(',').filter(Boolean)) {
    const [id, flag] = part.toLowerCase().split(':');
    if (state.byId.has(id) && !solo.mates.some(m => m.id === id) && solo.mates.length < MATES) solo.mates.push({ id, hover: flag === 'h' });
  }
}

function writeHash() {
  const parts = [];
  if (solo.me) parts.push('y=' + playerCode(solo.me));
  if (state.map) parts.push('m=' + state.map);
  if (solo.mates.length) parts.push('a=' + solo.mates.map(m => m.id + (m.hover ? ':h' : '')).join(','));
  const h = parts.length ? '#' + parts.join('&') : '';
  if (location.hash !== h) history.replaceState(null, '', h || location.pathname + location.search);
}

function loadSolo() {
  try {
    const saved = JSON.parse(localStorage.getItem(SOLO_KEY)) || {};
    state.map = state.data.maps[saved.map] ? saved.map : null;
    solo.me = saved.you ? parsePlayers(saved.you)[0] || null : null;
  } catch { state.map = null; }
}
function saveSolo() {
  try { localStorage.setItem(SOLO_KEY, JSON.stringify({ you: solo.me ? playerCode(solo.me) : null, map: state.map })); } catch { /* no storage */ }
}

/* You, as the library has you now: a saved player with the same name wins over an older code. */
function freshMe(p) {
  if (!p) return null;
  return state.library.find(x => x.name.toLowerCase() === p.name.toLowerCase()) || p;
}

/* ---- changes ---- */

function changed({ weights = false } = {}) {
  if (weights) { refreshWeights(); clearCache(); }
  saveSolo();
  writeHash();
  renderInputs();
  update();
}

function setMate(id) {
  if (solo.mates.some(m => m.id === id)) return;
  const at = solo.target ?? solo.mates.length;
  if (at >= MATES) return;                       // both picked: click a teammate first to change them
  if (at < solo.mates.length) solo.mates[at] = { id, hover: solo.mates[at].hover };
  else solo.mates.push({ id, hover: false });
  solo.target = null;
  changed();
}
function clearMate(i) { solo.mates.splice(i, 1); solo.target = null; changed(); }
function setHover(i, hover) { solo.mates[i].hover = hover; changed(); }
function setTarget(i) { solo.target = solo.target === i ? null : i; renderInputs(); }

/* ---- rendering: inputs ---- */

function renderInputs() {
  const { maps, classes } = state.data;
  // you
  const sel = $('#solo-you');
  const known = solo.me && state.library.some(p => p.name.toLowerCase() === solo.me.name.toLowerCase());
  sel.replaceChildren(
    el('option', { value: '', text: 'anyone (no picks)' }),
    ...state.library.map(p => el('option', { value: p.name, text: p.name })),
    solo.me && !known ? el('option', { value: solo.me.name, text: `${solo.me.name} (from a code)` }) : null);
  sel.value = solo.me ? solo.me.name : '';
  const prefs = Object.values(solo.me?.prefs || {});
  const r = roleRanks(solo.me);
  $('#you-summary').textContent = !solo.me ? 'Every legend counts as one you can play, with no favourites.'
    : !prefs.length && !r ? 'No picks marked: every legend counts as one you can play.'
      : [`${prefs.filter(v => v === 'comfort').length} ★ comfort`, `${prefs.filter(v => v === 'no').length} × won't play`,
        r ? `roles ${ROLES.filter(k => r[k]).sort((a, b) => r[a] - r[b]).map(k => `${k} ${RANK_LABEL[r[k]]}`).join(', ')}` : 'any role'].join(' · ')
        + '. Edit your picks in the analyser.';

  // map
  const chip = (id, label) => el('button', { type: 'button', class: 'tagchip sq', 'aria-pressed': String(state.map === id), text: label, onclick: () => { state.map = id; changed({ weights: true }); } });
  $('#solo-map').replaceChildren(chip(null, 'any'), ...Object.entries(maps).map(([id, m]) => chip(id, m.name.toLowerCase())));

  // teammate slots, then you
  const pos = Math.min(solo.mates.length, MATES) + 1;
  $('#mates').replaceChildren(...Array.from({ length: MATES }, (_, i) => {
    const m = solo.mates[i];
    const l = m && state.byId.get(m.id);
    const target = i === (solo.target ?? solo.mates.length);
    return el('li', { class: `slot sq${l ? ' filled' : ''}${target ? ' target' : ''}`, 'data-mate': String(i) },
      el('button', { type: 'button', class: 'slot-main', 'aria-pressed': String(solo.target === i), 'aria-label': l ? `Teammate ${i + 1}: ${l.name}. Replace` : `Teammate ${i + 1}: empty`, onclick: () => setTarget(i) },
        el('span', { class: 'slot-num', text: `teammate ${i + 1}` }),
        el('span', { class: `slot-name${l ? '' : ' slot-empty'}`, text: l ? l.name : '—' }),
        l ? el('span', { class: 'slot-class', text: classes[l.class].label }) : null),
      l ? el('div', { class: 'segs mate-state', role: 'group', 'aria-label': `${l.name}: hovering or locked` },
        el('button', { type: 'button', class: 'seg', 'aria-pressed': String(m.hover), 'data-hover': `${i}-hover`, text: 'hover', onclick: () => setHover(i, true) }),
        el('button', { type: 'button', class: 'seg', 'aria-pressed': String(!m.hover), 'data-hover': `${i}-locked`, text: 'locked', onclick: () => setHover(i, false) })) : null,
      l ? el('button', { type: 'button', class: 'slot-x', 'aria-label': `Remove ${l.name}`, text: '×', onclick: () => clearMate(i) }) : null);
  }), el('li', { class: 'slot sq slot-you' },
    el('div', { class: 'slot-main' },
      el('span', { class: 'slot-num', text: 'you' }),
      el('span', { class: 'slot-name', text: solo.me ? solo.me.name : 'you' }),
      el('span', { class: 'slot-class', text: `picking ${['first', 'second', 'third'][pos - 1]}` }))));

  // legend picker: hidden once both teammates have picked, until one is clicked to change it
  const full = solo.mates.length >= MATES && solo.target == null;
  $('#lobby-hint').textContent = full ? 'Both teammates have picked. Click one to change it.'
    : solo.target != null && solo.mates[solo.target] ? `Choose who replaces ${nameOf(solo.mates[solo.target].id)}, or click them again to cancel.`
      : 'Add what your teammates have picked, in any order. Mark a pick as a hover if they might still change it.';
  $('#solo-filters').hidden = $('#solo-picker').hidden = full;
  const q = $('#solo-search').value.trim().toLowerCase();
  const shown = displayOrder().filter(l => !q || l.name.toLowerCase().includes(q) || l.id.includes(q) || classes[l.class].label.toLowerCase().includes(q));
  $('#solo-picker').replaceChildren(...(shown.length ? shown.map(l => {
    const on = solo.mates.some(m => m.id === l.id);
    return el('button', {
      type: 'button', class: 'pick sq', 'aria-pressed': String(on), 'data-legend': l.id, disabled: on ? '' : null,
      'aria-label': `${l.name}${on ? ', picked by a teammate' : ''}`, onclick: () => setMate(l.id)
    }, el('span', { class: 'pick-name', text: l.name }), el('span', { class: 'pick-class', text: classes[l.class].label }));
  }) : [el('p', { class: 'picker-empty', text: 'no legends match' })]));
}

/* ---- rendering: suggestions ---- */

const POSITION_TEXT = [
  'Picking first, blind: each option is scored against what your two teammates are likely to pick, weighted by popularity.',
  'Picking second: each option is scored against what your last teammate is likely to pick, weighted by popularity.',
  'Picking third: these scores are exact.'
];
const others = (comp, id) => comp.ids.filter(x => x !== id);
const planBadge = (pid) => el('span', { class: `badge ${pid ? 'plan' : 'dodo'}`, title: pid ? `Qualifies as ${planLabel(pid)}` : 'Fits no plan', text: planLabel(pid) });
const knownBadge = (ids) => {
  const c = state.comps.get(compKey(ids));
  return c ? el('span', { class: `badge ${c.label.toLowerCase() === 'algs' ? 'algs' : 'neutral'}`, title: c.note || `${c.label} comp`, text: c.label }) : null;
};

function card(x, n, exact) {
  const l = state.byId.get(x.id);
  const comp = x.comp || x.best;
  const score = exact ? String(shownScore(x.score)) : x.score.toFixed(1);
  const pref = solo.me?.prefs?.[x.id];
  return el('li', { class: 'spick sq', 'data-suggestion': x.id },
    el('div', { class: 'spick-head' },
      el('span', { class: 'spick-num', text: `0${n + 1}` }),
      el('span', { class: 'spick-name' }, l.name, pref === 'comfort' ? el('span', { class: 'spick-star', title: 'comfort pick', text: ` ${PREF_GLYPH.comfort}` }) : null),
      el('span', { class: 'spick-score' }, el('b', { text: score }), el('small', { text: exact ? 'score' : 'expected' }))),
    el('p', { class: 'spick-meta' },
      el('span', { class: 'spick-class', text: state.data.classes[l.class].label.toLowerCase() }),
      x.role ? [' · ', el('span', { class: x.roleFit === 1 ? 'spick-role ok' : 'spick-role', text: x.role + (x.roleFit === 1 ? ' ✓' : '') })] : null,
      exact ? [' ', planBadge(x.plan), knownBadge(comp.ids)] : null),
    x.adds.length ? el('p', { class: 'spick-adds', text: `adds ${x.adds.join(', ')}` }) : null,
    !exact ? el('p', { class: 'spick-best' }, 'best with ', el('strong', { text: others(comp, x.id).map(nameOf).join(' + ') }), `: ${shownScore(comp.score)} `, planBadge(comp.plan), knownBadge(comp.ids)) : null,
    x.ifSwitch.map(s => {
      const drop = x.score - s.score;
      return el('p', { class: `spick-switch${drop >= 5 ? ' risky' : ''}` }, `if ${nameOf(s.id)} switches: about ${s.score.toFixed(1)}`, drop >= 5 ? ` (−${drop.toFixed(1)})` : '');
    }),
    el('a', { class: 'spick-link', href: './#' + analyserHash(comp), target: '_blank', rel: 'noopener', text: exact ? 'breakdown ›' : 'breakdown of the best case ›' }));
}

/* An expected pick's plan depends on who completes the comp, so its card shows the plan on the
   "best with" line instead of under the name. */
function renderPicks(r) {
  const top = r.list.slice(0, SHOWN);
  const also = r.list.slice(SHOWN, SHOWN + ALSO);
  $('#solo-position').textContent = POSITION_TEXT[r.position - 1];
  if (!top.length) return $('#solo-out').replaceChildren(el('p', { class: 't-err', text: 'Nothing left that you play. Mark fewer legends as × in the analyser.' }));
  $('#solo-out').replaceChildren(
    el('ol', { class: 'spicks', 'aria-label': 'Suggested picks' }, top.map((x, n) => card(x, n, r.exact))),
    also.length ? el('p', { class: 'salso meta' }, 'also: ', also.map((x, i) => [i ? ' · ' : '',
      el('span', { 'data-also': x.id }, nameOf(x.id), solo.me?.prefs?.[x.id] === 'comfort' ? ' ★' : '', ` ${r.exact ? shownScore(x.score) : x.score.toFixed(1)}`)])) : null);
  const pop = state.data.popularity;
  const { comfortBonus, roleBonus } = state.data.scoring;
  $('#solo-note').textContent = [
    `Ranked by score, plus ${comfortBonus} for a ★ comfort pick${roleRanks(solo.me) ? ` and up to ${roleBonus} for a role you like` : ''}.`,
    r.exact ? '' : pop ? `Popularity: ${pop.source}, checked ${pop.checked}.` : 'No popularity data: every legend is assumed equally likely.'
  ].filter(Boolean).join(' ');
}

/* Score whatever the lobby needs (a blind pick needs all 3,276 comps, about 2 s the first time),
   in chunks so the page stays responsive, then show the picks. */
async function update() {
  const my = ++solo.run;
  const todo = needed(solo.mates);
  const slow = todo.length > CHUNK;
  $('#solo-out').setAttribute('aria-busy', String(slow));
  for (let i = 0; i < todo.length; i += CHUNK) {
    for (const ids of todo.slice(i, i + CHUNK)) judgeComp(ids);
    if (slow) {
      $('#solo-status').textContent = `› scoring comps… ${Math.min(i + CHUNK, todo.length).toLocaleString('en-GB')} / ${todo.length.toLocaleString('en-GB')}`;
      await sleep(0);
      if (my !== solo.run) return;
    }
  }
  $('#solo-status').textContent = slow ? `› done: ${todo.length.toLocaleString('en-GB')} comps scored` : '';
  $('#solo-out').setAttribute('aria-busy', 'false');
  renderPicks(soloPicks(solo.mates, solo.me));
}

/* ---- load + wiring ---- */

function showError(msg) {
  $('#solo-out').replaceChildren(el('pre', { class: 'data-error t-err', text: msg }));
}

async function load() {
  let d, problems;
  try { ({ d, problems } = await loadData()); }
  catch (e) { return showError(e.message + (location.protocol === 'file:' ? '\n\nOpen the page through a local server (e.g. `python3 -m http.server`), not as a file.' : '')); }
  if (!problems.length) problems = validate(d);
  if (problems.length) return showError('Problems in data/:\n' + problems.map(p => '  ' + p).join('\n'));

  d.scoring = { ...SCORING_DEFAULTS, ...d.scoring };
  d.synergies ||= [];
  d.maps ||= {};
  state.data = d;
  for (const l of d.legends) state.byId.set(l.id, l);
  for (const s of d.synergies) state.pairs.set(pairKey(...s.pair), s);
  state.comps = new Map((d.comps || []).map(c => [compKey(c.legends), { label: c.label.trim(), note: c.note || '' }]));
  buildPerks();
  const m = d.meta || {};
  $('#data-meta').textContent = [m.season, m.updated && `data updated ${m.updated}`].filter(Boolean).join(' · ');

  loadStore();                                       // the analyser's player library (read only)
  for (const code of d.players || []) if (typeof code === 'string') for (const p of parsePlayers(code)) if (!state.library.some(x => x.name === p.name)) state.library.push(p);
  state.plan = null;                                 // each comp judged by its best lens, as in the analyser's overview
  state.tune = {};                                   // no priorities here
  state.squad = [];
  syncSquad();
  loadSolo();
  readHash();
  solo.me = freshMe(solo.me);
  refreshWeights();

  $('#solo-you').addEventListener('change', (e) => {
    solo.me = e.target.value ? freshMe(state.library.find(p => p.name === e.target.value) || solo.me) : null;
    changed();
  });
  const useCode = () => {
    const p = parsePlayers($('#solo-code').value)[0];
    $('#solo-code').setAttribute('aria-invalid', String(!p));
    if (!p) return;
    solo.me = p;
    $('#solo-code').value = '';
    changed();
  };
  $('#btn-code').addEventListener('click', useCode);
  $('#solo-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') useCode(); });
  $('#solo-search').addEventListener('input', renderInputs);
  $('#solo-search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = $('#solo-picker .pick:not([disabled])');
    if (first) { e.target.value = ''; setMate(first.dataset.legend); e.target.focus(); }
  });
  $('#btn-new').addEventListener('click', () => { solo.mates = []; solo.target = null; $('#solo-search').value = ''; changed(); });
  $('#btn-share').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try { await navigator.clipboard.writeText(location.href); btn.textContent = 'copied'; }
    catch { btn.textContent = 'copy failed'; }
    $('#share-status').textContent = btn.textContent;
    setTimeout(() => { btn.textContent = 'copy link'; }, 1500);
  });
  window.addEventListener('hashchange', () => {
    const map = state.map;
    readHash();
    solo.me = freshMe(solo.me);
    changed({ weights: state.map !== map });
  });

  if (location.hash) writeHash();                    // normalise the link
  renderInputs();
  update();
}

load();
