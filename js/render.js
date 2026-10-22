/* Rendering: one function per page block. */

import { $, compKey, displayOrder, el, GENERALIST, grantText, LEVELS, levelText, listText, nameOf, PHASES, planCore, PLAYERS, PREF_GLYPH, PREF_LABEL, PREFS, RANK_LABEL, roleRanks, ROLES, signed, SLOTS, state, tagText, UP_MODES } from './core.js';
import { activePins, analyse, bestBuild, findSwaps, thirdAdds, mapFit, pinText, playable, prefOf, seat, seatedIndex, settingsKey, shownScore, srcLabel, verdict } from './model.js';
import { characterise, planLabel, planText, sectionLabel, tolerated } from './summary.js';
import { playerCode, writeHash } from './links.js';
import { addPlayer, confirmThen, copyText, cyclePref, cycleRoleRank, importPlayers, pick, pickIn, clearSelection, select, setView, toggleMore, removePlayer, renamePlayer, setMap, setPin, setPlan, setSwapMode, setTune, setUpgrade, swapLegend, toggleLock, toggleSquad } from './actions.js';

export function renderAll() {
  renderRoster();
  renderTune();
  renderLock();
  renderResults();
  renderAnalysis();
}

const block = (title, ...kids) => el('div', { class: 'block' }, typeof title === 'string' ? el('h3', { class: 'label block-title', text: title }) : title, ...kids);
const blockHead = (title, ...right) => el('div', { class: 'block-head' }, el('h3', { class: 'label', text: title }), el('div', { class: 'head-actions' }, ...right));
const smallBtn = (text, onclick, attrs = {}) => el('button', { type: 'button', class: 'btn-term btn-sm', text, onclick, ...attrs });

/* ---- 1. players ---- */

export function prefButton(btn, player, l, pref) {
  btn.className = `pref pref-${pref}`;
  btn.textContent = PREF_GLYPH[pref];
  btn.title = PREF_LABEL[pref];
  btn.setAttribute('aria-label', `${player.name}: ${l.name}, ${PREF_LABEL[pref]}. Select to change.`);
  return btn;
}

/* table: false re-renders only the player list and leaves the legend table alone. */
export function renderRoster({ table = true } = {}) {
  const { legends, classes } = state.data;
  const counts = (p) => PREFS.filter(k => k !== 'can').map(k => `${PREF_GLYPH[k]} ${legends.filter(l => p.prefs[l.id] === k).length}`).join('  ');

  const rows = state.library.map((p, i) => {
    const seatNo = state.squad.indexOf(i);
    const on = seatNo !== -1;
    return el('li', { class: `lib-row${on ? ' on' : ''}` },
      el('button', {
        type: 'button', class: 'lib-seat', 'aria-pressed': String(on),
        'aria-label': `${p.name} playing`,
        title: on ? 'playing' : 'sitting out', text: on ? String(seatNo + 1) : '–',
        onclick: () => toggleSquad(i)
      }),
      el('input', {
        type: 'text', class: 'roster-input', value: p.name, maxlength: '16', spellcheck: 'false', 'aria-label': 'Player name',
        onchange: (e) => renamePlayer(i, e.target.value)
      }),
      el('span', { class: 'lib-mid' },
        el('span', { class: 'meta lib-counts', text: counts(p) }),
        el('span', { class: 'lib-roles', role: 'group', 'aria-label': `${p.name}'s preferred roles` },
          ROLES.map(r => {
            const rank = p.roles?.[r] ?? 1;
            return el('button', {
              type: 'button', class: `role-rank${roleRanks(p) ? ` r${rank}` : ''}`, 'data-role-rank': `${i}-${r}`,
              'aria-label': `${r}: ${roleRanks(p) ? RANK_LABEL[rank] + ' choice' : 'no preference'}. ${!roleRanks(p) ? 'Select to make it your 1st choice.' : rank === 1 ? 'Select to clear your role preferences.' : rank === 2 ? 'Select to make it your 3rd choice.' : 'Select to make it your 2nd choice.'}`,
              title: !roleRanks(p) ? 'make this your 1st choice' : rank === 1 ? 'clear role preferences' : rank === 2 ? 'drop to 3rd' : 'lift to 2nd',
              text: `${r} ${roleRanks(p) ? RANK_LABEL[rank] : 'any'}`, onclick: () => cycleRoleRank(i, r)
            });
          }))),
      el('span', { class: 'head-actions' },
        smallBtn('copy code', (e) => copyText(e.currentTarget, playerCode(p), 'copy code'), { title: 'Copy this player\'s picks to paste elsewhere' }),
        smallBtn('remove', (e) => confirmThen(e.currentTarget, () => removePlayer(i)), { 'aria-label': `Remove ${p.name}` }))
    );
  });

  const paste = el('input', {
    type: 'text', class: 'roster-input lib-paste', placeholder: 'paste player codes or a share link', spellcheck: 'false', 'aria-label': 'Player codes to import',
    onkeydown: (e) => { if (e.key === 'Enter') importPlayers(e.target.value); }
  });
  $('#roster-names').replaceChildren(
    state.library.length ? el('ol', { class: 'lib' }, rows) : el('p', { class: 'meta', text: 'No players saved yet. Add one, or paste codes from your squad.' }),
    el('p', { class: 'meta', id: 'lib-status', 'aria-live': 'polite', text: `Playing: ${state.squad.length}/${PLAYERS}${state.squad.length < PLAYERS ? ` (empty seats play anything)` : ''}` }),
    el('div', { class: 'lib-actions' },
      smallBtn('add player', addPlayer),
      state.library.length ? smallBtn('copy all codes', (e) => copyText(e.currentTarget, state.library.map(playerCode).join('\n'), 'copy all codes')) : null,
      paste,
      smallBtn('import', () => importPlayers(paste.value)))
  );
  if (!table) return;

  const seated = state.roster.players.filter(p => !p.filler);
  $('#roster-table').replaceChildren(...(seated.length ? [
    el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: 'legend' }), seated.map(p => el('th', { scope: 'col', text: p.name })))),
    el('tbody', {}, displayOrder().map((l, n, all) => [
      n === 0 || all[n - 1].class !== l.class
        ? el('tr', { class: 'class-row' }, el('th', { scope: 'colgroup', colspan: String(seated.length + 1), text: classes[l.class].label.toLowerCase() }))
        : null,
      el('tr', {},
        el('th', { scope: 'row', text: l.name }),
        seated.map((p, i) => el('td', {},
          prefButton(el('button', { type: 'button', 'data-pref': `${i}-${l.id}`, onclick: () => cyclePref(i, l.id) }), p, l, prefOf(i, l.id))))
      )
    ]))
  ] : [el('caption', { class: 'meta', text: 'Select who is playing to edit their picks.' })]));
}

