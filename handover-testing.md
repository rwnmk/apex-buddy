# apex-buddy: testing handover (2026-10-22)

This replaces the earlier testing handovers. Since they were written, the repo has moved, the results markup has changed to core cards, and there's a new solo-queue page with its own data file.

## Repo and working agreement
- **Repo:** `rwnmk/apex-buddy` (public; formerly `apex-comp-analyser`).
- **Pages** (served at https://rwnmk.github.io/apex-buddy/):
  - `/`: the home page, linking to each tool
  - `/comp/`: the analyser
  - `/solo/`: the solo-queue picker
  - `/rp-calc/`, `/omgwhy/`: for now, redirects to the tools' old homes until they're moved in
  - `/data.html`: the data viewer
  - `/solo.html`: a redirect stub; the home page also forwards old analyser/solo hash links
- **Static site:** there's no build step, and the pages load ES modules from `js/`.
- **Playwright (TypeScript) setup:** it lives in the repo root. It has `playwright.config.ts`, `tests/fixtures.ts`, and a single-file fixture at `tests/fixtures/legends.json`.
- **Rowan's rules:**
  - `comp/index.html` (the analyser page) is Rowan's; the home page's copy is his to adjust.
  - Data changes need his approval.
  - Code goes out as a zip of the changed files only.
- **This is a learning track for Rowan.** He's moving from manual QA towards SDET/developer work, and he knows Playwright in .NET/xUnit, not TypeScript.
  - Plumbing (config, CI, fixture mechanics) can be given directly.
  - For test design, coach with probing questions and review what he writes. Don't write the suite for him.

## Plumbing to fix first
- **`baseURL` is still commented out** in `playwright.config.ts`. The web server runs on port 4173, but `tests/fixtures.ts` calls `page.goto('/')`, which fails without a base URL. Set `use: { baseURL: 'http://localhost:4173', … }`.
- **The analyser is now at `/comp/`.** `page.goto('/')` loads the home page, which has no `#btn-generate`, so the fixture must go to `/comp/`. The data routes (`**/data/index.json`, `**/data/legends.json`) still match, because every page fetches the root `data/` folder.
- **`tests/example.spec.ts` is the Playwright template.** It hits playwright.dev, so delete it.
- **`tests/tests_tests.ts` won't be run.** It doesn't match Playwright's default `*.spec.ts` / `*.test.ts` pattern, so rename it (e.g. `smoke.spec.ts`).
- **The fixture is stale; see "Data loading" below.**

## What the site does now (short)

### Analyser (`/comp/`)
1. **Players:** a library of players, each marking every legend ★ / · / ×, optionally with ranked preferred roles (entry / secondary / anchor). Tick up to 3 to play.
2. **Tune:** map, plan (any / generalist / each plan), trait priorities, and locked legends (each optionally pinned to a player).
3. **Generate:** scores all 3,276 comps (about 2 s, plus a cosmetic log) into **sections**:
   - generalist, plus one per plan: Badger, Ram, Hawk, Spider, Wolf and Fox
   - each section shows up to 3 **core cards**: a legend pair, with its flex slot named by class (e.g. "+ Controller or Support")
   - each card has up to 4 **flex chips** (third legends) in rank order, plus "+N more" for up to 8 more
   - **overview** shows each section's best core, with **explore** to open that section
   - **tabs only change the view**; they don't change the plan setting
   - **selecting a chip** fills a bar at the bottom; **analyse** there picks the comp and judges it as that section's plan
   - **"show the worst comp"** shows a plain list of 3
4. **Breakdown:** score line, summary, radar, phase bars, gaps, swaps (Back undoes a swap), upgrades, coverage, pairs, map, classes and legend cards.

### Solo queue (`/solo/`)
1. **Inputs:**
   - **you:** a player from the analyser's library, or a pasted player code
   - **map**
   - **your place in the pick order:** 1st, 2nd or 3rd
   - **your two teammates' legends:** a teammate before you has **locked in**; one after you can only be **hovering**
2. **Output:** the 3 best picks for you, plus 5 runners-up.
   - **Both teammates known:** scores are **exact**, the same score the analyser gives that comp.
   - **Otherwise:** each option shows an **expected** score, assuming unknown teammates pick in proportion to `popularity.json`, plus its best case ("best with X + Y: 71").
   - **Ranking:** score + `comfortBonus` for a ★ pick + `roleBonus` × how much you like the role. Your × legends are never suggested.
   - **Hovering teammate:** each pick shows "if X switches: about N". A drop of 5 or more is marked `.risky`.
   - **Each card links** to the analyser's breakdown of that comp (or of its best case).
3. **Speed:** a blind pick scores all 3,276 comps the first time (about 2 s, with progress). Later updates are cached until the map changes.

## Data loading (this matters for fixtures)
- **How a page loads data:** it first requests `data/index.json`, which lists the split files:
  - `kits.json`, `upgrades.json`
  - `traits.csv`, `roles.csv`
  - `tags.json`, `maps.json`, `synergies.json`, `plans.json`, `comps.json`, `scoring.json`
  - `popularity.json`

  **If `index.json` returns 404, the page falls back to a single `data/legends.json`.**
- **Using the single-file fixture:** route `index.json` to a 404 *and* `legends.json` to the fixture. Without the first route, the real split data loads and your fixture is ignored (this is what `tests/fixtures.ts` does).
- **Alternative:** keep a fixture *folder* of split files and route `**/data/*` to it. That's closer to production, and it lets one test vary a single file (e.g. `scoring.json` or `popularity.json`).
- **The current fixture is stale.** `tests/fixtures/legends.json` predates roles, plans, derived traits, `codeOrder` and popularity.
  - The loader adds `codeOrder` for single files, but expect different scores from the live data.
  - **Without `popularity`**, the solo page treats every legend as equally likely. The data page also says so.
  - Regenerate the fixture, or switch to a split fixture folder.
- **Validation:** problems block the page and are listed in full. Examples:
  - broken JSON or CSV
  - unknown ids
  - out-of-range levels
  - a `popularity.pickRate` that misses a legend, has a non-number, or doesn't add up to 95–105

## Hooks for UI tests

### Analyser
- **Ready signal:** `#btn-generate` is enabled once data has loaded and validated. Data problems show in `pre.data-error` inside `#analysis`.
- **Generate finished:** `.sect-tabs` appears, and `#gen-log` ends with "done: N sections" (worst mode: "found it…").
- **Results:**
  - section tabs: `.sect-tabs button` (`aria-pressed`)
  - core cards: `.ccard`, with the title in `.ccard-pair` and the flex classes in `.ccard-cls`; overview cards also have an "explore" button
  - flex chips: `.fchip` (`aria-pressed` = selected, `.picked` = the comp in the breakdown); `.fchip-more` toggles extras (`aria-expanded`)
  - selection bar: `#selbar` (hidden until a chip is selected), with "analyse" (`#selbar .btn-term`) and clear (`.selbar-x`); Esc also clears it
  - worst mode: `.suggs .sugg` plus `.worst-note`
- **Breakdown:**
  - containers: `#comp-label`, `#analysis`, `.score-side`, `.characterisation` (one `p` per labelled line: Plan, Strengths, Roles, Phases…)
  - visuals: `.radar`, `.phase-bars`
  - swaps: `#swap-mode` (make it worse / better), `.swap-opt`. The best comps often have no improving swaps ("Nothing beats X here"), so "make it worse" is the reliable way to get options.
  - upgrades: `[data-up="<id>-<level>-<n>"]`
  - controls: `button:text-is("auto-pick")`, `#btn-share`
- **Players:**
  - library rows: `.lib-row`, with `.roster-input` (name), `.lib-seat` (playing) and role buttons `[data-role-rank="<i>-<role>"]`
  - picks table: `[data-pref="<seat>-<legendId>"]`
  - import: `.lib-paste`, plus the import button
- **Tune:** `#map-chips`, `#plan-chips`, `#tune-grid`, `#lock-details`, `.pick` (a legend in the lock grid), and pins `[data-pin="<legendId>"]`.

### Solo queue
- **Ready:** `.spick` cards appear in `#solo-out`.
  - While a blind pick is being scored, `#solo-out[aria-busy="true"]` is set and `#solo-status` counts up, ending "done: N comps scored".
  - Data problems show in `pre.data-error` inside `#solo-out`.
- **You:** `#solo-you` (a select whose values are library names, `""` = anyone), `#solo-code` + `#btn-code`, and `#you-summary`.
- **Map:** `#solo-map button` (`aria-pressed`).
- **Pick order:**
  - position control: `[data-pos="1|2|3"]` (`aria-pressed`)
  - slots: `#mates > li`, in pick order
  - your slot: `[data-you]`
  - teammate slots: `[data-mate="0|1"]` (0 = the earlier teammate), with `.before` / `.after` relative to you and `.target` on the one the picker fills next
  - in a teammate slot:
    - `.slot-main` (click to choose which one to change)
    - `.slot-status` (locked in / hovering / not entered yet / still to pick)
    - `.slot-x` (remove)
  - `#lobby-hint` says what to do next
  - `#btn-new` clears both teammates and keeps you, the map and your position
- **Picker:**
  - `[data-legend="<id>"]` buttons, disabled once a teammate has that legend
  - the picker (and `#solo-filters`) is hidden while both teammates are entered and neither is selected
  - `#solo-search` filters the picker; Enter adds the first match
- **Suggestions:**
  - `[data-suggestion="<id>"]` in rank order, each with `.spick-score` (the label says "score" or "expected"), `.spick-best`, `.spick-switch` (`.risky`) and `.spick-link`
  - runners-up: `[data-also="<id>"]`
  - `#solo-position` explains what the scores mean for this lobby
  - `#solo-note` gives the ranking rule and the popularity source

### Home page and nav
- Every page has the shared nav, `nav.site-nav`: `.site-nav-home`, then one link per tool. The current page's link has `aria-current="page"`.
- The home page lists the tools as `.tools .tool`; each card's heading link is the whole card.
- Hash forwarding: `/#c=…` (or any analyser key) goes to `/comp/#…`; `/#a=…` or `/#y=…` goes to `/solo/#…`.

### Data page
- `#data-status` says "Data checks out…" or lists problems.
- Sections are `#traits`, `#roles`, `#plans`, `#phases`, `#synergies`, `#maps`, `#upgrades`, `#weights` and `#popularity`.

### Shared across pages
- Toggles use `aria-pressed` throughout.
- **Storage:**
  - analyser: `apex-team-comp.v2` (`library`, `squad`, `map`, `plan`, `tune`)
  - solo page: `apex-team-comp.solo.v1` (`you` as a player code, `map`). The solo page reads the analyser's key but never writes it.
- **Clipboard:** copy buttons use `navigator.clipboard`, so grant `clipboard-read` / `clipboard-write` in Chromium.

## Formats worth testing
- **Analyser hash keys:**
  - `c` (comp with upgrade codes), `w` (make-it-worse)
  - `l` (locks; `wraith:Rowan` = pinned), `m` (map)
  - `p` (plan, or `generalist`), `t` (priorities)
  - `r` (`count~name~code~…`)

  A link describes the whole view: missing keys mean the defaults.
- **Solo hash keys:** `y` (you, as a player code), `m` (map), `p` (your pick position, 1–3), `a` (teammates' legends in pick order, `-` = not entered).
  - Example: `solo/#y=Rowan~28~CHoGjspF.123&m=olympus&p=2&a=bangalore,wraith`.
  - A solo link with no `m=` means any map.
  - Older links without `p=` put you after everyone listed. Their `:h` hover flags are ignored, because hovering now follows from the order.
- **Player codes:** `Name~count~code[.ranks]`, e.g. `Rowan~28~CHoGjspF.123` (roles: entry 1st, secondary 2nd, anchor 3rd). Codes decode through `codeOrder`, so they survive reordering legends in the data files.
- **Back:** analyser swaps add browser history entries, and Back restores the previous comp. The solo page replaces its hash, so it doesn't add history.

## Unit testing the model (no browser)
- **Importing:** `js/package.json` makes the modules importable from Node.
  - `model.js`, `solo.js`, `data.js` and `source.js` don't touch the DOM.
  - From a Playwright TS test, a dynamic `await import('../js/model.js')` is the safest way to load them. Confirm it works in this setup before building on it.
- **Setup recipe** (what the dev scripts do):
  ```ts
  const { loadData } = await import('../js/source.js');
  const { state, pairKey, SCORING_DEFAULTS } = await import('../js/core.js');
  const { buildPerks, refreshWeights, analyse, bestBuild, findTeams } = await import('../js/model.js');
  const { d } = await loadData(async p => { try { return fs.readFileSync('data/' + p, 'utf8'); } catch { return null; } });
  d.scoring = { ...SCORING_DEFAULTS, ...d.scoring }; d.synergies ||= []; d.maps ||= {};
  state.data = d; for (const l of d.legends) state.byId.set(l.id, l); for (const s of d.synergies) state.pairs.set(pairKey(...s.pair), s);
  buildPerks(); refreshWeights();
  state.roster.players = [0, 1, 2].map(() => ({ name: 'anyone', prefs: {}, filler: true }));
  ```
- **Solo model** (`js/solo.js`):
  - `soloPicks(mates, me)` takes `mates` as `[{ id, hover }]` (0–2) and `me` as a player (`{ prefs, roles }`) or `null`. It returns `{ position, exact, list }`, ranked best first.
  - `needed(mates)` lists the comps not yet scored.
  - `judgeComp(ids)` scores one comp, and caches it.
  - `clearCache()` empties that cache. The page calls it after `refreshWeights()` when the map changes.
- **Caching gotchas:**
  - `state` is a module-level singleton.
  - Upgrade builds are cached per legend id for the life of the module.
  - `solo.js` caches comp scores until `clearCache()`.

  So changing data, or the map, between tests in the same worker gives stale results. Load each data variant in its own worker or test file, keep data fixed per file, and call `clearCache()` after any change of map or priorities.
- **Pure functions that are easy to start with:**
  - `validate(d)`, including the popularity checks
  - `parseCsv`
  - `loadData` with an in-memory reader
  - `phaseProfile`
  - the `links.js` player-code round trip (it needs `state.data.codeOrder` and `state.byId`)

## Changes since the earlier handovers that break older tests
- The analyser's results are core cards and chips: `.ccard` / `.fchip` / `#selbar` replace `.sect-row`, `.linkish`, `.core` and the variation rows. Picking now goes through the selection bar.
- Tabs no longer change the plan, so a test that clicked a tab and expected `#plan-chips` to follow needs updating.
- `data/index.json` lists `popularity.json`, so a split fixture folder needs it, or the solo page falls back to equal odds.
- The solo page no longer has a hover/locked toggle (`[data-hover]` is gone). Status follows from `[data-pos]`.
- The analyser moved from `/` to `/comp/`, and the solo page from `/solo.html` to `/solo/`.
- The repo URL changed. `dataview.js`'s "suggest a change" links and every footer point at `apex-buddy`.

## Questions to coach Rowan through before writing tests
- **What would hurt most if it broke silently?** Think about friends' saved codes and shared links, the data loader, and the solo page never writing the analyser's library.
- **What can be asserted without pinning exact scores,** so tests survive data edits? Think about:
  - relationships: A ranks above B; a ★ pick outranks an equal-score non-★ pick
  - invariants:
    - every comp appears once per section
    - a legend is in at most two cores
    - a teammate's legend is never suggested
    - × legends never appear
  - round trips: link → view → link
- **Which fixture data would deliberately trigger each feature?**
  - analyser: a full house, a Dodo, a role gap, a pin whose player isn't ticked, an invalid CSV cell
  - solo page: a popularity file that makes one teammate a near-certainty, or one missing a legend
- **The pick-order rule:** in the solo page, what should change when you move from 2nd to 3rd with the same two teammates entered, and what shouldn't? How would you check the expected scores without hard-coding them? Hint for the coach: compare against `soloPicks` called directly in Node.
- **Node or browser?** Which checks belong in Node unit tests, and which need a browser?
