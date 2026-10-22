/* Things the UI can do to state. Each one updates state, then re-renders what changed. */

import { $, el, GEN_DELAY, LEVELS, listText, nameOf, PLAYERS, PREFS, roleRanks, ROLES, sleep, SLOTS, state, syncSquad, WORST_LINES } from './core.js';
import { activePins, findTeams, newcomerPicks, prefOf, refreshWeights } from './model.js';
import { cleanName, findPlayer, parsePlayers, saveStore, upsertPlayer, writeHash } from './links.js';
import { prefButton, renderAnalysis, renderLock, renderResults, renderRoster, renderTune } from './render.js';

export function settingsChanged() {
  refreshWeights();
  saveStore();
  writeHash();
  renderTune();
  renderLock();
  renderResults();
  renderAnalysis();
}

export function setMap(id) { state.map = id; settingsChanged(); }
/* The plan chip in --tune: sets the breakdown's lens and shows that section. */
export function setPlan(id) { state.plan = id; state.view = id; settingsChanged(); }
/* Results tabs and "explore": change the section on screen only, not the lens. */
export function setView(id) { state.view = id; renderResults(); }
/* Select a comp in the results: it goes into the selection bar; "analyse" there picks it. */
export function select(lens, x) { state.selected = { lens, x }; renderResults(); }
export function clearSelection() { state.selected = null; renderResults(); }
export function toggleMore(k) { if (!state.open.delete(k)) state.open.add(k); renderResults(); }
/* Pick a comp from a results section: the breakdown judges it as that section's plan. */
export function pickIn(lens, x) { state.selected = null; if (state.plan !== lens) { state.plan = lens; settingsChanged(); } pick(x); }

export function setTune(k, level) {
  if (level === 'normal') delete state.tune[k]; else state.tune[k] = level;
  settingsChanged();
  document.querySelector(`[data-tune="${k}-${level}"]`)?.focus({ preventScroll: true });
}

export function toggleLock(id) {
  const at = state.locked.indexOf(id);
  if (at !== -1) state.locked.splice(at, 1);
  else if (state.locked.length < SLOTS) state.locked.push(id);
  else state.locked[SLOTS - 1] = id;
  for (const k of Object.keys(state.pins)) if (!state.locked.includes(k)) delete state.pins[k];
  settingsChanged();
}

/* Pin a locked legend to a player (null = anyone). A player has one pin: pinning them
   elsewhere moves it. */
export function setPin(id, name) {
  for (const [k, n] of Object.entries(state.pins))
    if (k === id || (name && n.toLowerCase() === name.toLowerCase())) delete state.pins[k];
  if (name) state.pins[id] = name;
  settingsChanged();
  document.querySelector(`[data-pin="${id}"] [aria-pressed="true"]`)?.focus({ preventScroll: true });
}

/* Cycling a cell updates that button in place, so the open table keeps its scroll and focus. */
export function cyclePref(p, id) {
  const player = state.roster.players[p];
  const next = PREFS[(PREFS.indexOf(prefOf(p, id)) + 1) % PREFS.length];
  if (next === 'can') delete player.prefs[id]; else player.prefs[id] = next;
  const btn = document.querySelector(`[data-pref="${p}-${id}"]`);
  if (btn) prefButton(btn, player, state.byId.get(id), next);
  rosterChanged({ table: false });
}

/* Cycle one role's rank for a library player: 1st → 2nd → 3rd → 1st. All equal = role-agnostic. */
/* Role preference buttons. From "any" (role-agnostic), the clicked role becomes 1st and the other
   two 2nd. Then: clicking the 1st role clears everything back to "any"; clicking a 2nd role drops it
   to 3rd, and clicking a 3rd role lifts it back to 2nd. */
export function cycleRoleRank(i, role) {
  const p = state.library[i];
  const r = roleRanks(p);
  if (!r) p.roles = Object.fromEntries(ROLES.map(k => [k, k === role ? 1 : 2]));
  else if (r[role] === 1) delete p.roles;
  else p.roles = { ...r, [role]: r[role] === 2 ? 3 : 2 };
  rosterChanged({ table: false });
  document.querySelector(`[data-role-rank="${i}-${role}"]`)?.focus({ preventScroll: true });
}

export function rosterChanged({ table = true } = {}) {
  syncSquad();
  renderRoster({ table });
  renderLock();
  settingsChanged();
}

function libStatus(text) { const n = $('#lib-status'); if (n) n.textContent = text; }

export function toggleSquad(i) {
  const at = state.squad.indexOf(i);
  if (at !== -1) state.squad.splice(at, 1);
  else if (state.squad.length < PLAYERS) state.squad.push(i);
  else return libStatus(`${PLAYERS} players already selected. Sit someone out first.`);
  rosterChanged();
  document.querySelectorAll('.lib-seat')[i]?.focus({ preventScroll: true });
}

export function addPlayer() {
  let n = state.library.length + 1;
  while (findPlayer(`P${n}`) !== -1) n++;
  const i = upsertPlayer({ name: `P${n}`, prefs: {} });
  if (state.squad.length < PLAYERS) state.squad.push(i);
  rosterChanged();
  document.querySelectorAll('.lib-row .roster-input')[i]?.select();
}

