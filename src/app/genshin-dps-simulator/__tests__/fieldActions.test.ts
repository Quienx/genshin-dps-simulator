// Dash and Wait are field actions: the palette shows them once, in a
// General group. Each block is its member's: the one whose row it was
// dropped on (the run swaps them in first, with no Swap block), else the
// member on the field where it landed.
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
  it('swaps a Dash or Wait’s member in first when they are off the field', () => {
    const team = simulateTeam(
      ids.map(member),
      rotation(['nicole:skill', 'chevreuse:dodge', 'chevreuse:wait'])
    );
    expect(team.rotationTrace.map((entry) => entry.action)).toEqual([
      'nicole:skill',
      'chevreuse:dodge',
      'chevreuse:wait',
    ]);
    expect(team.swaps.map((swap) => swap.characterId)).toEqual([
      'nicole',
      'chevreuse',
    ]);
  });

  it('gives a Dash dropped on a member’s row to them, with no Swap block', () => {
    const actions = getTeamActions(ids);
    const dash = getGeneralPaletteActions(actions)[0];
    // After Nicole's E, on Chevreuse's row: Chevreuse's Dash.
    const dropped = applyDrop(
      rotation(['nicole:skill', 'nicole:burst']),
      actions,
      { kind: 'new', actionId: dash.id },
      'b1',
      'chevreuse'
    ).rotation;
    expect(dropped.blocks.map((entry) => entry.action)).toEqual([
      'nicole:skill',
      'chevreuse:dodge',
      'nicole:burst',
    ]);
  });

  it('moves a Dash to another row in its place', () => {
    const actions = getTeamActions(ids);
    const moved = applyDrop(
      rotation(['nicole:skill', 'nicole:dodge', 'nicole:burst']),
      actions,
      { kind: 'move', blockUid: 'b1' },
      'b2',
      'chevreuse'
    ).rotation;
    expect(moved.blocks.map((entry) => entry.action)).toEqual([
      'nicole:skill',
      'chevreuse:dodge',
      'nicole:burst',
    ]);
  });

  it('keeps a placed Dash its member’s when other blocks move', () => {
    const actions = getTeamActions(ids);
    const moved = applyDrop(
      rotation(['nicole:skill', 'chevreuse:dodge', 'nicole:burst']),
      actions,
      { kind: 'move', blockUid: 'b2' },
      'b0'
    ).rotation;
    expect(moved.blocks.map((entry) => entry.action)).toEqual([
      'nicole:burst',
      'nicole:skill',
      'chevreuse:dodge',
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
