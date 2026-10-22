/* The model: trait weights, scoring (the one place the score formula lives), upgrade builds,
   roster seating, the team finder and swaps. Uses no DOM, so it can be unit-tested directly. */

import { clamp, CORE_POOL, CORES, MORE, GENERALIST, LEVELS, nameOf, pairKey, PHASES, planCore, PLAYERS, RESULTS, roleMatch, ROLES, SLOTS, state, TUNE, VARIATIONS, VERDICTS, WORST_RESULTS } from './core.js';

/* weights + scoring:
   Trait weight = base weight (tags.<k>.weight) × your priority (×0.5 / ×1 / ×2) × the map's
   multiplier for that trait. Traits with base weight 0 are shown but never scored.

   A legend's trait levels = base tags + picked upgrade tags, each trait capped at maxPerLegend.
   Class perks are squad-wide (one set of survey beacons is enough), so each perk's tags count once
   per comp, whether it comes from a legend's class or from an upgrade that grants it (Alter's
   "Eye to Another World" grants the Recon beacon perk). A comp's trait total s is the sum of its
   legends' levels plus its perks' tags.

   A derived trait (one with "from", e.g. loot: { from: { mobility: 0.5 } }) adds those fractions of
   its source traits' totals to its own: s(loot) = loot levels + 0.5 · s(mobility). Sources can't be
   derived themselves, so there are no chains.

   value(s)  = (1 − b) · min(s, cA) / cA  +  b · min(s, cA + 1) / (cA + 1)      (cA = coveredAt, b = backup)
   coverage  = Σ weight · value / Σ weight · coverageMax
   synergy   = Σ pair scores / (pairs in a full comp · pairMax) · synergyMax
   map fit   = Σ legend fits on the chosen map / (SLOTS · pairMax) · mapMax          (0 with no map)
   class mix = − duplicateClassPenalty for each legend beyond the first in a class
   score     = coverage + synergy + map fit + class mix, shown clamped to 0–100.

   Plans and roles (see judge below):
   generic   = score + planRolePoints · role fit for entry / secondary / anchor
   plan P    = plan coverage + synergy + map fit + class mix + planRolePoints · role points, where
               role points = planRoleBalance · one-of-each fit + (1 − planRoleBalance) · fit for P's role mix
               plan coverage: P's tolerated traits drop out; core traits weigh planCoreWeight × weight
               (at least 2) and count up to coveredAt + planDepth; support traits weigh at least 1.
   A comp qualifies for P when its core traits average at least planCoreMin of that depth and its
   role fit for P is at least planRoleGate. Its plan is its best qualifying plan; with none, it's a
   Dodo (data.noPlan). Final score = max(generic, best plan), or plan P's score when P is picked.

   Both also take: − roleGapPenalty for each role (in the one-of-each assignment) whose legend is rated
   below roleGapMin; ± fullHouseBonus when all three pairs are rated positive / negative; and each
   legend's legendPower. Upgrades are chosen to maximise this final score (minimise, in worst mode). */

function weightFor(k) {
  const t = state.data.tags[k];
  const mapW = state.map ? state.data.maps[state.map].weights?.[k] ?? 1 : 1;
  return (t.weight ?? 1) * TUNE[state.tune[k] || 'normal'] * mapW;
}

/* state.W: keys = scored traits (weight > 0), with weights w. vecKeys = keys plus any unscored
   traits that a derived trait reads from; trait vectors and sums use vecKeys. derive[k] lists
   [source index, factor] pairs for scored trait k. */
export function refreshWeights() {
  const { tags } = state.data;
  const keys = Object.keys(tags).filter(k => (tags[k].weight ?? 1) > 0);
  const vecKeys = [...keys];
  for (const k of keys) for (const src of Object.keys(tags[k].from || {})) if (!vecKeys.includes(src)) vecKeys.push(src);
  for (const p of Object.values(state.data.plans || {})) for (const k of [...planCore(p), ...(p.support || [])]) if (!vecKeys.includes(k)) vecKeys.push(k);
  const derive = keys.map(k => (tags[k].from ? Object.entries(tags[k].from).map(([src, f]) => [vecKeys.indexOf(src), f]) : null));
  const w = keys.map(weightFor);
  state.W = { keys, vecKeys, derive, w, totalW: w.reduce((a, b) => a + b, 0) || 1 };
}

