/* eslint-disable no-console -- command-line script */
// A character file's draft, from gcsim (talent multipliers) and Project
// Amber (level 90 stats, icons, official texts, weapon, artifact set). The
// mechanics (frames, blocks, systems, rotation) are left as TODOs: write
// them from gcsim's .go files, listed in `_sources`.
//   npx tsx scripts/character-scaffold.ts <gcsim key> --weapon "<name>" \
//     --set "<name>" [--out <file>]
// e.g. npx tsx scripts/character-scaffold.ts mavuika \
//   --weapon "A Thousand Blazing Suns" --set "Obsidian Codex"
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { parseDmTables } from './character-scaffold/dmTables';

const GCSIM = 'https://raw.githubusercontent.com/genshinsim/gcsim/main';
const GCSIM_API =
  'https://api.github.com/repos/genshinsim/gcsim/contents/internal/characters';
const AMBER = 'https://gi.yatta.moe/api/v2/en';
// Curves have no language.
const AMBER_STATIC = 'https://gi.yatta.moe/api/v2/static';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ELEMENTS: Record<string, string> = {
  Fire: 'Pyro',
  Water: 'Hydro',
  Elec: 'Electro',
  Ice: 'Cryo',
  Wind: 'Anemo',
  Rock: 'Geo',
  Grass: 'Dendro',
};
const WEAPON_TYPES: Record<string, string> = {
  WEAPON_SWORD_ONE_HAND: 'Sword',
  WEAPON_CLAYMORE: 'Claymore',
  WEAPON_POLE: 'Polearm',
  WEAPON_CATALYST: 'Catalyst',
  WEAPON_BOW: 'Bow',
};
// Project Amber's stat names → the character file's screen stats.
const SCREEN_STATS: Record<string, string> = {
  FIGHT_PROP_CRITICAL: 'critRate',
  FIGHT_PROP_CRITICAL_HURT: 'critDamage',
  FIGHT_PROP_ATTACK_PERCENT: 'atkPercent',
  FIGHT_PROP_HP_PERCENT: 'hpPercent',
  FIGHT_PROP_DEFENSE_PERCENT: 'defPercent',
  FIGHT_PROP_ELEMENT_MASTERY: 'elementalMastery',
  FIGHT_PROP_CHARGE_EFFICIENCY: 'energyRecharge',
};
const PERCENT_PROPS = new Set(
  Object.keys(SCREEN_STATS).filter(
    (prop) => prop !== 'FIGHT_PROP_ELEMENT_MASTERY'
  )
);
// The set's pieces, in the file's order, by Amber's slot and icon suffix.
const PIECES = [
  ['flower', 'Flower', 4],
  ['plume', 'Plume', 2],
  ['sands', 'Sands', 5],
  ['goblet', 'Goblet', 1],
  ['circlet', 'Circlet', 3],
] as const;

