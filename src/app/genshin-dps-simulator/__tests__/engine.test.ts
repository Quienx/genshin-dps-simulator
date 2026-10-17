import { describe, expect, it } from 'vitest';

import { FRAME, simulate } from './simulate';
import { defenseMultiplier, resistanceMultiplier } from '../_lib/damageEngine';
import { opSchema } from '../_lib/engine/schema';
import { MAX_DURATION_SECONDS } from '../_lib/frames';
import { getReactionMultiplier } from '../_lib/reactions';
import { RotationBlock } from '../_lib/rotation/types';
import {
  buildDefaultValues,
  parseValues,
  withNumber,
  withRotation,
} from '../_lib/simulationValues';
import { ParsedValues } from '../_lib/types';

const block = (uid: string, action: string, hits = 1): RotationBlock => ({
  uid,
  action,
  hits,
  repeat: 1,
  seconds: 0,
  dashCancel: false,
});

const numbers = (values: Record<string, number>): ParsedValues => ({
  numbers: values,
  flags: {},
  rotation: null,
});

describe('damage formula', () => {
  it('applies the DEF multiplier', () => {
    expect(defenseMultiplier(90, 100)).toBeCloseTo(190 / 390, 10);
    expect(defenseMultiplier(90, 100, 0.5)).toBeCloseTo(190 / 290, 10);
    expect(defenseMultiplier(90, 100, 0, 1)).toBe(1);
  });

  it('applies the three RES brackets, continuous at 75%', () => {
    expect(resistanceMultiplier(10)).toBeCloseTo(0.9, 10);
    expect(resistanceMultiplier(-20)).toBeCloseTo(1.1, 10);
    expect(resistanceMultiplier(80)).toBeCloseTo(1 / 4.2, 10);
    expect(resistanceMultiplier(74.9999)).toBeCloseTo(
      resistanceMultiplier(75),
      4
    );
  });

  it('scales amplifying reactions with EM and reaction bonus', () => {
    const values = numbers({ em: 0, reactionBonus: 0 });
    expect(getReactionMultiplier(values, 'Vaporize', 'Hydro')).toBe(2);
    expect(getReactionMultiplier(values, 'Vaporize', 'Pyro')).toBe(1.5);
    expect(getReactionMultiplier(values, 'Vaporize', 'Cryo')).toBe(1);
    const withEm = numbers({ em: 200, reactionBonus: 15 });
    expect(getReactionMultiplier(withEm, 'Melt', 'Pyro')).toBeCloseTo(
      2 * (1 + (2.78 * 200) / 1600 + 0.15),
      10
    );
    // The hit's extra EM counts too.
    expect(
      getReactionMultiplier(numbers({ em: 100 }), 'Melt', 'Pyro', 100)
    ).toBeCloseTo(getReactionMultiplier(numbers({ em: 200 }), 'Melt', 'Pyro'));
  });
});

describe('values', () => {
  it('keeps the run length between 1 s and the maximum', () => {
    const duration = (value: string) =>
      parseValues(withNumber(buildDefaultValues('mualani'), 'duration', value))
        .numbers.duration;
    expect(duration('30')).toBe(30);
    expect(duration('')).toBe(1);
    expect(duration('0')).toBe(1);
    expect(duration('-5')).toBe(1);
    expect(duration('1e7')).toBe(MAX_DURATION_SECONDS);
  });
});

describe('block schema', () => {
  it('rejects a hit with neither a multiplier nor a row', () => {
    const hit = { element: 'Pyro', category: 'Extra' };
    expect(opSchema.safeParse({ hit }).success).toBe(false);
    expect(
      opSchema.safeParse({ hit: { ...hit, multiplier: 90 } }).success
    ).toBe(true);
    expect(
      opSchema.safeParse({ hit: { ...hit, row: 'elementalSkill/dmg' } }).success
    ).toBe(true);
  });
});

describe('rotation planning', () => {
  // The second Bite waits for its cooldown, past the end of the Blessing,
  // and is dropped there: what follows must not go back in time.
  const values = withRotation(buildDefaultValues('mualani'), {
    loop: false,
    blocks: [
      block('e', 'skill'),
      block('surf-1', 'momentum', 3),
      block('surf-2', 'momentum', 3),
      block('bite-1', 'sharkBite'),
      block('bite-2', 'sharkBite'),
      block('normal-1', 'normal'),
      block('normal-2', 'normal'),
    ],
  });

  // The Normal Attack is a bite while surfing; waiting for the bite's
  // cooldown outlasts the Blessing, so it starts as a plain N1 instead.
  it('decides the form when the action starts, after waiting', () => {
    const trace = simulate(values).result.rotationTrace ?? [];
    const first = trace.find((entry) => entry.blockUid === 'normal-1');
    const second = trace.find((entry) => entry.blockUid === 'normal-2');
    expect(first?.label).toBe('N1');
    expect(first?.performedAction).toBeUndefined();
    expect(first?.warning).toMatch(/Waited .* for the Bite cooldown/);
    expect(second?.label).toBe('N2');
    expect(second?.startTime).toBeGreaterThanOrEqual(first?.endTime ?? 0);
  });

  it('times every hit after the action that made it started', () => {
    const { context, result } = simulate(values);
    const startByBlock = new Map(
      (result.rotationTrace ?? []).map((entry) => [
        entry.blockUid,
        entry.startTime,
      ])
    );
    context.hitLog
      .filter((hit) => hit.blockUid !== undefined)
      .forEach((hit) => {
        const start = startByBlock.get(hit.blockUid ?? '') ?? 0;
        expect(hit.time + FRAME / 2).toBeGreaterThanOrEqual(start);
      });
  });
});

describe('stacks', () => {
  // Two Bursts in 120 s with 200% ER: each one uses up Wavechaser's
  // Exploits stacks.
  const values = withNumber(
    withNumber(buildDefaultValues('mualani'), 'duration', '120'),
    'energyRecharge',
    '200'
  );

  it('ends stacks on the frame a Burst uses them up', () => {
    const { context, result } = simulate(values);
    const burstFrames = new Set(
      context.hitLog
        .filter((hit) => hit.category === 'Burst')
        .map((hit) => Math.round(hit.time * 60))
    );
    const stacks = result.activity?.stacks.wavechaserStacks ?? [];
    const cut = stacks.filter(({ start, end }) => end - start < 1200);
    expect(cut.length).toBeGreaterThan(0);
    cut.forEach(({ end }) => expect(burstFrames.has(end)).toBe(true));
  });

  it('lasts exactly its duration in whole frames when not used up', () => {
    const { result } = simulate(values);
    const stacks = result.activity?.stacks.wavechaserStacks ?? [];
    const whole = stacks.filter(({ start, end }) => end - start === 1200);
    expect(whole.length).toBeGreaterThan(0);
    stacks.forEach(({ start, end }) => {
      expect(Number.isInteger(start)).toBe(true);
      expect(Number.isInteger(end)).toBe(true);
    });
  });
});