/* ---- 2. tune ---- */

export function renderTune() {
  const { maps, tags } = state.data;
  const chip = (id, label) => el('button', {
    type: 'button', class: 'tagchip sq', 'aria-pressed': String(state.map === id), text: label, onclick: () => setMap(id)
  });
  $('#map-chips').replaceChildren(chip(null, 'any'), ...Object.entries(maps).map(([id, m]) => chip(id, m.name.toLowerCase())));

  const m = state.map && maps[state.map];
  const favours = m ? Object.entries(m.weights || {}).sort((a, b) => b[1] - a[1])
    .map(([k, x]) => `${tags[k].label.toLowerCase()} ×${x}`).join(' · ') : '';
  $('#map-blurb').textContent = m ? `${m.blurb}${favours ? ` Weights: ${favours}.` : ''}` : 'No map: traits use their normal weights and map fit is ignored.';
  renderPlans();

  $('#tune-grid').replaceChildren(...state.W.keys.map((k, i) => {
    const cur = state.tune[k] || 'normal';
    const seg = (level, glyph, label) => el('button', {
      type: 'button', class: 'seg', 'aria-pressed': String(cur === level), 'data-tune': `${k}-${level}`,
      'aria-label': `${tags[k].label}: ${label}`, text: glyph, onclick: () => setTune(k, level)
    });
    return el('div', { class: `tune-row${cur !== 'normal' ? ' changed' : ''}` },
      el('span', { class: 'tune-name', text: tags[k].label }),
      el('span', { class: 'segs', role: 'group', 'aria-label': `${tags[k].label} priority` },
        seg('low', '−', 'lower'), seg('normal', '·', 'normal'), seg('high', '+', 'raise')),
      el('span', { class: 'tune-w', title: 'effective weight', text: '×' + +state.W.w[i].toFixed(2) })
    );
  }));
}

/* Plan chips, added under the map chips (index.html stays as it is). */
function renderPlans() {
  const { plans } = state.data;
  if (!plans || !Object.keys(plans).length) return;
  if (!$('#plan-chips'))
    $('#map-chips').parentElement.after(el('div', { class: 'stack-sm' },
      el('h3', { class: 'label', text: 'plan' }),
      el('div', { class: 'tags', id: 'plan-chips', role: 'group', 'aria-label': 'Plan' }),
      el('p', { class: 'meta', id: 'plan-blurb' })));
  const chip = (id, label) => el('button', {
    type: 'button', class: 'tagchip sq', 'aria-pressed': String(state.plan === id), text: label, onclick: () => setPlan(id)
  });
  $('#plan-chips').replaceChildren(chip(null, 'any'), chip(GENERALIST, 'generalist'), ...Object.entries(plans).map(([id, p]) => chip(id, p.label.toLowerCase())));
  const p = state.plan && plans[state.plan];
  $('#plan-blurb').textContent = p
    ? [p.note, planText(p), `Results show the ${p.label} section: comps that can play it, scored as a ${p.label}.`].filter(Boolean).join(' ')
    : state.plan === GENERALIST ? 'Generalist: comps judged on overall coverage, without a plan.'
    : 'Any plan: results show the best core of every section; pick one to see the whole section.';
}

export function renderLock() {
  const { classes } = state.data;
  $('#lock-summary').textContent = state.locked.length ? `(${state.locked.map(nameOf).join(', ')})` : '';
  $('#slots').replaceChildren(...Array.from({ length: SLOTS }, (_, i) => {
    const id = state.locked[i];
    const l = id ? state.byId.get(id) : null;
    return el('li', { class: `slot sq${l ? ' filled' : ''}` },
      el('div', { class: 'slot-main' },
        el('span', { class: 'slot-num', text: `0${i + 1}` }),
        el('span', { class: `slot-name${l ? '' : ' slot-empty'}`, text: l ? l.name : '—' }),
        l && el('span', { class: 'slot-class', text: classes[l.class].label }),
        l && pinRow(id)),
      l && el('button', { type: 'button', class: 'slot-x', 'aria-label': `Unlock ${l.name}`, text: '×', onclick: () => toggleLock(id) })
    );
  }));

  const q = state.query.trim().toLowerCase();
  const shown = displayOrder()
    .filter(l => !state.classFilter || l.class === state.classFilter)
    .filter(l => !q || l.name.toLowerCase().includes(q) || l.id.includes(q) || classes[l.class].label.toLowerCase().includes(q));
  if (!shown.length) return $('#picker').replaceChildren(el('p', { class: 'picker-empty', text: 'no legends match' }));
  $('#picker').replaceChildren(...shown.map(l => {
    const ok = playable(l.id);
    return el('button', {
      type: 'button', class: `pick sq${ok ? '' : ' nobody'}`, 'aria-pressed': String(state.locked.includes(l.id)),
      title: ok ? null : 'Nobody on the roster plays this legend',
      onclick: () => toggleLock(l.id)
    },
      el('span', { class: 'pick-name', text: l.name }),
      el('span', { class: 'pick-class', text: classes[l.class].label }));
  }));
}

