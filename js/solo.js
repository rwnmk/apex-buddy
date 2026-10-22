/* Solo queue: which legend should you pick, given the map, your picks (★ / · / ×) and whatever your
   teammates have hovered or locked? No DOM, so it runs in Node too.

   Your pick position follows from how many teammates have picked:
     third (2 known)  exact: every legend you can play, scored with the two teammates.
     second (1 known) expected: the last teammate is assumed to pick from what's left in proportion
                      to popularity (data/popularity.json), so each of your options is the
                      popularity-weighted average over their possible picks.
     first (blind)    the same, over both teammates picking in turn.
   Rank = score + comfortBonus for a ★ pick + roleBonus × how much you like the role the legend plays
   (the same bonuses as the analyser's seating). Plans are annotated, not chosen: a comp's score is
   already the better of its generalist and best-plan score.

   Scores come from bestBuild (each comp's best upgrade build) and are cached by comp, so moving
   from third pick to second reuses everything; refreshWeights (map change) needs clearCache(). */

import { compKey, roleMatch, state } from './core.js';
import { bestBuild, thirdAdds } from './model.js';

export const SHOWN = 3;            // suggestions shown in full
export const ALSO = 5;             // runners-up listed after them
const POP_FLOOR = 0.1;             // % used for a legend popularity.json doesn't list

const cache = new Map();           // compKey → { score, plan, as, roles, picks }
export const clearCache = () => cache.clear();

/* One comp, judged: score (as shown), the best plan it qualifies for (null = no plan), and roles in ids order. */
export function judgeComp(ids) {
  const k = compKey(ids);
  let x = cache.get(k);
  if (!x) {
    const b = bestBuild(ids);
    x = { ids: b.ids, score: b.score, plan: b.judge.plan, as: b.judge.as, roles: b.judge.roles, picks: b.picks };
    cache.set(k, x);
  }
  return x;
}
/* Role of one legend in a judged comp. */
const roleIn = (x, id) => x.roles?.[x.ids.indexOf(id)] || null;

export const popularity = (id) => state.data.popularity?.pickRate?.[id] ?? POP_FLOOR;
const allIds = () => state.data.legends.map(l => l.id);

/* Every comp the current lobby needs scored, so a caller can fill the cache in chunks
   (blind picks need all 3,276) and keep the page responsive. */
export function needed(mates) {
  const ids = allIds();
  const out = [];
  if (mates.length >= 2) {
    const [a, b] = mates.map(m => m.id);
    for (const c of ids) if (c !== a && c !== b) out.push([a, b, c]);
    // hovers: what if a hovering teammate switches? needs the other teammate + you + anyone else
    for (const h of mates.filter(m => m.hover)) {
      const o = mates.find(m => m !== h).id;
      for (const c of ids) for (const x of ids) if (c < x && c !== o && x !== o) out.push([o, c, x]);
    }
  } else if (mates.length === 1) {
    const a = mates[0].id;
    for (const c of ids) for (const x of ids) if (c < x && c !== a && x !== a) out.push([a, c, x]);
  } else {
    for (const a of ids) for (const b of ids) for (const c of ids) if (a < b && b < c) out.push([a, b, c]);
  }
  return out.filter(xs => !cache.has(compKey(xs)));
}

/* Popularity-weighted average score of fixed + one more legend from the rest; also the best such comp. */
function expectOne(fixed) {
  let sum = 0, z = 0, best = null;
  for (const x of allIds()) {
    if (fixed.includes(x)) continue;
    const w = popularity(x), j = judgeComp([...fixed, x]);
    sum += w * j.score; z += w;
    if (!best || j.score > best.score) best = j;
  }
  return { score: z ? sum / z : 0, best };
}
/* The same with two more legends, picked in turn (the second from what the first left). */
function expectTwo(c) {
  let sum = 0, z = 0, best = null;
  for (const a of allIds()) {
    if (a === c) continue;
    const w = popularity(a), e = expectOne([c, a]);
    sum += w * e.score; z += w;
    if (!best || e.best.score > best.score) best = e.best;
  }
  return { score: z ? sum / z : 0, best };
}

/* mates: [{ id, hover }] (0–2), me: a player ({ prefs, roles }) or null for "anyone".
   Returns { position, exact, list } with list ranked best first; each entry:
     { id, score, rank, comfort, role, roleFit, plan, comp, best, ifSwitch, adds }
   comp: the judged comp (exact), best: the best completion (expected), ifSwitch: for each hovering
   teammate, { id, score } = your expected score if they switch to something else. */
export function soloPicks(mates, me = null) {
  const taken = mates.map(m => m.id);
  const exact = mates.length >= 2;
  const position = Math.min(mates.length, 2) + 1;
  const { comfortBonus, roleBonus } = state.data.scoring;
  const list = [];
  for (const id of allIds()) {
    if (taken.includes(id) || me?.prefs?.[id] === 'no') continue;
    let score, comp = null, best = null;
    if (exact) { comp = judgeComp([...taken.slice(0, 2), id]); score = comp.score; }
    else if (mates.length === 1) ({ score, best } = expectOne([taken[0], id]));
    else ({ score, best } = expectTwo(id));
    const shown = comp || best;
    const role = roleIn(shown, id);
    const roleFit = me && role ? roleMatch(me, role) : 0;
    const comfort = me?.prefs?.[id] === 'comfort';
    const ifSwitch = exact ? mates.filter(m => m.hover).map(h => {
      const o = mates.find(m => m !== h).id;
      // they switch away from h: the rest of the pool, weighted by popularity
      let sum = 0, z = 0;
      for (const x of allIds()) {
        if (x === h.id || x === o || x === id) continue;
        sum += popularity(x) * judgeComp([o, id, x]).score; z += popularity(x);
      }
      return { id: h.id, score: z ? sum / z : 0 };
    }) : [];
    list.push({ id, score, rank: score + (comfort ? comfortBonus : 0) + roleBonus * roleFit, comfort, role, roleFit, plan: shown.plan, comp, best, ifSwitch, adds: [] });
  }
  list.sort((a, b) => b.rank - a.rank || b.score - a.score);
  // what your pick adds, for the ones shown in full (thirdAdds runs analyse, so not for all 25)
  for (const x of list.slice(0, SHOWN)) {
    const c = x.comp || x.best;
    x.adds = thirdAdds(c.ids, x.id, c.picks).map(a => a.label.toLowerCase());
  }
  return { position, exact, list };
}

/* Link to the analyser's breakdown of a judged comp (with its upgrade build, map and plan). */
export function analyserHash(comp) {
  const code = comp.ids.map(id => {
    const p = comp.picks?.[id] || {};
    const s = ['2', '3'].map(lv => (p[lv] != null ? 'ab'[p[lv]] : '-')).join('');
    return /^-+$/.test(s) ? id : `${id}:${s}`;
  }).join(',');
  return ['c=' + code, state.map && 'm=' + state.map, comp.as && 'p=' + comp.as].filter(Boolean).join('&');
}