const fetchText = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} for ${url}`);
  }
  return response.text();
};
const fetchJson = async (url: string): Promise<Json> =>
  JSON.parse(await fetchText(url));

// Amber's text without its markup and links.
const plain = (raw: string | undefined) =>
  (raw ?? '')
    .replace(/\{LINK#[^}]*\}/g, '')
    .replace(/\{\/LINK\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, '\n')
    .trim();

const findByName = async (kind: string, name: string) => {
  const items: Record<string, Json> = (await fetchJson(`${AMBER}/${kind}`)).data
    .items;
  const found = Object.entries(items).find(
    ([, item]) => String(item.name).toLowerCase() === name.toLowerCase()
  );
  if (!found) {
    throw new Error(`Project Amber has no ${kind} named "${name}"`);
  }
  return (await fetchJson(`${AMBER}/${kind}/${found[0]}`)).data as Json;
};

// Level 90 value of each base stat: its curve at 90 plus the last ascension.
const level90 = (
  upgrade: Json,
  curve: Record<string, number>
): Record<string, number> => {
  const added: Record<string, number> = upgrade.promote.at(-1).addProps ?? {};
  return Object.fromEntries(
    upgrade.prop.map((prop: Json) => [
      prop.propType,
      prop.initValue * curve[prop.type] + (added[prop.propType] ?? 0),
    ])
  );
};

const curveAt90 = async (kind: 'avatarCurve' | 'weaponCurve') => {
  const data = (await fetchJson(`${AMBER_STATIC}/${kind}`)).data;
  return (data['90'].curveInfos ?? data['90']) as Record<string, number>;
};

const args = process.argv.slice(2);
const option = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const key = args[0];
const weaponName = option('--weapon');
const setName = option('--set');
if (!key || !weaponName || !setName) {
  console.error(
    'Usage: npx tsx scripts/character-scaffold.ts <gcsim key> --weapon "<name>" --set "<name>" [--out <file>]'
  );
  process.exit(1);
}

const main = async () => {
  const dm = await fetchText(
    `${GCSIM}/internal/characters/${key}/zz_${key}.dm.go`
  );
  const tables = parseDmTables(dm);
  const goFiles: string[] = (
    (await fetchJson(`${GCSIM_API}/${key}`)) as unknown as Json[]
  )
    .map((file) => file.name)
    .filter((name: string) => name.endsWith('.go'));

  const avatar = await findByName('avatar', key);
  const weapon = await findByName('weapon', weaponName);
  const set = await findByName('reliquary', setName);

  const stats = level90(avatar.upgrade, await curveAt90('avatarCurve'));
  const ascension = Object.entries(
    avatar.upgrade.promote.at(-1).addProps as Record<string, number>
  ).find(([prop]) => !prop.startsWith('FIGHT_PROP_BASE_'));
  const ascensionStat = ascension
    ? {
        stat: SCREEN_STATS[ascension[0]] ?? 'elementalDmg',
        value:
          Math.round(
            ascension[1] * (ascension[0].endsWith('MASTERY') ? 1 : 100) * 10
          ) / 10,
      }
    : null;
  const weaponStats = level90(weapon.upgrade, await curveAt90('weaponCurve'));
  const [, substatProp] = weapon.upgrade.prop;
  const substatValue = weaponStats[substatProp?.propType];

  const talents = Object.values(avatar.talent as Record<string, Json>);
  const combat = talents.filter((talent) => talent.type !== 2);
  const passives = talents.filter((talent) => talent.type === 2);
  const talentOf = (kind: 'attack' | 'skill' | 'burst') =>
    kind === 'attack'
      ? combat[0]
      : kind === 'skill'
      ? combat[1]
      : combat.find((t) => t.type === 1);

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
                values: table.values.map((v) => Math.round(v * 10000) / 100),
              },
        ],
        timing: 'TODO',
      }));

  const draft = {
    _sources: {
      gcsim: goFiles.map(
        (name) => `${GCSIM}/internal/characters/${key}/${name}`
      ),
      amber: [
        `${AMBER}/avatar/${avatar.id}`,
        `${AMBER}/weapon/${weapon.id}`,
        `${AMBER}/reliquary/${set.id}`,
      ],
    },
    _todo: [
      'timings (hitmarks, end, cancels, gauge, icd) from the .go files',
      'cooldowns, energyCost, actions, forms',
      'blocks: passives, constellations, weapon and set effects',
      'systems, automatic, rotation, fields, details',
      'defaults: character screen totals of the build',
      'check each row component stat (atk / hp / def / em) and drop the unused rows',
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
    ascensionStat,
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
        boostedBy: 'TODO (c3 or c5)',
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
    weapon: {
      name: weapon.name,
      icon: weapon.icon,
      type: WEAPON_TYPES[weapon.type] ?? weapon.type,
      rarity: weapon.rank,
      level: 90,
      enabledFlag: 'TODO',
      refinementField: 'TODO',
      baseAtk: Math.round(weaponStats.FIGHT_PROP_BASE_ATTACK),
      substat: substatProp
        ? {
            stat: SCREEN_STATS[substatProp.propType] ?? substatProp.propType,
            value:
              Math.round(
                substatValue *
                  (PERCENT_PROPS.has(substatProp.propType) ? 100 : 1) *
                  10
              ) / 10,
          }
        : null,
      rows: 'TODO',
      passive: (() => {
        const affix = Object.values(
          (weapon.affix ?? {}) as Record<string, Json>
        )[0];
        return affix
          ? {
              name: affix.name,
              descriptions: Object.values(
                affix.upgrade as Record<string, string>
              ).map(plain),
            }
          : null;
      })(),
      blocks: 'TODO',
    },
    artifactSet: {
      name: set.name,
      pieces: PIECES.map(([id, label, suffix]) => ({
        id,
        label,
        icon: `UI_RelicIcon_${set.id}_${suffix}`,
      })),
      rows: Object.values(set.affixList as Record<string, string>).map(
        (text, index) => ({
          id: index === 0 ? 'set-two-piece' : 'set-four-piece',
          label: index === 0 ? '2-piece' : '4-piece',
          value: plain(text),
        })
      ),
      blocks: 'TODO',
    },
    defaults: 'TODO',
    fields: 'TODO',
    rotation: 'TODO',
    systems: 'TODO',
    automatic: 'TODO',
    details: 'TODO',
  };

  const out = option('--out') ?? join(__dirname, 'scaffolds', `${key}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(draft, null, 2)}\n`);
  console.log(
    `Wrote ${out}: ${tables.length} talent tables, ${goFiles.length} gcsim files`
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
