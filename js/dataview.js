/* Data viewer (data.html): charts every rating in the data files so the group can sanity-check it.
   Read-only: it never changes anything, and it uses nothing from the analyser except shared helpers. */

import { $, displayOrder, el, listText, PHASES, planCore, ROLES, SCORING_DEFAULTS, state } from './core.js';
import { validate } from './data.js';
import { loadData } from './source.js';

const REPO = 'https://github.com/rwnmk/apex-comp-analyser';

/* "Suggest a change" links open a pre-filled GitHub issue, so disagreements land in one place. */
const issueUrl = (what, current = '') => `${REPO}/issues/new?${new URLSearchParams({
  title: `Data: ${what}`,
  body: `**What:** ${what}\n${current ? `**Currently:** ${current}\n` : ''}**Suggested change:** \n**Why:** \n`,
  labels: 'data'
})}`;
const suggest = (what, current, text = 'suggest a change') => el('a', { class: 'dv-suggest', href: issueUrl(what, current), target: '_blank', rel: 'noopener', text });
const levelsText = (tags) => Object.entries(tags || {}).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ');
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  for (const kid of kids.flat(Infinity)) if (kid != null) n.append(kid);
  return n;
};

/* Trait colours, grouped by family: movement blues, fighting oranges, intel violet, control greens,
   sustain yellows, economy pink. Unknown traits get a grey. */
const TRAIT_COLOUR = {
  rotate: '#2a78d6', disengage: '#6aa3e6', mobility: '#a9cbf1',
  engage: '#d9541f', damage: '#f0915f', breach: '#a8381a',
  intel: '#8a7bea',
  hold: '#0f7a52', zone: '#1baf7a', cover: '#86d5b4',
  sustain: '#c98500', revive: '#f2c357',
  loot: '#d55181'
};
const ROLE_COLOUR = { entry: '#eb6834', secondary: '#6aa3e6', anchor: '#1baf7a' };
const colourOf = (k) => TRAIT_COLOUR[k] || '#8f8f8f';

/* Heat cell background: green for positive values, red for negative, stronger with size. */
const heat = (v, max) => {
  if (!v) return null;
  const a = (0.18 + 0.7 * Math.min(Math.abs(v), max) / max).toFixed(2);
  return v > 0 ? `background: rgba(59, 183, 29, ${a})` : `background: rgba(232, 139, 139, ${a})`;
};
const signedNum = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);

const section = (id, title, intro, ...body) => el('section', { class: 'section dv-section', id, 'aria-labelledby': `${id}-h` },
  el('div', { class: 'cmd-head' }, el('h2', { id: `${id}-h` }, el('span', { class: 'lambda', text: 'λ' }), ` data --${title}`),
    el('div', { class: 'head-actions' }, suggest(title))),
  intro ? el('p', { class: 'meta', text: intro }) : null,
  ...body);
const scroll = (...kids) => el('div', { class: 'dv-scroll' }, kids);

/* ---------- traits ---------- */
const view = { mode: 'levels', sort: 'class', focus: null };

function traitValues(l) {
  // explicit levels, plus derived shares (e.g. loot from mobility) in the weighted view
  const { tags } = state.data;
  const out = {};
  for (const [k, t] of Object.entries(tags)) {
    let v = l.tags?.[k] || 0;
    if (view.mode === 'weighted') {
      for (const [src, f] of Object.entries(t.from || {})) v += f * (l.tags?.[src] || 0);
      v *= t.weight ?? 1;
    }
    out[k] = v;
  }
  return out;
}

