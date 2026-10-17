// Character files edited on the fly, to test engine features no shipped
// character uses yet. They are loaded and validated like real files.
import arlecchinoJson from '../_data/characters/arlecchino.json';
import mualaniJson from '../_data/characters/mualani.json';
import { loadCharacterFile } from '../_lib/characterData';
import { createDamageContext } from '../_lib/damageEngine';
import { createRuntime } from '../_lib/engine/runtime';
import { simulateLoadedCharacter } from '../_lib/engine/simulateKit';
import { RotationBlock } from '../_lib/rotation/types';
import {
  buildDefaultValues,
  parseValues,
  withRotation,
} from '../_lib/simulationValues';

// Loose on purpose: tests reach into the JSON to change what they need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CharacterFile = any;

const FILES: Record<string, unknown> = {
  arlecchino: arlecchinoJson,
  mualani: mualaniJson,
};

export const editCharacter = (
  baseId: 'arlecchino' | 'mualani',
  edit: (file: CharacterFile) => void
): CharacterFile => {
  const file = structuredClone(FILES[baseId]);
  edit(file);
  return file;
};

export const block = (
  uid: string,
  action: string,
  options: Partial<RotationBlock> = {}
): RotationBlock => ({
  uid,
  action,
  hits: 1,
  repeat: 1,
  seconds: 0,
  dashCancel: false,
  ...options,
});

// Simulates an edited file with the base character's default build and,
// when given, a custom rotation.
export const simulateFile = (
  file: CharacterFile,
  {
    blocks,
    numbers = {},
    flags = {},
  }: {
    blocks?: RotationBlock[];
    numbers?: Record<string, string>;
    flags?: Record<string, boolean>;
  } = {}
) => {
  const loaded = loadCharacterFile(file);
  const defaults = buildDefaultValues(loaded.character.id);
  const values = withRotation(
    {
      ...defaults,
      numbers: { ...defaults.numbers, ...numbers },
      flags: { ...defaults.flags, ...flags },
    },
    blocks ? { loop: false, blocks } : null
  );
  const parsed = parseValues(values);
  const context = createDamageContext(parsed, 'expected');
  const result = simulateLoadedCharacter(loaded, context, parsed);
  return { loaded, context, result, trace: result.rotationTrace ?? [] };
};

// The runtime of an edited file on its own, to drive triggers and read
// state frame by frame without a rotation.
export const createFileRuntime = (
  file: CharacterFile,
  {
    numbers = {},
    flags = {},
  }: {
    numbers?: Record<string, string>;
    flags?: Record<string, boolean>;
  } = {}
) => {
  const loaded = loadCharacterFile(file);
  const defaults = buildDefaultValues(loaded.character.id);
  const parsed = parseValues({
    ...defaults,
    numbers: { ...defaults.numbers, ...numbers },
    flags: { ...defaults.flags, ...flags },
  });
  const context = createDamageContext(parsed, 'expected');
  const runtime = createRuntime({
    character: loaded.character,
    values: parsed,
    context,
    actions: loaded.actions,
  });
  return { runtime, context };
};

export const findTalent = (file: CharacterFile, id: string) =>
  file.talents.find((talent: { id: string }) => talent.id === id);
