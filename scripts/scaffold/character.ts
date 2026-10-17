/* eslint-disable no-console -- command-line script */
// A character file's draft, from gcsim (talent multipliers) and Project
// Amber (level 90 stats, icons, official texts). The weapon and the set are
// named by their catalog id (_data/weapons, _data/sets): one not in the
// catalog yet gets a hint to draft it (scaffold/weapon.ts, scaffold/set.ts).
// The mechanics (frames, blocks, systems, rotation) are TODOs: write them
// from gcsim's .go files, listed in `_sources`.
//   npx tsx scripts/scaffold/character.ts <gcsim key> [--weapon "<name>"] \
//     [--set "<name>"] [--out <file>]
import { join } from 'node:path';

import { parseDmTables } from './dmTables';
import {
  AMBER,
  DRAFTS,
  fetchJson,
  fetchText,
  findByName,
  GCSIM,
  GCSIM_API,
  inCatalog,
  Json,
  level90,
  option,
  plain,
  run,
  SCREEN_STATS,
  screenValue,
  slug,
  WEAPON_TYPES,
  writeDraft,
} from './shared';

const ELEMENTS: Record<string, string> = {
  Fire: 'Pyro',
  Water: 'Hydro',
  Elec: 'Electro',
  Ice: 'Cryo',
  Wind: 'Anemo',
  Rock: 'Geo',
  Grass: 'Dendro',
};

const args = process.argv.slice(2);
const key = args[0];
if (!key) {
  console.error(
    'Usage: npx tsx scripts/scaffold/character.ts <gcsim key> [--weapon "<name>"] [--set "<name>"] [--out <file>]'
  );
  process.exit(1);
}

// A weapon or set by catalog id, with a hint when it is not there yet.
const catalogRef = (
  folder: 'weapons' | 'sets',
  name: string | undefined,
  script: string,
  hints: string[]
) => {
  if (!name) {
    return 'TODO';
  }
  const id = slug(name);
  if (!inCatalog(folder, id)) {
    hints.push(
      `"${id}" is not in the catalog yet: npx tsx scripts/scaffold/${script}.ts "${name}"`
    );
  }
  return id;
};

run(async () => {
  const dm = await fetchText(
    `${GCSIM}/internal/characters/${key}/zz_${key}.dm.go`
  );
  const tables = parseDmTables(dm);
  const goFiles: string[] = (
    (await fetchJson(`${GCSIM_API}/characters/${key}`)) as unknown as Json[]
  )
    .map((file) => file.name)
    .filter((name: string) => name.endsWith('.go'));
  const avatar = await findByName('avatar', key);
  const stats = await level90(avatar.upgrade, 'avatarCurve');
  const ascension = Object.entries(
    avatar.upgrade.promote.at(-1).addProps as Record<string, number>
  ).find(([prop]) => !prop.startsWith('FIGHT_PROP_BASE_'));

  const talents = Object.values(avatar.talent as Record<string, Json>);
  const combat = talents.filter((talent) => talent.type !== 2);
  const passives = talents.filter((talent) => talent.type === 2);
  const talentOf = (kind: 'attack' | 'skill' | 'burst') =>
    kind === 'attack'
      ? combat[0]
      : kind === 'skill'
      ? combat[1]
      : combat.find((talent) => talent.type === 1);
  const rowsOf = (kind: 'attack' | 'skill' | 'burst') =>
    tables
      .filter((table) => table.talent === kind)
      .map((table) => ({
        type: 'multiplier',
        id: table.id,
        label: table.label,
        components: [
          table.flat
            ? { stat: 'flat', values: table.values }
            : {
                stat: 'atk',
                values: table.values.map(
                  (value) => Math.round(value * 10000) / 100
                ),
              },
        ],
        timing: 'TODO',
      }));

  const hints: string[] = [];
  const weapon = catalogRef(
    'weapons',
    option(args, '--weapon'),
    'weapon',
    hints
  );
  const artifactSet = catalogRef('sets', option(args, '--set'), 'set', hints);

  const draft = {
    _sources: {
      gcsim: goFiles.map(
        (name) => `${GCSIM}/internal/characters/${key}/${name}`
      ),
      amber: `${AMBER}/avatar/${avatar.id}`,
    },
    _todo: [
      'timings (hitmarks, end, cancels, gauge, icd) from the .go files',
      'cooldowns, energyCost, actions, forms',
      'blocks: passives and constellations',
      'systems, automatic, rotation, fields, details',
      "defaults: the build's character screen totals",
      'check each row component stat (atk / hp / def / em) and drop the unused rows',
      ...hints,
    ],
    id: key,
    name: avatar.name,
    element: ELEMENTS[avatar.element] ?? avatar.element,
    weaponType: WEAPON_TYPES[avatar.weaponType] ?? avatar.weaponType,
    rarity: avatar.rank,
    scalingStat: 'atk',
    baseStats: {
      hp: Math.round(stats.FIGHT_PROP_BASE_HP),
      atk: Math.round(stats.FIGHT_PROP_BASE_ATTACK),
      def: Math.round(stats.FIGHT_PROP_BASE_DEFENSE),
    },
    ascensionStat: ascension
      ? {
          stat: SCREEN_STATS[ascension[0]] ?? 'elementalDmg',
          value: screenValue(ascension[0], ascension[1]),
        }
      : null,
    icons: { avatar: avatar.icon },
    talents: (['attack', 'skill', 'burst'] as const).map((kind) => {
      const talent = talentOf(kind);
      return {
        id: {
          attack: 'normalAttack',
          skill: 'elementalSkill',
          burst: 'elementalBurst',
        }[kind],
        kind: { attack: 'normal', skill: 'skill', burst: 'burst' }[kind],
        name: talent?.name ?? 'TODO',
        icon: talent?.icon ?? 'TODO',
        levelField: {
          attack: 'normalAttackLevel',
          skill: 'skillLevel',
          burst: 'burstLevel',
        }[kind],
        boostedBy: kind === 'attack' ? null : 'TODO (c3 or c5)',
        description: plain(talent?.description),
        rows: rowsOf(kind),
      };
    }),
    blocks: 'TODO',
    passives: passives.map((passive, index) => ({
      id: `${key}-passive-${index + 1}`,
      name: passive.name,
      icon: passive.icon,
      value: 'TODO: what it does, in a sentence',
      description: plain(passive.description),
    })),
    constellations: Object.values(
      avatar.constellation as Record<string, Json>
    ).map((entry, index) => ({
      id: `c${index + 1}`,
      level: index + 1,
      name: entry.name,
      icon: entry.icon,
      effect: 'TODO',
      impact: 'TODO (simulated / partial / none / not-simulated)',
      note: 'TODO',
      description: plain(entry.description),
    })),
    weapon,
    artifactSet,
    defaults: 'TODO',
    fields: 'TODO',
    rotation: 'TODO',
    systems: 'TODO',
    automatic: 'TODO',
    details: 'TODO',
  };

  const out = option(args, '--out') ?? join(DRAFTS, `${key}.json`);
  writeDraft(out, draft);
  console.log(
    `Wrote ${out}: ${tables.length} talent tables, ${goFiles.length} gcsim files`
  );
  hints.forEach((hint) => console.log(`- ${hint}`));
});