/* A known-comp badge (from "comps" in the data) for these legends, or null. ALGS is red. */
function compBadge(ids) {
  const c = state.comps.get(compKey(ids));
  if (!c) return null;
  return el('span', { class: `badge ${c.label.toLowerCase() === 'algs' ? 'algs' : 'neutral'}`, title: c.note || `${c.label} comp`, text: c.label });
}

/* "played by" chips in a filled lock slot: anyone, then each ticked player who doesn't mark the
   legend ×. A pin whose player isn't ticked stays, shown as not playing. */
function pinRow(id) {
  const pin = state.pins[id] || null;
  const isPin = (name) => !!pin && pin.toLowerCase() === name.toLowerCase();
  // The pinned player keeps their chip even after marking the legend ×, so the pin stays visible.
  const players = state.roster.players.map((p, i) => ({ p, i })).filter(({ p, i }) => !p.filler && (prefOf(i, id) !== 'no' || isPin(p.name)));
  const asleep = pin && seatedIndex(pin) === -1;
  const chip = (label, name, extra = '') => el('button', {
    type: 'button', class: `tagchip sq pin-chip${extra}`, text: label,
    'aria-pressed': String(name ? isPin(name) : !pin),
    onclick: () => setPin(id, name)
  });
  return el('div', { class: 'slot-pin', role: 'group', 'aria-label': `${nameOf(id)} played by`, 'data-pin': id },
    el('span', { class: 'pin-label', text: 'played by' }),
    chip('anyone', null),
    players.map(({ p, i }) => chip(prefOf(i, id) === 'no' ? `${p.name}, doesn't play it` : p.name, p.name)),
    asleep ? chip(`${pin}, not playing`, pin, ' asleep') : null);
}

export function renderFilters() {
  const mk = (key, label) => el('button', {
    type: 'button', class: 'tagchip sq', 'aria-pressed': String(state.classFilter === key), text: label,
    onclick: () => { state.classFilter = key; renderFilters(); renderLock(); }
  });
  $('#class-filters').replaceChildren(mk(null, 'all'), ...Object.entries(state.data.classes).map(([k, c]) => mk(k, c.label.toLowerCase())));
}

/* ---- 3. generate ---- */

function seatingLine(ids, seating, roles) {
  if (!seating) return el('span', { class: 't-err', text: "this comp can't be seated on your roster" });
  const showRoles = roles && ids.some(id => state.byId.get(id).roles);
  return el('span', { class: 'seats' }, ids.map((id, i) => {
    const comfort = seating.comfy[i];
    const ok = seating.roleOk?.[i];
    return [i ? ' · ' : '', el('span', { class: comfort || ok ? 'seat-comfort' : null, text: `${seating.names[i]} → ${nameOf(id)}${showRoles ? ` (${roles[i]}${ok ? ' ✓' : ''})` : ''}${comfort ? ' ★' : ''}` })];
  }));
}

/* The comp's plan as a badge: its best plan, or Dodo with none. */
function planBadge(j) {
  if (!state.data.plans || !j) return null;
  return el('span', { class: `badge ${j.plan ? 'plan' : 'dodo'}`, text: planLabel(j.plan) });
}

export function renderResults() {
  const out = $('#results');
  const r = state.results;
  if (!r) {
    renderSelbar();
    $('#gen-log').replaceChildren();
    return out.replaceChildren(el('p', { class: 'meta', text: 'Set up players and priorities, then generate.' }));
  }
  const stale = r.key !== settingsKey();
  const bonus = state.data.scoring.comfortBonus;
  const chosenKey = state.chosen ? state.chosen.ids.join() : null;
  renderSelbar();
  if (r.sections) return out.replaceChildren(...[
    stale ? el('p', { class: 'stale', text: 'Settings changed since these were generated. Generate again to update.' }) : null,
    ...sectionsView(r)
  ].filter(Boolean));
  out.replaceChildren(...[
    stale ? el('p', { class: 'stale', text: 'Settings changed since these were generated. Generate again to update.' }) : null,
    !r.worst && r.list.length && bonus ? el('p', { class: 'meta rank-note', text: `Ranked by score, plus ${bonus} for each ★ comfort pick${state.roster.players.some(roleRanks) ? ` and up to ${state.data.scoring.roleBonus} for each player in a preferred role (✓)` : ''}.` }) : null,
    r.worst && r.list.length ? el('p', { class: 'worst-note', text: `The worst comp your squad can actually field, with the least useful upgrades, plus two runners-up. Pick it for the full breakdown.` }) : null,
    r.list.length ? el('ol', { class: 'suggs' }, r.list.map((x, i) => {
      const on = x.ids.join() === chosenKey;
      const fits = x.ids.map(mapFit);
      return el('li', { class: `sugg${on ? ' on' : ''}` },
        el('span', { class: 'sugg-score' }, String(shownScore(x.score)),
          !r.worst && x.seating.bonus > 0 ? el('span', {
            class: 'sugg-comfort', title: `${x.seating.comfort} comfort pick${x.seating.comfort === 1 ? '' : 's'}, ${x.seating.roleOk.filter(Boolean).length} in a preferred role: ranked as ${Math.round(x.rank)}`,
            text: `${'★'.repeat(x.seating.comfort)}${'✓'.repeat(x.seating.roleOk.filter(Boolean).length)} +${+x.seating.bonus.toFixed(1)}`
          }) : null),
        el('div', { class: 'sugg-body' },
          el('span', { class: 'sugg-names' }, x.ids.map((id, j) => [
            j ? el('span', { class: 'sugg-plus', text: ' + ' }) : null,
            el('span', { class: state.locked.includes(id) ? 'sugg-locked' : 'sugg-new', text: nameOf(id) }),
            state.map && fits[j] ? el('span', { class: fits[j] > 0 ? 'fit-up' : 'fit-down', title: `map fit ${fits[j] > 0 ? '+' : ''}${fits[j]}`, text: fits[j] > 0 ? '▲' : '▼' }) : null
          ]), compBadge(x.ids), planBadge(x.judge)),
          el('span', { class: 'sugg-ups' }, seatingLine(x.ids, x.seating, x.judge?.roles))
        ),
        el('button', {
          type: 'button', class: 'btn-term btn-sm', 'aria-pressed': String(on), text: on ? 'picked' : 'pick',
          'aria-label': `Pick suggestion ${i + 1}: ${x.ids.map(nameOf).join(', ')}`, onclick: () => pick(x)
        })
      );
    })) : el('p', { class: 't-err', text: state.locked.length && !seat(state.locked) ? `The locked legends can't be seated on your roster${pinText().length ? ` with ${listText(pinText())}` : ''}.` : 'No comps fit these settings. Loosen the roster or unlock a legend.' })
  ].filter(Boolean));
}