const chosenUpgrades = (l, picks = {}) => LEVELS.map(lv => (picks[lv] != null ? l.upgrades?.[lv]?.[picks[lv]] : null)).filter(Boolean);

/* Base tags + picked upgrade tags (class perks are handled per comp, below). */
function legendTags(l, picks = {}) {
  const max = state.data.scoring.maxPerLegend;
  const tags = Object.fromEntries(Object.entries(l.tags || {}).filter(([, n]) => n > 0));   // 0 = none, allowed while grading
  const from = {};                                   // trait → upgrade names that raised it
  for (const u of chosenUpgrades(l, picks)) {
    for (const [t, n] of Object.entries(u.tags || {})) {
      const before = tags[t] || 0;
      tags[t] = Math.min(max, before + n);
      if (tags[t] > before) (from[t] ||= []).push(u.name);
    }
  }
  return { tags, from };
}

/* Class perks, keyed 'class/Perk name'. Built once on load. */
export function buildPerks() {
  state.perks = new Map();
  for (const [c, cls] of Object.entries(state.data.classes))
    for (const p of cls.perks || []) state.perks.set(`${c}/${p.name}`, { cls: c, ...p });
}
const classPerkIds = (c) => (state.data.classes[c].perks || []).map(p => `${c}/${p.name}`);
const grantedPerkIds = (u) => Object.entries(u.grants || {}).flatMap(([c, which]) => (which === 'all' ? classPerkIds(c) : which.map(n => `${c}/${n}`)));

export const srcLabel = (src) => (src.upgrade ? `${src.legend}'s ${src.upgrade}` : src.legend);

/* Every class perk the comp has, with where it comes from. */
function compPerks(legends, picks = {}) {
  const out = new Map();                              // perk id → [{ legend, upgrade }], upgrade null for a legend's own class
  const add = (id, src) => (out.get(id) || out.set(id, []).get(id)).push(src);
  for (const l of legends) for (const id of classPerkIds(l.class)) add(id, { legend: l.name, upgrade: null });
  for (const l of legends) for (const u of chosenUpgrades(l, picks[l.id])) for (const id of grantedPerkIds(u)) add(id, { legend: l.name, upgrade: u.name });
  return out;
}

/* Points off for doubling up on a class. Only a legend's own class counts, not granted perks. */
function classPenalty(ids) {
  const counts = {};
  for (const id of ids) { const c = state.byId.get(id).class; counts[c] = (counts[c] || 0) + 1; }
  return Object.values(counts).reduce((a, n) => a + Math.max(0, n - 1), 0) * state.data.scoring.duplicateClassPenalty;
}

/* Comp totals per vecKey, with derived shares added (sources are never derived themselves). */
function withDerived(sums) {
  const { derive } = state.W;
  return sums.map((s, k) => { if (derive[k]) for (const [src, f] of derive[k]) s += f * sums[src]; return s; });
}

/* Best way to give each legend a different role from a mix of three. Returns { fit: 0–1, at: role per id }. */
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
function roleFit(ids, mix) {
  let best = -1, at = null;
  for (const p of PERMS) {
    const s = p.reduce((a, slot, i) => a + (state.byId.get(ids[i]).roles?.[mix[slot]] ?? 0), 0);
    if (s > best) { best = s; at = p.map(slot => mix[slot]); }
  }
  return { fit: best / 9, at };
}

/* Roles the comp can't really fill: for a role assignment (role per id), the roles whose legend is rated below roleGapMin. */
const gapsFor = (ids, at) => ids.map((id, i) => [at[i], state.byId.get(id).roles?.[at[i]] ?? 0]).filter(([, n]) => n < state.data.scoring.roleGapMin).map(([r]) => r);

/* Plans and roles on top of the trait sums (formulas in the header comment). sums: explicit totals
   aligned with state.W.vecKeys; fixed: synergy + map fit − class mix. */
