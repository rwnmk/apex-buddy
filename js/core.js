/* Shared constants, state and small helpers. Imports nothing, so every other module can use it. */

export const STORE_KEY = 'apex-team-comp.v2';            // player library, squad, map and priorities for this browser
export const SLOTS = 3;
export const PLAYERS = 3;                                // squad size; empty seats are filled by "anyone"
export const RESULTS = 12;
export const GENERALIST = 'generalist';   // the section (and state.plan value) for comps judged without a plan
export const CORES = 3;                   // cores shown per section
export const VARIATIONS = 4;              // comps shown per core
export const MORE = 8;                    // extra thirds a core can open up ("+N more")
export const CORE_POOL = 60;              // best comps per section that cores are drawn from
export const WORST_RESULTS = 3;
export const GEN_DELAY = [500, 900];                     // ms; generating is instant, the pause makes it feel considered
export const LEVELS = ['2', '3'];                        // upgrade levels, as used in the JSON keys
export const UP_CODE = ['a', 'b'];                       // hash codes for upgrade option 0 / 1
export const PREFS = ['can', 'comfort', 'no'];           // roster cycle order; missing = 'can'
export const PREF_GLYPH = { can: '·', comfort: '★', no: '×' };
export const PREF_LABEL = { can: 'can play', comfort: 'comfort pick', no: "doesn't play" };
export const TUNE = { low: 0.5, normal: 1, high: 2 };    // priority multipliers; missing = normal
export const TUNE_CODE = { low: 'lo', high: 'hi' };

export const SCORING_DEFAULTS = {
  coverageMax: 80,    // points available from trait coverage
  synergyMax: 20,     // ± points available from pair notes
  mapMax: 10,         // ± points available from map fit (0 when no map is chosen)
  pairMax: 2,         // largest |score| for a pair note, and largest |fit| for a legend on a map
  coveredAt: 2,       // comp trait total that counts as covered
  backup: 0.15,       // share of each trait's value that needs one point beyond coveredAt
  stackedAt: 4,       // comp trait total flagged as stacked
  maxPerLegend: 2,    // cap on one legend's level in a trait (base + class + upgrades)
  comfortBonus: 3,    // ranking bonus per comfort pick (not part of the comp score)
  duplicateClassPenalty: 4,  // points off per extra legend of a class already in the comp
  planRolePoints: 12, // points for how well the legends fill a role mix (entry / secondary / anchor)
  planRoleGate: 0.6,  // role fit (0–1) a comp needs to qualify for a plan
  planRoleBalance: 0.5, // share of a plan's role points that rewards one of each role, rather than the plan's own mix
  roleBonus: 2,       // ranking bonus per player seated in their preferred role (half for a middle choice) (not part of the comp score)
  planCoreMin: 0.5,   // average depth (0–1) a comp's core traits need to qualify for a plan
  planDepth: 2,       // plan core traits count up to coveredAt + planDepth instead of coveredAt
  planCoreWeight: 1.5, // plan core traits weigh this × their weight (at least 2)
  planTolerance: 0,   // share of its normal weight a trait a plan tolerates keeps (0 = it drops out of the plan's coverage)
  roleGapMin: 2,      // a role counts as filled when the legend playing it is rated at least this
  roleGapPenalty: 4,  // points off for each of entry / secondary / anchor the comp can't fill
  fullHouseBonus: 3,  // ± points when all three pairs are rated positive (full house) or all negative (civil war)
  legendPower: {},    // { legend id: ± points } for any comp with that legend: a judgment about the legend itself
  verdicts: { strong: 70, solid: 55, workable: 40 }   // score needed for each verdict label
};
/* A plan's defining traits: the keys of its targets ({ trait: comp total }), or its core list (older format). */
export const planCore = (p) => (p?.targets ? Object.keys(p.targets) : p?.core || []);
/* Game phases. Each trait says how much it matters in each (tags.<trait>.phases); a comp's phase profile
   is its coverage of the traits that matter in that phase. Descriptive only: phases don't change the score. */
export const PHASES = [
  ['early', 'early game', 'off the drop: looting and first fights'],
  ['mid', 'mid game', 'rotations and third parties'],
  ['late', 'late game', 'final rings and holds']
];
export const ROLES = ['entry', 'secondary', 'anchor'];      // legend roles, rated 0–3 each
export const RANK_LABEL = ['', '1st', '2nd', '3rd'];

/* A player's role preferences: player.roles = { entry, secondary, anchor } ranks 1–3, ties allowed.
   Missing, or all equal, means role-agnostic (returns null). */
