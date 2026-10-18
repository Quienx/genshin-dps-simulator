import { expandBondOfLife } from './bondOfLife';
import { expandEnergy } from './energy';
import { expandNightsoul } from './nightsoul';
import { expandVerdantDew } from './verdantDew';
import { Block } from '../schema';
import { CharacterData } from '../../characterSchema';

type SystemModule = (params: unknown, character: CharacterData) => Block[];

// Shared game systems a character file can turn on in `systems`. Each one
// validates its own params and returns ordinary blocks.
const MODULES: Record<string, SystemModule> = {
  bondOfLife: expandBondOfLife,
  energy: expandEnergy,
  nightsoul: expandNightsoul,
  verdantDew: expandVerdantDew,
};

export const expandSystems = (character: CharacterData): Block[] =>
  Object.entries(character.systems).flatMap(([name, params]) => {
    const expand = MODULES[name];
    if (!expand) {
      throw new Error(`Unknown system "${name}"`);
    }
    return expand(params, character);
  });
