// The scaffold's reader of gcsim's character .go files (no network: cuts
// of Escoffier's).
import { describe, expect, it } from 'vitest';

import { parseGoFrames } from './goFrames';

const ATTACK = `
var (
	attackFrames   [][]int
	attackHitmarks = [][]int{{7}, {16}, {27, 40}}
)
func init() {
	attackFrames[0] = frames.InitNormalCancelSlice(attackHitmarks[0][0], 22)
	attackFrames[0][action.ActionAttack] = 17
	attackFrames[0][action.ActionCharge] = 20
}
`;
const CHARGE = `
const chargeHitmark = 20
func init() {
	chargeFrames = frames.InitAbilSlice(65)
	chargeFrames[action.ActionDash] = chargeHitmark
	chargeFrames[action.ActionSwap] = 52
}
`;
const SKILL = `
const (
	skillCD = 15 * 60
)
func (c *char) Skill(p map[string]int) (action.Info, error) {
	ai := info.AttackInfo{
		ActorIndex: c.Index(),
		Abil:       "Low-Temperature Cooking",
		AttackTag:  attacks.AttackTagElementalArt,
		ICDTag:     attacks.ICDTagElementalArt,
		ICDGroup:   attacks.ICDGroupEscoffierSkill,
		Element:    attributes.Cryo,
		Durability: 25,
		Mult:       skillInital[c.TalentLvlSkill()],
	}
	c.SetCDWithDelay(action.ActionSkill, skillCD, 22)
	c.Core.QueueParticle(c.Base.Key.String(), 4, attributes.Cryo, c.ParticleDelay)
}
func (c *char) Burst(p map[string]int) (action.Info, error) {
	ai := info.AttackInfo{
		Abil:       "Scoring Cuts",
		ICDTag:     attacks.ICDTagNone,
		ICDGroup:   attacks.ICDGroupDefault,
		Element:    attributes.Cryo,
		Durability: 50,
	}
	c.ConsumeEnergy(5)
}
`;

describe('parseGoFrames', () => {
  const report = parseGoFrames([ATTACK, CHARGE, SKILL, 'c.EnergyMax = 60']);

  it('reads hitmark arrays and frame slices with their cancels', () => {
    expect(report.arrays.attackHitmarks).toEqual([[7], [16], [27, 40]]);
    expect(report.frames['attackFrames[0]']).toEqual({
      hitmark: 7,
      end: 22,
      cancels: { normal: 17, charged: 20 },
    });
    // A cancel read from a one-line constant.
    expect(report.frames.chargeFrames).toEqual({
      end: 65,
      cancels: { dodge: 20, swap: 52 },
    });
  });

  it('resolves cooldowns from constants and expressions', () => {
    expect(report.cooldowns).toEqual([
      { action: 'skill', frames: 900, delay: 22 },
    ]);
    expect(report.energy).toEqual({ max: 60, consumedAt: [5] });
  });

  it("reads each attack's element, gauge and ICD in the files' terms", () => {
    expect(
      report.attacks.map((attack) => [
        attack.abil,
        attack.element,
        attack.gauge,
        attack.icdTag,
        attack.icdGroup,
      ])
    ).toEqual([
      ['Low-Temperature Cooking', 'Cryo', 1, 'ElementalArt', 'escoffierSkill'],
      ['Scoring Cuts', 'Cryo', 2, 'None', 'standard'],
    ]);
    expect(report.particles).toEqual([
      { count: 4, element: 'Cryo', delay: 'c.ParticleDelay' },
    ]);
  });
});
