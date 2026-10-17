import { getLoadedCharacter } from './characterData';
import { expandSystems } from './engine/modules';
import { Condition } from './engine/schema';
import { splitTeamActionId } from './engine/simulateTeam';
import formatNumber from './formatNumber';

// What an action costs, from the character's data: its Energy, the forms
// that cost something else (and while what), and what it needs to be
// done at all (`actionRules`). The editor shows it before it is placed.
export type ActionCost = {
  energy: number | null;
  forms: { label: string; energy: number; when: string | null }[];
  requires: string | null;
};

const BOUNDS = { gt: '>', gte: '≥', lt: '<', lte: '≤' } as const;

// A condition in a few words ("Apex Drive", "Nightsoul ≥ 40"); null when
// it has no short reading (a hook, a flag).
const describeCondition = (
  condition: Condition,
  labelOf: (id: string) => string
): string | null => {
  if ('status' in condition) {
    return labelOf(condition.status);
  }
  if ('resource' in condition) {
    const bounds = (Object.keys(BOUNDS) as (keyof typeof BOUNDS)[])
      .filter((key) => condition[key] !== undefined)
      .map((key) => `${BOUNDS[key]} ${formatNumber(condition[key] ?? 0)}`);
    return `${labelOf(condition.resource)} ${bounds.join(' and ')}`.trim();
  }
  if ('all' in condition || 'any' in condition) {
    const parts = ('all' in condition ? condition.all : condition.any).map(
      (entry) => describeCondition(entry, labelOf)
    );
    return parts.every((part) => part !== null)
      ? parts.join('all' in condition ? ' and ' : ' or ')
      : null;
  }
  if ('not' in condition) {
    const inner = describeCondition(condition.not, labelOf);
    return inner && `not ${inner}`;
  }
  return null;
};

export const getActionCost = (
  characterId: string,
  teamActionId: string
): ActionCost => {
  const { character, actions, rotation } = getLoadedCharacter(characterId);
  const { actionId } = splitTeamActionId(teamActionId);
  // A sequence (Mualani's Shark Bite) costs what its first step does.
  const sequence = rotation?.actions.find((entry) => entry.id === actionId)
    ?.steps?.[0];
  const id =
    sequence === undefined
      ? actionId
      : typeof sequence === 'string'
      ? sequence
      : sequence.action;
  const action = actions[id];
  if (!action) {
    return { energy: null, forms: [], requires: null };
  }
  const blocks = [
    ...expandSystems(character),
    ...character.blocks,
    ...character.weapon.blocks,
    ...character.artifactSet.blocks,
  ];
  const labelOf = (blockId: string) => {
    const block = blocks.find((entry) => entry.id === blockId);
    return block && 'label' in block && block.label
      ? String(block.label)
      : blockId;
  };
  const energy = action.energyCost ?? null;
  return {
    energy,
    forms: (action.replacements ?? []).flatMap(
      ({ action: formId, while: when }) => {
        const form = actions[formId];
        const formEnergy = form?.energyCost ?? energy;
        return form && formEnergy !== null && formEnergy !== energy
          ? [
              {
                label: form.label,
                energy: formEnergy,
                when: describeCondition(when, labelOf),
              },
            ]
          : [];
      }
    ),
    requires: action.requires?.message ?? null,
  };
};

// The cost as lines for a tooltip; none for a free action.
export const describeActionCost = (cost: ActionCost): string[] => [
  ...(cost.energy !== null ? [`${formatNumber(cost.energy)} Energy`] : []),
  ...cost.forms.map(
    (form) =>
      `${form.label}: ${formatNumber(form.energy)} Energy${
        form.when ? ` (in ${form.when})` : ''
      }`
  ),
  ...(cost.requires ? [cost.requires] : []),
];
