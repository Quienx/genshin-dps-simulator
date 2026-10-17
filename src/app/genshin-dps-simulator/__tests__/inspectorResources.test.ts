import { describe, expect, it } from 'vitest';

import {
  actionAt,
  actionTitle,
  changesSpecialSystem,
  describeTrigger,
  eventCharacterState,
  groupNormalCombos,
  hitsOfAction,
  hitsOfGroup,
  systemEventRows,
} from '../_components/timeline/timelineData';
import { buildInspectorView } from '../_lib/inspector';
import {
  buildDefaultTeam,
  buildMemberValues,
  runSolo,
  runTeam,
} from '../_lib/team';

const arlecchinoView = () =>
  buildInspectorView(runSolo(buildMemberValues('arlecchino'), 'expected'));

describe('inspector: resource changes from outside the kit', () => {
  it("shows the weapon's Bond of Life grant as a block of its own", () => {
    const grants = arlecchinoView().chips.filter(
      (chip) => chip.blockId === 'crimson-moon-bond-grant' && !chip.hidden
    );

    expect(grants.length).toBeGreaterThan(0);
    expect(grants[0]).toMatchObject({ kind: 'trigger', sourceTag: 'Weapon' });
    // The Charged Attack's hit, ~6.57 s in.
    expect(grants[0].start).toBeCloseTo(394 / 60, 2);
  });
});

describe('timeline: a weapon trigger that changes Bond of Life', () => {
  it('goes with the special mechanics', () => {
    expect(changesSpecialSystem('arlecchino', 'crimson-moon-bond-grant')).toBe(
      true
    );
  });

  it('is described from its own data', () => {
    expect(describeTrigger('arlecchino', 'crimson-moon-bond-grant')).toEqual([
      'On a Charged hit:',
      '• +25 Bond of Life',
      'Once every 14 s.',
    ]);
  });
});

describe('inspector: how long an instant block stays up', () => {
  it('lasts until the end of the action that made it', () => {
    const view = arlecchinoView();
    const grant = view.chips.find(
      (chip) => chip.blockId === 'crimson-moon-bond-grant'
    )!;
    const action = view.actions.find((entry) => entry.causeId === grant.cause)!;

    expect(action.actionId).toBe('arlecchino:charged');
    expect(action.end).toBeGreaterThan(grant.start);
    expect(grant.end).toBeNull();
    expect(grant.until).toBe(action.end);
  });
});

