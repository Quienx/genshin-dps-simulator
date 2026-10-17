import { describe, expect, it } from 'vitest';

import {
  applyDrop,
  dropBefore,
  dropSlot,
  groupNormalCombos,
} from '../_components/timeline/timelineData';
import { buildInspectorView } from '../_lib/inspector';
import {
  buildDefaultTeam,
  buildMemberValues,
  buildRotationFromRun,
  createTeamBlock,
  getTeamActions,
  runOwnRotation,
  runSolo,
  runTeam,
} from '../_lib/team';

describe('buildRotationFromRun', () => {
  const values = buildMemberValues('arlecchino');
  const run = runSolo(values, 'expected');
  const rotation = buildRotationFromRun(run);

  it('makes each Normal Attack combo one block, its presses as hits', () => {
    expect(
      rotation.blocks.slice(0, 4).map((block) => [block.action, block.hits])
    ).toEqual([
      ['arlecchino:skill', 1],
      ['arlecchino:normal', 6],
      ['arlecchino:normal', 3],
      ['arlecchino:charged', 1],
    ]);
    expect(rotation.loop).toBe(false);
  });

  it('plays the same run again', () => {
    const again = runTeam(
      {
        members: [values],
        rotation,
        fillWhileWaiting: false,
        swapDelayFrames: 0,
        auras: false,
      },
      'expected'
    );

    expect(again.trace.map((entry) => entry.label)).toEqual(
      run.trace.map((entry) => entry.label)
    );
    expect(again.totalDamage).toBeCloseTo(run.totalDamage, 0);
  });

  it("plays a team's run again, swaps and all", () => {
    const team = buildDefaultTeam();
    const teamRun = runTeam(team, 'expected');
    const again = runTeam(
      { ...team, rotation: buildRotationFromRun(teamRun) },
      'expected'
    );

    expect(again.trace.map((entry) => entry.action)).toEqual(
      teamRun.trace.map((entry) => entry.action)
    );
    expect(again.totalDamage).toBeCloseTo(teamRun.totalDamage, 0);
  });
});

describe('edit mode: the chart blocks are the rotation blocks', () => {
  it('keeps two Normal Attack blocks apart though the combo goes on', () => {
    const values = buildMemberValues('arlecchino');
    const first = createTeamBlock('arlecchino:normal', 3);
    const second = createTeamBlock('arlecchino:normal', 3);
    const run = runTeam(
      {
        members: [values],
        rotation: { loop: false, blocks: [first, second] },
        fillWhileWaiting: false,
        swapDelayFrames: 0,
        auras: false,
      },
      'expected'
    );
    const { actions } = buildInspectorView(run);

    expect(
      groupNormalCombos(actions, { byBlock: true }).map((group) => [
        group.blockUid,
        group.parts.length,
      ])
    ).toEqual([
      [first.uid, 3],
      [second.uid, 3],
    ]);
    // Watching, the combo is one block (N1–N6).
    expect(groupNormalCombos(actions)[0].parts).toHaveLength(6);
  });
});

describe('edit mode: where a drop lands', () => {
  const values = buildMemberValues('arlecchino');
  const skill = createTeamBlock('arlecchino:skill');
  const normal = createTeamBlock('arlecchino:normal', 3);
  const charged = createTeamBlock('arlecchino:charged');
  const run = runTeam(
    {
      members: [values],
      rotation: { loop: false, blocks: [skill, normal, charged] },
      fillWhileWaiting: false,
      swapDelayFrames: 0,
      auras: false,
    },
    'expected'
  );
  const groups = groupNormalCombos(buildInspectorView(run).actions, {
    byBlock: true,
  });
  const [, combo, ca] = groups;

  it('goes before the first block that starts after it', () => {
    expect(dropBefore(groups, 0)).toBe(skill.uid);
    // Past the middle of the combo: after it, before the Charged Attack.
    expect(dropBefore(groups, combo.end - 0.01)).toBe(charged.uid);
    expect(dropBefore(groups, combo.start + 0.01)).toBe(normal.uid);
  });

  it('goes at the end past the last block', () => {
    expect(dropBefore(groups, ca.end + 5)).toBeNull();
  });

  it('lands in a slot: where the next block starts, or after the last', () => {
    // Over the combo's right half: the slot is where the Charged Attack
    // starts.
    expect(dropSlot(groups, combo.end - 0.01)).toEqual({
      beforeUid: charged.uid,
      time: ca.start - ca.waited,
    });
    expect(dropSlot(groups, ca.end + 5)).toEqual({
      beforeUid: null,
      time: ca.end,
    });
  });
});

