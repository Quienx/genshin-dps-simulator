/* eslint-disable no-console -- command-line script */
// The character screen totals of a standard build (KQM's convention), for a
// character file's `defaults.numbers`: its base stats, weapon (at the
// refinement given, R1 by default), set and a 5★ +20 artifact build.
//   npx tsx scripts/scaffold/build.ts <file> --sands atkPercent \
//     --goblet elementalDmg --circlet critRate \
//     --subs critRate:8,critDamage:8,atkPercent:2,energyRecharge:2 \
//     [--refinement 1]
import { readFileSync } from 'node:fs';

import { buildArtifacts, BuildSpec, parseLiquid } from './kqmsBuild';
import { option } from './shared';
import { computeScreenStats } from '../../src/app/genshin-dps-simulator/_lib/artifacts';
import { loadCharacterFile } from '../../src/app/genshin-dps-simulator/_lib/characterData';
import { ScreenStat } from '../../src/app/genshin-dps-simulator/_lib/characterSchema';
import {
  buildDefaultValuesFor,
  parseValues,
} from '../../src/app/genshin-dps-simulator/_lib/simulationValues';

const args = process.argv.slice(2);
const file = args[0];
const sands = option(args, '--sands') as ScreenStat | undefined;
const goblet = option(args, '--goblet') as ScreenStat | undefined;
const circlet = option(args, '--circlet') as ScreenStat | undefined;
const subs = option(args, '--subs');
if (!file || !sands || !goblet || !circlet || !subs) {
  console.error(
    'Usage: npx tsx scripts/scaffold/build.ts <file> --sands <stat> --goblet <stat> --circlet <stat> --subs stat:rolls,stat,… [--refinement n]'
  );
  process.exit(1);
}

const { character } = loadCharacterFile(JSON.parse(readFileSync(file, 'utf8')));
const values = buildDefaultValuesFor(character);
const refinement = option(args, '--refinement');
if (refinement) {
  values.numbers[character.weapon.refinementField] = refinement;
}
const spec: BuildSpec = { sands, goblet, circlet, liquid: parseLiquid(subs) };
const totals = computeScreenStats(
  character,
  parseValues(values),
  buildArtifacts(spec)
);
const round = (value: number) => Math.round(value * 10) / 10;
const numbers = {
  atk: Math.round(totals.atk),
  hp: Math.round(totals.hp),
  def: Math.round(totals.def),
  em: round(totals.em),
  cr: round(totals.cr),
  cd: round(totals.cd),
  energyRecharge: round(totals.energyRecharge),
  elementalBonus: round(totals.elementalBonus),
};
console.log(
  `${character.name} with ${character.weapon.name} R${refinement ?? 1} and ${
    character.artifactSet.name
  }: ${sands} / ${goblet} / ${circlet}, extra rolls ${subs}`
);
console.log(JSON.stringify(numbers, null, 2));
