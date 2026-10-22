/* Share links (the URL hash), player codes and this browser's saved settings. */

import { GENERALIST, LEVELS, PLAYERS, PREFS, roleRanks, ROLES, SLOTS, state, STORE_KEY, syncSquad, TUNE_CODE, UP_CODE } from './core.js';

/* url hash + local storage:
   #c=wraith:ab,newcastle,bangalore:-b&w=1&l=wraith:Rowan,bangalore&m=olympus&t=engage:hi.hold:lo&r=28~Rowan~CD3qSmyq~Sam~A
     c: the comp in the breakdown. After a colon: level 2 then level 3 upgrade (a / b / - for none).
     w: 1 when the breakdown's swaps block is in "make it worse" mode.
     l: locked legends, each optionally pinned to a player: wraith:Rowan,bangalore.  m: map.  p: plan (none = each comp's best).  t: priorities (hi / lo).
     r: roster, only when it isn't the default: count~name~code~name~code~name~code
        count = how many legends the codes cover. code = each legend's pref, in the order of
        data/legends.json (0 can, 1 comfort, 2 don't), read as one base-3 number and written in
        base64url, so a full roster is ~8 characters per player. Legends added to the END of the
        JSON later decode as "can play", so old links keep working; don't reorder the list.
   The hash wins over this browser's saved settings. */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/* Codes pack one digit per legend in data.codeOrder: a frozen, append-only list of legend ids, so the
   legends themselves can be listed in any order. Ids no longer in the data still take their slot. */
const codeOrder = () => state.data.codeOrder;

function packPrefs(prefs) {
  let n = 0n;
  for (const id of [...codeOrder()].reverse()) n = n * 3n + BigInt(PREFS.indexOf(prefs[id] || 'can'));
  let out = '';
  do { out = B64[Number(n % 64n)] + out; n /= 64n; } while (n > 0n);
  return out;
}

function unpackPrefs(code, count) {
  let n = 0n;
  for (const ch of code) { const v = B64.indexOf(ch); if (v < 0) return {}; n = n * 64n + BigInt(v); }
  const prefs = {};
  for (const id of codeOrder().slice(0, count)) {
    const pref = PREFS[Number(n % 3n)];
    n /= 3n;
    if (pref !== 'can' && state.byId.has(id)) prefs[id] = pref;
  }
  return prefs;
}

/* Role ranks ride on a player's code as an optional suffix: CD3qSmyq.213 = entry 2nd, secondary 1st,
   anchor 3rd. No suffix = role-agnostic, so older codes still work. */
const rolesSuffix = (p) => { const r = roleRanks(p); return r ? '.' + ROLES.map(k => r[k]).join('') : ''; };
function splitCode(code) {
  const [prefs, ranks] = String(code).split('.');
  return { prefs, roles: /^[1-3]{3}$/.test(ranks || '') ? Object.fromEntries(ROLES.map((r, i) => [r, +ranks[i]])) : undefined };
}

/* Returns the players in an r= value (no padding). */
function parseRoster(text) {
  const [count, ...rest] = text.split('~');
  const players = [];
  for (let i = 0; i + 1 < rest.length && players.length < PLAYERS; i += 2) {
    const c = splitCode(rest[i + 1]);
    players.push({ name: rest[i] || `P${players.length + 1}`, prefs: unpackPrefs(c.prefs, Math.min(+count || 0, codeOrder().length)), roles: c.roles });
  }
  return players;
}

/* One player as a pasteable code: name~count~prefs[.roles]. */
export const playerCode = (p) => `${p.name}~${codeOrder().length}~${packPrefs(p.prefs)}${rolesSuffix(p)}`;

/* Players from pasted text: one or more player codes (any separator), or a share link with r=. */
export function parsePlayers(text) {
  text = text.trim();
  const hash = text.includes('#') ? text.slice(text.indexOf('#') + 1) : text;
  if (/(^|&)r=/.test(hash)) return parseRoster(new URLSearchParams(hash).get('r') || '');
  const out = [];
  for (const m of text.matchAll(/([^~\s,;]+(?:[ ][^~\s,;]+)*)~(\d+)~([A-Za-z0-9_-]+(?:\.[1-3]{3})?)/g)) {
    let name = m[1];
    try { name = decodeURIComponent(name); } catch { /* keep as typed */ }
    const c = splitCode(m[3]);
    out.push({ name, prefs: unpackPrefs(c.prefs, Math.min(+m[2], codeOrder().length)), roles: c.roles });
  }
  return out;
}

