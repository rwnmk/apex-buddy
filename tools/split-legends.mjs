// Splits data/legends.json (everything in one file) into the files listed in data/index.json.
//
//   node tools/split-legends.mjs [path/to/legends.json] [out/dir]
//
// Defaults: data/legends.json → data/. Run from the repo root. It's a one-off migration, safe to rerun:
// it overwrites the split files from legends.json each time. The current legend order becomes the
// frozen codeOrder (player codes and links decode through it), so run it on the same legends.json the
// live site has been using. The split files then list legends by class and name.

import fs from 'node:fs';
import path from 'node:path';
import { SCORING_DEFAULTS } from '../js/core.js';

const src = process.argv[2] || 'data/legends.json';
const out = process.argv[3] || 'data';
const d = JSON.parse(fs.readFileSync(src, 'utf8'));
const codeOrder = d.codeOrder || d.legends.map(l => l.id);   // frozen before reordering
// the files list legends by class (in the order "classes" lists them), then by name, like the page does
const classOrder = Object.keys(d.classes || {});
d.legends = [...d.legends].sort((a, b) => classOrder.indexOf(a.class) - classOrder.indexOf(b.class) || a.name.localeCompare(b.name));

/* JSON laid out for reading and diffing: anything that fits in ~100 characters stays on one line,
   and from depth `flatAt` down everything is one line (so each synergy, upgrade option or known comp
   is a single line). */
function flat(value) {
  if (Array.isArray(value)) return `[${value.map(flat).join(', ')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${flat(v)}`).join(', ')}}`;
  return JSON.stringify(value);
}
function pretty(value, flatAt = Infinity, depth = 0, indent = '') {
  const one = flat(value);
  if (typeof value !== 'object' || value === null || depth >= flatAt || one.length + indent.length <= 100) return one;
  const next = indent + '  ';
  if (Array.isArray(value)) return `[\n${value.map(v => next + pretty(v, flatAt, depth + 1, next)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(value).map(([k, v]) => `${next}${JSON.stringify(k)}: ${pretty(v, flatAt, depth + 1, next)}`).join(',\n')}\n${indent}}`;
}
const write = (file, text) => { fs.writeFileSync(path.join(out, file), text.endsWith('\n') ? text : text + '\n'); console.log('wrote', path.join(out, file)); };
const writeJson = (file, value, flatAt) => write(file, pretty(value, flatAt));

const tagKeys = Object.keys(d.tags || {});
const roleKeys = ['entry', 'secondary', 'anchor'];
const csv = (columns, field) => [
  ['legend', ...columns].join(','),
  ...d.legends.map(l => [l.id, ...columns.map(c => (l[field]?.[c] ?? ''))].join(','))
].join('\n');

const files = {
  kits: 'kits.json', upgrades: 'upgrades.json', traits: 'traits.csv', roles: 'roles.csv', tags: 'tags.json',
  maps: 'maps.json', synergies: 'synergies.json', plans: 'plans.json', comps: 'comps.json', scoring: 'scoring.json',
  ...(d.players ? { players: 'players.json' } : {})
};

writeJson('index.json', { meta: d.meta, codeOrder, files });
writeJson('kits.json', {
  classes: d.classes,
  legends: d.legends.map(({ id, name, class: cls, kit, strengths, weaknesses, notes }) => ({ id, name, class: cls, kit, strengths, weaknesses, notes }))
});
writeJson('upgrades.json', Object.fromEntries(d.legends.filter(l => l.upgrades).map(l => [l.id, l.upgrades])), 3);
write('traits.csv', csv(tagKeys, 'tags'));
write('roles.csv', csv(roleKeys, 'roles'));
writeJson('tags.json', d.tags);
writeJson('maps.json', {
  maps: d.maps,
  fit: Object.fromEntries(d.legends.filter(l => l.maps && Object.keys(l.maps).length).map(l => [l.id, l.maps])),
  notes: Object.fromEntries(d.legends.filter(l => l.mapNotes && Object.keys(l.mapNotes).length).map(l => [l.id, l.mapNotes]))
});
writeJson('synergies.json', d.synergies || [], 1);
writeJson('plans.json', { plans: d.plans || {}, ...(d.noPlan ? { noPlan: d.noPlan } : {}) });
writeJson('comps.json', d.comps || [], 1);
// every scoring number, including the code defaults the old file didn't set, so the data alone decides the score
writeJson('scoring.json', { ...SCORING_DEFAULTS, ...d.scoring });
if (d.players) writeJson('players.json', d.players);
