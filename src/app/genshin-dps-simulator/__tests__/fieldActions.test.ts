// Dash and Wait are field actions: whoever is on the field does them, so
// the palette shows them once, in a General group, and the run says who
// did each one.
import { describe, expect, it } from 'vitest';

import { block } from './fixtures';
import { applyDrop } from '../_components/timeline/timelineData';
import { simulateTeam } from '../_lib/engine/simulateTeam';
import { buildDefaultValues, parseValues } from '../_lib/simulationValues';
import {
  getGeneralPaletteActions,
  getTeamActions,
  getTeamPaletteGroups,
} from '../_lib/team';

const ids = ['nicole', 'chevreuse'];
const member = (characterId: string) => ({
  characterId,
  values: parseValues(buildDefaultValues(characterId)),
});
const rotation = (actions: string[]) => ({
  loop: false,
  blocks: actions.map((action, index) => block(`b${index}`, action)),
});

describe('field actions', () => {
  it('records a Dash or Wait as done by the member on the field', () => {
    const team = simulateTeam(
      ids.map(member),
      rotation(['nicole:skill', 'chevreuse:dodge', 'chevreuse:wait'])
    );
    expect(team.rotationTrace.map((entry) => entry.action)).toEqual([
      'nicole:skill',
      'nicole:dodge',
      'nicole:wait',
    ]);
  });

  it('shows Dash and Wait once, in the General group, not per member', () => {
    const actions = getTeamActions(ids);
    const general = getGeneralPaletteActions(actions);
    expect(general.map((action) => action.kind)).toEqual(['dodge', 'wait']);
    expect(general.every((action) => !action.label.includes(':'))).toBe(true);
    getTeamPaletteGroups(ids, actions).forEach((group) =>
      expect(
        group.actions.filter(
          (action) => action.kind === 'dodge' || action.kind === 'wait'
        )
      ).toEqual([])
    );
  });

  it('gives a dropped Dash to the member on the field there', () => {
    const actions = getTeamActions(ids);
    const dash = getGeneralPaletteActions(actions)[0];
    const start = rotation(['chevreuse:skill', 'nicole:skill']);
    const new_ = { kind: 'new', actionId: dash.id } as const;
    // After Nicole's E: Nicole's.
    const afterNicole = applyDrop(start, actions, new_, null).rotation;
    expect(afterNicole.blocks.at(-1)?.action).toBe('nicole:dodge');
    // Before the first block: the member who starts.
    const first = applyDrop(start, actions, new_, 'b0').rotation;
    expect(first.blocks[0].action).toBe('chevreuse:dodge');
  });

  it('gives a moved Dash to the member on the field at its new place', () => {
    const actions = getTeamActions(ids);
    const start = rotation(['chevreuse:skill', 'nicole:dodge', 'nicole:skill']);
    const moved = applyDrop(
      start,
      actions,
      { kind: 'move', blockUid: 'b1' },
      'b0'
    ).rotation;
    expect(moved.blocks.map((entry) => entry.action)).toEqual([
      'chevreuse:dodge',
      'chevreuse:skill',
      'nicole:skill',
    ]);
  });
});