function towers() {
  const { tags } = state.data;
  const keys = Object.keys(tags);
  let legends = displayOrder().map(l => ({ l, v: traitValues(l) }));
  const total = (x) => keys.reduce((a, k) => a + x.v[k], 0);
  if (view.sort === 'total') legends = legends.slice().sort((a, b) => total(b) - total(a));
  const peak = Math.max(...legends.map(total)) || 1;
  const tickStep = Math.max(1, Math.ceil(peak / 5));
  const max = Math.ceil(peak / tickStep) * tickStep;

  const W = 1000, H = 330, top = 16, base = 250, left = 34;
  const step = (W - left) / legends.length, bw = Math.min(22, step * 0.62);
  const y = (v) => base - (v / max) * (base - top);
  const ticks = Array.from({ length: max / tickStep + 1 }, (_, i) => i * tickStep);

  return svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'dv-towers', role: 'img', 'aria-label': `Stacked bars of each legend's trait ${view.mode}` },
    ticks.map(t => [
      svg('line', { x1: left, x2: W, y1: y(t), y2: y(t), class: 'dv-grid' }),
      svg('text', { x: left - 6, y: y(t) + 4, class: 'dv-tick', 'text-anchor': 'end' }, String(t))
    ]),
    legends.map(({ l, v }, i) => {
      const x = left + i * step + (step - bw) / 2;
      let acc = 0;
      const segs = keys.filter(k => v[k] > 0).map(k => {
        const y0 = y(acc), y1 = y(acc + v[k]);
        acc += v[k];
        const dim = view.focus && view.focus !== k;
        return svg('rect', { x, y: y1, width: bw, height: Math.max(0, y0 - y1 - 1), fill: dim ? '#4a4a4a' : colourOf(k) },
          svg('title', {}, `${l.name}: ${tags[k].label} ${+v[k].toFixed(1)}`));
      });
      return svg('g', {}, segs,
        svg('text', { x: x + bw / 2, y: base + 8, class: 'dv-tick', transform: `rotate(-55 ${x + bw / 2} ${base + 8})`, 'text-anchor': 'end' }, l.name),
        svg('title', {}, `${l.name}: total ${+acc.toFixed(1)}`));
    }));
}

function traitKey() {
  return el('div', { class: 'dv-key', role: 'group', 'aria-label': 'Highlight a trait' },
    Object.entries(state.data.tags).map(([k, t]) => el('button', {
      type: 'button', 'aria-pressed': String(view.focus === k), onclick: () => { view.focus = view.focus === k ? null : k; renderTraits(); }
    }, el('i', { style: `background: ${colourOf(k)}` }), t.label.toLowerCase())));
}

function seg(name, options, cur, set) {
  return el('span', { class: 'dv-segs', role: 'group', 'aria-label': name },
    options.map(([v, label]) => el('button', { type: 'button', class: 'tagchip sq', 'aria-pressed': String(cur === v), text: label, onclick: () => set(v) })));
}

function traitTable() {
  const { tags, scoring } = state.data;
  const keys = Object.keys(tags);
  return scroll(el('table', { class: 'dv-table' },
    el('thead', {}, el('tr', {}, el('th', { text: 'legend' }), keys.map(k => el('th', { title: tags[k].label }, el('span', { class: 'dv-vert', text: k }))), el('th', { text: 'total' }), el('th', {}))),
    el('tbody', {}, displayOrder().map(l => el('tr', {},
      el('th', { scope: 'row' }, l.name, el('span', { class: 'dv-sub', text: ` ${l.class}` })),
      keys.map(k => { const v = l.tags?.[k] || 0; return el('td', { style: heat(v, scoring.maxPerLegend), text: v ? String(v) : '' }); }),
      el('td', { class: 'dv-total', text: String(keys.reduce((a, k) => a + (l.tags?.[k] || 0), 0)) }),
      el('td', {}, suggest(`${l.name}'s traits`, levelsText(l.tags), '✎')))))));
}

function renderTraits() {
  const { tags } = state.data;
  const weights = Object.entries(tags).map(([k, t]) => `${k} ×${t.weight ?? 1}${t.from ? ` (+${Object.entries(t.from).map(([s, f]) => `${f}×${s}`).join(', ')})` : ''}`).join(' · ');
  $('#traits-body').replaceChildren(
    el('div', { class: 'dv-controls' },
      seg('Show', [['levels', 'levels'], ['weighted', 'weighted']], view.mode, (v) => { view.mode = v; renderTraits(); }),
      seg('Sort', [['class', 'by class'], ['total', 'by total']], view.sort, (v) => { view.sort = v; renderTraits(); })),
    traitKey(),
    el('div', { class: 'dv-chart' }, towers()),
    el('p', { class: 'meta', text: view.mode === 'levels'
      ? 'Levels: each legend\'s tag levels, before class perks and upgrades. Click a trait to highlight it; hover a bar segment for its value.'
      : `Weighted: each level × its trait weight, including derived shares. Weights: ${weights}.` }),
    el('details', { class: 'dv-details' }, el('summary', { text: 'all trait levels as a table' }), traitTable()),
    el('details', { class: 'dv-details' }, el('summary', { text: 'what the levels mean' }), levelGuide()));
}