export function judge(ids, sums, fixed) {
  const sc = state.data.scoring;
  const { keys, vecKeys, w } = state.W;
  const totals = withDerived(sums);
  const cA = sc.coveredAt, deep = sc.coveredAt + sc.planDepth;
  const value = (s) => (1 - sc.backup) * Math.min(s, cA) / cA + sc.backup * Math.min(s, cA + 1) / (cA + 1);
  const R = sc.planRolePoints;

  const generic = { cov: coveragePts(sums), ...roleFit(ids, ROLES) };
  // role gaps: roles in the one-of-each assignment whose legend is rated below roleGapMin
  const roleGaps = gapsFor(ids, generic.at);
  generic.score = generic.cov + fixed + R * generic.fit - roleGaps.length * sc.roleGapPenalty;

  const plans = {};
  for (const [pid, p] of Object.entries(state.data.plans || {})) {
    // A plan is either targets ({ trait: comp total it wants }) or core traits that count up to coveredAt + planDepth.
    const want = p.targets || Object.fromEntries((p.core || []).map(k => [k, deep]));
    let num = 0, den = 0, core = 0;
    vecKeys.forEach((k, i) => {
      const base = i < keys.length ? w[i] : 0;
      let wt = base, v;
      if (p.tolerates?.includes(k)) { wt = base * (sc.planTolerance ?? 0); if (!wt) return; }
      else if (want[k]) { wt = Math.max(base, 2) * sc.planCoreWeight; v = Math.min(totals[i], want[k]) / want[k]; core += v; }
      else if (p.support?.includes(k)) wt = Math.max(base, 1);
      if (!wt) return;
      num += wt * (v ?? value(totals[i])); den += wt;
    });
    // with a role mix, a plan wants those roles; without one, it wants one of each like everything else
    const rf = p.roles ? roleFit(ids, p.roles) : generic;
    const cov = den ? num / den * sc.coverageMax : 0;
    const depth = core / Object.keys(want).length;
    // role points: planRoleBalance of them reward one of each role, the rest the plan's own mix
    const pts = (1 - sc.planRoleBalance) * rf.fit + sc.planRoleBalance * generic.fit;
    // judged as a plan, the comp needs the plan's own role mix (Hawk: entry, entry, secondary); generic needs one of each
    const planGaps = gapsFor(ids, rf.at);
    const progress = Object.entries(want).map(([k, t]) => [k, totals[vecKeys.indexOf(k)] ?? 0, t]);   // [trait, comp total, target]
    plans[pid] = { cov, fit: rf.fit, at: rf.at, pts, depth, progress, gaps: planGaps, score: cov + fixed + R * pts - planGaps.length * sc.roleGapPenalty, qual: depth >= sc.planCoreMin && (!p.roles || rf.fit >= sc.planRoleGate) };
  }
  const best = Object.entries(plans).filter(([, x]) => x.qual).sort((a, b) => b[1].score - a[1].score)[0];
  const plan = best ? best[0] : null;

  let as = null, qual = true;
  if (state.plan === GENERALIST) as = null;
  else if (state.plan && plans[state.plan]) { as = state.plan; qual = plans[as].qual; }
  else if (best && best[1].score > generic.score) as = plan;
  const used = as ? plans[as] : generic;
  // roles shown are always one of each: what the squad actually plays
  return {
    score: used.score, cov: used.cov, rolePts: R * (used.pts ?? used.fit), roles: as ? plans[as].at : generic.at, roleGaps: as ? plans[as].gaps : roleGaps, as, plan, qual, generic: generic.score,
    thin: as ? plans[as].depth < sc.planCoreMin : false, offRole: as && state.data.plans[as].roles ? plans[as].fit < sc.planRoleGate : false,
    progress: (as || plan) ? plans[as || plan].progress : null,
    // every lens at once, for the results sections: { generalist: {…}, planId: {…} }
    lenses: {
      [GENERALIST]: { score: generic.score, qual: true, roles: generic.at },
      ...Object.fromEntries(Object.entries(plans).map(([pid, x]) => [pid, { score: x.score, qual: x.qual, roles: x.at }]))
    }
  };
}