/* Results as sections: the overview (each section's best core) or one section's cores. Each core is a
   card: the pair, its flex slot as classes, and one chip per third legend in rank order (score + seating
   bonus, so comfort picks come first). A chip selects the comp into the selection bar; "analyse" there
   picks it. Tabs and "explore" only change the view; picking sets the lens. */
const classOf = (id) => state.data.classes[state.byId.get(id).class].label;
const orText = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
const sameComp = (a, b) => !!a && !!b && a.lens === b.lens && a.x.ids.join() === b.x.ids.join();
const fitMark = (id) => {
  const f = mapFit(id);
  return state.map && f ? el('span', { class: f > 0 ? 'fit-up' : 'fit-down', title: `map fit ${f > 0 ? '+' : ''}${f}`, text: f > 0 ? '▲' : '▼' }) : null;
};
const marks = (seating) => `${'★'.repeat(seating.comfort)}${'✓'.repeat(seating.roleOk.filter(Boolean).length)}`;
const seatText = (x) => x.ids.map((id, i) => `${x.seating.names[i]} → ${nameOf(id)}${x.roles?.[i] ? ` (${x.roles[i]})` : ''}${x.seating.comfy[i] ? ' ★' : ''}`).join(' · ');

function sectionsView(r) {
  const sections = r.sections.filter(s => s.id === GENERALIST || state.data.plans?.[s.id]);
  const viewId = state.view === undefined ? state.plan : state.view;
  const cur = sections.find(s => s.id === viewId) || null;
  const { comfortBonus, roleBonus } = state.data.scoring;
  const tabs = el('div', { class: 'tags sect-tabs', role: 'group', 'aria-label': 'Results section' },
    [{ id: null, label: 'overview', count: null }, ...sections.map(s => ({ id: s.id, label: sectionLabel(s.id).toLowerCase(), count: s.count }))]
      .map(t => el('button', { type: 'button', class: 'tagchip sq', 'aria-pressed': String((cur?.id ?? null) === t.id), onclick: () => setView(t.id) },
        t.label, t.count != null ? el('span', { class: 'sect-count', text: ` ${t.count}` }) : null)));
  const note = el('p', { class: 'meta rank-note', text: `${cur ? '' : 'The best core of each section. '}A core is two legends; its chips are third legends in rank order: score, plus ${comfortBonus} for each ★ comfort pick${state.roster.players.some(roleRanks) ? ` and up to ${roleBonus} for each player in a preferred role (✓)` : ''}. Select one to compare, then analyse it.` });
  const empty = () => el('p', { class: 't-err', text: state.locked.length && !seat(state.locked) ? `The locked legends can't be seated on your roster${pinText().length ? ` with ${listText(pinText())}` : ''}.` : 'No comps fit these settings. Loosen the roster or unlock a legend.' });
  if (!r.valid) return [tabs, empty()];

  const chosen = state.chosen && { lens: state.plan, x: state.chosen };
  const chip = (s, c, x, extra) => {
    const third = x.ids.filter(id => !c.pair.includes(id));
    const role = third.length === 1 ? x.roles?.[x.ids.indexOf(third[0])] : null;
    const picked = sameComp(chosen, { lens: s.id, x });
    return el('button', {
      type: 'button', class: `fchip sq${extra ? ' extra' : ''}${picked ? ' picked' : ''}`,
      'aria-pressed': String(sameComp(state.selected, { lens: s.id, x })),
      'aria-label': `${x.ids.map(nameOf).join(', ')} as ${sectionLabel(s.id)}: ${shownScore(x.score)}${picked ? ', picked' : ''}`,
      title: `${seatText(x)}\nranked as ${Math.round(x.rank)}`,
      onclick: () => select(s.id, x)
    },
      el('span', { class: 'fchip-name' }, third.length ? ['+ ', third.map((id, i) => [i ? ' + ' : '', nameOf(id), fitMark(id)])] : 'as locked', compBadge(x.ids)),
      el('span', { class: 'fchip-score', text: String(shownScore(x.score)) }),
      third.length === 1 ? el('span', { class: 'fchip-cls', text: classOf(third[0]).toLowerCase() }) : null,
      el('span', { class: 'fchip-meta' }, picked ? el('span', { class: 'fchip-picked', text: 'picked ' }) : null, role || '', ' ', el('span', { class: 'fchip-marks', text: marks(x.seating) })));
  };
  const card = (s, c, ci, overview) => {
    const k = `${s.id}|${c.pair.join()}`;
    const open = state.open.has(k);
    const thirds = c.vars.flatMap(x => x.ids.filter(id => !c.pair.includes(id)));
    const flex = thirds.length === c.vars.length ? orText([...new Set(thirds.map(classOf))]) : '';
    return el('section', { class: 'ccard sq', 'aria-label': `${overview ? sectionLabel(s.id) : `Core ${ci + 1}`}: ${c.pair.map(nameOf).join(' and ')}` },
      el('div', { class: 'ccard-head' },
        overview ? el('span', { class: `badge ${s.id === GENERALIST ? 'neutral' : 'plan'}`, text: sectionLabel(s.id) }) : el('span', { class: 'label', text: `core ${ci + 1}` }),
        el('h3', { class: 'ccard-pair' }, c.pair.map((id, j) => [j ? el('span', { class: 'sugg-plus', text: ' + ' }) : null,
          el('span', { class: state.locked.includes(id) ? 'sugg-locked' : null, text: nameOf(id) }), fitMark(id)]),
          flex ? [el('span', { class: 'sugg-plus', text: ' + ' }), el('span', { class: 'ccard-cls', text: flex })] : null),
        el('span', { class: 'ccard-best' }, 'best ', el('b', { text: String(Math.max(...c.vars.map(x => shownScore(x.score)))) })),
        overview ? el('button', { type: 'button', class: 'btn-term btn-sm', text: 'explore', 'aria-label': `Explore the ${sectionLabel(s.id)} section`, onclick: () => setView(s.id) }) : null),
      el('div', { class: 'flexrow' },
        c.vars.map(x => chip(s, c, x, false)),
        open ? c.more.map(x => chip(s, c, x, true)) : null,
        c.more.length ? el('button', { type: 'button', class: 'fchip fchip-more sq', 'aria-expanded': String(open), onclick: () => toggleMore(k) },
          el('span', { class: 'fchip-name', text: open ? 'fewer' : `+${c.more.length} more` }),
          el('span', { class: 'fchip-meta', text: open ? `back to the top ${c.vars.length}` : `next: ${c.more[0].ids.filter(id => !c.pair.includes(id)).map(nameOf).join(' + ')} ${shownScore(c.more[0].score)}` })) : null));
  };

  if (!cur) return [tabs, note, el('div', { class: 'ccards' }, sections.filter(s => s.cores.length).map(s => card(s, s.cores[0], 0, true)))];
  const p = state.data.plans?.[cur.id];
  return [tabs,
    el('p', { class: 'meta', text: p ? [p.note, planText(p)].filter(Boolean).join(' ') : 'Comps judged on overall coverage, without a plan.' }),
    note,
    cur.cores.length ? el('div', { class: 'ccards' }, cur.cores.map((c, ci) => card(cur, c, ci, false)))
      : el('p', { class: 'meta', text: `No comp your squad can field qualifies as a ${sectionLabel(cur.id)}.` })];
}