/* Each trait's written definition of a 1, 2 and 3 (tags.<trait>.levels), with the legends currently at
   each level, so a grade can be checked against its definition. Half steps are listed as they are. */
function levelGuide() {
  const { tags } = state.data;
  const legends = displayOrder();
  return el('div', { class: 'dv-guide' }, Object.entries(tags).map(([k, t]) => {
    const values = [...new Set(legends.map(l => l.tags?.[k] || 0).filter(v => v > 0))].sort((a, b) => a - b);
    const shown = [...new Set([1, 2, 3, ...values])].sort((a, b) => a - b);
    return el('div', { class: 'dv-guide-trait' },
      el('h4', {}, el('i', { class: 'dv-dot', style: `background: ${colourOf(k)}` }), t.label,
        el('span', { class: 'dv-sub', text: ` ×${t.weight ?? 1}` }), ' ', suggest(`${t.label} level definitions`, '', '✎')),
      el('dl', { class: 'dv-dl' }, shown.map(v => {
        const who = legends.filter(l => (l.tags?.[k] || 0) === v).map(l => l.name);
        return [el('dt', { text: String(v) }), el('dd', {},
          t.levels?.[v] ? el('span', { text: t.levels[v] }) : Number.isInteger(v) ? el('span', { class: 'dv-sub', text: 'not defined yet' }) : null,
          el('span', { class: 'dv-sub', text: who.length ? ` Currently: ${who.join(', ')}.` : ' Nobody yet.' }))];
      })));
  }));
}

/* ---------- roles ---------- */
function roles() {
  const legends = displayOrder();
  const best = (l) => { const r = l.roles || {}; const m = Math.max(...ROLES.map(k => r[k] ?? 0)); return m ? ROLES.filter(k => (r[k] ?? 0) === m).join(' / ') : '-'; };
  const counts = ROLES.map(r => `${r}: ${legends.filter(l => (l.roles?.[r] ?? 0) >= 3).length} rated 3, ${legends.filter(l => (l.roles?.[r] ?? 0) === 2).length} rated 2`).join(' · ');
  return [
    el('p', { class: 'meta', text: counts }),
    scroll(el('table', { class: 'dv-table dv-roles' },
      el('thead', {}, el('tr', {}, el('th', { text: 'legend' }), ROLES.map(r => el('th', { text: r })), el('th', { text: 'best at' }), el('th', {}))),
      el('tbody', {}, legends.map(l => el('tr', {},
        el('th', { scope: 'row' }, l.name, el('span', { class: 'dv-sub', text: ` ${l.class}` })),
        ROLES.map(r => {
          const v = l.roles?.[r] ?? 0;
          return el('td', {}, el('span', { class: 'dv-bar' }, el('i', { style: `width: ${(v / 3) * 100}%; background: ${ROLE_COLOUR[r]}` })), el('span', { class: 'dv-num', text: String(v) }));
        }),
        el('td', { class: 'dv-best', text: best(l) }),
        el('td', {}, suggest(`${l.name}'s roles`, ROLES.map(r => `${r} ${l.roles?.[r] ?? 0}`).join(', '), '✎')))))))
  ];
}

/* ---------- maps ---------- */
function maps() {
  const { maps: M, tags, scoring } = state.data;
  const ids = Object.keys(M);
  const legends = displayOrder();
  return [
    scroll(el('table', { class: 'dv-table' },
      el('thead', {}, el('tr', {}, el('th', { text: 'legend' }), ids.map(m => el('th', { text: M[m].name.toLowerCase() })))),
      el('tbody', {}, legends.map(l => el('tr', {},
        el('th', { scope: 'row', text: l.name }),
        ids.map(m => {
          const v = l.maps?.[m] || 0, note = l.mapNotes?.[m];
          return el('td', { style: heat(v, scoring.pairMax), title: note || null, class: note ? 'dv-noted' : null, text: v ? signedNum(v) : '' });
        })))))),
    el('p', { class: 'meta', text: 'Map fit per legend: hand-set, for specific interactions with a map (green helps, red hurts). Cells with a dotted underline have a note: hover to read it.' }),
    el('h3', { class: 'label', text: 'trait-driven lean' }),
    leanTable(),
    el('p', { class: 'meta', text: 'How much each map\'s weight multipliers favour each legend: the sum of level × trait weight × (multiplier − 1). This already happens through the traits, so hand-set fit above is only needed for interactions the traits don\'t capture.' }),
    el('h3', { class: 'label', text: 'map weight multipliers' }),
    scroll(el('table', { class: 'dv-table' },
      el('thead', {}, el('tr', {}, el('th', { text: 'map' }), Object.keys(tags).map(k => el('th', {}, el('span', { class: 'dv-vert', text: k }))))),
      el('tbody', {}, ids.map(m => el('tr', {},
        el('th', { scope: 'row', text: M[m].name }),
        Object.keys(tags).map(k => {
          const x = M[m].weights?.[k];
          return el('td', { style: x ? heat(x > 1 ? 1 : -1, 1.5) : null, text: x ? `×${x}` : '' });
        }))))))
  ];
}

