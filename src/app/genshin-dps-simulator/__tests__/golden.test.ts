import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { goldenChangePercent, runGoldenCases } from './goldenCases';

// Pinned expected DPS. When a change in results is intended, regenerate it
// with `npx tsx scripts/sim-golden.ts` and review the diff.
const GOLDEN_PATH = join(__dirname, '../../../../scripts/sim-golden.json');
const TOLERANCE_PERCENT = 0.1;

const golden: Record<string, number> = JSON.parse(
  readFileSync(GOLDEN_PATH, 'utf8')
);
const current = runGoldenCases();

describe('golden expected DPS', () => {
  it('covers the same cases as the pinned file', () => {
    expect(Object.keys(current).sort()).toEqual(Object.keys(golden).sort());
  });

  it.each(Object.keys(golden))('%s', (id) => {
    const before = golden[id];
    const after = current[id];
    const percent = goldenChangePercent(before, after);
    expect(
      Math.abs(percent),
      `${id}: ${before} -> ${after} (${percent.toFixed(2)}%)`
    ).toBeLessThanOrEqual(TOLERANCE_PERCENT);
  });
});