/* sums: explicit trait totals, aligned with state.W.vecKeys (derived amounts are added here) */
function coveragePts(sums) {
  const { coveredAt: cA, backup: b, coverageMax } = state.data.scoring;
  const { w, totalW, derive } = state.W;
  let v = 0;
  for (let k = 0; k < w.length; k++) {
    let s = sums[k];
    if (derive[k]) for (const [src, f] of derive[k]) s += f * sums[src];
    v += w[k] * ((1 - b) * Math.min(s, cA) / cA + b * Math.min(s, cA + 1) / (cA + 1));
  }
  return v / totalW * coverageMax;
}

const FULL_PAIRS = SLOTS * (SLOTS - 1) / 2;
/* ± fullHouseBonus when all three pairs are rated and all positive (full house) or all negative (civil war). */
export function pairVerdict(ids) {
  const scores = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) scores.push(state.pairs.get(pairKey(ids[i], ids[j]))?.score ?? 0);
  return scores.every(s => s > 0) ? 1 : scores.every(s => s < 0) ? -1 : 0;
}
const powerPts = (ids) => ids.reduce((a, id) => a + (state.data.scoring.legendPower?.[id] || 0), 0);
/* Points that don't depend on upgrades: synergy, map fit, class mix, full house, legend power. */
function fixedParts(ids) {
  const syn = synergyPts(ids), map = mapPts(ids), penalty = classPenalty(ids);
  const house = pairVerdict(ids) * state.data.scoring.fullHouseBonus, power = powerPts(ids);
  return { syn, map, penalty, house, power, total: syn + map - penalty + house + power };
}

function synergyPts(ids) {
  const { pairMax, synergyMax } = state.data.scoring;
  let s = 0;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) s += state.pairs.get(pairKey(ids[i], ids[j]))?.score || 0;
  return s / (FULL_PAIRS * pairMax) * synergyMax;
}

export const mapFit = (id) => (state.map ? state.byId.get(id).maps?.[state.map] || 0 : 0);
function mapPts(ids) {
  if (!state.map) return 0;
  const { pairMax, mapMax } = state.data.scoring;
  return ids.reduce((a, id) => a + mapFit(id), 0) / (SLOTS * pairMax) * mapMax;
}

export const shownScore = (x) => clamp(Math.round(x), 0, 100);
// the label for a score, using scoring.verdicts thresholds
export const verdict = (score) => VERDICTS.find(([k]) => !k || score >= (state.data.scoring.verdicts?.[k] ?? Infinity)).slice(1);

/* A comp's strength in each game phase (0–1): its coverage of the traits that matter in that phase,
   each weighted by trait weight × the trait's share of that phase (tags.<trait>.phases). Uses the same
   "covered at coveredAt" value as the score. Returns null when no trait has phases. */
export function phaseProfile(coverage) {
  const { coveredAt: cA, backup: b } = state.data.scoring;
  const value = (s) => (1 - b) * Math.min(s, cA) / cA + b * Math.min(s, cA + 1) / (cA + 1);
  const out = {};
  for (const [ph] of PHASES) {
    let num = 0, den = 0;
    for (const c of coverage) {
      const share = c.phases?.[ph] || 0;
      if (!share || !c.weight) continue;
      num += c.weight * share * value(c.sum); den += c.weight * share;
    }
    out[ph] = den ? num / den : null;
  }
  return Object.values(out).some(v => v != null) ? out : null;
}

