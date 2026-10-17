import { afterEach, describe, expect, it, vi } from 'vitest';

import { simulate } from './simulate';
import { CHARACTER_ACTIONS, getCharacterData } from '../_lib/characterData';
import { CHARACTER_LIST } from '../_lib/characters';
import { FRAMES_PER_SECOND } from '../_lib/frames';
import { buildAutomaticRotation } from '../_lib/rotation/automaticRotation';
import {
  buildDefaultValues,
  withFlag,
  withNumber,
  withRotation,
} from '../_lib/simulationValues';
import { SimulationValues } from '../_lib/types';

// Properties every character file must keep, whatever its blocks say. New
// characters are picked up automatically from CHARACTER_LIST.

type Scenario = { name: string; values: SimulationValues };

const scenariosFor = (characterId: string): Scenario[] => {
  const defaults = buildDefaultValues(characterId);
  const flags = Object.keys(defaults.flags);
  const constellations = flags.filter((flag) => /^c[1-6]$/.test(flag));
  const allConstellations = constellations.reduce(
    (values, flag) => withFlag(values, flag, true),
    defaults
  );
  return [
    { name: 'defaults', values: defaults },
    { name: 'all constellations', values: allConstellations },
    { name: '1 s', values: withNumber(defaults, 'duration', '1') },
    { name: '120 s', values: withNumber(defaults, 'duration', '120') },
    {
      name: 'custom rotation (automatic copy)',
      values: withRotation(defaults, buildAutomaticRotation(defaults)),
    },
    {
      name: 'custom rotation, all constellations',
      values: withRotation(
        allConstellations,
        buildAutomaticRotation(allConstellations)
      ),
    },
    // Every flag the other way round, one at a time.
    ...flags.map((flag) => ({
      name: `flag ${flag} flipped`,
      values: withFlag(defaults, flag, !defaults.flags[flag]),
    })),
  ];
};

const checkRun = (values: SimulationValues) => {
  const { parsed, context, result } = simulate(values);
  const duration = parsed.numbers.duration;
  const durationFrames = duration * FRAMES_PER_SECOND;
  const { hitLog } = context;

  expect(Number.isFinite(context.totalDamage)).toBe(true);
  expect(context.totalDamage).toBeGreaterThanOrEqual(0);
  expect(context.totalHits).toBe(hitLog.length);

  // Hits: finite, inside the run, in time order, adding up to the total.
  let previousTime = 0;
  let sum = 0;
  hitLog.forEach((hit) => {
    expect(Number.isFinite(hit.damage), `hit ${hit.index}`).toBe(true);
    expect(hit.damage).toBeGreaterThanOrEqual(0);
    expect(hit.time).toBeGreaterThanOrEqual(0);
    expect(hit.time).toBeLessThan(duration);
    expect(hit.time).toBeGreaterThanOrEqual(previousTime);
    previousTime = hit.time;
    sum += hit.damage;
  });
  expect(sum).toBeCloseTo(context.totalDamage, 3);

  // Actions: start in order, inside the run, never before the last one.
  const trace = result.rotationTrace ?? [];
  let previousStart = 0;
  trace.forEach((entry) => {
    const label = `${entry.label} at ${entry.startTime}`;
    expect(entry.startTime, label).toBeGreaterThanOrEqual(previousStart);
    expect(entry.startTime, label).toBeLessThan(duration);
    expect(entry.endTime, label).toBeGreaterThanOrEqual(entry.startTime);
    expect(entry.waitedSeconds, label).toBeGreaterThanOrEqual(0);
    previousStart = entry.startTime;
  });

  const { activity } = result;
  if (!activity) {
    return;
  }
  // Resources stay within their scale.
  activity.blocks
    .filter((block) => block.type === 'resource')
    .forEach((block) => {
      (activity.resources[block.id] ?? []).forEach(({ frame, value }) => {
        const label = `${block.id} at frame ${frame}`;
        expect(Number.isFinite(value), label).toBe(true);
        expect(value, label).toBeGreaterThanOrEqual(0);
        if (block.max !== undefined) {
          expect(value, label).toBeLessThanOrEqual(block.max);
        }
      });
    });
  // Statuses: well-formed, ordered, non-overlapping intervals in the run.
  Object.entries(activity.statuses).forEach(([id, intervals]) => {
    let lastEnd = 0;
    intervals.forEach(({ start, end }) => {
      const label = `${id} [${start}, ${end})`;
      expect(start, label).toBeGreaterThanOrEqual(lastEnd);
      expect(end, label).toBeGreaterThanOrEqual(start);
      expect(end, label).toBeLessThanOrEqual(durationFrames);
      lastEnd = end;
    });
  });
  // Stacks never outlast their window.
  activity.blocks
    .filter((block) => block.stackFrames !== undefined)
    .forEach((block) => {
      (activity.stacks[block.id] ?? []).forEach(({ start, end }) => {
        const label = `${block.id} [${start}, ${end})`;
        expect(end - start, label).toBeGreaterThanOrEqual(0);
        expect(end - start, label).toBeLessThanOrEqual(block.stackFrames ?? 0);
      });
    });
};

