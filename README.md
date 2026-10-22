# apex-buddy

Tell it who's playing, what you want from the squad and which map you're on. It suggests Apex Legends comps that fit, then breaks down whichever one you pick. It's a static page with no build step.

## Setup

1. Copy the site fonts into `fonts/`. `css/main.css` expects `fonts/roboto-mono-latin-{400,600,700}-normal.woff2` and `fonts/fa-{brands,solid}-subset.woff2`.
2. If the site's `main.css` changes, copy the new version over `css/main.css`. Page styles live in `css/comp.css` and only use the tokens from `main.css`.
3. To run it locally, use `python3 -m http.server`, then open http://localhost:8000. The page fetches its JSON, so opening `index.html` directly from disk won't work (nor would the ES modules).

## Code layout

`js/` holds ES modules, loaded by `<script type="module" src="js/app.js">`, with no build step:

| File | What's in it |
|---|---|
| `app.js` | Entry point: loads the data and wires up the page. |
| `core.js` | Constants, shared state and small helpers. Imports nothing. |
| `source.js` | Loads the data files listed in `data/index.json` and assembles them into one object (falls back to a single `data/legends.json`). Works in the browser and in Node. |
| `data.js` | Validation of the assembled data. |
| `model.js` | Trait weights, scoring (the only place the formula lives), upgrade builds, seating, the team finder and swaps. No DOM, so it can be unit-tested directly. |
| `summary.js` | The written summary. |
| `links.js` | Share links, player codes and saved settings. |
| `actions.js` | Things the UI can do to state. |
| `render.js` | One function per page block. |
| `dataview.js` | The data viewer (`data.html`): charts every rating in the data for checking. Read-only. |
| `solo.js` | The solo-queue model: picks for one player given the teammates' legends, exact or popularity-weighted. No DOM. |
| `soloview.js` | The solo-queue page (`solo.html`): loading, its link and storage, rendering. |

## Data viewer

`data.html` charts everything in the data files so the group can sanity-check it: trait towers (levels or weighted) with a full table, role ratings, plans, game phases per legend and per trait, the synergy matrix with every note, map fit and map weights, every upgrade with its markers, and trait weights, class perks, known comps and scoring settings. It reads the live files, so it's always current, and it shows any validation problems at the top. Under the trait chart, "what the levels mean" shows each trait's `levels` definitions with the legends currently at each level. "Suggest a change" links (per section, and ✎ per legend, plan and pair) open a pre-filled GitHub issue with the current values, so disagreements land in one place.

## Solo queue