/* Full report for the breakdown. picks: { id: { '2': n, '3': n } } */
export function analyse(ids, picks = {}) {
  const { tags } = state.data;
  const legends = ids.map(id => state.byId.get(id));
  const eff = legends.map(l => legendTags(l, picks[l.id]));

  const perks = compPerks(legends, picks);

  const whoFor = (key) => [
    ...legends.map((l, i) => ({ id: l.id, name: l.name, lv: eff[i].tags[key] || 0, via: eff[i].from[key] || [] })),
    ...[...perks].map(([pid, srcs]) => ({ perk: true, name: state.perks.get(pid).name, lv: state.perks.get(pid).tags?.[key] || 0, via: srcs.map(srcLabel) }))
  ].filter(x => x.lv);
  const explicit = Object.fromEntries(Object.keys(tags).map(key => [key, whoFor(key).reduce((a, x) => a + x.lv, 0)]));

  const coverage = Object.entries(tags).map(([key, t]) => {
    const who = [
      ...whoFor(key),
      // derived share, e.g. loot from the squad's mobility
      ...Object.entries(t.from || {}).map(([src, f]) => ({ derived: true, src, name: tags[src].label, lv: f * explicit[src], via: [] })).filter(x => x.lv)
    ];
    const base = t.weight ?? 1;
    return { key, ...t, base, weight: base > 0 ? weightFor(key) : 0, who, sum: who.reduce((a, x) => a + x.lv, 0) };
  }).sort((a, b) => b.weight - a.weight || b.sum - a.sum);

  const fx = fixedParts(ids);
  const synPts = fx.syn, mPts = fx.map, penalty = fx.penalty;
  const phases = phaseProfile(coverage);
  const j = judge(ids, state.W.vecKeys.map(k => explicit[k]), fx.total);
  const covPts = j.cov;

  const pairs = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const s = state.pairs.get(pairKey(ids[i], ids[j]));
      pairs.push({ a: legends[i], b: legends[j], score: s?.score || 0, note: s?.note || '' });
    }

  const classes = {};
  for (const l of legends) (classes[l.class] ||= []).push(l.name);

  return {
    ids, legends, eff, perks, coverage, pairs, classes, covPts, synPts, mapPts: mPts, penalty, housePts: fx.house, powerPts: fx.power, phases,
    doubled: Object.entries(classes).filter(([, names]) => names.length > 1),
    score: j.score, judge: j,
    gaps: coverage.filter(c => c.weight > 0 && c.sum === 0 && c.missing),
    unpicked: legends.filter(l => LEVELS.some(lv => l.upgrades?.[lv]?.length && picks[l.id]?.[lv] == null)).length
  };
}

/* What one legend adds to a comp: the traits whose weighted value would drop most without its own
   levels (and class perks only it brings). Used to explain a flex pick; not part of the score. */
export function thirdAdds(ids, id, picks = {}, n = 2) {
  const { coveredAt: cA, backup: b } = state.data.scoring;
  const value = (s) => (1 - b) * Math.min(s, cA) / cA + b * Math.min(s, cA + 1) / (cA + 1);
  const a = analyse(ids, picks);
  const mine = (label) => label === nameOf(id) || label.startsWith(`${nameOf(id)}'s `);
  return a.coverage.filter(c => c.weight > 0).map(c => {
    const own = c.who.filter(w => w.id === id || (w.perk && w.via.every(mine))).reduce((s, w) => s + w.lv, 0);
    return { key: c.key, label: c.label, gain: c.weight * (value(c.sum) - value(c.sum - own)) };
  }).filter(x => x.gain > 0.01).sort((x, y) => y.gain - x.gain).slice(0, n);
}

/* search:
   Every legend has up to 4 upgrade builds (one pick per level, as in-game). Each build is turned
   into a trait vector once; comps are then scored with plain array maths. A level with a "must"
   option only offers that option. "unplayable" options are left out (unless every option at that
   level is unplayable); when looking for the worst build they're the only ones offered instead. Trait vectors don't depend on weights, so the cache survives
   map and priority changes. */

const buildCache = new Map();

function buildsFor(id, worst = false) {
  const key = `${id}|${worst ? 'worst' : 'best'}`;
  if (buildCache.has(key)) return buildCache.get(key);
  const l = state.byId.get(id);
  const per = LEVELS.map(lv => {
    const opts = l.upgrades?.[lv] || [];
    if (!opts.length) return [null];
    const must = opts.findIndex(u => u.must);
    if (must >= 0) return [must];
    const all = opts.map((_, n) => n);
    const skip = all.filter(n => opts[n].unplayable);
    const playable = all.filter(n => !opts[n].unplayable);
    if (worst) return skip.length ? skip : all;
    return playable.length ? playable : all;
  });
  const builds = [];
  const walk = (i, picks) => {
    if (i === LEVELS.length) {
      const t = legendTags(l, picks).tags;
      const vec = state.W.vecKeys.map(k => t[k] || 0);
      const grants = chosenUpgrades(l, picks).flatMap(grantedPerkIds);
      builds.push({ picks: { ...picks }, vec, grants, raw: vec.reduce((a, b) => a + b, 0) });
      return;
    }
    for (const n of per[i]) { picks[LEVELS[i]] = n; walk(i + 1, picks); }
  };
  walk(0, {});
  buildCache.set(key, builds);
  return builds;
}

