/* The written summary of a comp, as labelled lines. */

import { compKey, GENERALIST, listText, nameOf, PHASES, SLOTS, state } from './core.js';
import { mapFit, prefOf, shownScore } from './model.js';

/* A plan in a sentence, from its optional ring / wins / cover fields. */
const WINS_TEXT = { kills: 'A kills comp', placement: 'A placement comp', either: 'A comp that plays for kills or placement' };
const RING_TEXT = { inside: 'claims space inside the ring', edge: 'plays the edge', anywhere: 'plays anywhere in the ring' };
const COVER_TEXT = { use: 'uses cover', remove: 'breaks cover open', bypass: 'goes round cover', avoid: 'avoids cover fights' };
export function planText(p) {
  const how = [RING_TEXT[p.ring], COVER_TEXT[p.cover]].filter(Boolean);
  if (!how.length) return p.wins ? `${WINS_TEXT[p.wins]}.` : '';
  return `${WINS_TEXT[p.wins] || 'A comp'} that ${listText(how)}.`;
}
export const sectionLabel = (id) => (id === GENERALIST ? 'Generalist' : state.data.plans?.[id]?.label || id);
export const planLabel = (pid) => (pid ? state.data.plans[pid].label : state.data.noPlan?.label || 'Dodo');
/* Traits the comp's plan doesn't need: their gaps don't count against it, so don't warn about them. */
export function tolerated(a) {
  const pid = a.judge?.as || a.judge?.plan;
  return new Set(pid ? state.data.plans[pid].tolerates || [] : []);
}
const DODO_NOTE = "No clear plan. Pick one before you drop, or you'll wander into the first fight.";

/* characterisation:
   A short paragraph built from the comp's strongest traits (tags.<k>.style / .strong),
   its best pair note, its map fit, its biggest gap and who's on what. */

