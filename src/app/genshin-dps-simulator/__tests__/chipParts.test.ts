// An artifact set's block lists each of its bonuses once (the rows of its
// tooltip, keyed by `part.key`), however often a bonus was up while the
// block lasted: Iansan's Scroll 4-piece reaction buff, applied again after
// it ran out while her 20 s Nightsoul buff kept the block open, is the same
// row, not a new one with the same name.
import { describe, expect, it } from 'vitest';

import { CHARACTER_LIST } from '../_lib/characters';
import { buildInspectorView } from '../_lib/inspector';
import { executeRun, RunRequest } from '../_lib/runRequest';
import {
  buildDefaultTeam,
  buildMemberValues,
  buildPresetTeam,
  INSPECTOR_TEST_IDS,
  MAVUIKA_PRESETS,
  NEFER_PRESETS,
} from '../_lib/team';

// Every scenario the timeline offers, with default builds.
const SCENARIOS: [string, RunRequest][] = [
  [
    'Varesa team',
    { kind: 'team', team: buildDefaultTeam(), critMode: 'expected' },
  ],
  ...[...MAVUIKA_PRESETS, ...NEFER_PRESETS].map(
    (preset): [string, RunRequest] => [
      preset.id,
      { kind: 'team', team: buildPresetTeam(preset), critMode: 'expected' },
    ]
  ),
  [
    'inspector test',
    { kind: 'inspector', members: INSPECTOR_TEST_IDS.map(buildMemberValues) },
  ],
  ...CHARACTER_LIST.map(({ id }): [string, RunRequest] => [
    `solo:${id}`,
    { kind: 'solo', values: buildMemberValues(id), critMode: 'expected' },
  ]),
];

// Each value listed again, with where it is.
const repeated = (lists: [string, unknown[]][]) =>
  lists.flatMap(([where, values]) =>
    values
      .filter((value, index) => values.indexOf(value) !== index)
      .map((value) => `${where}: ${String(value)}`)
  );

describe('a block’s parts (an artifact set’s bonuses)', () => {
  it.each(SCENARIOS)(
    '%s: each bonus is one row, with its own key',
    (_, request) => {
      const blocks = buildInspectorView(executeRun(request)).chips.flatMap(
        (chip): [string, NonNullable<typeof chip.parts>][] =>
          chip.parts && chip.parts.length > 0
            ? [[`${chip.characterId}: ${chip.label}`, chip.parts]]
            : []
      );
      // What the tooltip shows: no bonus twice.
      expect(
        repeated(
          blocks.map(([where, parts]) => [
            where,
            parts.map((part) => part.label),
          ])
        )
      ).toEqual([]);
      // What it keys its rows by.
      blocks.forEach(([where, parts]) =>
        parts.forEach((part) => expect(part.key, where).toBeTruthy())
      );
      expect(
        repeated(
          blocks.map(([where, parts]) => [where, parts.map((part) => part.key)])
        )
      ).toEqual([]);
    }
  );

  it('keeps a bonus up again as one row, spanning its applications', () => {
    const chip = buildInspectorView(
      executeRun({
        kind: 'team',
        team: buildDefaultTeam(),
        critMode: 'expected',
      })
    ).chips.find(
      (entry) =>
        entry.characterId === 'iansan' &&
        entry.label === 'Scroll of the Hero of Cinder City'
    );
    const reaction = chip?.parts?.find(
      (part) => part.label === 'Scroll 4-piece: reaction buff'
    );
    expect(reaction?.key).toBe('scrollReaction');
    // Up three times (from 5 s, 22 s and 40 s; renewed at 6 s and 24 s):
    // every application, in order.
    expect(reaction?.renewals?.map((renewal) => renewal.start)).toEqual([
      expect.closeTo(5.17, 1),
      expect.closeTo(6.17, 1),
      expect.closeTo(22.37, 1),
      expect.closeTo(24.17, 1),
      expect.closeTo(40.3, 1),
    ]);
    expect(reaction?.start).toBeCloseTo(5.17, 1);
    expect(reaction?.end).toBeCloseTo(55.3, 1);
  });
});