/* The selection bar: fixed at the bottom while a comp is selected, so options can be compared
   without leaving the results. Built here so index.html needn't change. */
function renderSelbar() {
  let bar = $('#selbar');
  if (!bar) {
    bar = el('div', { class: 'selbar', id: 'selbar', role: 'region', 'aria-label': 'Selected comp', hidden: '' }, el('div', { class: 'selbar-in' }));
    document.body.append(bar);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.selected) clearSelection(); });
  }
  const sel = state.results?.sections && state.selected;
  bar.hidden = !sel;
  document.body.classList.toggle('has-selbar', !!sel);
  if (!sel) return bar.firstChild.replaceChildren();
  const { lens, x } = sel;
  const core = state.results.sections.find(s => s.id === lens)?.cores.find(c => c.vars.includes(x) || c.more?.includes(x));
  const third = core ? x.ids.filter(id => !core.pair.includes(id)) : [];
  const adds = third.length === 1 ? thirdAdds(x.ids, third[0], x.picks) : [];
  const picked = state.chosen && state.plan === lens && state.chosen.ids.join() === x.ids.join();
  bar.firstChild.replaceChildren(
    el('span', { class: 'selbar-score', text: String(shownScore(x.score)) }),
    el('span', { class: 'selbar-names' }, x.ids.map(nameOf).join(' + '), ' ', el('span', { class: `badge ${lens === GENERALIST ? 'neutral' : 'plan'}`, text: sectionLabel(lens) }), compBadge(x.ids)),
    el('span', { class: 'selbar-detail' }, seatingLine(x.ids, x.seating, x.roles),
      adds.length ? [' · ', el('span', { class: 'selbar-adds', text: `${nameOf(third[0])} adds ${adds.map(a => a.label.toLowerCase()).join(', ')}` })] : null,
      x.seating.bonus > 0 ? ` · ranked +${+x.seating.bonus.toFixed(1)}` : null),
    el('span', { class: 'selbar-actions' },
      el('button', { type: 'button', class: 'btn-term btn-sm', text: picked ? 'show' : 'analyse', 'aria-label': `${picked ? 'Show' : 'Analyse'} ${x.ids.map(nameOf).join(', ')} as ${sectionLabel(lens)}`, onclick: () => pickIn(lens, x) }),
      el('button', { type: 'button', class: 'selbar-x', 'aria-label': 'Clear selection', text: '×', onclick: clearSelection })));
}

/* ---- 4. breakdown ---- */

export function renderAnalysis() {
  const c = state.chosen;
  $('#comp-label').replaceChildren(...(c ? [c.ids.map(nameOf).join(' + '), compBadge(c.ids)].filter(Boolean) : []));
  $('#btn-share').hidden = !c;
  if (!c) {
    $('#score-status').textContent = '';
    return $('#analysis').replaceChildren(el('p', { class: 'empty-state' }, el('span', { class: 'lambda', text: '›' }), 'generate, then pick a comp to see its breakdown'));
  }
  const a = analyse(c.ids, c.picks);
  const seating = seat(c.ids);
  $('#score-status').textContent = `Score ${shownScore(a.score)}: ${verdict(shownScore(a.score))[0]}`;
  $('#analysis').replaceChildren(...[
    el('div', { class: 'an-top' },
      el('div', { class: 'an-main' },
        scoreBlock(a, seating),
        el('div', { class: 'characterisation' }, characterise(a, seating).map(p => el('p', {},
          p.label ? el('strong', { class: `char-label${p.cls ? ' ' + p.cls : ''}`, text: `${p.label}: ` }) : null, p.text)))),
      el('div', { class: 'an-side' }, radar(a), phaseBars(a))),
    gapsBlock(a),
    swapsBlock(a),
    upgradesBlock(a),
    coverageBlock(a),
    pairsBlock(a),
    mapBlock(a),
    classesBlock(a),
    cardsBlock(a)
  ].filter(Boolean));
}