export function renamePlayer(i, value) {
  const name = cleanName(value, state.library[i].name);
  const clash = findPlayer(name);
  if (clash !== -1 && clash !== i) { renderRoster({ table: false }); return libStatus(`There's already a player called ${name}.`); }
  const old = state.library[i].name.toLowerCase();
  for (const [k, n] of Object.entries(state.pins)) if (n.toLowerCase() === old) state.pins[k] = name;
  state.library[i].name = name;
  rosterChanged();
}

export function removePlayer(i) {
  state.library.splice(i, 1);
  state.squad = state.squad.filter(x => x !== i).map(x => (x > i ? x - 1 : x));
  rosterChanged();
}

export function importPlayers(text) {
  const found = parsePlayers(text || '').filter(p => p.name !== 'anyone');
  if (!found.length) return libStatus("Couldn't find any player codes in that. A code looks like Name~28~FKHEfED6.");
  const names = [];
  for (const p of found) {
    const i = upsertPlayer(p);
    names.push(state.library[i].name);
    if (!state.squad.includes(i) && state.squad.length < PLAYERS) state.squad.push(i);
  }
  rosterChanged();
  libStatus(`Imported ${listText(names)}. Players with the same name were updated.`);
}

export async function copyText(btn, text, label) {
  try { await navigator.clipboard.writeText(text); btn.textContent = 'copied'; }
  catch { btn.textContent = 'copy failed'; }
  setTimeout(() => { btn.textContent = label; }, 1500);
}

/* Two-step button: the first click asks, a second click within 3s does it. */
export function confirmThen(btn, action) {
  if (btn.dataset.armed) {
    clearTimeout(+btn.dataset.armed);
    btn.textContent = btn.dataset.label;
    delete btn.dataset.armed;
    delete btn.dataset.label;
    return action();
  }
  btn.dataset.label = btn.textContent;
  btn.textContent = 'sure?';
  btn.dataset.armed = String(setTimeout(() => {
    if (!btn.isConnected) return;
    btn.textContent = btn.dataset.label;
    delete btn.dataset.armed;
    delete btn.dataset.label;
  }, 3000));
}

/* worst: the "show the worst comp" button. Same search, flipped: lowest score, worst upgrades,
   still only comps your roster can actually field. */
export async function generate(worst = false) {
  if (state.generating || !state.data) return;
  state.generating = true;
  $('#btn-generate').disabled = $('#btn-worst').disabled = true;
  $('#results').classList.add('busy');
  const log = $('#gen-log');
  const lines = [];
  const say = (text, cls) => { lines.push(el('span', { class: cls || null, text: text + '\n' })); log.replaceChildren(...lines); };

  const r = findTeams(worst);
  const pinned = activePins();
  const locked = state.locked.map(id => (pinned[id] !== undefined ? `${nameOf(id)} (${state.roster.players[pinned[id]].name})` : nameOf(id)));
  const pace = (GEN_DELAY[0] + Math.random() * (GEN_DELAY[1] - GEN_DELAY[0])) / 3;
  say(`› ${r.total.toLocaleString('en-GB')} comps${locked.length ? ` with ${listText(locked)}` : ''}`);
  await sleep(pace);
  say(`› ${r.valid.toLocaleString('en-GB')} fit the roster · map: ${state.map ? state.data.maps[state.map].name : 'any'}`);
  await sleep(pace);
  say(worst ? '› picking the least useful upgrades…' : '› trying upgrade builds…');
  await sleep(pace);
  if (!r.list.length) say('› nothing fits these settings', 't-err');
  else say(worst ? `› found it. ${WORST_LINES[Math.floor(Math.random() * WORST_LINES.length)]}` : (r.sections ? `› done: ${r.sections.filter(x => x.cores.length).length} sections` : `› done: top ${r.list.length}`), worst ? 't-err' : 't-ok');

  state.results = r;
  state.selected = null;
  state.open.clear();
  state.generating = false;
  $('#btn-generate').disabled = $('#btn-worst').disabled = false;
  $('#results').classList.remove('busy');
  renderResults();
}

export function pick(r) {
  state.chosen = { ids: r.ids.slice(), picks: structuredClone(r.picks), worst: !!state.results?.worst };
  writeHash();
  renderResults();
  renderAnalysis();
  $('#analyse-h').scrollIntoView({ block: 'start' });
}

export function setUpgrade(id, lv, n) {
  const picks = (state.chosen.picks[id] ||= Object.fromEntries(LEVELS.map(l => [l, null])));
  picks[lv] = picks[lv] === n ? null : n;
  writeHash();
  renderAnalysis();
  document.querySelector(`[data-up="${id}-${lv}-${n}"]`)?.focus({ preventScroll: true });
}

/* Swap one legend for another, keeping it in the same position. Back undoes it. */
export function swapLegend(out, inId) {
  const c = state.chosen;
  const ids = c.ids.map(id => (id === out ? inId : id));
  const picks = structuredClone(c.picks);
  delete picks[out];
  picks[inId] = newcomerPicks(ids, picks, inId, c.worst);
  state.chosen = { ids, picks, worst: c.worst };
  writeHash({ push: true });
  renderResults();
  renderAnalysis();
  document.querySelector(`[data-swap-col="${ids.indexOf(inId)}"]`)?.focus({ preventScroll: true });
}

export function setSwapMode(worst) {
  state.chosen.worst = worst;
  writeHash();
  renderAnalysis();
  $('#swap-mode')?.focus({ preventScroll: true });
}