describe('timeline: an action by name', () => {
  it('names each Normal Attack by its place in the combo', () => {
    const view = arlecchinoView();
    const names = view.actions
      .slice(0, 8)
      .map((action) => actionTitle(action, undefined));

    expect(names).toEqual(['E', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N1']);
    const normal = view.actions[3];
    expect(normal.comboIndex).toBe(2);
    expect(actionTitle(normal, { label: 'Arlecchino: Normal Attack' })).toBe(
      'Normal Attack · N3'
    );
    expect(actionTitle(view.actions[0], { label: 'All Is Ash (E)' })).toBe(
      'All Is Ash (E)'
    );
  });
});

describe('timeline: a Normal Attack combo as one block', () => {
  it('joins the presses of one combo, N1 to the last', () => {
    const view = arlecchinoView();
    const groups = groupNormalCombos(view.actions);
    const normal = { label: 'Arlecchino: Normal Attack' };

    expect(
      groups
        .slice(0, 4)
        .map((group) =>
          actionTitle(group, group.comboIndex === null ? undefined : normal)
        )
    ).toEqual(['E', 'Normal Attack · N1–N6', 'Normal Attack · N1–N3', 'CA']);
    const combo = groups[1];
    expect(combo.parts).toHaveLength(6);
    expect(combo.start).toBe(combo.parts[0].start);
    expect(combo.end).toBe(combo.parts[5].end);
    // Every hit of its presses, once.
    expect(hitsOfGroup(view, combo)).toEqual(
      combo.parts.flatMap((part) => hitsOfAction(view, part))
    );
    // Nothing lost: every press is in one block.
    expect(groups.flatMap((group) => group.parts)).toEqual(view.actions);
  });
});

describe('timeline: what a weapon does to a special system', () => {
  it('gets a Buffs & Debuffs row of its own: each time it gave Bond of Life', () => {
    const rows = systemEventRows(arlecchinoView());
    const grant = rows.find((row) => row.blockId === 'crimson-moon-bond-grant');

    expect(grant).toMatchObject({
      characterId: 'arlecchino',
      label: 'Charged Attack hit grants Bond of Life',
      sourceTag: 'Weapon',
    });
    expect(grant!.chips).toHaveLength(4);
    expect(grant!.chips[0].start).toBeCloseTo(394 / 60, 2);
    // The kit's own Bond of Life changes are not rows of their own.
    expect(rows.map((row) => row.blockId)).not.toContain('masque-consume');
    expect(rows.map((row) => row.blockId)).not.toContain('absorb-directive');
  });
});

describe('inspector: a bonus while a resource meets a bound', () => {
  const view = arlecchinoView();
  const of = (blockId: string) =>
    view.chips.filter((chip) => chip.blockId === blockId && !chip.hidden);

  it('is a bonus block while it holds, its resource as the timer', () => {
    const [high] = of('crimson-moon-high-bond');

    expect(high).toMatchObject({
      kind: 'status',
      type: 'bonus',
      sourceTag: 'Weapon',
      meter: {
        resource: 'bondOfLife',
        label: 'Bond of Life',
        bounds: { gte: 30 },
      },
    });
    // From the Directive's absorb (Bond of Life 0 → 130).
    expect(high.start).toBeCloseTo(369 / 60, 2);
    expect(high.value).toBeTruthy();
    expect(high.meter!.points.length).toBeGreaterThan(1);
    expect(of('crimson-moon-bond')[0].meter!.bounds).toEqual({ gt: 0 });
  });

  it('shows two bonuses of one name and condition once', () => {
    const masque = view.chips.filter(
      (chip) =>
        chip.label === 'Masque of the Red Death' && chip.kind === 'status'
    );
    expect(masque.length).toBeGreaterThan(0);
    expect(new Set(masque.map((chip) => chip.start)).size).toBe(masque.length);
  });
});

describe('Selected Event: the character state', () => {
  it("follows the playhead, past the event's last hit", () => {
    const run = runTeam(buildDefaultTeam(), 'expected');
    const view = buildInspectorView(run);
    const varesa = run.members.find(
      (member) => member.characterId === 'varesa'
    )!;
    // Varesa's last Kablam: nothing of hers lands after it.
    const kablam = view.actions
      .filter((action) => action.actionId === 'varesa:burst')
      .at(-1)!;
    const later = kablam.end + 0.5;

    const at = eventCharacterState(varesa, kablam, later);
    const after = eventCharacterState(varesa, kablam, later + 1);
    const remaining = (state: typeof at) =>
      state.skill?.cooldown.remaining ?? 0;

    expect(remaining(at)).toBeGreaterThan(0);
    expect(remaining(after)).toBeCloseTo(remaining(at) - 1, 1);
  });
});

describe('Selected Event at the playhead', () => {
  it('is an action from where its block starts: its wait for a cooldown first', () => {
    const view = buildInspectorView(runTeam(buildDefaultTeam(), 'expected'));
    const nicole = view.actions.find(
      (action) => action.actionId === 'nicole:skill' && action.waited > 0
    )!;
    const inItsWait = nicole.start - nicole.waited / 2;

    expect(actionAt(view.actions, inItsWait)?.key).toBe(nicole.key);
    // Before its wait, the one before it.
    expect(
      actionAt(view.actions, nicole.start - nicole.waited - 0.05)?.key
    ).not.toBe(nicole.key);
  });
});
