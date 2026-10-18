// Swaps are the engine's own: the user never places one. A block of a
// member off the field (a Wait too) brings them on the field first, so
// Chevreuse's Wait after Nicole's E catches the particles on the field.
import { describe, expect, it } from 'vitest';

import { block } from './fixtures';
import { applyDrop } from '../_components/timeline/timelineData';
import {
  buildMemberValues,
  DEFAULT_SWAP_DELAY_FRAMES,
  getGeneralPaletteActions,
  getTeamActions,
  getTeamPaletteGroups,
  runTeam,
  withoutSwaps,
} from '../_lib/team';

const empty = (id: string) => {
  const values = buildMemberValues(id);
  return {
    ...values,
    numbers: { ...values.numbers, startingEnergy: '0', duration: '8' },
  };
};
const run = (actions: string[]) =>
  runTeam(
    {
      members: ['nicole', 'chevreuse'].map(empty),
      rotation: {
        loop: false,
        blocks: actions.map((action, index) =>
          block(`b${index}`, action, { seconds: 1.5 })
        ),
      },
      fillWhileWaiting: false,
      swapDelayFrames: DEFAULT_SWAP_DELAY_FRAMES,
      auras: true,
    },
    'expected'
  );
const energyAt = (team: ReturnType<typeof run>, id: string, time: number) =>
  (
    team.members.find((member) => member.characterId === id)!.activity!
      .resources.energy ?? []
  )
    .filter((point) => point.frame <= time * 60)
    .at(-1)?.value ?? 0;

describe('swaps', () => {
  it('are no palette action: not in the General group nor a member’s', () => {
    const actions = getTeamActions(['nicole', 'chevreuse']);
    expect(
      getGeneralPaletteActions(actions).map((action) => action.kind)
    ).toEqual(['dodge', 'wait']);
    getTeamPaletteGroups(['nicole', 'chevreuse'], actions).forEach((group) =>
      expect(group.actions.some((action) => action.kind === 'swap')).toBe(false)
    );
  });

  it("happen by themselves: Chevreuse's Wait brings her on the field to catch Nicole's particles", () => {
    const withWait = run(['nicole:skill', 'chevreuse:wait']);
    expect(withWait.swaps.map((swap) => swap.characterId)).toEqual([
      'nicole',
      'chevreuse',
    ]);
    // On the field when the particles land: full Energy (60% off it).
    const without = run(['nicole:skill', 'nicole:wait']);
    expect(energyAt(withWait, 'chevreuse', 3)).toBeGreaterThan(
      energyAt(without, 'chevreuse', 3) * 1.5
    );
  });

  it('are dropped from a rotation made before', () => {
    const old = {
      loop: false,
      blocks: [
        block('e', 'nicole:skill'),
        block('s', 'chevreuse:swap'),
        block('w', 'chevreuse:wait'),
      ],
    };
    expect(withoutSwaps(old).blocks.map((entry) => entry.action)).toEqual([
      'nicole:skill',
      'chevreuse:wait',
    ]);
  });

  // The engine swaps by itself to a block of a member off the field, so a
  // drop never adds one.
  describe('never added on a drop', () => {
    const actions = getTeamActions(['nicole', 'chevreuse']);
    const wait = getGeneralPaletteActions(actions).find(
      (action) => action.kind === 'wait'
    )!;
    const start = {
      loop: false,
      blocks: [block('e', 'nicole:skill'), block('q', 'chevreuse:burst')],
    };
    const actionsOf = (rotation: typeof start) =>
      rotation.blocks.map((entry) => entry.action);
    const drop = (actionId: string, beforeUid: string | null) =>
      applyDrop(start, actions, { kind: 'new', actionId }, beforeUid);

    it("before another member's block dropped where they are off the field", () => {
      const result = drop('chevreuse:skill', 'q');
      expect(actionsOf(result.rotation)).toEqual([
        'nicole:skill',
        'chevreuse:skill',
        'chevreuse:burst',
      ]);
      expect(
        result.rotation.blocks.find((entry) => entry.uid === result.selected)
          ?.action
      ).toBe('chevreuse:skill');
    });

    it('before a moved block', () => {
      const moved = applyDrop(
        {
          loop: false,
          blocks: [
            block('e', 'nicole:skill'),
            block('n', 'nicole:normal'),
            block('q', 'chevreuse:burst'),
          ],
        },
        actions,
        { kind: 'move', blockUid: 'q' },
        'n'
      );
      expect(actionsOf(moved.rotation)).toEqual([
        'nicole:skill',
        'chevreuse:burst',
        'nicole:normal',
      ]);
    });

    it('nor for a Wait: it is the member on the field’s where it lands', () => {
      expect(actionsOf(drop(wait.id, 'q').rotation)).toEqual([
        'nicole:skill',
        'nicole:wait',
        'chevreuse:burst',
      ]);
      // After the other member's block, it is theirs.
      expect(actionsOf(drop(wait.id, null).rotation)).toEqual([
        'nicole:skill',
        'chevreuse:burst',
        'chevreuse:wait',
      ]);
    });

    it('and the engine still swaps to the block of a member off the field', () => {
      const team = run(actionsOf(drop('chevreuse:skill', 'q').rotation));
      expect(team.swaps.map((swap) => swap.characterId)).toEqual([
        'nicole',
        'chevreuse',
      ]);
    });
  });
});
