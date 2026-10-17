// Artifacts entered piece by piece: the character screen's totals are
// computed from base stats, ascension, weapon and the five pieces.
import { describe, expect, it } from 'vitest';

import { computeScreenStats, createDefaultArtifacts } from '../_lib/artifacts';
import { getCharacterData } from '../_lib/characterData';
import {
  buildDefaultValues,
  parseValues,
  withArtifacts,
  withNumber,
} from '../_lib/simulationValues';
import { ArtifactBuild } from '../_lib/types';

// Flower HP, plume ATK, ATK% sands, element goblet, CRIT Rate circlet, and
// two substats on the flower.
const sampleArtifacts = (): ArtifactBuild => {
  const artifacts = createDefaultArtifacts();
  artifacts.enabled = true;
  artifacts.pieces.circlet.main = { stat: 'critRate', value: '31.1' };
  artifacts.pieces.flower.subs[0] = { stat: 'critRate', value: '3.9' };
  artifacts.pieces.flower.subs[1] = { stat: 'critDamage', value: '7.8' };
  return artifacts;
};

describe('computeScreenStats', () => {
  it('adds base, ascension, weapon and pieces (Varesa)', () => {
    const character = getCharacterData('varesa');
    const values = parseValues(buildDefaultValues('varesa'));
    const stats = computeScreenStats(character, values, sampleArtifacts());
    // (356 + 608) × (1 + 46.6%) + 311
    expect(stats.atk).toBeCloseTo(964 * 1.466 + 311, 6);
    expect(stats.hp).toBeCloseTo(12699 + 4780, 6);
    expect(stats.def).toBeCloseTo(782, 6);
    // 5 base + 19.2 ascension + 33.1 Lost Prayer + 31.1 circlet + 3.9
    expect(stats.cr).toBeCloseTo(92.3, 6);
    expect(stats.cd).toBeCloseTo(57.8, 6);
    expect(stats.energyRecharge).toBeCloseTo(100, 6);
    expect(stats.elementalBonus).toBeCloseTo(46.6, 6);
    expect(stats.em).toBeCloseTo(0, 6);
  });

  it("adds a weapon's on-screen passive by refinement (Nicole's Angelos)", () => {
    const character = getCharacterData('nicole');
    const base = buildDefaultValues('nicole');
    const atkAt = (refinement: string) =>
      computeScreenStats(
        character,
        parseValues(
          withNumber(base, character.weapon.refinementField, refinement)
        ),
        sampleArtifacts()
      ).atk;
    const baseAtk = character.baseStats.atk + character.weapon.baseAtk;
    // R1 +12% ATK, R5 +24%.
    expect(atkAt('5') - atkAt('1')).toBeCloseTo(baseAtk * 0.12, 6);
  });

  it("adds the set's on-screen 2-piece (Harmonic Whimsy ATK +18%)", () => {
    const character = getCharacterData('arlecchino');
    const values = parseValues(buildDefaultValues('arlecchino'));
    const baseAtk = character.baseStats.atk + character.weapon.baseAtk;
    const stats = computeScreenStats(character, values, sampleArtifacts());
    // 18% set + 46.6% sands; Arlecchino's ascension is CRIT DMG.
    expect(stats.atk).toBeCloseTo(baseAtk * (1 + 0.646) + 311, 6);
    expect(stats.cd).toBeCloseTo(50 + 38.4 + 7.8, 6);
  });

  it('ignores empty or non-numeric lines', () => {
    const character = getCharacterData('varesa');
    const values = parseValues(buildDefaultValues('varesa'));
    const artifacts = sampleArtifacts();
    artifacts.pieces.sands.subs[0] = { stat: 'critRate', value: '' };
    artifacts.pieces.sands.subs[1] = { stat: '', value: '10' };
    artifacts.pieces.sands.subs[2] = { stat: 'critRate', value: 'abc' };
    expect(computeScreenStats(character, values, artifacts).cr).toBeCloseTo(
      92.3,
      6
    );
  });
});

describe('parseValues with artifacts', () => {
  it('replaces the typed totals while artifacts are on', () => {
    const values = withArtifacts(
      buildDefaultValues('varesa'),
      sampleArtifacts()
    );
    const parsed = parseValues(values);
    expect(parsed.numbers.atk).toBeCloseTo(964 * 1.466 + 311, 6);
    expect(parsed.numbers.cr).toBeCloseTo(92.3, 6);
    expect(parsed.numbers.energyRecharge).toBeCloseTo(100, 6);
  });

  it('keeps the typed totals while artifacts are off', () => {
    const artifacts = { ...sampleArtifacts(), enabled: false };
    const values = withArtifacts(buildDefaultValues('varesa'), artifacts);
    expect(parseValues(values).numbers.atk).toBe(2128);
  });
});
