/* eslint-disable no-console -- command-line script */
// Checks a character file (a draft too: it need not be registered). It is
// loaded as the app loads it (schema, references, catalog), then played
// alone with its defaults and expected CRITs (its `automatic` list), and
// what happened is printed: the actions, every hit, the particles and the
// Energy, the totals. With --team, registered teammates play along (the
// file's character still plays its automatic list on the field).
//   npx tsx scripts/scaffold/check.ts <file> [--team id,id] [--seconds 60] [--all]
import { readFileSync } from 'node:fs';

import { option } from './shared';
import { loadCharacterFile } from '../../src/app/genshin-dps-simulator/_lib/characterData';
import { simulateTeam } from '../../src/app/genshin-dps-simulator/_lib/engine/simulateTeam';
import {
  buildDefaultValues,
  buildDefaultValuesFor,
  parseValues,
} from '../../src/app/genshin-dps-simulator/_lib/simulationValues';
import { CharacterId } from '../../src/app/genshin-dps-simulator/_lib/types';

const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error(
    'Usage: npx tsx scripts/scaffold/check.ts <file> [--team id,id] [--seconds 60] [--all]'
  );
  process.exit(1);
}

const round = (value: number, digits = 0) =>
  Math.round(value * 10 ** digits) / 10 ** digits;
const seconds = (frame: number) => `${round(frame / 60, 2)} s`;
const table = (rows: (string | number)[][]) => {
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => String(row[column]).length))
  );
  rows.forEach((row) =>
    console.log(
      row.map((cell, column) => String(cell).padEnd(widths[column])).join('  ')
    )
  );
};

let loaded: ReturnType<typeof loadCharacterFile>;
try {
  loaded = loadCharacterFile(JSON.parse(readFileSync(file, 'utf8')));
} catch (error) {
  console.error(
    `Does not load:\n${error instanceof Error ? error.message : error}`
  );
  process.exit(1);
}

const { character } = loaded;
const values = buildDefaultValuesFor(character);
const duration = option(args, '--seconds');
if (duration) {
  values.numbers.duration = duration;
}
const teammates = (option(args, '--team') ?? '')
  .split(',')
  .filter(Boolean)
  .map((id) => ({
    characterId: id,
    values: parseValues(buildDefaultValues(id as CharacterId)),
  }));
const run = simulateTeam(
  [
    { characterId: character.id, values: parseValues(values), loaded },
    ...teammates,
  ],
  null,
  { critMode: 'expected', auras: teammates.length > 0 }
);
const member = run.members[0];
const hits = member.context.hitLog;

console.log(
  `\n${character.name}: loads. ${readNumberOf('duration')} s alone${
    teammates.length
      ? ` with ${teammates.map((t) => t.characterId).join(', ')}`
      : ''
  }.\n`
);

function readNumberOf(name: string) {
  return values.numbers[name];
}

console.log('Actions');
table([
  ['start', 'end', 'action', 'warning'],
  ...run.rotationTrace
    .filter((entry) => entry.action.startsWith(`${character.id}:`))
    .slice(0, args.includes('--all') ? undefined : 30)
    .map((entry) => [
      `${round(entry.startTime, 2)}`,
      `${round(entry.endTime, 2)}`,
      entry.label,
      entry.warning ?? '',
    ]),
]);

console.log('\nHits');
table([
  ['frame', 'source', 'category', 'element', 'reaction', 'CRIT %', 'DMG'],
  ...hits
    .slice(0, args.includes('--all') ? undefined : 40)
    .map((hit) => [
      Math.round(hit.time * 60),
      hit.sourceId ?? hit.actionId ?? '',
      hit.category,
      hit.element,
      hit.reaction === 'None' ? '' : hit.reaction,
      round(hit.critRate * 100, 1),
      round(hit.damage),
    ]),
]);
if (!args.includes('--all') && hits.length > 40) {
  console.log(`… ${hits.length - 40} more (--all)`);
}

console.log('\nParticles');
table([
  ['made', 'caught', 'count', 'element', 'by'],
  ...run.events
    .filter(
      (event) =>
        event.kind === 'particles' && event.characterId === character.id
    )
    .map((event) => [
      seconds(event.frame),
      seconds(Number(event.detail?.arrives ?? event.frame)),
      round(Number(event.detail?.count ?? 0), 2),
      String(event.detail?.element ?? ''),
      event.blockId ?? '',
    ]),
]);

const energy = member.activity?.resources.energy ?? [];
if (energy.length > 0) {
  console.log('\nEnergy');
  console.log(
    energy
      .slice(0, 30)
      .map((point) => `${seconds(point.frame)}=${round(point.value, 1)}`)
      .join('  ')
  );
}

const sum = (key: (hit: (typeof hits)[number]) => string) => {
  const totals = new Map<string, { hits: number; damage: number }>();
  hits
    .filter((hit) => hit.counted)
    .forEach((hit) => {
      const entry = totals.get(key(hit)) ?? { hits: 0, damage: 0 };
      entry.hits += 1;
      entry.damage += hit.damage;
      totals.set(key(hit), entry);
    });
  return Array.from(totals.entries())
    .sort((a, b) => b[1].damage - a[1].damage)
    .map(([name, entry]) => [
      name,
      entry.hits,
      round(entry.damage),
      `${round((entry.damage / member.context.totalDamage) * 100, 1)}%`,
    ]);
};
console.log('\nBy category');
table([['category', 'hits', 'DMG', 'share'], ...sum((hit) => hit.category)]);
console.log('\nBy source');
table([
  ['source', 'hits', 'DMG', 'share'],
  ...sum((hit) => hit.sourceId ?? hit.actionId ?? hit.category),
]);
const counted = Number(readNumberOf('duration'));
console.log(
  `\nTotal ${round(member.context.totalDamage)} DMG, ${round(
    member.context.totalDamage / counted,
    2
  )} DPS over ${counted} s.`
);
