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

// Each character's expansion, once: its systems never change after it is
// loaded, and expanding validates them with zod, too slow to repeat for
// every block's tooltip. The blocks are only read, never changed.
const expanded = new WeakMap<CharacterData, Block[]>();

export const expandSystems = (character: CharacterData): Block[] => {
  const known = expanded.get(character);
  if (known) {
    return known;
  }
  const blocks = Object.entries(character.systems).flatMap(([name, params]) => {
    const expand = MODULES[name];
    if (!expand) {
      throw new Error(`Unknown system "${name}"`);
    }
    return expand(params, character);
  });
  expanded.set(character, blocks);
  return blocks;
};
