/* eslint-disable no-console -- command-line script */
// Expected-damage regression check for the Genshin DPS simulator (the
// cases live in the simulator's __tests__/goldenCases.ts).
//   npx tsx scripts/sim-golden.ts            write scripts/sim-golden.json
//   npx tsx scripts/sim-golden.ts --compare  diff against the stored file
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  goldenChangePercent,
  runGoldenCases,
} from '../src/app/genshin-dps-simulator/__tests__/goldenCases';

const GOLDEN_PATH = join(__dirname, 'sim-golden.json');
const TOLERANCE_PERCENT = 0.1;

const compare = (current: Record<string, number>): number => {
  if (!existsSync(GOLDEN_PATH)) {
    console.error(`No golden file at ${GOLDEN_PATH}; run without --compare.`);
    return 1;
  }
  const golden: Record<string, number> = JSON.parse(
    readFileSync(GOLDEN_PATH, 'utf8')
  );
  let failures = 0;
  for (const id of Array.from(
    new Set([...Object.keys(golden), ...Object.keys(current)])
  )) {
    const before = golden[id];
    const after = current[id];
    if (before === undefined || after === undefined) {
      console.log(
        `${id}: ${before ?? '—'} -> ${after ?? '—'} (case added/removed)`
      );
      failures++;
      continue;
    }
    const percent = goldenChangePercent(before, after);
    const ok = Math.abs(percent) <= TOLERANCE_PERCENT;
    if (!ok) {
      failures++;
    }
    console.log(
      `${ok ? 'ok  ' : 'DIFF'} ${id}: ${before} -> ${after} (${percent.toFixed(
        2
      )}%)`
    );
  }
  console.log(
    failures === 0 ? 'All cases match.' : `${failures} case(s) differ.`
  );
  return failures === 0 ? 0 : 1;
};

const current = runGoldenCases();
if (process.argv.includes('--compare')) {
  process.exit(compare(current));
}
writeFileSync(GOLDEN_PATH, `${JSON.stringify(current, null, 2)}\n`);
console.log(`Wrote ${Object.keys(current).length} cases to ${GOLDEN_PATH}`);