const perkVecCache = new Map();
const perkVec = (pid) => perkVecCache.get(pid) || perkVecCache.set(pid, state.W.vecKeys.map(k => state.perks.get(pid).tags?.[k] || 0)).get(pid);

/* Best upgrade builds for a set of legends. Ties go to more total trait points + distinct class perks (raw). */
/* worst: find the lowest-scoring build instead (ties go to fewer trait points). */
export function bestBuild(ids, worst = false) {
  const opts = ids.map(id => buildsFor(id, worst));
  const n = state.W.vecKeys.length;
  const sums = new Array(n);
  const native = new Set(ids.flatMap(id => classPerkIds(state.byId.get(id).class)));
  const fixed = fixedParts(ids).total;
  let best = null;
  const lensBest = {};
  const walk = (i, chosen) => {
    if (i === ids.length) {
      sums.fill(0);
      let raw = 0;
      for (const b of chosen) { raw += b.raw; for (let k = 0; k < n; k++) sums[k] += b.vec[k]; }
      const perks = new Set(native);
      for (const b of chosen) for (const pid of b.grants) perks.add(pid);
      for (const pid of perks) { const v = perkVec(pid); for (let k = 0; k < n; k++) sums[k] += v[k]; }
      raw += perks.size;                              // tie-break: an upgrade that adds a new class perk beats a duplicate
      const jj = judge(ids, sums, fixed);                    // upgrades serve the comp's plan (or a picked plan)
      const score = jj.score;
      const better = worst ? score < best?.score - 1e-9 : score > best?.score + 1e-9;
      const tie = best && Math.abs(score - best.score) <= 1e-9 && (worst ? raw < best.raw : raw > best.raw);
      if (!best || better || tie) best = { score, raw, chosen: chosen.slice(), sums: sums.slice() };
      // and the best build for each lens separately (a build that qualifies for a plan beats one that doesn't)
      if (!worst) for (const [lens, x] of Object.entries(jj.lenses)) {
        const cur = lensBest[lens];
        if (!cur || (x.qual && !cur.qual) || (x.qual === cur.qual && x.score > cur.score + 1e-9)) lensBest[lens] = { ...x, chosen: chosen.slice() };
      }
      return;
    }
    for (const b of opts[i]) { chosen.push(b); walk(i + 1, chosen); chosen.pop(); }
  };
  walk(0, []);
  const j = judge(ids, best.sums, fixed);
  const picksOf = (chosen) => Object.fromEntries(ids.map((id, i) => [id, { ...chosen[i].picks }]));
  const lenses = Object.fromEntries(Object.entries(lensBest).map(([lens, x]) => [lens, { score: x.score, qual: x.qual, roles: x.roles, picks: picksOf(x.chosen) }]));
  return { ids, score: j.score, judge: j, raw: best.raw, picks: picksOf(best.chosen), lenses };
}

export const prefOf = (p, id) => state.roster.players[p].prefs[id] || 'can';
export const playable = (id) => state.roster.players.some((_, p) => prefOf(p, id) !== 'no');

/* Pins by name, so they survive roster reordering and a player sitting out. A pin only applies
   while its player is ticked: activePins gives { legend id → roster index } for those. */
export const seatedIndex = (name) => state.roster.players.findIndex(p => !p.filler && p.name.toLowerCase() === name.toLowerCase());
export function activePins() {
  const out = {};
  for (const [id, name] of Object.entries(state.pins)) {
    const at = seatedIndex(name);
    if (at !== -1 && state.locked.includes(id)) out[id] = at;
  }
  return out;
}
export const pinText = () => Object.entries(activePins()).map(([id, p]) => `${state.roster.players[p].name} on ${nameOf(id)}`);

/* Roster seating: each legend goes to a different player who plays it (the pinned player, for a
   pinned legend), maximising comfortBonus per comfort pick + roleBonus × how much each player likes
   the role their legend plays in the comp (one of each: see judge).
   Returns { seats: [player index per legend], comfort, roleMatch, bonus } or null. */
