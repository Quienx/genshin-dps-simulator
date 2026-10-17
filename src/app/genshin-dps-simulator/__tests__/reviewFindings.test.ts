// Review findings outside the engine (data, results, export): each test
// reproduces a reported problem.
import { describe, expect, it } from 'vitest';

import {
  block,
  createFileRuntime,
  editCharacter,
  simulateFile,
} from './fixtures';
import { goldenChangePercent } from './goldenCases';
import { getCharacterData } from '../_lib/characterData';
import { getBuildEffects, getMaxDamageBonus } from '../_lib/effects';
import { buildHitsCsv } from '../_lib/exportHitsCsv';
import { buildDefaultValues, parseValues } from '../_lib/simulationValues';

describe('Obsidian Codex 4-piece', () => {
  // Fires on consuming Nightsoul points, at most once per second.
  const runtimeWithProbes = () => {
    const file = editCharacter('mualani', (character) => {
      character.blocks.push(
        {
          id: 'probe-gain',
          type: 'trigger',
          source: 'talent',
          label: 'Probe: gain points',
          when: { use: 'probeGain' },
          do: [{ setResource: 'nightsoul', value: 60 }],
        },
        {
          id: 'probe-spend',
          type: 'trigger',
          source: 'talent',
          label: 'Probe: spend a point',
          when: { use: 'probeSpend' },
          do: [{ addResource: 'nightsoul', amount: -1 }],
        }
      );
    });
    return createFileRuntime(file, { flags: { obsidian4: true } }).runtime;
  };

  it('does not open the CRIT window when points are gained', () => {
    const runtime = runtimeWithProbes();
    runtime.fireTriggers('use', ['probeGain'], 0, null);
    expect(runtime.getResource('nightsoul')).toBe(60);
    expect(runtime.isActive('obsidianCrit', 1)).toBe(false);
  });

  it('refreshes it at most once per second of points spent', () => {
    const runtime = runtimeWithProbes();
    runtime.fireTriggers('use', ['probeGain'], 0, null);
    runtime.fireTriggers('use', ['probeSpend'], 10, null);
    runtime.fireTriggers('use', ['probeSpend'], 40, null);
    expect(runtime.finishActivity(3600).statuses.obsidianCrit).toEqual([
      { start: 10, end: 10 + 361 },
    ]);
  });
});

describe('golden comparison', () => {
  it('flags a case pinned at 0 that changed', () => {
    expect(Math.abs(goldenChangePercent(0, 5))).toBeGreaterThan(0.1);
    expect(goldenChangePercent(0, 0)).toBe(0);
  });
});

describe('hits CSV export', () => {
  const { context } = simulateFile(
    editCharacter('arlecchino', () => {}),
    {
      blocks: [block('n', 'normal', { hits: 3 })],
    }
  );
  const lines = buildHitsCsv(context.hitLog)
    .replace(/^\uFEFF/, '')
    .split('\r\n');
  // Every cell is quoted, so cells split on `";"` whatever they contain.
  const cells = (line: string) => line.slice(1, -1).split('";"');

  it('uses the semicolon its BOM comment promises Excel', () => {
    expect(cells(lines[0])).toHaveLength(17);
    lines.slice(1).forEach((line) => expect(cells(line)).toHaveLength(17));
  });
});

describe('build card DMG Bonus highlight', () => {
  it('leaves out team buffs and bonuses that scale with a stat', () => {
    const nicole = getCharacterData('nicole');
    // Only Celestial Gift's own +20% Pyro DMG: its party copy and
    // Angelos' Heptades (% of ATK) do not count.
    expect(
      getMaxDamageBonus(
        getBuildEffects(nicole),
        parseValues(buildDefaultValues('nicole'))
      )
    ).toBe(20);
  });
});