export function roleRanks(p) {
  if (!p?.roles) return null;
  const v = ROLES.map(r => p.roles[r] ?? 1);
  return v.every(x => x === v[0]) ? null : Object.fromEntries(ROLES.map((r, i) => [r, v[i]]));
}
/* How happy a player is in a role: 1 for their top-ranked role, 0 for their bottom one, 0.5 between. Role-agnostic: 0. */
export function roleMatch(p, role) {
  const r = roleRanks(p);
  if (!r) return 0;
  const vals = Object.values(r), top = Math.min(...vals), bottom = Math.max(...vals);
  return r[role] === top ? 1 : r[role] === bottom ? 0 : 0.5;
}
export const WORST_LINES = ['good luck out there.', 'drop hot, die hot.', 'third party magnet.', 'your teammates will forgive you. eventually.', 'this one is for the clip.'];
export const VERDICTS = [['strong', 'Strong comp', ''], ['solid', 'Solid, with gaps', ''], ['workable', 'Workable', 'meh'], [null, 'Uphill battle', 'bad']];

export const $ = (sel) => document.querySelector(sel);

/* Tiny DOM builder. Children that are null, undefined or false are skipped, so
   `cond && el(...)` works. Use a ternary when the condition could be 0 or ''. */
export const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) n.append(kid);
  return n;
};

export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const pairKey = (a, b) => [a, b].sort().join('|');
// A comp's identity regardless of legend order, for "comps" in the data.
export const compKey = (ids) => ids.slice().sort().join('+');
// Optional upgrade "mode": the kind of match it's better in. Shown as a badge next to MUST.
export const UP_MODES = {
  algs: { text: 'ALGS', title: 'Better in competitive (ALGS) matches' },
  ranked: { text: 'ranked', title: 'Better in ranked matches' }
};
export const nameOf = (id) => state.byId.get(id).name;
/* Legends in display order: by class (in the order "classes" lists them), then by name. Only for
   showing lists; codes and links always use the JSON order, so this can't break them. */
let ordered = null;
export const displayOrder = () => ordered ||= (() => {
  const cls = Object.keys(state.data.classes);
  return [...state.data.legends].sort((a, b) => cls.indexOf(a.class) - cls.indexOf(b.class) || a.name.localeCompare(b.name));
})();
/* Levels may be half steps (2.5). Whole levels show as pluses (++), halves as numbers (+2.5). */
export const isHalfStep = (n) => typeof n === 'number' && Number.isInteger(n * 2);
export const levelText = (n) => (Number.isInteger(n) ? '+'.repeat(n) : `+${n}`);
export const listText = (xs) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const tagText = (tags) => Object.entries(tags || {}).filter(([, n]) => n > 0).map(([t, n]) => `+${n !== 1 ? n + ' ' : ''}${state.data.tags[t].label.toLowerCase()}`).join(', ');
export const grantText = (u) => Object.entries(u.grants || {}).map(([c, which]) => `${state.data.classes[c].label.toLowerCase()} perks: ${which === 'all' ? 'all' : which.join(', ')}`).join(', ');
export const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(Math.round(n));

export const state = {
  data: null,
  byId: new Map(),
  pairs: new Map(),
  W: null,                 // { keys, base, w, totalW }: weighted traits, rebuilt when map/priorities change
  perks: new Map(),        // 'class/Perk name' → { cls, name, effect, tags }, built once on load
  library: [],             // every saved player: { name, prefs }
  squad: [],               // library indices of who's playing now (up to PLAYERS)
  roster: { players: [] }, // the squad as seated: library players, then "anyone" fillers (see syncSquad)
  map: null,               // map id, or null for any
  plan: null,              // results section shown and the lens the breakdown uses: a plan id, 'generalist',
                           // or null for the overview (each comp judged by its best plan)
  tune: {},                // { tag: 'low' | 'high' }
  locked: [],              // legend ids every suggestion must include
  comps: new Map(),        // compKey → { label, note } from the optional "comps" list (e.g. ALGS comps)
  pins: {},                // locked legend id → player name who must play it; lives only in the URL.
                           // Ignored while that player isn't ticked (see activePins).
  view: undefined,         // results section on screen: a plan id, 'generalist', null (overview); undefined follows plan
  selected: null,          // { lens, x } a comp selected in the results, shown in the selection bar until picked
  open: new Set(),         // cores showing their "+N more" thirds, by lens|pair
  classFilter: null,
  query: '',
  results: null,           // { key, list, total, ms } from the last generate
  generating: false,
  chosen: null             // { ids, picks, worst } shown in the breakdown; picks: { id: { '2': n|null, '3': n|null } };
                           // worst: the swaps block suggests "make it worse" swaps instead
};

/* The squad as the solver sees it: the chosen library players, padded with "anyone" seats
   that play every legend, so a duo or a squad with a random still works. */
export function syncSquad() {
  state.squad = state.squad.filter(i => state.library[i]).slice(0, PLAYERS);
  const players = state.squad.map(i => state.library[i]);
  while (players.length < PLAYERS) players.push({ name: 'anyone', prefs: {}, filler: true });
  state.roster = { players };
}