describe.each(CHARACTER_LIST.map((character) => character.id))('%s', (id) => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(scenariosFor(id).map((scenario) => [scenario.name, scenario]))(
    'keeps its invariants: %s',
    (_name, scenario) => {
      checkRun(scenario.values);
    }
  );

  it('deals damage with the default build', () => {
    const { context } = simulate(buildDefaultValues(id));
    expect(context.totalDamage).toBeGreaterThan(0);
  });

  it('gives the same result every time in expected mode', () => {
    const values = buildDefaultValues(id);
    const first = simulate(values);
    const second = simulate(values);
    expect(second.context.totalDamage).toBe(first.context.totalDamage);
    expect(second.context.hitLog).toEqual(first.context.hitLog);
    expect(second.result.rotationTrace).toEqual(first.result.rotationTrace);
    expect(second.result.activity).toEqual(first.result.activity);
  });

  it('changes neither the values nor the character data', () => {
    const values = buildDefaultValues(id);
    const valuesBefore = structuredClone(values);
    const dataBefore = JSON.stringify(getCharacterData(id));
    const actionsBefore = JSON.stringify(CHARACTER_ACTIONS[id]);
    simulate(values);
    simulate(withRotation(values, buildAutomaticRotation(values)));
    expect(values).toEqual(valuesBefore);
    expect(JSON.stringify(getCharacterData(id))).toBe(dataBefore);
    expect(JSON.stringify(CHARACTER_ACTIONS[id])).toBe(actionsBefore);
  });

  it('plays a copy of the automatic rotation like the automatic one', () => {
    const values = buildDefaultValues(id);
    const automatic = simulate(values);
    const custom = simulate(
      withRotation(values, buildAutomaticRotation(values))
    );
    expect(custom.context.totalDamage).toBeCloseTo(
      automatic.context.totalDamage,
      3
    );
  });

  it('never deals less damage over a longer run', () => {
    const values = buildDefaultValues(id);
    const short = simulate(withNumber(values, 'duration', '30'));
    const long = simulate(withNumber(values, 'duration', '60'));
    expect(long.context.totalDamage).toBeGreaterThanOrEqual(
      short.context.totalDamage
    );
  });

  it('keeps random CRITs between never and always critting', () => {
    const values = buildDefaultValues(id);
    const expected = simulate(values).context.totalDamage;
    // Math.random() of 0 crits every hit (and rolls the most particles);
    // just under 1 never crits (and rolls the fewest).
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const alwaysCrit = simulate(values, 'random').context;
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    const neverCrit = simulate(values, 'random').context;
    expect(alwaysCrit.totalDamage).toBeGreaterThanOrEqual(expected);
    expect(neverCrit.totalDamage).toBeLessThanOrEqual(expected);
    expect(neverCrit.totalCrits).toBe(0);
  });
});
