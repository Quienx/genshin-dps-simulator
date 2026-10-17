// The scaffold's reader of gcsim's zz_<name>.dm.go (no network: a cut of
// Escoffier's file).
import { describe, expect, it } from 'vitest';

import { parseDmTables } from './dmTables';

const DM = `
var (
	attack = [][][]float64{
		{{ // attack: KitchenSkills - 1-Hit DMG: {0}
			0.51551,
			0.55747,
		}},
		{
			{ // attack: KitchenSkills - 3-Hit DMG: {2}+{3}
				0.329995,
				0.356855,
			},
			{ // attack: KitchenSkills - 3-Hit DMG: {2}+{3}
				0.403327,
				0.436156,
			},
		},
	}
	// attack: KitchenSkills - Charged Attack DMG: {4}
	charge = []float64{
		1.15412,
		1.24806,
	}
	// skill: LowTemperatureCooking - Frosty Parfait DMG: {1}
	skillDot = []float64{
		1.2,
		1.29,
	}
	// burst: ScoringCuts - Healing: {1} ATK+{2}
	burstHealFlat = []float64{
		1078.5255,
		1186.3931,
	}
)
`;

describe('parseDmTables', () => {
  const tables = parseDmTables(DM);

  it('reads every table with its talent and label', () => {
    expect(
      tables.map((table) => [table.id, table.talent, table.label])
    ).toEqual([
      ['attack-1', 'attack', '1-Hit DMG'],
      ['attack-2', 'attack', '3-Hit DMG'],
      ['attack-3', 'attack', '3-Hit DMG'],
      ['charge', 'attack', 'Charged Attack DMG'],
      ['skillDot', 'skill', 'Frosty Parfait DMG'],
      ['burstHealFlat', 'burst', 'Healing'],
    ]);
  });

  it('keeps the values per level, a nested table hit by hit', () => {
    expect(tables[1].values).toEqual([0.329995, 0.356855]);
    expect(tables[2].values).toEqual([0.403327, 0.436156]);
    expect(tables[4].values).toEqual([1.2, 1.29]);
  });

  it("tells flat values (a heal's flat part) from multipliers", () => {
    expect(tables.find((table) => table.id === 'burstHealFlat')?.flat).toBe(
      true
    );
    expect(tables.find((table) => table.id === 'skillDot')?.flat).toBe(false);
  });
});