`solo.html` is for when you queue alone. Choose who you are (from the analyser's player library, or a pasted player code), the map, where you are in the pick order (1st, 2nd or 3rd), and whatever your teammates have picked. A teammate who picks before you has locked in; one who picks after you can only be hovering. It shows the three best picks for you and five runners-up.

- **Both teammates known** (locked or hovering): each legend you play is scored with the two of them. Exact, the same score the analyser would give that comp.
- **One or neither known:** the teammates still to pick are assumed to choose from what's left in proportion to `popularity.json`, so each option shows its **expected** score, plus its best case ("best with Gibraltar + Wattson: 71").
- **Ranking** is the score plus `comfortBonus` for a ★ pick and `roleBonus` × how much you like the role the legend plays, as in the analyser's seating. Your × legends are never suggested.
- **Hovers:** a teammate after you who's hovering a legend is treated as picking it, and each suggestion also shows its expected score if they switch. A drop of 5 or more is shown in red.
- **Plans** are annotated, not chosen: a comp's score is already the better of its generalist and best-plan scores. Each card links to the analyser's breakdown (for an expected pick, of its best case).

It reads the player library but never writes it. It remembers you and the map under `apex-team-comp.solo.v1`; the pick order and teammates live only in the link: `#y=Rowan~28~CD3qSmyq.123&m=olympus&p=2&a=wraith,bangalore` (`y` you as a player code, `m` map, `p` your place in the pick order, `a` the teammates' legends in pick order, `-` for one not entered yet). Older links without `p=` put you after everyone listed. A blind pick scores all 3,276 comps the first time (about 2 s, with progress); everything after that is cached until the map changes.

To refresh the popularity numbers, copy the percentages from apexlegendsstatus.com's legend popularity page into `data/popularity.json` and update `checked`. The validator checks that every legend is listed and that the shares add up to about 100.

## How the page works

1. **Players:** keep a library of everyone in your group. Each player marks every legend as ★ comfort pick, · can play, or × doesn't play.
   - Each player can rank the roles they like to play: entry, secondary and anchor. Everyone starts role-agnostic ("any"). Clicking a role makes it 1st and the other two 2nd; clicking a 2nd role drops it to 3rd (and back); clicking the 1st role clears back to "any".
   - Tick who's playing now, up to three. Empty seats count as "anyone", who plays every legend, so a duo still works.
   - **copy code** gives one player's picks as a short code, like `Rowan~28~CD3qSmyq`, with role ranks as an optional suffix (`Rowan~28~CD3qSmyq.123` = entry 1st, secondary 2nd, anchor 3rd; no suffix = role-agnostic). Paste one or more codes, or a whole share link, into the import box to add or update players; a code with an existing name replaces that player's picks.
   - To give everyone the same library automatically, add `"players": ["Rowan~28~CD3qSmyq", "Jim~28~Bpa2aLdh"]` to `legends.json`. Seeded players are only added if that name isn't already saved in the browser.
   A suggestion only counts if each legend can go to a different seat that plays it.
2. **Tune:**
   - Pick a map, or "any". A map scales some trait weights (E-District raises building lockdown, Storm Point raises rotation, and so on) and turns on map fit.
   - Raise or lower each trait's priority (×2 / ×1 / ×0.5).
   - Pick a plan, "generalist", or "any". This chooses which results section is shown and how the breakdown judges the picked comp; it doesn't change what generate finds, so switching never makes results stale.
   - Optionally lock up to three legends. Lock all three to analyse just that comp. A locked legend can be pinned to a player ("played by"), and that player always plays it. A pin is ignored while its player isn't ticked, and a player can only be pinned to one legend.
3. **Generate:** checks every comp that fits (3,276 with nothing locked), along with each comp's best upgrade build, then sorts them into sections: **generalist** (judged on overall coverage, no plan) and one per plan (only comps that qualify, scored as that plan with that plan's best upgrades). Each section is shown as up to 3 **cores**, a pair of legends, each with its best 4 third legends ("variations"), like a meta site's core-and-flex view; a comp appears once per section, a legend is in at most two cores (locked legends are in every core). A core's card names its flex slot by class ("Sparrow + Gibraltar + Controller or Support") and shows each third as a chip with its class, role and seating marks, in rank order (that section's score plus the seating bonus, so comfort picks come first). "+N more" opens up to 8 further thirds. "Overview" shows each section's best core, with **explore** to open the section. The tabs only change the view: selecting a chip puts the comp in a bar at the bottom (seats, and what the third legend adds), and **analyse** there picks it and judges it as that section's plan. Esc or × clears the selection. Generating takes a second or two; the log is cosmetic. If you change a setting afterwards, the results are marked stale until you generate again.
4. **Pick:** a suggestion opens its breakdown. That includes a written summary (with the comp's plan, what it punishes and its risks); the score split into coverage, synergy and map; who plays what, with each legend's role; gaps (gaps the comp's plan tolerates are marked as fine); swaps (the best single-legend replacements your squad can still seat, or "make it worse" ones, with Back undoing a swap); editable upgrades (auto-pick finds the best build); coverage; pairs; map fit; class perks; and a card per legend.

The player library, who's playing, map, plan and priorities are saved in your browser. Worst mode still shows a plain list of the three worst comps.

### Share links

`#c=wraith:ab,bangalore,newcastle:-b&l=wraith&m=olympus&t=engage:hi.hold:hi.damage:lo&r=28~Reanne~FKHEfED6~Rowan~CD3qSmyq~Jim~Bpa2aLdh`

| Key | Meaning |
|---|---|
| `c` | The comp in the breakdown. After a colon come the level 2 and level 3 upgrade picks: `a` means the first option, `b` the second, `-` none. |
| `w` | `1` when the breakdown's swaps block is in "make it worse" mode (set by picking a worst comp, or the toggle). |
| `l` | Locked legends, each optionally pinned to a player: `wraith:Rowan,bangalore`. |
| `m` | Map id. |
| `p` | The results section and breakdown lens: a plan id or `generalist`. Without it, the overview, and the breakdown judges a comp by its best plan. |
| `t` | Priorities: `hi` or `lo`. |
| `r` | Who's playing (not the whole library), included when anyone is selected: `count~name~code~name~code~name~code`. Each code packs one player's ·/★/× marks for every legend into about 8 characters, in the order of `codeOrder` (in `data/index.json`), plus the optional `.123` role-rank suffix. **Add new legends to the end of `codeOrder` and never reorder it**, or old codes and links will scramble. Everything else can be in any order. Legends added later decode as "can play". |

Opening a link shows exactly the view it describes: anything it leaves out (no `m`, no `p`, no `t`, no `l`) means the default, not whatever that browser had. The link's map and priorities aren't saved until you change a setting yourself. Players in `r` that aren't in your library are added; players you already have keep your saved picks, so use the import box to take someone's newer picks on purpose.

## Editing the data

Every piece of text and every number comes from the files in `data/`, split by kind so changes are easy to track and test separately. `data/index.json` lists them:

| File | Kind | Contains |
|---|---|---|
| `index.json` | | `meta` (season and dates), `codeOrder`, and `files` (which file holds what). |
| `kits.json` | facts | `classes` (and their perks) and `legends`: id, name, class, kit, strengths, weaknesses, notes. |
| `upgrades.json` | facts + markers | `{ "legend-id": { "2": [a, b], "3": [a, b] } }`. |
| `traits.csv` | opinion | Trait levels: one row per legend id, one column per trait. Blank = not set. |
| `roles.csv` | opinion | Role ratings: `legend,entry,secondary,anchor`. |
| `synergies.json` | opinion | Rated pairs, one per line. |
| `plans.json` | opinion | `plans` and `noPlan`. |
| `comps.json` | opinion | Known comps (ALGS markers). |
| `popularity.json` | fact (hand-copied) | Share of players by legend, with `source` and `checked` date. Only the solo-queue page uses it. |
| `tags.json` | settings | Trait definitions, weights, derived traits and level definitions. |
| `maps.json` | settings | `maps` (names, blurbs, multipliers), plus per-legend `fit` and `notes`. |
| `scoring.json` | settings | Every scoring number, including the ones the code would otherwise default. |

The CSV grids open in a spreadsheet; lines starting with `#` are comments. To try an alternative without losing the current version, add a second file (e.g. `plans-targets.json`) and point `index.json` at it: switching back is one line. **`codeOrder` is the one append-only list**: player codes and links decode through it, so new legends go on the end and nothing is ever reordered or removed from it. Everything else (including the order legends appear in `kits.json` and the CSVs) can be rearranged freely.

The loader assembles the files into one object with the keys below. If there's no `data/index.json`, it reads a single `data/legends.json` with all of these keys instead (`tools/split-legends.mjs` turns one into the other). If anything is invalid (broken JSON or CSV, an unknown id, trait or column, a level outside 0 to `maxPerLegend`, a pair score out of range, a pair listed twice, or a legend missing from `codeOrder`), the page lists each problem.

| Key | What it does |
|---|---|
| `legends[].tags` | `{ "tag": level }`, from 0 to `scoring.maxPerLegend` in steps of 0.5. A level is where the legend's power budget went: higher means a bigger part of the kit; 0 means none, the same as leaving the tag out (handy while grading). Half steps show as numbers (`+2.5`) rather than pluses. |
| `legends[].roles` | `{ "entry": 0–3, "secondary": 0–3, "anchor": 0–3 }`, in steps of 0.5. How well the legend fills each fight role. Missing roles count as 0. |
| `legends[].maps` | `{ "map-id": -pairMax..pairMax }`, hand-set map fit for interactions the traits don't capture. Map multipliers already favour legends through their traits (the data page shows this "trait-driven lean"), so most legends shouldn't need any. Missing maps count as 0. |
| `legends[].mapNotes` | `{ "map-id": "why" }`. Shown in the breakdown and the summary. |
| `maps.<id>` | `name`, `blurb`, and `weights` (`{ "tag": multiplier }`) applied to trait weights on that map. |
| `legends[].strengths` / `weaknesses` / `notes` | Text shown on the legend card. |
| `legends[].upgrades` | `{ "2": [a, b], "3": [a, b] }`. Each option is `{ "name", "effect", "tags"?, "grants"?, "unsure"?, "must"?, "unplayable"?, "mode"? }`. `grants` gives the squad another class's perks: `{ "recon": ["Survey Beacons"] }` or `{ "controller": "all" }`. Only one option per level can be `must`. `unplayable` marks an option as not worth taking (shown as SKIP): auto-pick and generate never choose it, unless every option at that level is unplayable, while the worst comp always does. An option can't be both. `mode` is `"algs"` or `"ranked"`, the kind of match the upgrade is better in; it's shown as a badge next to MUST and doesn't change scoring. |
| `classes.<key>.perks` | `[{ "name", "effect", "tags"? }]`. Perks are squad-wide: each perk's tags count once per comp, however many legends bring it. |
| `tags.<key>` | `label`; `weight` (0 means show the trait but don't score it); `missing`, the text shown when the comp has none of it; and `style` + `strong`, the adjective and sentence used in the written summary. Optional `from` makes a derived trait: `"loot": { "from": { "mobility": 0.5 } }` adds half the comp's mobility total to its loot total, on top of any explicit `loot` levels (e.g. Loba's). A source can't itself be derived. Optional `levels`: `{ "1": "…", "2": "…", "3": "…" }`, a written definition of each level, shown on the data page next to the legends currently at that level. Optional `phases`: `{ "early": 0.2, "mid": 0.5, "late": 0.3 }`, how much the trait matters in each game phase; see Game phases. |
| `synergies[]` | `{ "pair": [a, b], "score": -pairMax..pairMax, "note" }`. Pairs that aren't listed count as 0. |
| `comps[]` | Optional known comps: `{ "legends": [a, b, c], "label": "ALGS", "note"? }`. Legend order doesn't matter. A matching comp gets a badge (red for ALGS) in the results, the breakdown and swaps, and the note is added to the written summary. Display only: it doesn't change scoring. Dating the note ("Split 2") helps spot stale entries. |
| `plans.<id>` | A comp style. Scoring fields: `label`; `targets` (`{ "hold": 4, "zone": 4 }`: the comp totals the plan wants; reaching a target counts as fully covered, so going deep pays) or the older `core` list (traits that count up to `coveredAt` + `planDepth`); `support` (traits that help); `tolerates` (traits it doesn't need, so their gaps count for little or nothing, see `planTolerance`); and optional `roles` (a role mix such as `["entry", "entry", "secondary"]`, only for plans that genuinely break one of each; without it the plan wants one of each, like every comp). Descriptive fields, all optional: `ring` (`inside` / `edge` / `anywhere`), `wins` (`kills` / `placement` / `either`), `cover` (`use` / `remove` / `bypass` / `avoid`), `punishes` (plan ids or short phrases), `risks` (sentences) and `note` (a tagline). |
| `noPlan` | Optional `{ "label": "Dodo", "note" }`: what a comp with no plan is called. |
| `scoring` | See below. |

## Scoring

A legend's level in a trait is its base tag plus its picked upgrade tags, capped at `maxPerLegend`. A comp's total in a trait is the sum of its three legends' levels, plus the tags of each class perk the comp has (counted once, whether it comes from a legend's class or an upgrade's `grants`), plus any derived share (`from`).

| Setting | Default | Meaning |
|---|---|---|
| `coverageMax` | 80 | Points available from trait coverage. |
| `coveredAt` | 2 | Comp total at which a trait counts as covered. |
| `backup` | 0.15 | Share of each trait's value that needs one point beyond `coveredAt`. |
| `synergyMax` | 20 | ± points available from pair notes. Keep it low while few pairs are rated, so legends with more rated pairs don't get an unearned edge. |
| `mapMax` | 10 | ± points available from map fit (0 when no map is chosen). |
| `pairMax` | 2 | Largest allowed pair score and map fit. |
| `stackedAt` | 4 | Comp total at which a trait is flagged as stacked. |
| `maxPerLegend` | 2 | Cap on one legend's level in a trait. |
| `comfortBonus` | 3 | Ranking bonus per comfort pick. Not part of the displayed score. |
| `duplicateClassPenalty` | 4 | Points off for each legend beyond the first in a class. Classes granted by upgrades don't count. |
| `planRolePoints` | 12 | Points for how well the legends fill a role mix. |
| `planRoleGate` | 0.6 | Role fit (0–1) a comp needs to qualify for a plan. |
| `planRoleBalance` | 0.5 | Share of a plan's role points that rewards one of each role (entry, secondary, anchor) instead of the plan's own mix. |
| `roleBonus` | 2 | Ranking bonus per player seated in their preferred role (half for a middle choice). Not part of the displayed score. |
| `planCoreMin` | 0.5 | Average depth (0–1) a comp's core traits need to qualify for a plan. |
| `planDepth` | 2 | A plan's core traits count up to `coveredAt` + this, so going deep pays. |
| `planCoreWeight` | 1.5 | A plan's target (or core) traits weigh this × their weight (at least 2). |
| `planTolerance` | 0 | Share of its normal weight a tolerated trait keeps in the plan's coverage (0 = it drops out). |
| `roleGapMin` | 2 | A role counts as filled when the legend playing it is rated at least this. |
| `roleGapPenalty` | 4 | Points off for each role the comp can't fill: one of each (entry, secondary, anchor) when judged generically, or the plan's own role mix when judged as a plan. |
| `fullHouseBonus` | 3 | Points for a comp whose three pairs are all rated positive (full house), or off when all are negative (civil war). |
| `legendPower` | `{}` | `{ "legend-id": points }` added to any comp with that legend: a judgment about the legend itself (e.g. `"ballistic": -4`), rather than about any pair. |
| `verdicts` | 70 / 55 / 40 | Scores needed for "Strong comp", "Solid, with gaps" and "Workable" (`{ "strong", "solid", "workable" }`). |

The formulas, with s = the comp's total in a trait, cA = `coveredAt` and b = `backup`:

- **Trait value** = (1 − b) · min(s, cA) / cA + b · min(s, cA + 1) / (cA + 1)
- **Weight** = base weight × your priority (×0.5 / ×1 / ×2) × the map's multiplier for that trait
- **Coverage** = Σ (weight × trait value) / Σ weight × `coverageMax`
- **Synergy** = Σ pair scores / (3 pairs × `pairMax`) × `synergyMax`
- **Map fit** = Σ the legends' fit on the chosen map / (3 × `pairMax`) × `mapMax`
- **Class mix** = −`duplicateClassPenalty` × (legends beyond the first in each class)
- **Base** = coverage + synergy + map fit + class mix.

### Game phases

Each trait's `phases` says how much it matters early (off the drop: looting and first fights), mid (rotations and third parties) and late (final rings and holds). A comp's strength in a phase is its coverage of the traits that matter then, weighted by trait weight × phase share, using the same "covered at `coveredAt`" value as the score. The breakdown shows it as three bars under the radar and a "Phases" line in the summary (strongest and weakest phase); the data page shows where each legend shines. Phases are descriptive: they don't change the score.

### Plans and roles

- **Role fit** = the best way to give each legend a different role from a mix of three, as the sum of their ratings / 9 (0–1).
- **Generic score** = base + `planRolePoints` × role fit for entry / secondary / anchor − `roleGapPenalty` × roles below `roleGapMin` in that assignment.
- **Plan score** = plan coverage + synergy + map fit + class mix + `planRolePoints` × (`planRoleBalance` × role fit for entry / secondary / anchor + (1 − `planRoleBalance`) × role fit for the plan's `roles`). Plan coverage drops the plan's `tolerates` traits; `core` traits weigh `planCoreWeight` × their weight (at least 2) and count up to `coveredAt` + `planDepth`; `support` traits weigh at least 1. Role gaps here are counted against the plan's own role mix.
- A comp **qualifies** for a plan when its core traits average at least `planCoreMin` of that depth and its role fit for the plan is at least `planRoleGate`. Its plan is its best qualifying plan; with none, it's a Dodo.
- **Score** = the higher of the generic score and its best plan's score, or the picked plan's score when a plan is picked. Displayed clamped to 0–100.

Base also includes ± `fullHouseBonus` and each legend's `legendPower`. Upgrades are chosen to maximise the final score (so a comp judged as a plan gets the upgrades that plan wants), or to minimise it in worst mode.

The roles shown for a comp are always one of each: the best way to give its legends entry, secondary and anchor.

Seating gives each legend to a different player who plays it, maximising `comfortBonus` × comfort picks + `roleBonus` × role matches (1 for a player's top-ranked role, 0.5 for a middle one, 0 for their bottom one or if they're role-agnostic). Generate ranks comps by score + that seating bonus, then by total trait points, then alphabetically. Each result shows its bonus next to its stars and ticks (`★✓ +5`), so a lower score ranked higher is explained, and the seating line marks a player in their preferred role with ✓.