export function seat(ids) {
  const { comfortBonus, roleBonus } = state.data.scoring;
  const roles = ids.length === SLOTS ? roleFit(ids, ROLES).at : [];   // partial comps (e.g. checking locks) have no roles yet
  let best = null;
  const used = new Array(PLAYERS).fill(false);
  const pins = activePins();
  const walk = (i, seats, comfort, match) => {
    if (i === ids.length) {
      const bonus = comfortBonus * comfort + roleBonus * match;
      if (!best || bonus > best.bonus + 1e-9) best = { seats: seats.slice(), comfort, roleMatch: match, bonus };
      return;
    }
    const pinned = pins[ids[i]] ?? -1;
    for (let p = 0; p < PLAYERS; p++) {
      const pref = prefOf(p, ids[i]);
      if (used[p] || pref === 'no' || (pinned !== -1 && p !== pinned)) continue;
      used[p] = true; seats.push(p);
      walk(i + 1, seats, comfort + (pref === 'comfort' ? 1 : 0), match + (roles[i] ? roleMatch(state.roster.players[p], roles[i]) : 0));
      used[p] = false; seats.pop();
    }
  };
  walk(0, [], 0, 0);
  // Snapshot names, comfort and role matches now: results outlive roster edits, and seat indices would point at the wrong people.
  if (best) {
    best.names = best.seats.map(p => state.roster.players[p].name);
    best.comfy = best.seats.map((p, i) => prefOf(p, ids[i]) === 'comfort');
    best.roleOk = best.seats.map((p, i) => !!roles[i] && roleMatch(state.roster.players[p], roles[i]) === 1);
  }
  return best;
}

/* Everything that changes the suggestions. Used to spot stale results. */
// the plan isn't part of it: generate scores every section at once, and the plan only chooses which one to show
export const settingsKey = () => JSON.stringify([state.locked, activePins(), state.map, state.tune, state.roster.players.map(p => [p.prefs, p.roles])]);

/* Team finder: every comp that includes the locked legends and seats on the roster, each with
   its best upgrade build. Ranked by score + the seating bonus (comfort picks and preferred roles), then raw, then name. */
export function findTeams(worst = false) {
  const t0 = performance.now();
  const locked = state.locked;
  const pool = state.data.legends.map(l => l.id).filter(id => !locked.includes(id) && playable(id));
  const need = SLOTS - locked.length;
  const list = [];
  let total = 0;
  const combos = (start, acc) => {
    if (acc.length === need) {
      total++;
      const ids = [...locked, ...acc];
      const seating = seat(ids);
      if (!seating) return;
      const r = bestBuild(ids, worst);
      // with a plan picked, comps that can't play it rank after every comp that can
      list.push({ ...r, seating, rank: worst ? -r.score : r.score + seating.bonus - (r.judge.qual ? 0 : 1000) });
      return;
    }
    for (let i = start; i < pool.length; i++) { acc.push(pool[i]); combos(i + 1, acc); acc.pop(); }
  };
  combos(0, []);
  list.sort((a, b) => b.rank - a.rank || (worst ? a.raw - b.raw : b.raw - a.raw) || a.ids.join().localeCompare(b.ids.join()));
  const sections = worst ? null : buildSections(list);
  return { key: settingsKey(), worst, list: list.slice(0, worst ? WORST_RESULTS : RESULTS), sections, total, valid: list.length, ms: Math.round(performance.now() - t0) };
}

/* Results sections, one per lens: the generalist (no plan) and each plan. In each, comps that qualify
   are scored as that plan, with that plan's best upgrades, and ranked by score + seating bonus. They're
   shown as cores: a pair of legends with its best third legends (variations), like a meta site's
   "core + flex" view. Cores are picked greedily from the best comps: each comp appears once, a legend
   is in at most two cores, and with locked legends every core contains them. */
