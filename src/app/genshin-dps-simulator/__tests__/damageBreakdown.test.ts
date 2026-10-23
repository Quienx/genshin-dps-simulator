// The Results panel's breakdown: the run's counted DMG by member and by
// kind of hit, adding up to the run's total.
import { describe, expect, it } from 'vitest';

import { damageBreakdown } from '../_components/timeline/timelineData';
import { buildInspectorView, EnemyHit } from '../_lib/inspector';
import { buildDefaultTeam, runTeam } from '../_lib/team';

const hit = (patch: Partial<EnemyHit>): EnemyHit => ({
  index: 0,
  time: 1,
  characterId: 'varesa',
  blockUid: null,
  row: null,
  actionId: null,
  label: 'Hit',
  element: 'Electro',
  reaction: 'None',
  category: 'Normal',
  damage: 100,
  isCrit: false,
  counted: true,
  sourceId: null,
  coordinated: false,
  ...patch,
});

describe('the DMG breakdown', () => {
  it('splits the counted DMG by member and by kind, most first', () => {
    const { total, byMember, byType } = damageBreakdown({
      hits: [
        hit({ damage: 300, category: 'Plunge' }),
        hit({ damage: 100, category: 'Normal' }),
        hit({ characterId: 'nicole', damage: 50, category: 'Skill' }),
        // A projection Nicole's status fires: a coordinated attack.
        hit({
          characterId: 'nicole',
          damage: 50,
          category: 'Arcane Projection',
          coordinated: true,
        }),
      ],
    });
    expect(total).toBe(500);
    expect(byMember.map(({ key, share }) => [key, share])).toEqual([
      ['varesa', 0.8],
      ['nicole', 0.2],
    ]);
    expect(byMember[0].label).toBe('Varesa');
    expect(byType.map(({ key, label, share }) => [key, label, share])).toEqual([
      ['Plunge', 'Plunge', 0.6],
      ['Normal', 'Normal Attack', 0.2],
      ['Skill', 'Skill (E)', 0.1],
      ['coordinated', 'Coordinated attacks', 0.1],
    ]);
  });

  it('leaves out the hits past the counted duration', () => {
    const { total, byType } = damageBreakdown({
      hits: [
        hit({ damage: 100 }),
        hit({ damage: 900, category: 'Burst', counted: false }),
      ],
    });
    expect(total).toBe(100);
    expect(byType.map((entry) => entry.key)).toEqual(['Normal']);
  });

  it('adds up to the run’s total, in shares of 100%', () => {
    const run = runTeam(buildDefaultTeam(), 'expected');
    const { total, byMember, byType } = damageBreakdown(
      buildInspectorView(run)
    );
    expect(total).toBeCloseTo(run.totalDamage, 3);
    [byMember, byType].forEach((shares) =>
      expect(shares.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(
        1,
        9
      )
    );
  });

  it('has nothing to split in a run with no DMG', () => {
    expect(damageBreakdown({ hits: [] })).toEqual({
      total: 0,
      byMember: [],
      byType: [],
    });
  });
});
