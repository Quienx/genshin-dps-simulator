// Swap: a member comes on the field and does nothing else, so a Wait after
// it is theirs (Nicole's E, swap to Chevreuse, wait for the particles).
import { describe, expect, it } from 'vitest';

import { block } from './fixtures';
import { applyDrop } from '../_components/timeline/timelineData';
import {
  buildMemberValues,
  DEFAULT_SWAP_DELAY_FRAMES,
  getGeneralPaletteActions,
  getTeamActions,
  getTeamPaletteGroups,
  retargetSwap,
  runTeam,
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

describe('the Swap action', () => {
  it('is once in the General group, not in the members’ ones', () => {
    const actions = getTeamActions(['nicole', 'chevreuse']);
    expect(
      getGeneralPaletteActions(actions).map((action) => action.kind)
    ).toEqual(['dodge', 'wait', 'swap']);
    getTeamPaletteGroups(['nicole', 'chevreuse'], actions).forEach((group) =>
      expect(group.actions.some((action) => action.kind === 'swap')).toBe(false)
    );
  });

  describe('dropped from the General group', () => {
    const actions = getTeamActions(['nicole', 'chevreuse', 'iansan']);
    const swap = getGeneralPaletteActions(actions).find(
      (action) => action.kind === 'swap'
    )!;
    const start = {
      loop: false,
      blocks: [block('e', 'nicole:skill'), block('q', 'chevreuse:burst')],
    };
    const dropped = (beforeUid: string | null) => {
      const result = applyDrop(
        start,
        actions,
        { kind: 'new', actionId: swap.id },
        beforeUid
      );
      return result.rotation.blocks.find(
        (entry) => entry.uid === result.selected
      )!.action;
    };

    it("goes to the next block's member", () => {
      expect(dropped('q')).toBe('chevreuse:swap');
    });

    it('else to the first member off the field', () => {
      // At the end, after Chevreuse's Q: Nicole is the first one off it.
      expect(dropped(null)).toBe('nicole:swap');
    });

    it('can be pointed at another member', () => {
      const rotation = applyDrop(
        start,
        actions,
        { kind: 'new', actionId: swap.id },
        'q'
      ).rotation;
      const uid = rotation.blocks[1].uid;
      expect(
        retargetSwap(rotation, uid, 'iansan').blocks.map((b) => b.action)
      ).toEqual(['nicole:skill', 'iansan:swap', 'chevreuse:burst']);
    });
  });

  it("brings Chevreuse on the field, so the Wait is hers and she catches Nicole's particles", () => {
    const withSwap = run(['nicole:skill', 'chevreuse:swap', 'nicole:wait']);
    expect(withSwap.trace.map((entry) => entry.action)).toEqual([
      'nicole:skill',
      'chevreuse:swap',
      'chevreuse:wait',
    ]);
    expect(withSwap.swaps.map((swap) => swap.characterId)).toEqual([
      'nicole',
      'chevreuse',
    ]);
    // On the field when the particles land: full Energy (60% off it).
    const without = run(['nicole:skill', 'nicole:wait']);
    expect(energyAt(withSwap, 'chevreuse', 3)).toBeGreaterThan(
      energyAt(without, 'chevreuse', 3) * 1.5
    );
  });

  it('takes no time of its own when the member is already on the field', () => {
    const team = run(['nicole:skill', 'nicole:swap', 'nicole:normal']);
    const [, swap, normal] = team.trace;
    expect(swap.endTime).toBeCloseTo(swap.startTime, 6);
    expect(team.swaps).toHaveLength(1);
    expect(normal.startTime).toBeGreaterThan(0);
  });

  describe('added on a drop', () => {
    const actions = getTeamActions(['nicole', 'chevreuse']);
    const start = {
      loop: false,
      blocks: [block('e', 'nicole:skill'), block('q', 'chevreuse:burst')],
    };
    const actionsOf = (rotation: typeof start) =>
      rotation.blocks.map((entry) => entry.action);
    const drop = (actionId: string, beforeUid: string | null) =>
      applyDrop(start, actions, { kind: 'new', actionId }, beforeUid);

    it("goes before another member's block dropped where they are off the field", () => {
      const result = drop('chevreuse:skill', 'q');
      expect(actionsOf(result.rotation)).toEqual([
        'nicole:skill',
        'chevreuse:swap',
        'chevreuse:skill',
        'chevreuse:burst',
      ]);
      // The block dropped stays picked, not its swap.
      expect(
        result.rotation.blocks.find((entry) => entry.uid === result.selected)
          ?.action
      ).toBe('chevreuse:skill');
    });

    it('is not added for the member on the field, nor at the start', () => {
      expect(actionsOf(drop('nicole:normal', 'q').rotation)).toEqual([
        'nicole:skill',
        'nicole:normal',
        'chevreuse:burst',
      ]);
      expect(actionsOf(drop('chevreuse:skill', 'e').rotation)).toEqual([
        'chevreuse:skill',
        'nicole:skill',
        'chevreuse:burst',
      ]);
    });

    it('is not added twice, nor for a Wait', () => {
      const once = drop('chevreuse:skill', 'q').rotation;
      const swapUid = once.blocks[1].uid;
      const again = applyDrop(
        once,
        actions,
        { kind: 'new', actionId: 'chevreuse:normal' },
        swapUid
      );
      expect(
        actionsOf(again.rotation).filter((id) => id.endsWith(':swap'))
      ).toHaveLength(1);
      expect(actionsOf(drop('nicole:wait', 'q').rotation)).toEqual([
        'nicole:skill',
        'nicole:wait',
        'chevreuse:burst',
      ]);
    });

    it('goes before a moved block too', () => {
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
        'chevreuse:swap',
        'chevreuse:burst',
        'nicole:normal',
      ]);
    });
  });

  describe("a Wait dropped on a member's row", () => {
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

    it('is that member’s: a Swap in goes before it', () => {
      const result = applyDrop(
        start,
        actions,
        { kind: 'new', actionId: wait.id },
        'q',
        'chevreuse'
      );
      expect(actionsOf(result.rotation)).toEqual([
        'nicole:skill',
        'chevreuse:swap',
        'chevreuse:wait',
        'chevreuse:burst',
      ]);
    });

    it('needs no Swap on the row of the member on the field', () => {
      const result = applyDrop(
        start,
        actions,
        { kind: 'new', actionId: wait.id },
        'q',
        'nicole'
      );
      expect(actionsOf(result.rotation)).toEqual([
        'nicole:skill',
        'nicole:wait',
        'chevreuse:burst',
      ]);
    });

    it('moves to another row the same way', () => {
      const moved = applyDrop(
        {
          loop: false,
          blocks: [
            block('e', 'nicole:skill'),
            block('w', 'nicole:wait'),
            block('q', 'chevreuse:burst'),
          ],
        },
        actions,
        { kind: 'move', blockUid: 'w' },
        'q',
        'chevreuse'
      );
      expect(actionsOf(moved.rotation)).toEqual([
        'nicole:skill',
        'chevreuse:swap',
        'chevreuse:wait',
        'chevreuse:burst',
      ]);
    });
  });
});
