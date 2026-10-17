// Coordinated attacks: hits made by a block (a status's ticks, a trigger's
// hit), not by an action's own row: Escoffier's Mek, Arlecchino's
// Directive, Nicole's Arcane Projections. The inspector names them so the
// chart and the Event panel can show them.
import { describe, expect, it } from 'vitest';

import { block } from './fixtures';
import { buildInspectorView, coordinatedUntil } from '../_lib/inspector';
import {
  buildDefaultTeam,
  buildMemberValues,
  runSolo,
  runTeam,
} from '../_lib/team';

const solo = (id: string) =>
  buildInspectorView(runSolo(buildMemberValues(id), 'expected'));

describe('coordinated attacks', () => {
  const escoffier = solo('escoffier');

  it("makes a ticking status a coordinated attack (Escoffier's Mek)", () => {
    const mek = escoffier.chips.find((chip) => chip.blockId === 'mek')!;
    expect(mek.type).toBe('coordinated');
    expect(mek.hitText).toMatch(/21 × Frosty Parfait DMG Cryo/);
  });

  it('marks the hits blocks make, not the actions’ own', () => {
    const mekHits = escoffier.hits.filter((hit) => hit.sourceId === 'mek');
    expect(mekHits.length).toBeGreaterThan(20);
    expect(mekHits.every((hit) => hit.coordinated)).toBe(true);
    const eHit = escoffier.hits.find(
      (hit) => hit.category === 'Skill' && !hit.sourceId
    )!;
    expect(eHit.coordinated).toBe(false);
  });

  it('adds them up per source until the playhead', () => {
    const at30 = coordinatedUntil(escoffier, 30);
    const mek = at30.find((entry) => entry.sourceId === 'mek')!;
    const landed = escoffier.hits.filter(
      (hit) => hit.sourceId === 'mek' && hit.time <= 30 + 1e-6
    );
    expect(mek.hits).toBe(landed.length);
    expect(mek.damage).toBeCloseTo(
      landed.reduce((sum, hit) => sum + hit.damage, 0),
      6
    );
    expect(mek.label).toBe('Cooking Mek: Cold Storage Mode');
    expect(mek.characterId).toBe('escoffier');
  });

  it("covers Arlecchino's Directive", () => {
    const arlecchino = solo('arlecchino');
    expect(
      arlecchino.chips.find((chip) => chip.blockId === 'directive')?.type
    ).toBe('coordinated');
  });

  it("covers Nicole's Arcane Projections, named from her block", () => {
    // Her Q (Silent Contemplation), then Varesa's hits summon them.
    const team = buildDefaultTeam();
    const view = buildInspectorView(
      runTeam(
        {
          ...team,
          rotation: {
            loop: false,
            blocks: [
              block('q', 'nicole:burst'),
              block('na', 'varesa:normal', { hits: 4 }),
              block('na2', 'varesa:normal', { hits: 4 }),
            ],
          },
        },
        'expected'
      )
    );
    const projections = coordinatedUntil(view, view.duration).filter((source) =>
      /Arcane Projection/i.test(source.label)
    );
    expect(projections.length).toBeGreaterThan(0);
    // Dealt by Varesa, as the attacker.
    expect(projections[0].characterId).toBe('varesa');
    expect(projections[0].hits).toBeGreaterThan(0);
  });
});
