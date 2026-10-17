// What the chart shows for each block: a sequence (Mualani's Shark Bite)
// as itself, and an action as the form it was played as (Varesa's E in
// Fiery Passion is Fiery Passion Rush), so the editor needs one E only.
import { describe, expect, it } from 'vitest';

import { block } from './fixtures';
import { displayAction } from '../_components/timeline/timelineData';
import { buildInspectorView } from '../_lib/inspector';
import {
  buildDefaultTeam,
  buildMemberValues,
  getTeamActions,
  runOwnRotation,
  runTeam,
} from '../_lib/team';

const byId = (ids: string[]) =>
  new Map(getTeamActions(ids).map((action) => [action.id, action]));

describe('what the chart shows for a block', () => {
  it('shows a sequence as its own action, played as its step', () => {
    const view = buildInspectorView(
      runOwnRotation(
        {
          members: [buildMemberValues('mualani')],
          rotation: { loop: false, blocks: [block('sb', 'mualani:sharkBite')] },
          fillWhileWaiting: false,
          swapDelayFrames: 0,
          auras: false,
        },
        'expected'
      )
    );
    const piece = view.actions.find((action) => action.blockUid === 'sb')!;
    expect(piece.shownActionId).toBe('mualani:sharkBite');
    expect(piece.actionId).toBe('mualani:normal');
  });

  it("shows Varesa's E and Q as the form they were played as", () => {
    const team = buildDefaultTeam();
    const ids = team.members.map((values) => values.character);
    const view = buildInspectorView(runTeam(team, 'expected'));
    const names = new Set(
      view.actions
        .filter((action) => action.characterId === 'varesa')
        .map((action) => displayAction(action, byId(ids))?.label)
    );
    expect(names).toContain('Varesa: Riding the Night-Rainbow (E)');
    expect(names).toContain('Varesa: Fiery Passion Rush (free)');
    expect(names).toContain('Varesa: Volcano Kablam');
    const rush = view.actions.find(
      (action) => action.performedActionId === 'varesa:freeFieryRush'
    )!;
    expect(displayAction(rush, byId(ids))?.icon).toBe('Skill_S_Varesa_02');
  });

  it('gives Varesa one E and one Q in the editor', () => {
    const shown = getTeamActions(['varesa'])
      .filter((action) => !action.hidden)
      .map((action) => action.id);
    expect(shown).toContain('varesa:skill');
    expect(shown).toContain('varesa:burst');
    expect(shown).not.toContain('varesa:eSpecial');
    expect(shown).not.toContain('varesa:qSpecial');
  });
});
