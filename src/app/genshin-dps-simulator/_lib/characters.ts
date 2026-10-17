import { CHARACTER_DATA, CHARACTER_ROTATIONS } from './characterData';
import { CharacterData } from './characterSchema';
import { createKitSimulator } from './engine/simulateKit';
import { getUsedStats } from './stats';
import { CharacterDefinition, CharacterId } from './types';

type KitExtras = {
  hasNormalOnlyScenario?: boolean;
};

// Every character runs on the block engine from its file; this only adds
// what is not data yet (Arlecchino's "Normal Attacks only" card).
const KIT_EXTRAS: Record<string, KitExtras> = {
  arlecchino: { hasNormalOnlyScenario: true },
};

const toDefinition = (data: CharacterData): CharacterDefinition => {
  const extras = KIT_EXTRAS[data.id] ?? {};
  return {
    id: data.id,
    name: data.name,
    element: data.element,
    avatar: data.icons.avatar,
    hasNormalOnlyScenario: extras.hasNormalOnlyScenario ?? false,
    stat: data.scalingStat,
    stats: getUsedStats(data),
    elementalLabel: `${data.element} DMG Bonus (%)`,
    numberDefaults: data.defaults.numbers,
    flagDefaults: data.defaults.flags,
    fields: data.fields,
    rotation: CHARACTER_ROTATIONS[data.id],
    simulate: createKitSimulator(data.id),
  };
};

export const CHARACTER_LIST: CharacterDefinition[] =
  CHARACTER_DATA.map(toDefinition);

export const CHARACTERS: Record<CharacterId, CharacterDefinition> =
  Object.fromEntries(
    CHARACTER_LIST.map((character) => [character.id, character])
  );

export const DEFAULT_CHARACTER_ID: CharacterId = CHARACTER_LIST[0].id;

export const isCharacterId = (value: string): value is CharacterId =>
  CHARACTER_LIST.some((character) => character.id === value);