function scoreBlock(a, seating) {
  const { scoring } = state.data;
  const shown = shownScore(a.score);
  const [vText, vClass] = verdict(shown);
  const j = a.judge;
  const parts = [`coverage ${Math.round(a.covPts)}/${scoring.coverageMax}`];
  if (j.as) parts.unshift(`as ${planLabel(j.as)}`);
  if (scoring.planRolePoints && a.legends.some(l => l.roles)) parts.push(`roles +${Math.round(j.rolePts)}/${scoring.planRolePoints}`);
  if (j.roleGaps?.length) parts.push(`role gaps ${signed(-j.roleGaps.length * scoring.roleGapPenalty)} (${j.roleGaps.join(', ')})`);
  parts.push(`synergy ${signed(a.synPts)}/${scoring.synergyMax}`);
  if (state.map) parts.push(`map ${signed(a.mapPts)}/${scoring.mapMax}`);
  if (a.penalty) parts.push(`class mix ${signed(-a.penalty)}`);
  if (a.housePts) parts.push(`${a.housePts > 0 ? 'full house' : 'civil war'} ${signed(a.housePts)}`);
  if (a.powerPts) parts.push(`legend power ${signed(a.powerPts)}`);
  return el('div', { class: 'score' },
    el('div', { class: 'score-num' }, String(shown), el('small', { text: ' /100' })),
    el('div', { class: 'score-side' },
      el('span', { class: `verdict ${vClass}`, text: vText }),
      el('span', { class: 'meta', text: parts.join(' · ') }),
      a.unpicked ? el('span', { class: 'meta', text: `${a.unpicked} legend${a.unpicked > 1 ? 's have' : ' has'} unpicked upgrades. Auto-pick fills them.` }) : null,
      seatingLine(a.ids, seating, j.roles)
    ));
}

const WORSE_EMPTY = (name) => `${name} is already as bad as it gets.`;
function swapsBlock(a) {
  const worst = !!state.chosen.worst;
  const cols = findSwaps(a.ids, worst);
  return block(
    blockHead(worst ? 'make it worse' : 'swaps',
      smallBtn(worst ? 'make it better' : 'make it worse', () => setSwapMode(!worst), { id: 'swap-mode', class: `btn-term btn-sm${worst ? '' : ' btn-worst'}` })),
    el('p', { class: 'meta', text: worst
      ? 'The most damaging replacements your squad can still seat, compared on their worst upgrades. Back undoes a swap.'
      : 'The best replacements your squad can still seat, compared on their best upgrades. Back undoes a swap.' }),
    el('div', { class: 'col-grid' }, cols.map((col, i) => el('div', { class: 'col', role: 'group', 'aria-label': `Instead of ${nameOf(col.out)}` },
      el('span', { class: 'col-title' }, el('span', { class: 'col-sub', text: 'instead of ' }), nameOf(col.out)),
      col.locked ? el('p', { class: 'meta', text: activePins()[col.out] !== undefined ? `locked to ${state.roster.players[activePins()[col.out]].name}` : 'locked' })
        : !col.list.length ? el('p', { class: 'meta', text: worst ? WORSE_EMPTY(nameOf(col.out)) : `Nothing beats ${nameOf(col.out)} here.` })
        : col.list.map((x, n) => {
          const comfy = x.seating.comfy[x.at];
          const why = [x.fixes.length && `fixes ${listText(x.fixes)}`, x.loses.length && `loses ${listText(x.loses)}`].filter(Boolean).join(' · ');
          return el('button', {
            type: 'button', class: `swap-opt sq${worst ? ' worse' : ''}`, 'data-swap-col': n === 0 ? String(i) : null,
            'aria-label': `Swap ${nameOf(col.out)} for ${nameOf(x.id)}, ${signed(x.delta)} points, played by ${x.seating.names[x.at]}${comfy ? ', a comfort pick' : ''}${why ? `. ${why}` : ''}`,
            onclick: () => swapLegend(col.out, x.id)
          },
            el('span', { class: 'swap-name', text: nameOf(x.id) }),
            el('span', { class: `swap-delta ${x.delta > 0 ? 'pos' : 'neg'}`, text: signed(x.delta) }),
            compBadge(x.next) ? el('span', { class: 'swap-badge' }, compBadge(x.next)) : null,
            el('span', { class: `swap-who${comfy ? ' seat-comfort' : ''}`, text: `${comfy ? '★ ' : ''}${x.seating.names[x.at]}` }),
            why ? el('span', { class: 'swap-why', text: why }) : null);
        })
    )))
  );
}

function gapsBlock(a) {
  if (!a.gaps.length) return null;
  const ok = tolerated(a);
  const pid = a.judge?.as || a.judge?.plan;
  return block('gaps', el('ul', { class: 'lines warn' }, a.gaps.map(g => el('li', { class: ok.has(g.key) ? 'tolerated' : null },
    el('strong', { text: g.label + ': ' }), g.missing, ok.has(g.key) ? el('span', { class: 'meta', text: ` Fine for a ${planLabel(pid)}.` }) : null))));
}