function leanTable() {
  const { maps: M, tags } = state.data;
  const ids = Object.keys(M);
  const lean = (l, m) => Object.entries(M[m].weights || {}).reduce((a, [k, mult]) => a + (l.tags?.[k] || 0) * (tags[k]?.weight ?? 1) * (mult - 1), 0);
  const legends = displayOrder();
  const max = Math.max(...legends.flatMap(l => ids.map(m => Math.abs(lean(l, m))))) || 1;
  return scroll(el('table', { class: 'dv-table' },
    el('thead', {}, el('tr', {}, el('th', { text: 'legend' }), ids.map(m => el('th', { text: M[m].name.toLowerCase() })))),
    el('tbody', {}, legends.map(l => el('tr', {},
      el('th', { scope: 'row', text: l.name }),
      ids.map(m => { const v = Math.round(lean(l, m) * 10) / 10; return el('td', { style: heat(v, max), text: v ? signedNum(v) : '' }); }))))));
}

/* ---------- phases ---------- */
function phases() {
  const { tags } = state.data;
  const legends = displayOrder();
  // a legend's weight in each phase: level × trait weight × the trait's share of that phase (derived shares included)
  const pts = (l, ph) => Object.entries(tags).reduce((a, [k, t]) => {
    let v = l.tags?.[k] || 0;
    for (const [src, f] of Object.entries(t.from || {})) v += f * (l.tags?.[src] || 0);
    return a + v * (t.weight ?? 1) * (t.phases?.[ph] || 0);
  }, 0);
  const max = Math.max(...legends.flatMap(l => PHASES.map(([ph]) => pts(l, ph)))) || 1;
  return [
    scroll(el('table', { class: 'dv-table' },
      el('thead', {}, el('tr', {}, el('th', { text: 'legend' }), PHASES.map(([, label]) => el('th', { text: label })), el('th', { text: 'strongest' }))),
      el('tbody', {}, legends.map(l => {
        const vals = PHASES.map(([ph]) => pts(l, ph));
        const top = Math.max(...vals);
        return el('tr', {},
          el('th', { scope: 'row' }, l.name, el('span', { class: 'dv-sub', text: ` ${l.class}` })),
          vals.map(v => el('td', { style: heat(v, max), text: v ? (Math.round(v * 10) / 10).toString() : '' })),
          el('td', { class: 'dv-best', text: top ? PHASES.filter((_, i) => vals[i] === top).map(([, label]) => label).join(' / ') : '-' }));
      })))),
    el('p', { class: 'meta', text: 'Each legend\'s weight in each phase: level × trait weight × that trait\'s share of the phase. Legends with no strong phase show up as flat rows.' }),
    el('h3', { class: 'label', text: 'how much each trait matters per phase' }),
    scroll(el('table', { class: 'dv-table dv-list' },
      el('thead', {}, el('tr', {}, el('th', { text: 'trait' }), PHASES.map(([, label]) => el('th', { text: label })))),
      el('tbody', {}, Object.entries(tags).map(([k, t]) => el('tr', {},
        el('th', { scope: 'row' }, el('i', { class: 'dv-dot', style: `background: ${colourOf(k)}` }), t.label),
        PHASES.map(([ph]) => { const v = t.phases?.[ph] || 0; return el('td', { style: heat(v, 1), text: v ? String(v) : '' }); })))))),
    el('p', { class: 'meta', text: 'Set per trait in tags.json ("phases"). A comp\'s phase profile in the breakdown is its coverage of the traits that matter in each phase. Phases are descriptive: they don\'t change the score.' })
  ];
}

