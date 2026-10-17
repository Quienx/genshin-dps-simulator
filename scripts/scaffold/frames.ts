/* eslint-disable no-console -- command-line script */
// A gcsim character's timings, read from its .go files: hitmarks, frame
// slices (end and cancels), cooldowns, Energy, charges, every AttackInfo
// (element, gauge, ICD) and particles. Written next to the character draft
// (scripts/scaffolds/<key>.frames.json); character.ts reads it too.
//   npx tsx scripts/scaffold/frames.ts <gcsim key> [--out <file>]
import { join } from 'node:path';

import { FramesReport, parseGoFrames } from './goFrames';
import {
  DRAFTS,
  fetchJson,
  fetchText,
  GCSIM,
  GCSIM_API,
  Json,
  option,
  run,
  writeDraft,
} from './shared';

// Every .go file of a gcsim character (its dm.go's constants too).
export const fetchFrames = async (key: string): Promise<FramesReport> => {
  const files = (
    (await fetchJson(`${GCSIM_API}/characters/${key}`)) as unknown as Json[]
  )
    .map((file) => String(file.name))
    .filter((name) => name.endsWith('.go'));
  const sources = await Promise.all(
    files.map((name) =>
      fetchText(`${GCSIM}/internal/characters/${key}/${name}`)
    )
  );
  return parseGoFrames(sources);
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const key = args[0];
  if (!key) {
    console.error(
      'Usage: npx tsx scripts/scaffold/frames.ts <gcsim key> [--out <file>]'
    );
    process.exit(1);
  }
  run(async () => {
    const report = await fetchFrames(key);
    const out = option(args, '--out') ?? join(DRAFTS, `${key}.frames.json`);
    writeDraft(out, report);
    console.log(`Wrote ${out}`);
    Object.entries(report.frames).forEach(([name, slice]) =>
      console.log(
        `  ${name}: end ${slice.end}${
          slice.hitmark === undefined ? '' : `, hit ${slice.hitmark}`
        }, cancels ${JSON.stringify(slice.cancels)}`
      )
    );
    report.cooldowns.forEach((cooldown) =>
      console.log(
        `  CD ${cooldown.action}: ${cooldown.frames}${
          cooldown.delay === undefined ? '' : ` after ${cooldown.delay}`
        }`
      )
    );
    console.log(
      `  Energy ${report.energy.max ?? '—'}, ${
        report.attacks.length
      } attacks, ${report.particles.length} particle calls`
    );
  });
}