function upgradesBlock(a) {
  if (!a.legends.some(l => l.upgrades)) return null;
  const picks = state.chosen.picks;
  return block(
    blockHead('upgrades',
      smallBtn('auto-pick', () => { state.chosen.picks = bestBuild(a.ids).picks; writeHash(); renderAnalysis(); },
        { title: 'Pick the upgrades that give the best score (must-picks always taken)' }),
      smallBtn('none', () => { state.chosen.picks = {}; writeHash(); renderAnalysis(); })),
    el('p', { class: 'meta', text: 'Pick one upgrade per level. Upgrades that add a trait update the coverage below. MUST = the other option is much weaker; SKIP = not worth taking; ? = not confirmed for the current season.' }),
    el('div', { class: 'col-grid' }, a.legends.map(l => el('div', { class: 'col' },
      el('span', { class: 'col-title up-col-title', text: l.name }),
      LEVELS.filter(lv => l.upgrades?.[lv]?.length).map(lv => el('div', { class: 'up-level', role: 'group', 'aria-label': `${l.name} level ${lv} upgrade` },
        el('span', { class: 'up-lv', text: `lv${lv}` }),
        l.upgrades[lv].map((u, n) => el('button', {
          type: 'button', class: `up-opt sq${u.must ? ' must' : ''}${u.unplayable ? ' skip' : ''}`, 'aria-pressed': String(picks[l.id]?.[lv] === n),
          'data-up': `${l.id}-${lv}-${n}`, onclick: () => setUpgrade(l.id, lv, n)
        },
          el('span', { class: 'up-name' }, u.name,
            u.unsure && el('span', { class: 'up-unsure', title: 'Not confirmed for the current season', text: ' ?' }),
            u.must && el('span', { class: 'badge must', title: 'Must-pick: the other option is much weaker', text: 'must' }),
            u.unplayable && el('span', { class: 'badge skip', title: 'Unplayable: not worth taking', text: 'skip' }),
            UP_MODES[u.mode] && el('span', { class: `badge ${u.mode}`, title: UP_MODES[u.mode].title, text: UP_MODES[u.mode].text })),
          u.effect ? el('span', { class: 'up-effect', text: u.effect }) : null,
          u.tags || u.grants ? el('span', { class: 'up-tags', text: [tagText(u.tags), grantText(u)].filter(Boolean).join(', ') }) : null
        ))
      ))
    )))
  );
}

/* Coverage shape: one axis per scored trait, in the coverage list's order, filled to how covered
   it is (the outer ring is "covered"). Missing traits are labelled red. Inline SVG, no library. */
/* Phase profile: one bar per game phase, the comp's coverage of what that phase asks for. */
function phaseBars(a) {
  if (!a.phases) return null;
  return el('figure', { class: 'phase-bars' },
    PHASES.filter(([k]) => a.phases[k] != null).map(([k, label, what]) => {
      const pct = Math.round(a.phases[k] * 100);
      return el('div', { class: 'phase-row', title: what },
        el('span', { class: 'phase-label', text: label }),
        el('span', { class: 'phase-bar', role: 'img', 'aria-label': `${label}: ${pct}%` }, el('i', { style: `width: ${pct}%` })),
        el('span', { class: 'phase-pct', text: `${pct}%` }));
    }),
    el('figcaption', { class: 'meta', text: 'Game phases: how much of what each phase asks for the comp covers. Not part of the score.' }));
}