function buildSections(list) {
  const lensIds = [GENERALIST, ...Object.keys(state.data.plans || {})];
  const locked = state.locked;
  return lensIds.map(lens => {
    const comps = list.filter(x => x.lenses?.[lens]?.qual).map(x => ({
      ids: x.ids, raw: x.raw, seating: x.seating, lens,
      score: x.lenses[lens].score, roles: x.lenses[lens].roles, picks: x.lenses[lens].picks,
      rank: x.lenses[lens].score + x.seating.bonus
    })).sort((a, b) => b.rank - a.rank || b.raw - a.raw || a.ids.join().localeCompare(b.ids.join()));
    const pool = comps.slice(0, CORE_POOL);
    const key = (x) => x.ids.slice().sort().join('+');
    const used = new Set(), inCores = {}, cores = [];
    for (const head of pool) {
      if (cores.length >= CORES) break;
      if (used.has(key(head))) continue;
      const pairs = locked.length >= SLOTS ? [head.ids]
        : [[0, 1], [0, 2], [1, 2]].map(([i, j]) => [head.ids[i], head.ids[j]])
          .filter(p => locked.every(id => p.includes(id) || locked.length > 2))
          .filter(p => p.every(id => locked.includes(id) || (inCores[id] || 0) < 2));
      let bestPair = null;
      for (const p of pairs) {
        const vars = pool.filter(x => !used.has(key(x)) && p.every(id => x.ids.includes(id))).slice(0, VARIATIONS);
        const value = vars.slice(0, 3).reduce((a, x) => a + x.rank, 0);
        if (vars.includes(head) && (!bestPair || value > bestPair.value)) bestPair = { pair: p, vars, value };
      }
      if (!bestPair) continue;
      for (const x of bestPair.vars) used.add(key(x));
      for (const id of bestPair.pair) inCores[id] = (inCores[id] || 0) + 1;
      cores.push({ pair: bestPair.pair, vars: bestPair.vars });
    }
    // more: the core's other thirds that qualify, in rank order (shown on request; may repeat another core's comp)
    for (const c of cores) {
      const shown = new Set(c.vars.map(key));
      c.more = comps.filter(x => !shown.has(key(x)) && c.pair.every(id => x.ids.includes(id))).slice(0, MORE);
    }
    return { id: lens, count: comps.length, cores };
  });
}

/* Single-legend swaps for the breakdown. For each legend in the comp, the replacements the rest
   of the squad can still seat, ranked by how much they change the score. Both sides are scored
   on their best upgrades (worst upgrades when worst), the same way generate ranks comps, so an
   unpicked upgrade on the current comp doesn't inflate every swap. Only changes of at least one
   shown point count, up to SWAPS per legend. Locked legends aren't swapped. */
const SWAPS = 3;
export function findSwaps(ids, worst = false) {
  const base = bestBuild(ids, worst);
  const baseGaps = new Set(analyse(ids, base.picks).gaps.map(g => g.key));
  return ids.map((out, at) => {
    if (state.locked.includes(out)) return { out, locked: true, list: [] };
    const list = [];
    for (const l of state.data.legends) {
      if (ids.includes(l.id)) continue;
      const next = ids.map(id => (id === out ? l.id : id));
      const seating = seat(next);
      if (!seating) continue;
      const r = bestBuild(next, worst);
      const delta = Math.round(r.score - base.score);
      if (worst ? delta <= -1 : delta >= 1) list.push({ id: l.id, next, delta, raw: r.raw, picks: r.picks, seating, at });
    }
    list.sort((a, b) => (worst ? a.delta - b.delta : b.delta - a.delta) || b.raw - a.raw || a.id.localeCompare(b.id));
    list.length = Math.min(list.length, SWAPS);
    for (const x of list) {
      const gaps = analyse(x.next, x.picks).gaps;
      const now = new Set(gaps.map(g => g.key));
      x.fixes = [...baseGaps].filter(k => !now.has(k)).map(k => state.data.tags[k].label.toLowerCase());
      x.loses = gaps.filter(g => !baseGaps.has(g.key)).map(g => g.label.toLowerCase());
    }
    return { out, locked: false, list };
  });
}

/* The newcomer's upgrades after a swap: the best (or worst) build for it, with everyone else's
   picks left exactly as they were. */
export function newcomerPicks(ids, picks, id, worst) {
  let best = null;
  for (const b of buildsFor(id, worst)) {
    const score = analyse(ids, { ...picks, [id]: b.picks }).score;
    if (!best || (worst ? score < best.score - 1e-9 : score > best.score + 1e-9)) best = { score, picks: { ...b.picks } };
  }
  return best ? best.picks : {};
}
