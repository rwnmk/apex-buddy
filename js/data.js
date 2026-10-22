/* Validation of data/legends.json: every problem is listed on the page with its location. */

import { compKey, isHalfStep, LEVELS, pairKey, SCORING_DEFAULTS, SLOTS, UP_CODE, UP_MODES } from './core.js';

export function validate(d) {
  const problems = [];
  const say = (m) => problems.push(m);
  if (!d || !Array.isArray(d.legends)) return ['"legends" must be an array.'];
  const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
  if (!isObj(d.tags)) say('"tags" must be an object.');
  if (!isObj(d.classes)) say('"classes" must be an object.');
  if (d.scoring != null && !isObj(d.scoring)) say('"scoring" must be an object.');
  for (const [k, v] of Object.entries(isObj(d.scoring) ? d.scoring : {}))
    if (k === 'verdicts') {
      if (!isObj(v) || ['strong', 'solid', 'workable'].some(x => typeof v[x] !== 'number')) say('scoring.verdicts should be { "strong": n, "solid": n, "workable": n }.');
    } else if (k === 'legendPower') {
      if (!isObj(v)) say('scoring.legendPower should be { "legend-id": points }.');
      else for (const [id, n] of Object.entries(v)) {
        if (!d.legends?.some(l => l?.id === id)) say(`scoring.legendPower: unknown legend "${id}".`);
        if (!(typeof n === 'number' && Number.isFinite(n))) say(`scoring.legendPower.${id} should be a number.`);
      }
    } else if (k in SCORING_DEFAULTS && !(typeof v === 'number' && Number.isFinite(v))) say(`scoring.${k} should be a number.`);
  const sc = { ...SCORING_DEFAULTS, ...(isObj(d.scoring) ? d.scoring : {}) };
  if (sc.coveredAt < 1) say('scoring.coveredAt should be at least 1.');
  if (!(sc.pairMax > 0)) say('scoring.pairMax should be more than 0.');
  if (!(sc.backup >= 0 && sc.backup <= 1)) say('scoring.backup should be from 0 to 1.');
  const pairMax = sc.pairMax;
  const checkTags = (where, tags) => {
    for (const [t, n] of Object.entries(tags || {})) {
      if (!d.tags?.[t]) say(`${where}: unknown tag "${t}".`);
      else if (!(isHalfStep(n) && n >= 0 && n <= sc.maxPerLegend)) say(`${where}: tag "${t}" should be from 0 to ${sc.maxPerLegend} (scoring.maxPerLegend) in steps of 0.5, got ${JSON.stringify(n)}.`);
    }
  };
  for (const [k, t] of Object.entries(d.tags || {})) {
    if (t?.phases != null && !(isObj(t.phases) && Object.entries(t.phases).every(([ph, n]) => ['early', 'mid', 'late'].includes(ph) && typeof n === 'number' && n >= 0)))
      say(`tags.${k}: "phases" should be like { "early": 0.2, "mid": 0.5, "late": 0.3 }.`);
    if (t?.levels != null && !(isObj(t.levels) && Object.entries(t.levels).every(([lv, txt]) => ['1', '2', '3'].includes(lv) && typeof txt === 'string')))
      say(`tags.${k}: "levels" should be like { "1": "…", "2": "…", "3": "…" }.`);
    if (!t?.label) say(`tags.${k}: missing "label".`);
    if (t?.weight != null && !(typeof t.weight === 'number' && t.weight >= 0)) say(`tags.${k}: "weight" should be a number ≥ 0.`);
    if (t?.from != null) {
      if (!isObj(t.from)) { say(`tags.${k}: "from" should be an object like { "mobility": 0.5 }.`); continue; }
      for (const [src, f] of Object.entries(t.from)) {
        if (!d.tags[src]) say(`tags.${k}: "from" names unknown trait "${src}".`);
        else if (src === k || d.tags[src].from) say(`tags.${k}: "from" can't use "${src}", which is itself derived.`);
        if (!(typeof f === 'number' && f > 0)) say(`tags.${k}: "from.${src}" should be a number > 0.`);
      }
    }
  }
  for (const [k, m] of Object.entries(d.maps || {})) {
    if (!m.name) say(`maps.${k}: missing "name".`);
    for (const [t, x] of Object.entries(m.weights || {})) {
      if (!d.tags?.[t]) say(`maps.${k}: unknown tag "${t}" in weights.`);
      else if (!(typeof x === 'number' && x >= 0)) say(`maps.${k}: weight for "${t}" should be a number ≥ 0.`);
    }
  }
  for (const [k, c] of Object.entries(d.classes || {})) {
    if (!c.label) say(`classes.${k}: missing "label".`);
    for (const p of c.perks || []) checkTags(`classes.${k} perk "${p.name}"`, p.tags);
  }
  const ids = new Set();
  for (const [i, l] of d.legends.entries()) {
    const where = `legends[${i}]${l?.id ? ` (${l.id})` : ''}`;
    if (!isObj(l)) { say(`${where}: should be an object.`); continue; }
    if (!l.id) say(`${where}: missing "id".`);
    else if (!/^[a-z0-9-]+$/.test(l.id)) say(`${where}: id should be lowercase letters, numbers or dashes.`);
    else if (ids.has(l.id)) say(`${where}: duplicate id.`);
    ids.add(l.id);
    if (!l.name) say(`${where}: missing "name".`);
    if (!d.classes?.[l.class]) say(`${where}: unknown class "${l.class}".`);
    checkTags(where, l.tags);
    for (const [m, fit] of Object.entries(l.maps || {})) {
      if (!d.maps?.[m]) say(`${where}: unknown map "${m}".`);
      else if (typeof fit !== 'number' || Math.abs(fit) > pairMax) say(`${where}: map fit for "${m}" should be a number from -${pairMax} to ${pairMax}.`);
    }
    for (const m of Object.keys(l.mapNotes || {})) if (!d.maps?.[m]) say(`${where}: mapNotes has unknown map "${m}".`);
    for (const [lv, opts] of Object.entries(l.upgrades || {})) {
      if (!LEVELS.includes(lv)) say(`${where}: upgrade level "${lv}" should be one of ${LEVELS.join(', ')}.`);
      if (!Array.isArray(opts) || opts.length > UP_CODE.length) { say(`${where}: upgrades["${lv}"] should be an array of up to ${UP_CODE.length}.`); continue; }
      if (opts.filter(u => u?.must).length > 1) say(`${where}: both level ${lv} upgrades are marked "must".`);
      for (const [n, u] of opts.entries()) {
        if (!u?.name) say(`${where}: upgrades["${lv}"][${n}] is missing "name".`);
        if (u?.must && u?.unplayable) say(`${where} upgrade "${u.name}": can't be both "must" and "unplayable".`);
        if (u?.mode != null && !UP_MODES[u.mode]) say(`${where} upgrade "${u?.name}": "mode" should be ${Object.keys(UP_MODES).map(m => `"${m}"`).join(' or ')}.`);
        checkTags(`${where} upgrade "${u?.name}"`, u?.tags);
        for (const [c, which] of Object.entries(u?.grants || {})) {
          const cls = d.classes?.[c];
          if (!cls) { say(`${where} upgrade "${u.name}": grants unknown class "${c}".`); continue; }
          if (which !== 'all' && !(Array.isArray(which) && which.every(name => cls.perks?.some(pk => pk.name === name))))
            say(`${where} upgrade "${u.name}": grants.${c} should be "all" or a list of ${c} perk names.`);
        }
      }
    }
  }
  const seenPairs = new Set();
  for (const [i, s] of (d.synergies || []).entries()) {
    if (!Array.isArray(s.pair) || s.pair.length !== 2 || s.pair[0] === s.pair[1]) { say(`synergies[${i}]: "pair" needs two different legend ids.`); continue; }
    for (const p of s.pair) if (!ids.has(p)) say(`synergies[${i}]: unknown legend "${p}".`);
    if (typeof s.score !== 'number' || Math.abs(s.score) > pairMax) say(`synergies[${i}]: "score" should be a number from -${pairMax} to ${pairMax}.`);
    const k = pairKey(...s.pair);
    if (seenPairs.has(k)) say(`synergies[${i}]: ${s.pair.join(' + ')} is listed twice.`);
    seenPairs.add(k);
  }
  const RING = ['inside', 'edge', 'anywhere'], WINS = ['kills', 'placement', 'either'], COVER = ['use', 'remove', 'bypass', 'avoid'], ROLE_KEYS = ['entry', 'secondary', 'anchor'];
  for (const [i, l] of d.legends.entries()) {
    if (l?.roles == null) continue;
    const where = `legends[${i}] (${l.id})`;
    if (!isObj(l.roles)) { say(`${where}: "roles" should be an object like { "entry": 3, "secondary": 1, "anchor": 0 }.`); continue; }
    for (const [r, n] of Object.entries(l.roles)) {
      if (!ROLE_KEYS.includes(r)) say(`${where}: unknown role "${r}" (use entry, secondary or anchor).`);
      else if (!(isHalfStep(n) && n >= 0 && n <= 3)) say(`${where}: role "${r}" should be from 0 to 3 in steps of 0.5.`);
    }
  }
  if (d.plans != null && !isObj(d.plans)) say('"plans" must be an object.');
  for (const [k, p] of Object.entries(isObj(d.plans) ? d.plans : {})) {
    const where = `plans.${k}`;
    if (!isObj(p)) { say(`${where}: should be an object.`); continue; }
    if (k === 'generalist') say(`${where}: "generalist" is reserved for comps judged without a plan; use another id.`);
    if (typeof p.label !== 'string' || !p.label.trim()) say(`${where}: missing "label".`);
    if (p.targets != null) {
      if (!isObj(p.targets) || !Object.keys(p.targets).length) say(`${where}: "targets" should be like { "hold": 5, "zone": 4 }.`);
      else for (const [t, n] of Object.entries(p.targets)) {
        if (!d.tags?.[t]) say(`${where}: "targets" has unknown trait "${t}".`);
        if (!(typeof n === 'number' && n > 0)) say(`${where}: target for "${t}" should be a number > 0.`);
      }
    } else if (!Array.isArray(p.core) || !p.core.length) say(`${where}: needs "targets" (or the older "core" list).`);
    for (const f of ['core', 'support', 'tolerates']) {
      if (p[f] == null) continue;
      if (!Array.isArray(p[f])) { say(`${where}: "${f}" should be a list of traits.`); continue; }
      for (const t of p[f]) if (!d.tags?.[t]) say(`${where}: "${f}" has unknown trait "${t}".`);
    }
    if (p.roles != null && (!Array.isArray(p.roles) || p.roles.length !== 3 || p.roles.some(r => !ROLE_KEYS.includes(r)))) say(`${where}: "roles" (optional) should list 3 roles from entry, secondary and anchor.`);
    if (p.ring != null && !RING.includes(p.ring)) say(`${where}: "ring" should be ${RING.map(x => `"${x}"`).join(', ')}.`);
    if (p.wins != null && !WINS.includes(p.wins)) say(`${where}: "wins" should be ${WINS.map(x => `"${x}"`).join(', ')}.`);
    if (p.cover != null && !COVER.includes(p.cover)) say(`${where}: "cover" should be ${COVER.map(x => `"${x}"`).join(', ')}.`);
    for (const f of ['punishes', 'risks']) if (p[f] != null && !(Array.isArray(p[f]) && p[f].every(x => typeof x === 'string'))) say(`${where}: "${f}" should be a list of text.`);
    if (p.note != null && typeof p.note !== 'string') say(`${where}: "note" should be text.`);
  }
  if (d.noPlan != null && !(isObj(d.noPlan) && typeof d.noPlan.label === 'string')) say('"noPlan" should be { "label": …, "note": … }.');
  if (!Array.isArray(d.codeOrder) || d.codeOrder.some(id => typeof id !== 'string')) say('"codeOrder" should be a list of legend ids.');
  else {
    if (new Set(d.codeOrder).size !== d.codeOrder.length) say('codeOrder: an id is listed twice.');
    for (const id of ids) if (!d.codeOrder.includes(id)) say(`codeOrder: "${id}" is missing. Add new legends to the end of codeOrder (never reorder it: player codes depend on it).`);
  }
  if (d.comps != null && !Array.isArray(d.comps)) say('"comps" must be an array.');
  const seenComps = new Set();
  for (const [i, c] of (Array.isArray(d.comps) ? d.comps : []).entries()) {
    const where = `comps[${i}]`;
    if (!isObj(c)) { say(`${where}: should be an object.`); continue; }
    if (!Array.isArray(c.legends) || c.legends.length !== SLOTS || new Set(c.legends).size !== SLOTS) { say(`${where}: "legends" needs ${SLOTS} different legend ids.`); continue; }
    for (const id of c.legends) if (!ids.has(id)) say(`${where}: unknown legend "${id}".`);
    if (typeof c.label !== 'string' || !c.label.trim()) say(`${where}: missing "label".`);
    if (c.note != null && typeof c.note !== 'string') say(`${where}: "note" should be text.`);
    const k = compKey(c.legends);
    if (seenComps.has(k)) say(`${where}: ${c.legends.join(' + ')} is listed twice.`);
    seenComps.add(k);
  }
  // popularity.json (solo-queue page): { pickRate: { legend: % of players } }, roughly summing to 100
  if (d.popularity != null) {
    const pr = d.popularity?.pickRate;
    if (!isObj(pr)) say('popularity.pickRate should be { "legend-id": percent }.');
    else {
      for (const [id, n] of Object.entries(pr)) {
        if (!d.legends.some(l => l?.id === id)) say(`popularity.pickRate: unknown legend "${id}".`);
        if (!(typeof n === 'number' && Number.isFinite(n) && n >= 0)) say(`popularity.pickRate.${id} should be a number, 0 or more.`);
      }
      const missing = d.legends.filter(l => l?.id && !(l.id in pr)).map(l => l.id);
      if (missing.length) say(`popularity.pickRate is missing ${missing.join(', ')}.`);
      const sum = Object.values(pr).filter(n => typeof n === 'number').reduce((a, n) => a + n, 0);
      if (sum < 95 || sum > 105) say(`popularity.pickRate adds up to ${+sum.toFixed(1)}; it should be about 100.`);
    }
  }
  return problems;
}