export const cleanName = (name, fallback) => String(name).replace(/[~:|&=#,.+%]/g, '').trim().slice(0, 16) || fallback;
export const findPlayer = (name) => state.library.findIndex(p => p.name.toLowerCase() === name.toLowerCase());

/* Add a player to the library, or replace the picks of the one with the same name. */
export function upsertPlayer(p, { overwrite = true } = {}) {
  const name = cleanName(p.name, `P${state.library.length + 1}`);
  const i = findPlayer(name);
  const roles = roleRanks(p) || undefined;
  if (i === -1) { state.library.push({ name, prefs: { ...p.prefs }, ...(roles && { roles }) }); return state.library.length - 1; }
  if (overwrite) { state.library[i].prefs = { ...p.prefs }; if (roles) state.library[i].roles = roles; else delete state.library[i].roles; }
  return i;
}

function parseComp(text) {
  const ids = [];
  const picks = {};
  for (const part of text.toLowerCase().split(',').map(s => s.trim()).filter(Boolean)) {
    const [id, code = ''] = part.split(':');
    if (!state.byId.has(id) || ids.includes(id) || ids.length >= SLOTS) continue;
    ids.push(id);
    picks[id] = Object.fromEntries(LEVELS.map((lv, k) => {
      const i = UP_CODE.indexOf(code[k]);
      return [lv, i >= 0 && state.byId.get(id).upgrades?.[lv]?.[i] ? i : null];
    }));
  }
  return { ids, picks };
}

/* A link describes a whole view, so anything it leaves out means the default, not whatever this
   browser had. Players in r= that aren't in your library are added; ones you already have keep
   your saved picks (use the import box to take someone's newer picks on purpose). The link's map
   and priorities are shown but not saved until you change a setting yourself. */
export function readHash() {
  const raw = location.hash.slice(1);
  if (!raw) return;
  const params = new URLSearchParams(raw);
  if (params.has('r')) {
    state.squad = parseRoster(params.get('r'))
      .filter(p => p.name !== 'anyone' && !(/^P\d$/.test(p.name) && !Object.keys(p.prefs).length))   // skip untouched placeholder players
      .map(p => upsertPlayer(p, { overwrite: false }))
      .slice(0, PLAYERS);
    syncSquad();
  }
  saveStore({ settings: false });
  const c = params.has('c') ? parseComp(params.get('c')) : null;
  state.chosen = c && c.ids.length === SLOTS ? { ...c, worst: params.get('w') === '1' } : null;
  state.locked = [];
  state.pins = {};
  for (const part of (params.get('l') || '').split(',').map(x => x.trim()).filter(Boolean)) {
    const [raw, name] = part.split(':');
    const id = raw.toLowerCase();
    if (!state.byId.has(id) || state.locked.includes(id) || state.locked.length >= SLOTS) continue;
    state.locked.push(id);
    const who = name ? cleanName(name, '') : '';
    if (who && !Object.values(state.pins).some(n => n.toLowerCase() === who.toLowerCase())) state.pins[id] = who;
  }
  state.map = state.data.maps[params.get('m')] ? params.get('m') : null;
  state.plan = state.data.plans?.[params.get('p')] || params.get('p') === GENERALIST ? params.get('p') : null;
  state.tune = {};
  for (const part of (params.get('t') || '').split('.').filter(Boolean)) {
    const [k, code] = part.split(':');
    const level = Object.keys(TUNE_CODE).find(l => TUNE_CODE[l] === code);
    if (state.data.tags[k] && level) state.tune[k] = level;
  }
}

const compCode = (ids, picks = {}) => ids.map(id => {
  const code = LEVELS.map(lv => (picks[id]?.[lv] != null ? UP_CODE[picks[id][lv]] : '-')).join('');
  return /^-+$/.test(code) ? id : `${id}:${code}`;
}).join(',');

/* push: add a browser history entry instead of replacing this one, so Back undoes the change
   (used for swaps; hashchange re-reads the whole view). */
export function writeHash({ push = false } = {}) {
  const parts = [];
  if (state.chosen) parts.push('c=' + compCode(state.chosen.ids, state.chosen.picks));
  if (state.chosen?.worst) parts.push('w=1');
  if (state.locked.length) parts.push('l=' + state.locked.map(id => (state.pins[id] ? `${id}:${encodeURIComponent(state.pins[id])}` : id)).join(','));
  if (state.map) parts.push('m=' + state.map);
  if (state.plan) parts.push('p=' + state.plan);
  const t = Object.entries(state.tune).map(([k, v]) => `${k}:${TUNE_CODE[v]}`).join('.');
  if (t) parts.push('t=' + t);
  const r = state.roster.players.filter(p => !p.filler);
  if (r.length) parts.push('r=' + [codeOrder().length, ...r.flatMap(p => [encodeURIComponent(p.name), packPrefs(p.prefs) + rolesSuffix(p)])].join('~'));
  const h = parts.length ? '#' + parts.join('&') : '';
  if (location.hash !== h) history[push ? 'pushState' : 'replaceState'](null, '', h || location.pathname + location.search);
}

export function loadStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    const clean = (p) => ({
      name: p.name, prefs: Object.fromEntries(Object.entries(p.prefs || {}).filter(([id, v]) => state.byId.has(id) && PREFS.includes(v) && v !== 'can')),
      roles: p.roles && Object.fromEntries(ROLES.filter(r => [1, 2, 3].includes(p.roles[r])).map(r => [r, p.roles[r]]))
    });
    if (Array.isArray(saved.library)) {
      // upsertPlayer merges names that differ only in case, which shifts indices; map old → new
      const at = saved.library.map(p => (p?.name ? upsertPlayer(clean(p)) : -1));
      state.squad = [...new Set((saved.squad || []).filter(Number.isInteger).map(i => at[i] ?? -1).filter(i => i >= 0))];
    }
    if (saved.map && state.data.maps[saved.map]) state.map = saved.map;
    if (saved.plan && (state.data.plans?.[saved.plan] || saved.plan === GENERALIST)) state.plan = saved.plan;
    if (saved.tune) state.tune = Object.fromEntries(Object.entries(saved.tune).filter(([k, v]) => state.data.tags[k] && TUNE_CODE[v]));
  } catch { /* no storage, or bad data: keep defaults */ }
}

/* settings: false saves the library and squad but keeps the map and priorities already saved
   (used when a share link is opened). */
export function saveStore({ settings = true } = {}) {
  try {
    let { map, plan, tune } = state;
    if (!settings) ({ map = null, plan = null, tune = {} } = JSON.parse(localStorage.getItem(STORE_KEY)) || {});
    localStorage.setItem(STORE_KEY, JSON.stringify({ library: state.library, squad: state.squad, map, plan, tune }));
  } catch { /* storage unavailable, or bad saved data */ }
}