export function characterise(a, seating) {
  const { coveredAt } = state.data.scoring;
  const names = a.legends.map(l => l.name);
  const strong = a.coverage
    .filter(c => c.weight > 0 && c.sum >= coveredAt && c.strong)
    .sort((x, y) => y.weight * Math.min(y.sum, coveredAt + 1) - x.weight * Math.min(x.sum, coveredAt + 1))
    .slice(0, 3);
  const styles = strong.map(c => c.style).filter(Boolean).slice(0, 2);
  const out = [];                                    // [{ label?, text, cls? }], one line each
  const line = (label, ...texts) => { const t = texts.filter(Boolean).join(' '); if (t) out.push({ label, text: t }); };

  const an = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
  line(null, !styles.length ? `${listText(names)} make a generalist squad without a standout strength.`
    : styles.length === 1 ? `${listText(names)} make ${an(styles[0])} ${styles[0]} squad.`
    : `${listText(names)} make ${an(styles[0])} ${styles[0]} squad with ${an(styles[1])} ${styles[1]} streak.`);
  planLines(a, line);
  line('Strengths', ...strong.map(c => {
    const named = c.who.filter(x => !x.perk && !x.derived);
    const people = named.length ? named : c.who.filter(x => !x.derived).length ? c.who.filter(x => !x.derived) : c.who;
    const top = people.filter(x => x.lv === Math.max(...people.map(y => y.lv))).map(x => x.name);
    return `${c.strong.replace(/\.$/, '')} (${top.length === SLOTS ? 'everyone' : listText(top)}).`;
  }));

  const bestPair = a.pairs.filter(p => p.score > 0 && p.note).sort((x, y) => y.score - x.score)[0];
  if (bestPair) line('Best link', `${bestPair.a.name} + ${bestPair.b.name}.`, bestPair.note);
  const worstPair = a.pairs.filter(p => p.score < 0).sort((x, y) => x.score - y.score)[0];
  if (worstPair) line('Friction', `${worstPair.a.name} + ${worstPair.b.name}.`, worstPair.note);

  if (state.map) {
    const mapName = state.data.maps[state.map].name;
    const good = a.legends.filter(l => mapFit(l.id) > 0);
    const bad = a.legends.filter(l => mapFit(l.id) < 0);
    const note = (l) => l.mapNotes?.[state.map] ? ` ${l.mapNotes[state.map]}` : '';
    line('Map',
      good.length && `${mapName} suits ${listText(good.map(l => l.name))}.${good.length === 1 ? note(good[0]) : ''}`,
      bad.length && `${listText(bad.map(l => l.name))} ${bad.length > 1 ? 'have' : 'has'} a harder time on ${mapName}.${bad.length === 1 ? note(bad[0]) : ''}`,
      !good.length && !bad.length && `Nobody here is especially suited to, or held back by, ${mapName}.`);
  }

  line('Classes', ...a.doubled.map(([c, names]) => `Doubled up on ${state.data.classes[c].label} (${listText(names)}): the class perks only count once.`));

  const ok = tolerated(a);
  const gap = a.gaps.find(g => !ok.has(g.key));
  if (gap) line('Watch out', gap.missing);
  else {
    const thin = a.coverage.filter(c => c.weight > 0 && c.sum > 0 && c.sum < coveredAt && !ok.has(c.key)).sort((x, y) => y.weight - x.weight)[0];
    if (thin) line('Watch out', `It's thin on ${thin.label.toLowerCase()}, with only ${listText(thin.who.map(x => (x.derived ? `the squad's ${x.name.toLowerCase()}` : x.name)))} contributing.`);
  }

  if (seating) {
    const comfy = a.ids.map((id, i) => ({ id, p: seating.seats[i] })).filter(x => prefOf(x.p, x.id) === 'comfort');
    if (comfy.length) line('Comfort', `${listText(comfy.map(x => `${state.roster.players[x.p].name} gets ${nameOf(x.id)}`))}, ${comfy.length > 1 ? 'all comfort picks' : 'a comfort pick'}.`);
  }
  const known = state.comps.get(compKey(a.ids));
  if (known) out.push({ label: known.label, text: known.note || 'A known comp.', cls: known.label.toLowerCase() === 'algs' ? 'algs' : '' });
  if (a.phases) {
    const ph = PHASES.filter(([k]) => a.phases[k] != null).map(([k, label, what]) => ({ k, label, what, v: a.phases[k] }));
    const hi = ph.reduce((x, y) => (y.v > x.v ? y : x)), lo = ph.reduce((x, y) => (y.v < x.v ? y : x));
    if (hi.v - lo.v >= 0.08) line('Phases', `Strongest in the ${hi.label} (${hi.what}), weakest in the ${lo.label} (${lo.what}).`);
    else line('Phases', 'Even across the game: no phase stands out as a strength or a weakness.');
  }
  const gaps = a.judge?.roleGaps || [];
  if (gaps.length) {
    const why = { entry: "you'll struggle to start fights on your terms", secondary: 'nobody follows up the entry or plays the second angle', anchor: 'nobody holds space or covers the retreat' };
    line('Roles', ...[...new Set(gaps)].map(r => `Nobody here fills ${r} well, so ${why[r]}.`));
  }
  if (shownScore(a.score) < 40) line(null, 'Honestly? Drop somewhere quiet and hope.');
  return out;
}

/* The plan lines: the plan the comp is judged as (or its best plan), what it punishes and risks.
   With a plan picked that the comp can't really play, say why. With no plan, it's a Dodo. */
function planLines(a, line) {
  const { plans, noPlan } = state.data;
  if (!plans || !a.judge) return;
  const j = a.judge;
  const pid = j.as || j.plan;
  if (!pid) return line('Plan', `${planLabel(null)}.`, noPlan?.note || DODO_NOTE);
  const p = plans[pid];
  if (state.plan && !j.qual) {
    const short = (j.progress || []).filter(([, n, t]) => n < t).map(([k, n, t]) => `${state.data.tags[k].label.toLowerCase()} ${+n.toFixed(1)}/${t}`);
    const why = [j.thin && (short.length ? `it falls short of ${p.label}'s targets (${short.join(', ')})` : 'its core traits are thin'), j.offRole && `its legends don't fill ${p.label}'s roles (${p.roles.join(', ')})`].filter(Boolean);
    line('Plan', `Not a natural ${p.label}: ${listText(why)}.`, j.plan && j.plan !== pid ? `It plays more like a ${planLabel(j.plan)}.` : '');
  } else line('Plan', `${p.label}.`, p.note, planText(p),
    j.progress && p.targets ? `Targets: ${j.progress.map(([k, n, t]) => `${state.data.tags[k].label.toLowerCase()} ${+n.toFixed(1)}/${t}`).join(', ')}.` : '');
  const punish = (p.punishes || []).map(x => plans[x]?.label || x);
  if (punish.length) line('Punishes', `${listText(punish)}.`);
  if (p.risks?.length) line('Risks', ...p.risks);
}
