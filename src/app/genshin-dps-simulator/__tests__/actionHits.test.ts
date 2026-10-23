// Which hits an event lists as its own, and the reactions each hit set
// off: a status's E or Q ticks go to that talent's latest action, and a
// transformative reaction's own hit links back to the hit that caused it.
import { describe, expect, it } from 'vitest';

import {
  hitsOfAction,
  reactionsByHit,
} from '../_components/timeline/timelineData';
import { buildInspectorView, InspectorView } from '../_lib/inspector';
import {
  buildDefaultTeam,
  buildPresetTeam,
  MAVUIKA_PRESETS,
  runTeam,
} from '../_lib/team';

const labelsOf = (view: InspectorView, actionId: string) =>
  view.actions
    .filter((action) => action.actionId === actionId)
    .map((action) =>
      Array.from(new Set(hitsOfAction(view, action).map((hit) => hit.label)))
    );

describe("an action's hits", () => {
  const view = buildInspectorView(
    runTeam(buildPresetTeam(MAVUIKA_PRESETS[0]), 'expected')
  );

  it("give Citlali's Opal Fire ticks to her E, even when her Q's points start it", () => {
    labelsOf(view, 'citlali:skill').forEach((labels) =>
      expect(labels).toContain('Opal Fire')
    );
    labelsOf(view, 'citlali:burst').forEach((labels) =>
      expect(labels).not.toContain('Opal Fire')
    );
  });

  it('never count a hit for two actions', () => {
    MAVUIKA_PRESETS.map((preset) =>
      buildInspectorView(runTeam(buildPresetTeam(preset), 'expected'))
    )
      .concat(buildInspectorView(runTeam(buildDefaultTeam(), 'expected')))
      .forEach((each) => {
        const counted = each.actions.flatMap((action) =>
          hitsOfAction(each, action)
        );
        expect(new Set(counted).size).toBe(counted.length);
      });
  });
});

describe('the reactions a hit set off', () => {
  it('link an Overloaded to the hit that caused it, with its own DMG', () => {
    const view = buildInspectorView(runTeam(buildDefaultTeam(), 'expected'));
    const reactions = reactionsByHit(view);
    const overloads = view.hits.filter((hit) => hit.category === 'Overloaded');
    const linked = Array.from(reactions.values())
      .flat()
      .filter((entry) => entry.reaction === 'Overloaded');
    expect(overloads.length).toBeGreaterThan(0);
    expect(linked.map((entry) => entry.damage)).toEqual(
      overloads.map((hit) => hit.damage)
    );
  });

  it("mark an amplified hit with its reaction (Melt), its DMG being the hit's", () => {
    const view = buildInspectorView(
      runTeam(buildPresetTeam(MAVUIKA_PRESETS[1]), 'expected')
    );
    const melted = view.hits.filter((hit) => hit.reaction === 'Melt');
    expect(melted.length).toBeGreaterThan(0);
    const reactions = reactionsByHit(view);
    melted.forEach((hit) =>
      expect(reactions.get(`${hit.characterId}#${hit.index}`)).toContainEqual({
        reaction: 'Melt',
        damage: null,
      })
    );
  });
});
