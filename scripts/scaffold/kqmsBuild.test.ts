// The standard build the defaults' stats come from.
import { describe, expect, it } from 'vitest';

import { AVERAGE_ROLL, buildArtifacts, parseLiquid } from './kqmsBuild';

describe('the standard build', () => {
  it('spreads the 20 extra rolls: given counts, the rest evenly', () => {
    expect(
      parseLiquid('critRate:8,critDamage:8,atkPercent,energyRecharge')
    ).toEqual({ critRate: 8, critDamage: 8, atkPercent: 2, energyRecharge: 2 });
  });

  it('gives each substat 2 rolls plus its extra ones, never on its own main', () => {
    const build = buildArtifacts({
      sands: 'atkPercent',
      goblet: 'elementalDmg',
      circlet: 'critRate',
      liquid: parseLiquid('critRate:8,critDamage:12'),
    });
    const total = (stat: string) =>
      Object.values(build.pieces)
        .flatMap((piece) => piece.subs)
        .filter((line) => line.stat === stat)
        .reduce((sum, line) => sum + Number(line.value), 0);
    expect(total('critRate')).toBeCloseTo(10 * (AVERAGE_ROLL.critRate ?? 0), 2);
    expect(total('critDamage')).toBeCloseTo(
      14 * (AVERAGE_ROLL.critDamage ?? 0),
      2
    );
    expect(total('energyRecharge')).toBeCloseTo(
      2 * (AVERAGE_ROLL.energyRecharge ?? 0),
      2
    );
    expect(
      build.pieces.circlet.subs.some((line) => line.stat === 'critRate')
    ).toBe(false);
    expect(build.pieces.sands.main).toEqual({
      stat: 'atkPercent',
      value: '46.6',
    });
    Object.values(build.pieces).forEach((piece) =>
      expect(piece.subs).toHaveLength(4)
    );
  });
});
