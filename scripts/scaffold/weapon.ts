/* eslint-disable no-console -- command-line script */
// A weapon's catalog entry draft (_data/weapons/<id>.json), from Project
// Amber: level 90 base ATK and substat, icon, rarity, the passive's name and
// text at R1-R5, and a flag and refinement field to name it by. Its rows'
// templates and its blocks are TODOs (gcsim: internal/weapons/<type>/<key>).
//   npx tsx scripts/scaffold/weapon.ts "<name>" [--out <file>]
import { join } from 'node:path';

import {
  camel,
  DRAFTS,
  findByName,
  inCatalog,
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

const args = process.argv.slice(2);
const name = args[0];
if (!name) {
  console.error(
    'Usage: npx tsx scripts/scaffold/weapon.ts "<name>" [--out <file>]'
  );
  process.exit(1);
}

run(async () => {
  const weapon = await findByName('weapon', name);
  const id = slug(weapon.name);
  const stats = await level90(weapon.upgrade, 'weaponCurve');
  const [, substat] = weapon.upgrade.prop;
  const affix = Object.values(weapon.affix ?? {})[0] as
    | { name: string; upgrade: Record<string, string> }
    | undefined;
  const flag = camel(weapon.name);
  const refinementField = `${flag}Refinement`;

  const draft = {
    _todo: [
      'rows: the passive as a template with params per refinement (screenStat for an always-on stat)',
      `blocks: its effects (gcsim internal/weapons/${String(
        WEAPON_TYPES[weapon.type] ?? ''
      ).toLowerCase()}/...), with ifFlag "${flag}" and scaleBy { field: "${refinementField}" }`,
    ],
    id,
    name: weapon.name,
    icon: weapon.icon,
    type: WEAPON_TYPES[weapon.type] ?? weapon.type,
    rarity: weapon.rank,
    level: 90,
    enabledFlag: flag,
    refinementField,
    baseAtk: Math.round(stats.FIGHT_PROP_BASE_ATTACK),
    substat: substat
      ? {
          stat: SCREEN_STATS[substat.propType] ?? substat.propType,
          value: screenValue(substat.propType, stats[substat.propType]),
        }
      : null,
    rows: [
      {
        id: 'weapon-passive',
        label: `R{refinement} passive: ${affix?.name ?? 'TODO'}`,
        status: 'included',
        template: 'TODO',
        params: {},
      },
    ],
    passive: affix
      ? {
          name: affix.name,
          descriptions: Object.values(affix.upgrade).map(plain),
        }
      : null,
    blocks: 'TODO',
    // A character that names it gets these unless its own defaults say
    // otherwise.
    defaults: { numbers: { [refinementField]: 1 }, flags: { [flag]: true } },
  };

  const out = option(args, '--out') ?? join(DRAFTS, 'weapons', `${id}.json`);
  writeDraft(out, draft);
  console.log(
    `Wrote ${out}${
      inCatalog('weapons', id) ? ` (already in the catalog as "${id}")` : ''
    }`
  );
});