/* ---------- synergies ---------- */
function synergies() {
  const { synergies: S = [], scoring } = state.data;
  const legends = displayOrder();
  const key = (a, b) => [a, b].sort().join('|');
  const byPair = new Map(S.map(s => [key(...s.pair), s]));
  const name = (id) => state.byId.get(id).name;
  const total = legends.length * (legends.length - 1) / 2;
  const sorted = [...S].sort((a, b) => b.score - a.score || name(a.pair[0]).localeCompare(name(b.pair[0])));
  return [
    el('p', { class: 'meta', text: `${S.length} of ${total} pairs rated (${Math.round((S.length / total) * 100)}%). Unrated pairs count as 0.` }),
    scroll(el('table', { class: 'dv-table dv-matrix' },
      el('thead', {}, el('tr', {}, el('th', {}), legends.map(l => el('th', {}, el('span', { class: 'dv-vert', text: l.name }))))),
      el('tbody', {}, legends.map((a, i) => el('tr', {},
        el('th', { scope: 'row', text: a.name }),
        legends.map((b, j) => {
          if (j === i) return el('td', { class: 'dv-self' });
          const s = byPair.get(key(a.id, b.id));
          return el('td', { style: s ? heat(s.score, scoring.pairMax) : null, title: s ? `${a.name} + ${b.name}: ${signedNum(s.score)}. ${s.note || ''}` : null, text: s ? signedNum(s.score) : '' });
        })))))),
    el('details', { class: 'dv-details' }, el('summary', { text: `every rated pair with its note (${S.length})` }),
      el('ul', { class: 'dv-pairs' }, sorted.map(s => el('li', {},
        el('span', { class: `dv-score ${s.score > 0 ? 'pos' : s.score < 0 ? 'neg' : ''}`, text: signedNum(s.score) || '0' }),
        el('strong', { text: `${name(s.pair[0])} + ${name(s.pair[1])}` }),
        s.note ? ` ${s.note}` : null, ' ', suggest(`${name(s.pair[0])} + ${name(s.pair[1])} synergy`, `${signedNum(s.score) || '0'}${s.note ? `: ${s.note}` : ''}`, '✎')))))
  ];
}

/* ---------- plans ---------- */
function plans() {
  const { plans: P = {}, tags, noPlan } = state.data;
  const chips = (keys, cls) => (keys || []).map(k => el('span', { class: `dv-chip ${cls}`, style: cls === 'core' ? `border-color: ${colourOf(k)}` : null, text: tags[k]?.label.toLowerCase() || k }));
  const feeders = (p) => displayOrder()
    .map(l => ({ l, n: planCore(p).reduce((a, k) => a + (l.tags?.[k] || 0), 0) }))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n || a.l.name.localeCompare(b.l.name)).slice(0, 6)
    .map(x => `${x.l.name} ${x.n}`);
  return [
    el('div', { class: 'dv-plans' }, Object.entries(P).map(([id, p]) => el('article', { class: 'card dv-plan sq' },
      el('h3', {}, p.label, ' ', suggest(`the ${p.label} plan`, p.targets ? `targets ${Object.entries(p.targets).map(([k, n]) => `${k} ${n}`).join(', ')}` : `core ${(p.core || []).join(', ')}`, '✎')),
      p.note ? el('p', { class: 'dv-note', text: p.note }) : null,
      el('p', { class: 'meta', text: [p.ring && `ring: ${p.ring}`, p.wins && `wins by: ${p.wins}`, p.cover && `cover: ${p.cover}`].filter(Boolean).join(' · ') || 'no ring / wins / cover set' }),
      el('dl', { class: 'dv-dl' },
        el('dt', { text: p.targets ? 'targets' : 'core' }), el('dd', {}, p.targets
          ? Object.entries(p.targets).map(([k, n]) => el('span', { class: 'dv-chip core', style: `border-color: ${colourOf(k)}`, text: `${tags[k]?.label.toLowerCase() || k} ${n}` }))
          : chips(p.core, 'core')),
        el('dt', { text: 'support' }), el('dd', {}, chips(p.support, 'support')),
        el('dt', { text: 'tolerates' }), el('dd', {}, chips(p.tolerates, 'tol')),
        el('dt', { text: 'roles' }), el('dd', { text: p.roles ? p.roles.join(', ') : 'one of each' }),
        el('dt', { text: 'punishes' }), el('dd', { text: (p.punishes || []).map(x => P[x]?.label || x).join(', ') || '-' }),
        el('dt', { text: 'risks' }), el('dd', { text: (p.risks || []).join(' ') || '-' }),
        el('dt', { text: 'best fits' }), el('dd', { class: 'meta', title: `Legends with the most levels in ${p.label}'s target traits`, text: feeders(p).join(', ') || '-' }))))),
    el('p', { class: 'meta', text: `No plan: ${noPlan?.label || 'Dodo'}${noPlan?.note ? `. ${noPlan.note}` : ''}. "Best fits" are the legends with the most levels in a plan's core traits.` })
  ];
}

