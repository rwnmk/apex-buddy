/* Data loading. The data lives in several files in data/, listed in data/index.json and split by kind:
   facts (kits.json, upgrades.json), opinions (traits.csv, roles.csv, synergies.json, plans.json,
   comps.json), settings (tags.json, maps.json, scoring.json) and the solo-queue page's
   legend popularity (popularity.json). This assembles them into one object,
   the shape the rest of the code uses. Without an index.json, data/legends.json (everything in one
   file, as before the split) is used instead.

   loadData(read) takes read(path) → Promise<text | null> (null = file not found), so the same code
   runs in the browser (fetch) and in Node scripts (fs). Returns { d, problems }: problems are about
   the files themselves (parse errors, unknown legends or columns); validate(d) checks the content. */

export const DATA_DIR = 'data/';
// data/ sits beside js/, so pages in subfolders (comp/, solo/) find it too
const DATA_URL = new URL('../' + DATA_DIR, import.meta.url);

export const fetchText = async (path) => {
  const res = await fetch(new URL(path, DATA_URL), { cache: 'no-cache' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${DATA_DIR}${path}`);
  return res.text();
};

/* CSV grid: a header row (legend, then one column per trait or role), then one row per legend id.
   Blank cells mean "not set". Lines starting with # are comments. No quoting: values are ids and numbers. */
export function parseCsv(text, file, problems) {
  const lines = text.split(/\r?\n/).map((s, i) => [s.trim(), i + 1]).filter(([s]) => s && !s.startsWith('#'));
  if (!lines.length) return { columns: [], rows: [] };
  const header = lines[0][0].split(',').map(s => s.trim());
  if (header[0] !== 'legend') problems.push(`${file}: the first column should be "legend".`);
  const columns = header.slice(1);
  const rows = lines.slice(1).map(([s, line]) => {
    const cells = s.split(',').map(c => c.trim());
    if (cells.length > header.length) problems.push(`${file} line ${line}: more cells than columns.`);
    const values = {};
    columns.forEach((col, i) => {
      const cell = cells[i + 1] ?? '';
      if (cell === '') return;
      const n = Number(cell);
      if (Number.isNaN(n)) problems.push(`${file} line ${line}, column ${col}: "${cell}" isn't a number.`);
      else values[col] = n;
    });
    return { id: cells[0], values, line };
  });
  return { columns, rows };
}

export async function loadData(read = fetchText) {
  const problems = [];
  const json = (text, file) => {
    try { return JSON.parse(text); } catch (e) { problems.push(`${file} is not valid JSON: ${e.message}`); return null; }
  };

  const indexText = await read('index.json');
  if (indexText == null) {
    const text = await read('legends.json');
    if (text == null) throw new Error(`Found neither ${DATA_DIR}index.json nor ${DATA_DIR}legends.json.`);
    const d = json(text, 'legends.json');
    if (d && Array.isArray(d.legends) && !d.codeOrder) d.codeOrder = d.legends.map(l => l?.id);
    return { d, problems };
  }

  const index = json(indexText, 'index.json');
  if (!index) return { d: null, problems };
  const files = index.files || {};
  const texts = {};
  await Promise.all(Object.entries(files).map(async ([k, path]) => {
    texts[k] = await read(path);
    if (texts[k] == null) problems.push(`index.json lists ${path} (${k}), but it wasn't found.`);
  }));
  const get = (k) => (texts[k] == null ? undefined : files[k].endsWith('.csv') ? parseCsv(texts[k], files[k], problems) : json(texts[k], files[k]));

  const kits = get('kits') || {};
  const tags = get('tags') || {};
  const legends = (kits.legends || []).map(l => ({ ...l }));
  const byId = new Map(legends.map(l => [l?.id, l]));
  const forLegend = (file, id, line) => {
    const l = byId.get(id);
    if (!l) problems.push(`${file}${line ? ` line ${line}` : ''}: unknown legend "${id}".`);
    return l;
  };

  // grids: traits.csv → legend.tags, roles.csv → legend.roles
  for (const [k, field, known] of [['traits', 'tags', Object.keys(tags)], ['roles', 'roles', ['entry', 'secondary', 'anchor']]]) {
    const grid = get(k);
    if (!grid) continue;
    for (const col of grid.columns) if (!known.includes(col)) problems.push(`${files[k]}: unknown column "${col}".`);
    for (const row of grid.rows) { const l = forLegend(files[k], row.id, row.line); if (l) l[field] = row.values; }
  }
  for (const [id, ups] of Object.entries(get('upgrades') || {})) { const l = forLegend(files.upgrades, id); if (l) l.upgrades = ups; }
  const maps = get('maps') || {};
  for (const [id, fit] of Object.entries(maps.fit || {})) { const l = forLegend(files.maps, id); if (l) l.maps = fit; }
  for (const [id, notes] of Object.entries(maps.notes || {})) { const l = forLegend(files.maps, id); if (l) l.mapNotes = notes; }
  const plans = get('plans') || {};

  const d = {
    meta: index.meta,
    codeOrder: index.codeOrder,
    scoring: get('scoring'),
    classes: kits.classes,
    tags,
    maps: maps.maps,
    plans: plans.plans,
    noPlan: plans.noPlan,
    comps: get('comps'),
    synergies: get('synergies'),
    players: get('players'),
    popularity: get('popularity'),
    legends
  };
  for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
  return { d, problems };
}
