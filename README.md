# Genshin DPS Simulator

A Genshin Impact damage simulator built on a **generic engine**. Every character is **data**: one JSON file that describes the kit (talents, passives, constellations, weapon, artifact set, rotation). The engine knows nothing about any particular character; it only runs blocks. Shared game mechanics such as Energy, Bond of Life or Nightsoul are **pluggable system modules** that a character turns on in its JSON.

Frames, hitmarks and kit rules are taken from [gcsim](https://github.com/genshinsim/gcsim), so results can be checked against a known reference.

The site is the simulator: `/` opens a team combat timeline with an editable rotation (the old `/genshin-dps-simulator` redirects there). The team or character picked is kept in the URL (`/?team=solo:mavuika`).

Current roster: **Arlecchino, Mualani, Varesa, Iansan, Chevreuse, Nicole, Escoffier, Mavuika, Citlali, Bennett, Xilonen, Sucrose**.

Preset teams: Varesa with Iansan, Chevreuse and Nicole; Mavuika's Melt teams (with Citlali, Escoffier and Bennett; Citlali, Xilonen and Bennett; Citlali, Xilonen and Iansan, after [KQM's guide](https://keqingmains.com/q/mavuika-quickguide/)). The Team button picks any party of up to four.

## Features

- **Solo and team runs.** Up to 4 members share one clock (event queue) against one enemy, with swaps (gcsim's `swap_delay`), team buffs (stats and infusions), shared particles, elemental resonance, and Pyro/Electro/Cryo auras with Overloaded and Melt.
- **Expected or rolled damage.** Expected values average CRITs. The Simulate button rolls them.
- **Real builds.** Enter the character screen totals, or the five artifacts, and the engine computes the screen stats from them. Each build can wear another catalog weapon or artifact set; typed totals follow the change.
- **Combat timeline.** Every action, hit, status and resource on one zoomable timeline, with playback, a combat log, a damage summary, the enemy's state and each member's character sheet.
- **Rotation editor.** Drag-and-drop blocks; an E block with a Hold toggle, a held Charged Attack's spins; pick several blocks (Ctrl/Shift + click, Shift + drag a rectangle) to move or delete them together. Edited rotations are kept in the browser.
- **Validation at load.** Every file is parsed with zod, and every resource or status it names is checked, so a malformed kit fails at import instead of producing `NaN` damage.

## How it works

```
_data/characters/<name>.json
        │  registered in CHARACTER_FILES (_lib/characterData.ts)
        ▼
zod schemas ──────────── characterSchema.ts, actionSchema.ts, engine/schema.ts
        │
        ▼
reference check ──────── engine/validateReferences.ts
        │
        ▼
systems expansion ────── engine/modules/*  (energy, bondOfLife, nightsoul → plain blocks)
        │
        ▼
runtime + kit adapter ── engine/runtime.ts   state, bonuses, triggers, hits
        │                engine/kitAdapter.ts when each action starts, which form it takes
        │                engine/queue.ts      frame-based event queue
        ▼
simulateKit.ts (solo) / simulateTeam.ts (team) → results → UI (_components/)
```

| Path (under `src/app/genshin-dps-simulator/`)     | Role                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `_data/characters/*.json`                         | One file per character                                                 |
| `_data/weapons/*.json`, `_data/sets/*.json`       | The weapon and artifact set catalog (`_lib/catalog.ts`)                |
| `_data/reactions.json`                            | Reaction formulas (Vaporize, Melt, Overloaded)                         |
| `_lib/characterData.ts`                           | `CHARACTER_FILES` registry, `loadCharacterFile()`                      |
| `_lib/characterSchema.ts`, `_lib/actionSchema.ts` | Character and talent schemas; `getCharacterActions()` compiles actions |
| `_lib/engine/schema.ts`                           | Block, condition, trigger and operation schemas                        |
| `_lib/engine/runtime.ts`                          | Simulation state, bonuses, triggers and hits                           |
| `_lib/engine/kitAdapter.ts`                       | Action timing, cancels, forms                                          |
| `_lib/engine/modules/`                            | Shared system modules (`MODULES` in `index.ts`)                        |
| `_lib/engine/simulateKit.ts`                      | Solo runs, `simulateLoadedCharacter()`                                 |
| `_lib/engine/simulateTeam.ts`                     | Team runs, `simulateTeam()`                                            |
| `_lib/team.ts`                                    | Team presets and screen state                                          |
| `_components/timeline/`                           | The timeline UI (`CombatTimelinePage.tsx` is the entry point)          |
| `__tests__/`                                      | Vitest suite (engine features, invariants, golden cases, teams)        |
| `CLAUDE.md`                                       | **Full engine and JSON reference**                                     |

## Core concepts

A character file is mostly **talents** plus a list of **blocks**. There are four block types:

| Block      | What it is                                                                         |
| ---------- | ---------------------------------------------------------------------------------- |
| `bonus`    | A conditional stat, infusion, reaction or multiplier change                        |
| `resource` | A number with min and max (Energy, Bond of Life, Nightsoul points, stacks)         |
| `status`   | A temporary state or mode, with duration, ticks, stacks or drain                   |
| `trigger`  | `when` something happens (hit, use, resource change, status end…), `do` operations |

- **Talents** have multiplier `rows` with gcsim timing (hitmarks, `end`, `cancels`), extra `actions` (hold E, plunges), and `forms`: alternate versions of an action that apply `while` a status holds (for example, Varesa's Fiery Passion attacks).
- **Conditions** (`resource`, `status`, `flag`, `field`, `ready`, `previous`, `all` / `any` / `not`) gate bonuses, triggers, operations and rotation entries.
- **Operations** include `addResource`, `applyStatus`, `addStack`, `reduceCooldown`, `hit`, `reactionHit`, `particles`, `heal` and `count`.
- **Systems** are shared mechanics. A character enables one with params, and the module expands it into ordinary blocks before the run.

Real examples from the character files. Arlecchino's Blood-Debt Directive is a `status` with ticks, and her Normal Attack infusion is a `bonus` gated on a resource:

```json
{
  "id": "directive",
  "type": "status",
  "source": "talent",
  "label": "Blood-Debt Directive",
  "target": "enemy",
  "durationFrames": 1800,
  "ticks": {
    "everyFrames": 300,
    "count": 2,
    "row": "elementalSkill/blood-debt-directive",
    "element": "Pyro",
    "category": "Directive"
  }
}
```

```json
{
  "id": "masque-infusion",
  "type": "bonus",
  "source": "talent",
  "label": "Masque of the Red Death",
  "infuse": "Pyro",
  "match": { "actions": ["normal", "charged"] },
  "while": { "bondOfLife": { "gte": 30 } }
}
```

Mualani turns on the Energy and Nightsoul systems. Her surfing state is Nightsoul's Blessing:

```json
"systems": {
  "energy": { "initialField": "startingEnergy" },
  "nightsoul": {
    "maxPoints": 60,
    "blessing": { "drain": { "everyFrames": 6, "firstAfterFrames": 8 } },
    "nightsoulBurst": {
      "do": [{ "addStack": "wavechaserStacks", "ifFlag": "wavechaserPassive" }]
    }
  }
}
```

The full field reference (every key, trigger, operation, `details` template and gotcha) is in [`src/app/genshin-dps-simulator/CLAUDE.md`](src/app/genshin-dps-simulator/CLAUDE.md).

### Available systems

| Module       | Creates                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `energy`     | Resource `energy` (max = Q cost), particles × ER, flat Energy on Normal/Charged hits by weapon type  |
| `bondOfLife` | Resource `bondOfLife` (%); the kit decides how it is gained and consumed                             |
| `nightsoul`  | Resource `nightsoul`, status `nightsoulBlessing` (drain or fixed duration), optional Nightsoul Burst |

## Design rules

These keep the engine generic. Read them before proposing a change.

1. **A temporary state or mode is a `status` block.** There is no separate "state" type. Natlan modes use Nightsoul's Blessing.
2. **What changes inside a state is a talent `form`** with `"while": { "status": "<id>" }`.
3. **Passives and constellations are `bonus` or `trigger` blocks**, never states.
4. **A mechanic several characters share goes in a `systems` module.** One that belongs to a single character stays in its JSON.
5. **`hook` is the last resort**, for rules no block can express.
6. **Engine changes must be generic.** Never write code for one character. Each engine change needs a test in `__tests__/engineFeatures.test.ts`, and the golden results must stay the same unless the change is meant to move them.
7. **Use gcsim as the source of truth.** If a rule is uncertain, mark the constellation `partial` or `not-simulated` instead of guessing.

## Contributing

### Add a character

1. Scaffold the drafts (written to `scripts/scaffolds/`, not loaded by the app):
   - `npx tsx scripts/scaffold/character.ts <gcsim key> --weapon "<name>" --set "<name>"`: stats, ascension stat, every talent table, icons, official texts, and gcsim's frames.
   - `npx tsx scripts/scaffold/weapon.ts "<name>"` and `scripts/scaffold/set.ts "<name>"` for catalog entries it needs.
2. Write the mechanics (forms, blocks, systems, `automatic`, defaults) and save it as `_data/characters/<name>.json`. Check it unregistered with `npx tsx scripts/scaffold/check.ts <file> [--team id,id]`; `scripts/scaffold/build.ts` gives a standard build's screen totals.
3. Add the import to `CHARACTER_FILES` in `_lib/characterData.ts`. The invariants in `__tests__/invariants.test.ts` then cover it automatically.
4. Add cases to `__tests__/goldenCases.ts`, then regenerate the golden file with `npx tsx scripts/sim-golden.ts`.
5. Add a row to the "What each character uses" table in `CLAUDE.md`.

If the kit needs something no block can express, that is an engine feature (see below), not a reason for character-specific code.

### Add a shared mechanic (system module)

For mechanics like Bond of Life or Nightsoul that several characters share:

1. Create `_lib/engine/modules/<name>.ts`. It validates its own params and returns plain `Block[]`.
2. Register it in `MODULES` in `_lib/engine/modules/index.ts`.
3. Test it in `__tests__/engineFeatures.test.ts` using the helpers in `__tests__/fixtures.ts`.
4. Document its params in the module table in `CLAUDE.md`.

### Change the engine

- Only generic features. Write the failing test first, then the fix.
- `npx tsx scripts/sim-golden.ts --compare` must pass (0.1% tolerance) unless the change is meant to move results. In that case, regenerate the golden file and explain why in the PR.

### Before opening a PR

```bash
pnpm test
pnpm typecheck
pnpm lint
npx tsx scripts/sim-golden.ts --compare
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), and commitlint enforces it.

## For AI agents

- Read [`src/app/genshin-dps-simulator/CLAUDE.md`](src/app/genshin-dps-simulator/CLAUDE.md) before touching the simulator. It is the authoritative reference.
- Characters are JSON only. Never add `if (character === …)` logic to the engine.
- Before creating a module or a new block type, check whether the existing blocks, forms or systems already cover the rule.
- For bug fixes, confirm the bug with a failing test, then fix it.
- Keep docs in English.

## Roadmap

Gaps in the engine, roughly in order of impact. The details are in `CLAUDE.md`.

- The rest of the reaction table in teams: Swirl (Sucrose's A1, VV 4-piece), Crystallize, Vaporize with Hydro auras, Electro-Charged, coexisting auras
- Additive reactions (Aggravate, Spread) and the remaining transformative reactions
- A party shield state, more resonances (Geo, Hydro, Dendro, Anemo)
- Team buffs by the receiver's element or weapon, per-member counters, charges changed by a constellation, a Nightsoul Burst a kit can force (Xilonen, Sucrose)
- Healing and shields as simulated values; a jump action (Mavuika's Flamestrider plunge)

Planned characters include Flins, Navia and Zhongli.

## Getting started

Use **pnpm** so the Husky hooks work.

```bash
git clone git@github.com:Quienx/genshin-dps-simulator.git
cd genshin-dps-simulator
pnpm install
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

### Deploy on Vercel

Import the GitHub repository in Vercel; it detects Next.js and pnpm. Set the environment variable `ENABLE_EXPERIMENTAL_COREPACK=1` (so it uses the `packageManager` pnpm version) and Node.js 20 or later. Every push to `main` deploys. The site URL (metadata, sitemap) comes from the production domain; elsewhere, set `SITE_URL` (for example `https://example.com`, no trailing `/`).

| Command           | What it does                              |
| ----------------- | ----------------------------------------- |
| `pnpm dev`        | Start the dev server                      |
| `pnpm build`      | Production build (also generates sitemap) |
| `pnpm test`       | Run the Vitest suite once                 |
| `pnpm test:watch` | Run Vitest in watch mode                  |
| `pnpm typecheck`  | Type-check with `tsc`                     |
| `pnpm lint`       | Lint with ESLint                          |
| `pnpm format`     | Format with Prettier                      |

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui on Radix, zod, `@dnd-kit`, Vitest.

## Credits

- Frames, hitmarks and kit rules: [gcsim](https://github.com/genshinsim/gcsim)
- Rotations for Mavuika's teams: [KQM's Mavuika guide](https://keqingmains.com/q/mavuika-quickguide/)
- Ascension stats: [Project Amber](https://gi.yatta.moe)
- Bootstrapped from [theodorusclarence/ts-nextjs-tailwind-starter](https://github.com/theodorusclarence/ts-nextjs-tailwind-starter)