describe('edit mode: a drop', () => {
  const actions = getTeamActions(['arlecchino']);
  const skill = createTeamBlock('arlecchino:skill');
  const normal = createTeamBlock('arlecchino:normal', 3);
  const charged = createTeamBlock('arlecchino:charged');
  const rotation = { loop: false, blocks: [skill, normal, charged] };
  const order = (result: { rotation: { blocks: { action: string }[] } }) =>
    result.rotation.blocks.map((block) => block.action.split(':')[1]);

  it('adds a palette action there, a Normal Attack as a whole combo', () => {
    const result = applyDrop(
      rotation,
      actions,
      { kind: 'new', actionId: 'arlecchino:normal' },
      charged.uid
    );

    expect(order(result)).toEqual(['skill', 'normal', 'normal', 'charged']);
    expect(result.rotation.blocks[2]).toMatchObject({
      uid: result.selected,
      hits: 6,
    });
  });

  it('moves a block there', () => {
    expect(
      order(
        applyDrop(
          rotation,
          actions,
          { kind: 'move', blockUid: skill.uid },
          null
        )
      )
    ).toEqual(['normal', 'charged', 'skill']);
    expect(
      order(
        applyDrop(
          rotation,
          actions,
          { kind: 'move', blockUid: charged.uid },
          normal.uid
        )
      )
    ).toEqual(['skill', 'charged', 'normal']);
  });

  it('leaves a block dropped on its own place where it was', () => {
    expect(
      applyDrop(
        rotation,
        actions,
        { kind: 'move', blockUid: normal.uid },
        normal.uid
      ).rotation
    ).toBe(rotation);
  });
});

describe('edit mode: a rotation longer than the run', () => {
  it('plays every block, past the run duration', () => {
    const values = buildMemberValues('arlecchino');
    const blocks = Array.from({ length: 40 }, () =>
      createTeamBlock('arlecchino:normal', 6)
    );
    const setup = {
      rotation: { loop: false, blocks },
      fillWhileWaiting: false,
      swapDelayFrames: 0,
      auras: false,
    };

    const run = runOwnRotation({ ...setup, members: [values] }, 'expected');
    const played = new Set(run.trace.map((entry) => entry.blockUid));

    expect(blocks.every((block) => played.has(block.uid))).toBe(true);
    const last = run.trace.at(-1)!;
    expect(run.duration).toBeGreaterThanOrEqual(last.endTime);
  });

  it('keeps the run duration when the blocks fit in it', () => {
    const values = buildMemberValues('arlecchino');
    const run = runOwnRotation(
      {
        members: [values],
        rotation: {
          loop: false,
          blocks: [createTeamBlock('arlecchino:skill')],
        },
        fillWhileWaiting: false,
        swapDelayFrames: 0,
        auras: false,
      },
      'expected'
    );

    expect(run.duration).toBe(runSolo(values, 'expected').duration);
  });
});

describe('edit mode: an E on cooldown', () => {
  it('waits for it, and the chart knows how long (its grey stretch)', () => {
    const blocks = [
      createTeamBlock('arlecchino:skill'),
      createTeamBlock('arlecchino:normal', 2),
      createTeamBlock('arlecchino:skill'),
      createTeamBlock('arlecchino:normal', 1),
    ];
    const run = runOwnRotation(
      {
        members: [buildMemberValues('arlecchino')],
        rotation: { loop: false, blocks },
        fillWhileWaiting: false,
        swapDelayFrames: 0,
        auras: false,
      },
      'expected'
    );
    const { actions } = buildInspectorView(run);
    const [, , combo, skill] = actions;

    expect(skill.blockUid).toBe(blocks[2].uid);
    // Put right after the combo; cast once the E is back.
    expect(skill.start - skill.waited).toBeCloseTo(combo.end, 5);
    expect(skill.waited).toBeGreaterThan(20);
    expect(skill.warning).toMatch(/^Waited .* for the E cooldown$/);
    expect(combo.waited).toBe(0);
  });
});