/* ---------- upgrades ---------- */
function upgrades() {
  const { tags, classes } = state.data;
  const tagLine = (u) => Object.entries(u.tags || {}).filter(([, n]) => n > 0).map(([k, n]) => `+${n > 1 ? n + ' ' : ''}${tags[k]?.label.toLowerCase() || k}`)
    .concat(Object.entries(u.grants || {}).map(([c, w]) => `${classes[c]?.label.toLowerCase() || c} perks: ${w === 'all' ? 'all' : w.join(', ')}`)).join(', ');
  const badges = (u) => [u.must && ['must', 'must'], u.unplayable && ['skip', 'skip'], u.unsure && ['?', 'neutral'], u.mode && [u.mode, u.mode]].filter(Boolean)
    .map(([t, c]) => el('span', { class: `badge ${c}`, text: t }));
  const byClass = Object.keys(classes).map(c => [c, displayOrder().filter(l => l.class === c)]);
  const counts = { must: 0, skip: 0, unsure: 0 };
  for (const l of state.data.legends) for (const u of Object.values(l.upgrades || {}).flat()) { if (u.must) counts.must++; if (u.unplayable) counts.skip++; if (u.unsure) counts.unsure++; }
  return [
    el('p', { class: 'meta', text: `${counts.must} must-picks, ${counts.skip} marked skip, ${counts.unsure} still unsure (?).` }),
    byClass.map(([c, legends]) => el('details', { class: 'dv-details' },
      el('summary', { text: `${classes[c].label.toLowerCase()} (${legends.length})` }),
      scroll(el('table', { class: 'dv-table dv-ups' },
        el('thead', {}, el('tr', {}, el('th', { text: 'legend' }), el('th', { text: 'level' }), el('th', { text: 'option a' }), el('th', { text: 'option b' }))),
        el('tbody', {}, legends.flatMap(l => Object.entries(l.upgrades || {}).map(([lv, opts], n) => el('tr', {},
          n === 0 ? el('th', { scope: 'row', rowspan: String(Object.keys(l.upgrades).length), text: l.name }) : null,
          el('td', { class: 'dv-sub', text: `lv${lv}` }),
          opts.map(u => el('td', {},
            el('span', { class: 'dv-up-name' }, u.name, badges(u)),
            el('span', { class: 'dv-up-effect', text: u.effect || '' }),
            tagLine(u) ? el('span', { class: 'dv-up-tags', text: tagLine(u) }) : null))))))))))
  ];
}

/* ---------- weights, classes, settings, known comps ---------- */
function weights() {
  const { tags, classes, scoring, comps = [] } = state.data;
  return [
    scroll(el('table', { class: 'dv-table dv-list' },
      el('thead', {}, el('tr', {}, el('th', { text: 'trait' }), el('th', { text: 'weight' }), el('th', { text: 'derived from' }), el('th', { text: 'shown when missing' }))),
      el('tbody', {}, Object.entries(tags).map(([k, t]) => el('tr', {},
        el('th', { scope: 'row' }, el('i', { class: 'dv-dot', style: `background: ${colourOf(k)}` }), t.label),
        el('td', { text: String(t.weight ?? 1) }),
        el('td', { text: t.from ? Object.entries(t.from).map(([s, f]) => `${f} × ${s}`).join(', ') : '' }),
        el('td', { class: 'dv-sub', text: t.missing || '' })))))),
    el('h3', { class: 'label', text: 'class perks' }),
    el('ul', { class: 'dv-perks' }, Object.entries(classes).map(([, c]) => el('li', {},
      el('strong', { text: c.label }), ': ',
      (c.perks || []).map((p, i) => [i ? ' · ' : '', p.name, p.tags && Object.keys(p.tags).length ? el('span', { class: 'dv-sub', text: ` (+${Object.entries(p.tags).map(([k, n]) => `${n > 1 ? n + ' ' : ''}${k}`).join(', ')})` }) : null])))),
    el('h3', { class: 'label', text: 'known comps' }),
    comps.length ? el('ul', { class: 'dv-perks' }, comps.map(c => el('li', {}, el('span', { class: `badge ${c.label.toLowerCase() === 'algs' ? 'algs' : 'neutral'}`, text: c.label }), ' ',
      listText(c.legends.map(id => state.byId.get(id)?.name || id)), c.note ? el('span', { class: 'dv-sub', text: ` ${c.note}` }) : null)))
      : el('p', { class: 'meta', text: 'None listed.' }),
    el('h3', { class: 'label', text: 'scoring settings' }),
    el('p', { class: 'meta dv-settings', text: Object.entries(scoring).map(([k, v]) => `${k} ${v && typeof v === 'object' ? Object.entries(v).map(([a, b]) => `${a} ${b}`).join(', ') || '-' : v}`).join(' · ') })
  ];
}

