import { CharacterData } from './characterSchema';
import { expandSystems } from './engine/modules';
import { ENERGY_ID } from './engine/modules/energy';
import { getFieldsBySection } from './simulationFields';
import { CharacterDefinition, FieldDefinition } from './types';

// What fills a character's Q button, as in the game: its Energy, or the
// resource its `actionRules` make the Q need instead (Mavuika's Fighting
// Spirit, ready at 100). Null when the Q needs neither.
export type BurstCharge = {
  resource: string;
  label: string;
  // How much the Q needs: the ring is full (and glows) from there.
  needed: number;
  // The number field the resource starts from (the sheet's run option).
  field: string | null;
};

export const getBurstCharge = (
  character: CharacterData
): BurstCharge | null => {
  const blocks = [...expandSystems(character), ...character.blocks];
  const resourceOf = (id: string) =>
    blocks.find((block) => block.type === 'resource' && block.id === id);
  const charge = (resource: string, needed: number): BurstCharge | null => {
    const block = resourceOf(resource);
    if (!block || block.type !== 'resource') {
      return null;
    }
    const { initial } = block;
    return {
      resource,
      label: block.label ?? resource,
      needed,
      field:
        typeof initial === 'object' && initial !== null && 'field' in initial
          ? initial.field
          : null,
    };
  };
  const cost = character.talents.find(
    (talent) => talent.kind === 'burst'
  )?.energyCost;
  if (cost !== undefined && resourceOf(ENERGY_ID)) {
    return charge(ENERGY_ID, cost);
  }
  const rule = character.actionRules?.find(
    (entry) =>
      entry.action === 'burst' &&
      entry.requires !== undefined &&
      'resource' in entry.requires &&
      entry.requires.gte !== undefined
  );
  const requires = rule?.requires;
  return requires && 'resource' in requires && requires.gte !== undefined
    ? charge(requires.resource, requires.gte)
    : null;
};

// The run options a member's sheet offers (the rest is the scenario's or
// the timeline's rotation's): what its Q starts with.
export const getRunOptionFields = (
  definition: CharacterDefinition,
  character: CharacterData
): FieldDefinition[] => {
  const field = getBurstCharge(character)?.field;
  return getFieldsBySection(definition, 'rotation').filter(
    (entry) => entry.name === field
  );
};
