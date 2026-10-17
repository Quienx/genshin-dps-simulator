/* eslint-disable no-console -- command-line script */
// An artifact set's catalog entry draft (_data/sets/<id>.json), from
// Project Amber: its pieces with their icons, the 2- and 4-piece texts and a
// flag for each. Its blocks (and screenStats, for a 2-piece that shows on
// the character screen) are TODOs (gcsim: internal/artifacts/<key>).
//   npx tsx scripts/scaffold/set.ts "<name>" [--out <file>]
import { join } from 'node:path';

import {
  camel,
  DRAFTS,
  findByName,
  inCatalog,
  option,
  plain,
  run,
  slug,
  writeDraft,
} from './shared';

// The pieces, in the files' order, by Amber's icon suffix.
const PIECES = [
  ['flower', 'Flower', 4],
  ['plume', 'Plume', 2],
  ['sands', 'Sands', 5],
  ['goblet', 'Goblet', 1],
  ['circlet', 'Circlet', 3],
] as const;

const args = process.argv.slice(2);
const name = args[0];
if (!name) {
  console.error(
    'Usage: npx tsx scripts/scaffold/set.ts "<name>" [--out <file>]'
  );
  process.exit(1);
}

run(async () => {
  const set = await findByName('reliquary', name);
  const id = slug(set.name);
  const flag = camel(set.name);
  const texts = Object.values(set.affixList as Record<string, string>).map(
    plain
  );
  const flags = texts.map((_, index) => `${flag}${index === 0 ? 2 : 4}`);

  const draft = {
    _todo: [
      `blocks: the 2- and 4-piece effects (gcsim internal/artifacts/...), with ifFlag "${
        flags[0]
      }" / "${flags[1] ?? ''}"`,
      'screenStats: a 2-piece stat that shows on the character screen (ATK +18%), if any',
    ],
    id,
    name: set.name,
    pieces: PIECES.map(([pieceId, label, suffix]) => ({
      id: pieceId,
      label,
      icon: `UI_RelicIcon_${set.id}_${suffix}`,
    })),
    rows: texts.map((value, index) => ({
      id: index === 0 ? 'set-two-piece' : 'set-four-piece',
      label: index === 0 ? '2-piece' : '4-piece',
      value,
      flag: flags[index],
    })),
    blocks: 'TODO',
    // A character that names it gets these unless its own defaults say
    // otherwise.
    defaults: {
      flags: Object.fromEntries(flags.map((entry) => [entry, true])),
    },
  };

  const out = option(args, '--out') ?? join(DRAFTS, 'sets', `${id}.json`);
  writeDraft(out, draft);
  console.log(
    `Wrote ${out}${
      inCatalog('sets', id) ? ` (already in the catalog as "${id}")` : ''
    }`
  );
});