/* ---------- popularity (solo-queue page) ---------- */
function popularity() {
  const pop = state.data.popularity;
  if (!pop?.pickRate) return [el('p', { class: 'meta', text: 'No popularity.json listed in index.json: the solo-queue page treats every legend as equally likely.' })];
  const rows = Object.entries(pop.pickRate).sort((a, b) => b[1] - a[1]);
  const top = rows[0]?.[1] || 1;
  return [
    el('p', { class: 'meta', text: [pop.source, pop.checked && `checked ${pop.checked}`, pop.note].filter(Boolean).join(' · ') }),
    scroll(el('table', { class: 'dv-table dv-roles dv-pop' },
      el('thead', {}, el('tr', {}, el('th', { text: 'legend' }), el('th', { text: 'share of players' }))),
      el('tbody', {}, rows.map(([id, n]) => el('tr', {},
        el('th', { scope: 'row', text: state.byId.get(id)?.name || id }),
        el('td', {}, el('span', { class: 'dv-bar' }, el('i', { style: `width: ${(n / top * 100).toFixed(1)}%; background: var(--trim)` })), el('span', { class: 'dv-num', text: `${n}%` })))))))
  ];
}

/* ---------- load ---------- */
async function load() {
  let d, problems;
  try {
    ({ d, problems } = await loadData());
  } catch (e) {
    $('#data-status').textContent = `Couldn't load the data: ${e.message}`;
    return;
  }
  if (!d) { $('#data-status').textContent = problems.join(' · '); return; }
  if (!problems.length) problems = validate(d);
  $('#data-status').replaceChildren(problems.length
    ? el('span', { class: 't-err', text: `${problems.length} problem${problems.length > 1 ? 's' : ''} in the data (the analyser won't load until they're fixed): ${problems.join(' · ')}` })
    : el('span', { text: 'Data checks out: no validation problems.' }));
  if (!Array.isArray(d.legends) || !d.tags || !d.classes) return;

  d.scoring = { ...SCORING_DEFAULTS, ...d.scoring };
  d.maps ||= {};
  state.data = d;
  for (const l of d.legends) state.byId.set(l.id, l);
  const m = d.meta || {};
  $('#data-meta').textContent = [m.season, m.updated && `data updated ${m.updated}`, `${d.legends.length} legends`].filter(Boolean).join(' · ');

  const sections = [
    ['traits', 'traits', 'What each legend brings. These drive most of a comp\'s score.', [el('div', { id: 'traits-body', class: 'dv-stack' })]],
    ['roles', 'roles', 'How well each legend fills each fight role, 0–3.', roles()],
    ['plans', 'plans', 'The comp styles and what each one needs.', plans()],
    ['phases', 'phases', 'Where each legend shines: early (off the drop), mid (rotations) or late (final rings).', phases()],
    ['synergies', 'synergies', 'Pair ratings. Read a row across to see one legend\'s partners; hover a cell for the note.', synergies()],
    ['maps', 'maps', null, maps()],
    ['upgrades', 'upgrades', 'Every upgrade option, with the traits it adds and its markers.', upgrades()],
    ['weights', 'weights', 'Trait weights, class perks, known comps and the scoring settings.', weights()],
    ['popularity', 'popularity', 'How often each legend is played. Only the solo-queue page uses it, to guess what teammates will pick; it isn\'t part of any score.', popularity()]
  ];
  $('#dv-nav').replaceChildren(...sections.map(([id, t]) => el('a', { href: `#${id}`, text: t })));
  $('#dv').replaceChildren(...sections.map(([id, t, intro, body]) => section(id, t, intro, body)));
  renderTraits();
}

load();