function radar(a) {
  const { coveredAt, stackedAt } = state.data.scoring;
  const traits = a.coverage.filter(c => c.weight > 0);
  if (traits.length < 3) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}, ...kids) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
    n.append(...kids.flat().filter(x => x != null));
    return n;
  };
  const R = 96;
  const at = (i, r) => {
    const t = -Math.PI / 2 + (i * 2 * Math.PI) / traits.length;
    return [r * Math.cos(t), r * Math.sin(t)];
  };
  const ring = (f) => traits.map((_, i) => at(i, R * f).map(v => v.toFixed(1)).join(',')).join(' ');
  const val = (c) => Math.min(c.sum, coveredAt) / coveredAt;
  const pid = a.judge?.as || a.judge?.plan;
  const plan = pid ? state.data.plans[pid] : null;
  const core = new Set(planCore(plan));
  const level = (c) => (c.sum >= stackedAt ? 'stacked' : c.sum >= coveredAt ? 'covered' : c.sum > 0 ? 'partial' : 'missing');
  const groups = { covered: [], partial: [], stacked: [], missing: [] };
  for (const c of traits) groups[level(c)].push(c.key);
  const desc = Object.entries(groups).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ');

  const shape = svg('svg', { viewBox: '-180 -132 360 264', class: 'radar', role: 'img', 'aria-label': `Coverage shape. ${desc}.` },
    svg('polygon', { class: 'radar-ring', points: ring(1) }),
    svg('polygon', { class: 'radar-ring half', points: ring(0.5) }),
    traits.map((c, i) => { const [x, y] = at(i, R); return svg('line', { class: `radar-axis${core.has(c.key) ? ' core' : ''}`, x1: 0, y1: 0, x2: x.toFixed(1), y2: y.toFixed(1) }); }),
    svg('polygon', { class: 'radar-fill', points: traits.map((c, i) => at(i, R * val(c)).map(v => v.toFixed(1)).join(',')).join(' ') }),
    traits.map((c, i) => {
      if (!c.sum) return null;
      const [x, y] = at(i, R * val(c));
      return svg('circle', { class: `radar-dot ${level(c)}`, cx: x.toFixed(1), cy: y.toFixed(1), r: 3.2 });
    }),
    traits.map((c, i) => {
      const [x, y] = at(i, R + 12);
      const cos = x / (R + 12), sin = y / (R + 12);
      const anchor = cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle';
      return svg('text', { class: `radar-label${c.sum ? '' : ' missing'}${core.has(c.key) ? ' core' : ''}`, x: x.toFixed(1), y: (y + (sin > 0.5 ? 9 : sin < -0.5 ? -3 : 4)).toFixed(1), 'text-anchor': anchor }, c.key);
    }));
  return el('figure', { class: 'radar-wrap' }, shape,
    el('figcaption', { class: 'meta', text: `Coverage shape. The outer ring is covered; red traits are missing.${plan ? ` Highlighted axes are ${plan.label}'s core traits.` : ''}` }));
}

function coverageBlock(a) {
  const { coveredAt, stackedAt } = state.data.scoring;
  const rows = a.coverage.map(c => {
    const covered = c.sum >= coveredAt;
    const stacked = c.sum >= stackedAt;
    const cls = ['cov-row', c.weight === 0 ? 'info' : c.sum === 0 ? 'missing' : '', stacked ? 'stacked' : ''].filter(Boolean).join(' ');
    const segs = Array.from({ length: stackedAt }, (_, i) => el('i', { class: i < c.sum ? (covered ? 'on' : 'part') : null }));
    const who = c.who.length ? c.who.map(x => (x.derived ? `+${+x.lv.toFixed(1)} from ${x.name.toLowerCase()}`
      : `${x.name} ${levelText(x.lv)}${x.via.length ? ` (${x.via.join(', ')})` : ''}`)).join(', ')
      : el('span', { class: c.weight > 0 ? 'cov-none' : null, text: 'none' });
    return el('div', { class: cls },
      el('span', { class: 'cov-name' }, c.label, el('span', { class: 'w', title: c.weight ? 'weight for your settings' : null, text: c.weight ? '×' + +c.weight.toFixed(2) : 'info' })),
      el('span', { class: 'cov-bar', role: 'img', 'aria-label': `${c.label}: ${+c.sum.toFixed(1)} points, ${covered ? 'covered' : c.sum ? 'partial' : 'missing'}` }, segs),
      el('span', { class: 'cov-who' }, who, stacked && el('span', { class: 'stack', text: 'stacked' }))
    );
  });
  return block('coverage',
    el('div', { class: 'legend-key' },
      el('span', { class: 'k-on', text: 'covered' }), el('span', { class: 'k-part', text: 'partial' }), el('span', { class: 'k-stack', text: 'stacked (doubled up)' })),
    el('div', { class: 'coverage' }, rows));
}

function pairsBlock(a) {
  const all = a.pairs.length === 3;
  const badge = all && a.pairs.every(p => p.score > 0) ? el('span', { class: 'badge full', text: 'full house' })
    : all && a.pairs.every(p => p.score < 0) ? el('span', { class: 'badge war', text: 'civil war' }) : null;
  return block(badge ? blockHead('pairs', badge) : 'pairs', el('div', { class: 'pairs' }, a.pairs.map(p => el('div', { class: 'pair' },
    el('span', { class: `pair-score ${p.score > 0 ? 'pos' : p.score < 0 ? 'neg' : 'zero'}`, text: p.score > 0 ? '+' + p.score : String(p.score) }),
    el('span', {},
      el('span', { class: 'pair-who', text: `${p.a.name} + ${p.b.name}` }),
      el('span', { class: `pair-note${p.note ? '' : ' none'}`, text: p.note ? `: ${p.note}` : ': no note yet' }))
  ))));
}

function mapBlock(a) {
  if (!state.map) return null;
  const mapName = state.data.maps[state.map].name;
  return block(`map: ${mapName.toLowerCase()}`, el('div', { class: 'pairs' }, a.legends.map(l => {
    const fit = mapFit(l.id);
    return el('div', { class: 'pair' },
      el('span', { class: `pair-score ${fit > 0 ? 'pos' : fit < 0 ? 'neg' : 'zero'}`, text: fit > 0 ? '+' + fit : String(fit) }),
      el('span', {},
        el('span', { class: 'pair-who', text: l.name }),
        el('span', { class: `pair-note${l.mapNotes?.[state.map] ? '' : ' none'}`, text: l.mapNotes?.[state.map] ? `: ${l.mapNotes[state.map]}` : fit ? '' : ': neutral' })));
  })));
}

function classesBlock(a) {
  const { classes, scoring } = state.data;
  const byClass = {};                                 // class → [[perk, sources]]
  for (const [pid, srcs] of a.perks) { const pk = state.perks.get(pid); (byClass[pk.cls] ||= []).push([pk, srcs]); }
  return block('class perks',
    el('p', { class: 'meta', text: `Class perks are shared by the squad, so each one counts once however many legends bring it. Some upgrades grant another class's perks. Each extra legend in a class costs ${scoring.duplicateClassPenalty} points.` }),
    el('div', { class: 'col-grid' }, Object.entries(byClass).map(([k, list]) => {
      const own = a.classes[k] || [];
      return el('div', { class: 'col' },
        el('span', { class: 'col-title' }, classes[k].label,
          el('span', { class: 'col-sub', text: own.length ? ` · ${own.join(', ')}` : ' · via upgrade' }),
          own.length > 1 ? el('span', { class: 'col-warn', text: ` doubled ${signed(-(own.length - 1) * scoring.duplicateClassPenalty)}` }) : null),
        el('ul', { class: 'lines' }, list.map(([pk, srcs]) => el('li', {},
          el('strong', { text: pk.name }), pk.effect ? `: ${pk.effect}` : null,
          pk.tags ? el('span', { class: 'up-tags', text: ' ' + tagText(pk.tags) }) : null,
          srcs.some(x => x.upgrade) ? el('span', { class: 'col-sub', text: ` (from ${srcs.filter(x => x.upgrade).map(srcLabel).join(', ')})` }) : null))));
    })));
}

function cardsBlock(a) {
  const { classes, tags } = state.data;
  return block('legends', el('div', { class: 'legend-cards' }, a.legends.map((l, i) => {
    const { tags: eff, from } = a.eff[i];
    return el('article', { class: 'card legend-card sq' },
      el('div', { class: 'card-top' }, el('span', { text: classes[l.class].label.toUpperCase() })),
      el('h3', { text: l.name }),
      l.kit ? el('dl', { class: 'kit' }, ['passive', 'tactical', 'ultimate'].filter(k => l.kit[k]).map(k => [el('dt', { text: k.slice(0, 3) }), el('dd', { text: l.kit[k] })])) : null,
      el('div', { class: 'tagline' }, Object.entries(eff).sort((x, y) => y[1] - x[1]).map(([t, lv]) => el('span', {
        class: [lv > 1 ? 'lv2' : '', from[t] ? 'boosted' : ''].filter(Boolean).join(' ') || null,
        title: from[t] ? `from: ${from[t].join(', ')}` : null,
        text: `${tags[t].label.toLowerCase()} ${levelText(lv)}`
      }))),
      l.strengths?.length ? el('ul', { class: 'lines' }, l.strengths.map(s => el('li', { text: s }))) : null,
      l.weaknesses?.length ? el('ul', { class: 'lines minus' }, l.weaknesses.map(s => el('li', { text: s }))) : null,
      l.notes ? el('p', { class: 'legend-note', text: l.notes }) : null
    );
  })));
}
